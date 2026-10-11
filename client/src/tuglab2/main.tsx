import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { buildIdentity, TrainSession } from './session';
import { createDefaultTrainConfig, cloneTrainConfig } from './config';
import { TrainControls } from './controls';
import { defaultCamera, drawTrain } from './canvasRenderer';
import { SettingsPanel } from './panels';
import { ComparisonTable, TelemetryPanel } from './telemetryPanel';
import { drawGraphs } from './graphs';
import { decodeShare, encodeShare, exportCSV, exportRecording, serializeCSVCell, type TrainRecording } from './recording';
import { downloadText, initialSession, recordingJob, type RunResult } from './io';
import type { TrainConfig } from './types';
import type { SceneSpec } from './scenes';
import './style.css';

let session=new TrainSession(createDefaultTrainConfig());
let controls:TrainControls|undefined;
const camera=defaultCamera();
const ZERO={x:0,y:0,magnitude:0,brake:false};
const sharePrefix='#tuglab2=';
function App() {
  const [,refresh]=useState(0),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState<TrainRecording>(),[preview,setPreview]=useState<RunResult>(),[results,setResults]=useState<RunResult[]>([]),[shareLink,setShareLink]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null),graphs=useRef<HTMLCanvasElement>(null),brakeA=useRef<HTMLButtonElement>(null),brakeRear=useRef<HTMLButtonElement>(null);
  const view=useRef<RunResult>(),job=useRef<ReturnType<typeof recordingJob>>(),busyRef=useRef(false);
  const update=()=>refresh(n=>n+1);
  view.current=preview;busyRef.current=busy;
  const safe=(action:()=>void)=>{try{setError('');action();update();}catch(e){setError(e instanceof Error?e.message:String(e));update();}};
  const pause=()=>{controls?.clear();if(!session.state.paused)session.pause();};
  const invalidate=()=>{setLoaded(undefined);setPreview(undefined);view.current=undefined;setResults([]);setStatus('');};
  const currentShare=()=>{const config=cloneTrainConfig(session.recording.config);config.world.statics=config.world.statics.filter(o=>!o.id.startsWith('passage:'));return encodeShare({config,settings:session.settings,scene:session.recording.scene,fa:session.fa});};
  const cleanStaleShare=()=>{
    if(location.hash.startsWith(sharePrefix)){try{const decoded=decodeShare(location.hash.slice(sharePrefix.length));if(encodeShare(decoded)!==currentShare())history.replaceState(null,'',location.pathname+location.search);}catch{/* Повреждённая ссылка остаётся видимой для исправления. */}}
  };
  const applyConfig=(config:TrainConfig,scene:SceneSpec=session.recording.scene)=>safe(()=>{
    if(!session.state.paused)throw new Error('Настройка доступна только на паузе');
    const c=cloneTrainConfig(config);
    // Генератор прохода добавляет свои препятствия; новый старт создаёт их один раз.
    c.world.statics=c.world.statics.filter(o=>!o.id.startsWith('passage:'));
    const candidate=new TrainSession(c,{settings:session.settings,scene,fa:session.fa,dt:1/c.numerics.tickRate});
    controls?.clear();session=candidate;invalidate();camera.fit=true;cleanStaleShare();
  });
  useEffect(()=>{
    controls=new TrainControls(canvas.current!,brakeA.current!,brakeRear.current!,()=>{if(!session.state.paused)session.pause();update();});
    let last=performance.now(),accumulator=0,raf=0,lastHUD=0;
    const hash=()=>{
      if(!location.hash)return;
      try {
        if(!location.hash.startsWith(sharePrefix))throw new Error('Чужая ссылка: ожидается формат TugLab-2');
        if(busyRef.current)throw new Error('Сначала завершите или отмените операцию записи');
        const p=decodeShare(location.hash.slice(sharePrefix.length));const candidate=new TrainSession(p.config,{settings:p.settings,scene:p.scene,fa:p.fa});
        controls?.clear();job.current?.cancel();session=candidate;setLoaded(undefined);setPreview(undefined);view.current=undefined;setResults([]);setStatus('Ссылка: новый старт на паузе');setError('');camera.fit=true;update();
      }catch(e){setError(e instanceof Error?e.message:String(e));update();}
    };
    const frame=(now:number)=>{
      const elapsed=Math.min(.1,(now-last)/1000);last=now;
      if(session.state.paused||view.current||busyRef.current)accumulator=0;
      else {
        accumulator+=elapsed;
        while(accumulator>=session.dt){
          try{const result=session.step(controls!.read(),controls!.rearBrake);accumulator-=session.dt;if(!result.accepted||session.state.paused){controls?.clear();break;}}
          catch(e){pause();setError(e instanceof Error?e.message:String(e));break;}
        }
      }
      const v=view.current,state=v?.state??session.state,record=v?.recording??session.recording;
      drawTrain(canvas.current!,state,camera,controls,record.ticks.at(-1)?.engineWrenches);
      if(now-lastHUD>100){lastHUD=now;update();}
      raf=requestAnimationFrame(frame);
    };
    window.addEventListener('hashchange',hash);hash();raf=requestAnimationFrame(frame);
    return ()=>{cancelAnimationFrame(raf);controls?.destroy();job.current?.cancel();window.removeEventListener('hashchange',hash);};
  },[]);
  const record=preview?.recording??loaded??session.recording,state=preview?.state??session.state,telemetry=preview?.telemetry??session.telemetry;
  useEffect(()=>{if(graphs.current)drawGraphs(graphs.current,record);},[record,record.ticks.length,session.state.world.tick]);
  const runJob=async(task:'replay'|'compare')=>{
    try {
      setError('');pause();const snapshot=loaded??session.recording;
      if(!snapshot.ticks.length)throw new Error('Сначала запишите хотя бы один принятый тик');
      setBusy(true);busyRef.current=true;setStatus('Подготовка…');
      const operation=recordingJob(task,snapshot,setStatus);job.current=operation;
      const variants=await operation.promise;
      if(task==='replay'){const r=variants[0];r.state.paused=true;setPreview(r);view.current=r;setStatus(`Воспроизведено ${r.recording.ticks.length} тиков · финальный кадр. Restart возвращает к старту.`);}
      else {setResults(variants);setStatus('Сравнение готово: четыре варианта, включая неполные и неудачные окна.');}
    }catch(e){setError(e instanceof Error?e.message:String(e));setStatus('Ошибка операции: исходный заезд сохранён');}
    finally{job.current=undefined;setBusy(false);busyRef.current=false;update();}
  };
  const importFile=async(file?:File)=>{
    if(!file||busyRef.current)return;
    try {
      setError('');pause();setBusy(true);busyRef.current=true;setStatus('Подготовка импорта…');
      const operation=recordingJob('import',file,setStatus);job.current=operation;
      const [imported]=await operation.promise,candidateRecord=imported.recording,candidate=initialSession(candidateRecord);
      controls?.clear();session=candidate;invalidate();setLoaded(candidateRecord);setStatus(`Импортировано ${candidateRecord.ticks.length} тиков. Воспроизвести — повтор от начала.`);camera.fit=true;
    }catch(e){setError(e instanceof Error?e.message:String(e));setStatus('Импорт не применён: исходный заезд сохранён');}
    finally{job.current=undefined;setBusy(false);busyRef.current=false;update();}
  };
  const comparisonCSV=()=>{
    let csv='variant,outcome,complete_input,measurement_complete,time_s,path_B_m,residual_B_m_s,omega_B_rad_s,max_lateral_B_m,max_angle_B_rad,AB_peak_N,BC_peak_N,contact_count,saturation_s\n';
    for(const r of results){const t=r.telemetry;csv+=[r.name,r.stopReason??t.outcome,r.comparison?.completeInput??false,r.comparison?.measurementComplete??false,t.time,t.brakingDistance,t.bodies.B?.speed,t.bodies.B?.angularVelocity,t.maxLateralB,t.maxAngleB,t.linkPeaks.AB?.force??'',t.linkPeaks.BC?.force??'',t.contactCount,t.saturationTime].map(v=>serializeCSVCell(typeof v==='number'?v:String(v??''))).join(',')+'\n';}
    return csv;
  };
  const saveGraph=(r:TrainRecording,name='tuglab2-graphs.png')=>safe(()=>{const exportCanvas=document.createElement('canvas');drawGraphs(exportCanvas,r);const a=document.createElement('a');a.href=exportCanvas.toDataURL('image/png');a.download=name;a.click();});
  return <div class="app" onClick={e=>{(e.target as HTMLElement).closest('button')?.blur();}}>
    <header><div class="title"><h1>TugLab-2</h1><span>Космический поезд · {buildIdentity().appVersion} · {buildIdentity().sourceSHA.slice(0,8)}</span></div>
      <nav aria-label="Управление опытом"><button disabled={busy||!!preview} onClick={()=>safe(()=>{if(session.state.paused){invalidate();session.resume();}else pause();})}>{session.state.paused?'Старт':'Пауза'}</button>
      <button disabled={busy||!!preview||!session.state.paused} onClick={()=>safe(()=>{invalidate();session.resume();session.step(controls?.read()??ZERO,controls?.rearBrake??false);session.pause();controls?.clear();})}>Step</button>
      <button disabled={busy} onClick={()=>safe(()=>{controls?.clear();session.restart();invalidate();camera.fit=true;cleanStaleShare();})}>Restart</button>
      <button disabled={busy||!!preview} onClick={()=>safe(()=>{session.setFA(!session.fa);setLoaded(undefined);cleanStaleShare();})}>FA A: {session.fa?'ON':'OFF'}</button>
      {session.state.connections.map(link=><button key={link.id} disabled={busy||!!preview} onClick={()=>safe(()=>{const result=session.setConnection(link.id,!link.connected);if(!result.ok)throw new Error(result.reason);setLoaded(undefined);})}>{link.id}: {link.connected?'расцепить':'сцепить'}</button>)}</nav>
    </header>
    <div class="error" role="alert" hidden={!error}>{error}</div>
    <div class="workspace"><main>
      <div class="camera-bar"><label>Камера<select aria-label="Камера" value={camera.mode} onChange={e=>{camera.mode=e.currentTarget.value as typeof camera.mode;update();}}><option value="A">Следить A</option><option value="B">Следить B</option><option value="train">Весь состав</option></select></label><button onClick={()=>{camera.fit=true;camera.mode='train';update();}}>Весь поезд</button><button aria-label="Увеличить" onClick={()=>{camera.scale=Math.min(camera.scale*1.2,camera.mode==='train'?camera.fitLimit:Infinity);update();}}>+</button><button aria-label="Уменьшить" onClick={()=>{camera.scale/=1.2;update();}}>−</button><span data-testid="camera-scale">{camera.scale.toFixed(4)} px/м</span></div>
      <canvas class="pilot-canvas" ref={canvas} aria-label="Космический поезд" data-testid="pilot-canvas"/>
      <div class="pilot-controls"><button ref={brakeA} disabled={busy||!!preview} data-testid="brake-a">Тормоз A</button><p>WASD / стрелки · мышь от A · сенсорный джойстик. Пробел — тормоз A. B пассивен.</p><button ref={brakeRear} disabled={busy||!!preview} data-testid="brake-rear">Тормоз заднего</button></div>
      <TelemetryPanel session={session} state={state} t={telemetry} record={record} input={controls?.read().magnitude??0} rear={controls?.rearBrake??false} brake={controls?.brake??false} preview={!!preview} settings={preview?.settings} fa={preview?.fa}/>
      <details class="graphs-panel" open><summary>Графики принятых тиков</summary><canvas ref={graphs} aria-label="Графики телеметрии"/><button onClick={()=>saveGraph(record)}>Сохранить графики PNG</button></details>
      <section class="io-panel" data-testid="io-panel"><h2>Запись и сравнение</h2><p>JSON — заезд от начала в той же сборке. Ссылка — параметры нового опыта на паузе.</p><div class="quick">
        <button disabled={busy} onClick={()=>safe(()=>downloadText('tuglab2-run.json',exportRecording(record)))}>Сохранить JSON</button>
        <button disabled={busy} onClick={()=>safe(()=>downloadText('tuglab2-run.csv',exportCSV(record),'text/csv'))}>Сохранить CSV</button>
        <label class="file-label">Импорт JSON<input aria-label="Импорт JSON" type="file" accept=".json,application/json" disabled={busy} onChange={e=>{void importFile(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label>
        <button disabled={busy} onClick={()=>void runJob('replay')}>Воспроизвести</button><button disabled={busy} onClick={()=>void runJob('compare')}>Сравнить режимы</button>
        <button disabled={busy} onClick={()=>safe(()=>{const link=location.href.split('#')[0]+sharePrefix+currentShare();setShareLink(link);history.replaceState(null,'',link);setStatus('Ссылка готова: новый опыт с параметрами на паузе.');})}>Поделиться</button>
        {busy&&<button onClick={()=>job.current?.cancel()}>Отменить операцию</button>}
      </div>{shareLink&&<label>Ссылка<input aria-label="Ссылка" value={shareLink} readOnly onFocus={e=>e.currentTarget.select()}/></label>}<p role="status" data-testid="io-status">{status}</p>
      {results.length>0&&<><ComparisonTable results={results}/><div class="quick"><button onClick={()=>safe(()=>downloadText('tuglab2-comparison.json',JSON.stringify({app:'tuglab2-comparison',...buildIdentity(),variants:results})))}>Сравнение JSON</button><button onClick={()=>safe(()=>downloadText('tuglab2-comparison.csv',comparisonCSV(),'text/csv'))}>Сравнение CSV</button>{results.map(r=><span><button onClick={()=>safe(()=>downloadText(`tuglab2-${r.recording.config.composition}-${r.recording.settings.mode}.csv`,exportCSV(r.recording),'text/csv'))}>{r.name} CSV</button><button onClick={()=>saveGraph(r.recording,`tuglab2-${r.recording.config.composition}-${r.recording.settings.mode}.png`)}>{r.name} графики PNG</button></span>)}</div></>}
      </section>
      <details class="help"><summary>Как провести опыт</summary><p>Стартовый M–L–M: две пружины M по 360 м. Ведите A; C никогда не использует маршевый двигатель. «Накат» сохраняет массу C; «Один тягач» исключает C и BC. Brake A или удержание заднего тормоза запрашивает повышенную ретротягу только в режиме помощи при торможении.</p><p>Торможение со смещением задаёт 40/80 м/с и зеркальные ±5°/±2 м/с. Поворот/дуга и размыкание — сценарии ручного пилотирования; выберите мировое направление или кнопку связи. Restart повторяет исходные параметры. После расцепки включите режим C явно.</p><p>Остановка: все тела &lt;1 м/с и |ω|&lt;1°/с непрерывно 2 с; предел 60 с после тормоза. Неудачный исход сохраняйте в JSON. Сравнение использует тот же ввод A; короткая запись — неполное окно. Пружины не сталкиваются с препятствиями, не оборачиваются и не рвутся; 0.5…1.5 l₀ — численные ограничения LAB. Допуски захвата LAB, не production. Android и полезность ассистента квалифицируются отдельно.</p></details>
    </main><SettingsPanel session={session} locked={busy||!!preview} config={applyConfig} settings={patch=>safe(()=>{session.setAssistantSettings(patch);setLoaded(undefined);cleanStaleShare();})} mode={mode=>safe(()=>{session.setMode(mode);setLoaded(undefined);cleanStaleShare();})}/></div>
  </div>;
}
render(<App/>,document.getElementById('app')!);
