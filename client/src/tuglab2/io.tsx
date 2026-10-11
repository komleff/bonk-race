import type { TrainRecording } from './recording';
import { SESSION_LIMITS, validateAssistantSettings, type AssistantSettings } from './assistant';
import { buildIdentity, TrainSession } from './session';
import { validTrainState } from './train';
import type { TrainTelemetry } from './telemetry';
import type { TrainState } from './types';
export interface RunResult {
  name:string;state:TrainState;recording:TrainRecording;telemetry:TrainTelemetry;
  comparison?:TrainSession['comparison'];stopReason?:string;settings:AssistantSettings;fa:boolean;
}
export function downloadText(name:string,text:string,type='application/json'):void {
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// Полный журнал проверяется в нашем рабочем потоке. Здесь проверяется только оболочка его ответа.
function checkEnvelope(record:TrainRecording):void {
  const identity=buildIdentity();
  if(!record||record.app!=='tuglab2'||record.schema!==1||record.sourceSHA!==identity.sourceSHA||record.appVersion!==identity.appVersion
    ||!Array.isArray(record.ticks)||record.ticks.length>SESSION_LIMITS.maxRecordingTicks||!Array.isArray(record.events)||record.events.length>SESSION_LIMITS.maxRecordingTicks
    ||![1/30,1/60,1/120].includes(record.dt))throw new Error('Несовместимый ответ рабочего потока');
}
export function initialSession(record:TrainRecording):TrainSession {
  checkEnvelope(record);
  return new TrainSession(record.config,{...buildIdentity(),initialState:record.initialState,settings:record.settings,scene:record.scene,fa:record.fa,dt:record.dt});
}
export function recordingJob(task:'replay'|'compare'|'import',input:TrainRecording|File,onProgress:(text:string)=>void):{promise:Promise<RunResult[]>;cancel:()=>void} {
  if(task==='import'){if(!(input instanceof File)||input.size>SESSION_LIMITS.maxImportBytes)throw new Error('JSON превышает допустимый размер');}
  else checkEnvelope(input as TrainRecording);
  const worker=new Worker(new URL('./recordingWorker.tsx',import.meta.url),{type:'module'});
  let rejectJob:(error:Error)=>void=()=>{};
  const promise=new Promise<RunResult[]>((resolve,reject)=>{
    rejectJob=reject;const received:RunResult[]=[];
    worker.onerror=event=>{worker.terminate();reject(new Error(event.message||'Ошибка рабочего потока'));};
    worker.onmessage=(event:MessageEvent<{progress?:string;error?:string;result?:RunResult;done?:boolean}>)=>{
      if(event.data.progress){onProgress(event.data.progress);return;}
      if(event.data.error){worker.terminate();reject(new Error(event.data.error));return;}
      try {
        if(event.data.result){const r=event.data.result;checkEnvelope(r.recording);initialSession(r.recording);validateAssistantSettings(r.settings);
          if(typeof r.fa!=='boolean'||!validTrainState(r.state)||!Number.isFinite(r.telemetry.time)
            ||r.state.world.tick!==(task==='import'?0:r.recording.ticks.length)||r.state.world.time!==r.telemetry.time
            ||received.length>=(task==='compare'?4:1))throw new Error('Недопустимый результат рабочего потока');
          received.push(r);
        }
        if(event.data.done){worker.terminate();if(received.length!==(task==='compare'?4:1))throw new Error('Неполный результат операции');resolve(received);}
      }catch(error){worker.terminate();reject(error);}
    };
    worker.postMessage({task,input});
  });
  return {promise,cancel:()=>{worker.terminate();rejectJob(new Error('Операция отменена'));}};
}
