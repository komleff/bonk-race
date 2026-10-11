import { compareRecording, importRecording, replayRecording, validateRecording, type TrainRecording } from './recording';
import { buildIdentity, TrainSession } from './session';
import { validTrainState } from './train';
import type { AssistantMode } from './assistant';
import type { TrainComposition } from './types';

// Только этот поток разбирает и полностью проверяет журналы; идентичность берётся из текущей сборки.
self.onmessage = async (event: MessageEvent<{task:'replay'|'compare'|'import';input:TrainRecording|File}>) => {
  try {
    const {task,input}=event.data;
    self.postMessage({progress:task==='import'?'Чтение и проверка JSON…':'Проверка исходной записи…'});
    if(task==='import') {
      if(!(input instanceof File))throw new Error('Ожидается файл JSON');
      const record=importRecording(await input.text(),buildIdentity());
      const session=new TrainSession(record.config,{...buildIdentity(),initialState:record.initialState,settings:record.settings,scene:record.scene,fa:record.fa,dt:record.dt});
      self.postMessage({result:{name:'Импорт',state:session.state,recording:record,telemetry:session.telemetry,settings:session.settings,fa:session.fa}});
      self.postMessage({done:true});return;
    }
    const record=input as TrainRecording;validateRecording(record,buildIdentity());
    const variants=task==='replay'?[{name:'Повтор',mode:undefined,composition:undefined}]:[
      {name:'Поезд · накат',mode:'coast' as AssistantMode,composition:undefined},
      {name:'Поезд · страховка',mode:'guard' as AssistantMode,composition:undefined},
      {name:'Поезд · торможение',mode:'brake' as AssistantMode,composition:undefined},
      {name:'Один тягач A–B',mode:'coast' as AssistantMode,composition:'single' as TrainComposition}];
    for(let i=0;i<variants.length;i++) {
      self.postMessage({progress:`${variants[i].name}: ${i+1}/${variants.length}`});
      const v=variants[i],session=v.mode?compareRecording(record,v.mode,{composition:v.composition}):replayRecording(record);
      validateRecording(session.recording,buildIdentity());if(!validTrainState(session.state))throw new Error('Повтор вернул недопустимое состояние');
      // Варианты передаются отдельно, без единого большого пакета из четырёх журналов.
      self.postMessage({result:{name:v.name,state:session.state,recording:session.recording,telemetry:session.telemetry,comparison:session.comparison,stopReason:session.stoppedReason,settings:session.settings,fa:session.fa}});
    }
    self.postMessage({done:true});
  } catch(error) { self.postMessage({error:error instanceof Error?error.message:String(error)}); }
};
