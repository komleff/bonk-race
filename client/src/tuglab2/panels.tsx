import { useEffect, useState } from 'preact/hooks';
import type { TrainSession } from './session';
import { cloneTrainConfig, fitTrainLink, fitTrainShip } from './config';
import type { TrainConfig, TrainBodyId } from './types';
import type { AssistantSettings } from './assistant';
import type { SceneSpec } from './scenes';
import { HULL_CATALOG, type HullSize } from '../u2taglab/profile';

interface NumberProps {label:string;value:number;change:(v:number)=>void;min?:number;max?:number;disabled?:boolean}
export function NumberField({label,value,change,min=-Infinity,max=Infinity,disabled}:NumberProps) {
  const [draft,setDraft]=useState(String(value)),[error,setError]=useState('');
  useEffect(()=>{setDraft(String(value));setError('');},[value]);
  const commit=()=>{
    const v=Number(draft);if(!draft.trim()||!Number.isFinite(v)||v<min||v>max){setError(`Допустимое значение: ${min}…${max}`);return;}
    setError('');if(v!==value){try{change(v);}catch(e){setError(e instanceof Error?e.message:String(e));}}
  };
  return <label class="number-field"><span>{label}</span><input aria-label={label} type="text" inputMode="decimal" value={draft} disabled={disabled}
    onInput={e=>setDraft(e.currentTarget.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>{error&&<small role="alert">{error}</small>}</label>;
}
interface Props {
  session:TrainSession;locked:boolean;
  config:(config:TrainConfig,scene?:SceneSpec)=>void;
  settings:(patch:Partial<AssistantSettings>)=>void;mode:(mode:AssistantSettings['mode'])=>void;
}
const sizes:HullSize[]=['XS','S','M','L','XL','XXL'];
const sceneOptions:[string,string][]=[['empty','Пустое пространство'],['braking','Торможение со смещением'],['turn:45','Поворот 45°'],['turn:90','Поворот 90°'],['turn:180','Поворот 180°'],['turn:arc','Плавная дуга'],['passage','Узкий проход'],['failure:g0','Отказ: g=0'],['failure:delay2','Отказ: задержка 2 с'],['failure:lateral0','Отказ: бок C=0'],['failure:retro0','Отказ: ретро C=0'],['disconnect:AB','Размыкание AB'],['disconnect:BC','Размыкание BC']];
export function SettingsPanel({session,locked,config,settings,mode}:Props) {
  const cfg=session.recording.config,scene=session.recording.scene,s=session.settings,structural=locked||!session.state.paused;
  const change=(fn:(c:TrainConfig)=>void,sc:SceneSpec=scene)=>{const c=cloneTrainConfig(cfg);fn(c);config(c,sc);};
  const patchShip=(id:TrainBodyId,key:string,v:number)=>change(c=>{
    (c.ships[id] as unknown as Record<string,unknown>)[key]=v;
    if(key==='speedLimit')c.ships[id].speedLimits={forward:v,reverse:v,lateral:v};
  });
  const sceneKey=scene.variant?`${scene.id}:${scene.variant}`:scene.id;
  return <aside class="settings-panel" data-testid="settings-panel">
    <h2>Опыт</h2><p class="muted">Корпуса, массы, двигатели и сцены применяются новым стартом на паузе.</p>
    <label>Сцена<select aria-label="Сцена" value={sceneKey} disabled={structural} onChange={e=>{
      const [id,variant]=e.currentTarget.value.split(':');const sc={...scene,id:id as SceneSpec['id'],variant:variant as SceneSpec['variant'],speed:id==='braking'?40:0} as SceneSpec;
      change(()=>{},sc);
    }}>{sceneOptions.map(([id,name])=><option value={id}>{name}</option>)}</select></label>
    <NumberField label="Seed" value={scene.seed} min={0} max={4294967295} disabled={structural} change={v=>{if(!Number.isInteger(v))throw new Error('Seed должен быть целым');change(()=>{},{...scene,seed:v});}}/>
    <label>Зеркало<select aria-label="Зеркало" value={scene.mirror} disabled={structural} onChange={e=>change(()=>{},{...scene,mirror:Number(e.currentTarget.value) as 1|-1})}><option value={1}>+5° / +2 м/с</option><option value={-1}>−5° / −2 м/с</option></select></label>
    {scene.id==='braking'&&<label>Начальная скорость<select aria-label="Начальная скорость" value={scene.speed} disabled={structural} onChange={e=>change(()=>{},{...scene,speed:Number(e.currentTarget.value) as 40|80})}><option value={40}>40 м/с</option><option value={80}>80 м/с</option></select></label>}
    <label>Состав<select aria-label="Состав" value={cfg.composition} disabled={structural} onChange={e=>change(c=>{c.composition=e.currentTarget.value as TrainConfig['composition'];})}><option value="train">Поезд A–B–C</option><option value="single">Один тягач A–B</option></select></label>
    {(['A','B','C'] as const).map(id=>{const p=cfg.ships[id],preset=fitTrainShip(p.size,id==='B');const custom=Object.keys(preset).some(k=>JSON.stringify((p as unknown as Record<string,unknown>)[k])!==JSON.stringify((preset as unknown as Record<string,unknown>)[k]));
      return <fieldset key={id} disabled={structural||(id==='C'&&cfg.composition==='single')}><legend>{id}: {id==='B'?'пассивный груз':id==='A'?'передний тягач':'задний тягач'} {custom?'· пользовательский':'· пресет'}</legend>
        <label>Корпус {id}<select aria-label={`Корпус ${id}`} value={p.size} onChange={e=>change(c=>{c.ships[id]=fitTrainShip(e.currentTarget.value as HullSize,id==='B');})}>{(id==='B'?sizes:sizes.filter(v=>['S','M','L','XL'].includes(v))).map(size=><option value={size}>{size} · {HULL_CATALOG[size].length}×{HULL_CATALOG[size].width} м</option>)}</select></label>
        <NumberField label={`Масса ${id}, кг`} value={p.mass} min={1} max={1e12} change={v=>patchShip(id,'mass',v)}/>
      </fieldset>;})}
    <p>B/A={(cfg.ships.B.mass/cfg.ships.A.mass).toFixed(3)} · C/A={cfg.composition==='train'?(cfg.ships.C.mass/cfg.ships.A.mass).toFixed(3):'н/д'} · B/(A+C)={(cfg.ships.B.mass/(cfg.ships.A.mass+(cfg.composition==='train'?cfg.ships.C.mass:0))).toFixed(3)}</p>
    <div class="quick" aria-label="Масса B/A">{[.1,.25,.5,1,2,5,10].map(r=><button disabled={structural} onClick={()=>change(c=>{c.ships.B.mass=c.ships.A.mass*r;})}>{r*100}%</button>)}</div>
    <h2>Задний ассистент</h2><div class="quick">{(['coast','guard','brake'] as const).map(m=><button disabled={locked||cfg.composition==='single'} aria-pressed={s.mode===m} onClick={()=>mode(m)}>{m==='coast'?'Накат':m==='guard'?'Страховка':'Помощь при торможении'}</button>)}</div>
    <p>{s.mode==='coast'?'Двигатели C OFF':'Маршевый двигатель C OFF · режим включается явно после повторной сцепки'}</p>
    <NumberField label="Помощь g, %" value={s.g*100} min={0} max={100} disabled={locked} change={v=>settings({g:v/100})}/>
    <div class="quick">{[0,50,100].map(v=><button disabled={locked} onClick={()=>settings({g:v/100})}>g {v}%</button>)}</div>
    <NumberField label="Задержка, с" value={s.delay} min={0} max={2} disabled={locked} change={v=>settings({delay:v})}/>
    <div class="quick">{[0,.25,1,2].map(v=><button disabled={locked} onClick={()=>settings({delay:v})}>{v} с</button>)}</div>
    <details data-testid="expert-settings"><summary>Экспертные настройки</summary>
      {(['A','C'] as const).map(id=><fieldset key={id} disabled={structural||(id==='C'&&cfg.composition==='single')}><legend>Двигатели {id} · LAB</legend>
        {([['forwardForce','Маршевая тяга, Н'],['reverseForce','Ретротяга, Н'],['lateralForce','Боковая тяга, Н'],['yawTorque','Момент, Н·м'],['speedLimit','Общий V_FA, м/с'],['yawLimit','Предел вращения, рад/с'],['yawStopTime','Время остановки вращения, с'],['comfortableBrakingTime','Комфортное торможение, с'],['emergencyBrakingTime','Аварийное торможение, с'],['coastDeadzone','Мёртвая зона наката, м/с'],['lateralComfort','Боковое ускорение FA, м/с²'],['crewGLimit','Предел ускорения FA, g']] as const).map(([key,label])=><NumberField label={`${id}: ${label}`} value={cfg.ships[id][key]} min={key.includes('Time')||key==='speedLimit'||key==='crewGLimit'?0.001:0} max={key==='yawTorque'?1e14:1e12} change={v=>patchShip(id,key,v)}/>)}
        <label><input type="checkbox" checked={cfg.ships[id].enginesEnabled} onChange={e=>change(c=>{c.ships[id].enginesEnabled=e.currentTarget.checked;})}/>Двигатели {id} разрешены</label>
        <p>LAB capture: {Object.values(cfg.ships[id].speedLimits).join(' / ')} м/с (вперёд / назад / бок). Изменение V_FA обновляет все три допуска захвата.</p>
      </fieldset>)}
      {(['AB','BC'] as const).map(id=>{const l=cfg.links[id];return <fieldset key={id} disabled={structural||(id==='BC'&&cfg.composition==='single')}><legend>Пружина {id}</legend>
        <label>Модуль {id}<select aria-label={`Модуль ${id}`} value={l.module} onChange={e=>{const module=e.currentTarget.value;if(module!=='custom')change(c=>{c.links[id]=fitTrainLink(module as 'S'|'M'|'L'|'XL',l.restLength);});}}>{['S','M','L','XL','custom'].map(m=><option value={m}>{m==='custom'?'Пользовательский модуль':m}</option>)}</select></label>
        <NumberField label={`${id}: l₀, м`} value={l.restLength} min={2} max={20000} change={v=>change(c=>{c.links[id].restLength=v;})}/>
        <NumberField label={`${id}: k, Н/м`} value={l.k} min={1} max={1e12} change={v=>change(c=>{c.links[id].k=v;c.links[id].module='custom';})}/>
        <NumberField label={`${id}: c, Н·с/м`} value={l.c} min={0} max={1e12} change={v=>change(c=>{c.links[id].c=v;c.links[id].module='custom';})}/>
        <p>LAB захват ≤{l.captureMaxLength} м · покой {l.restLength} м · рабочий предел {1.5*l.restLength} м. Минимум захвата 2 м; фактическая длина становится l₀.</p>
      </fieldset>;})}
      <fieldset disabled={locked}><legend>Регулятор C</legend>{(['Td','Tv','Tlat','Tyaw'] as const).map(key=><NumberField label={`${key}, с`} value={s[key]} min={.25} max={10} change={v=>settings({[key]:v})}/>)}
        <NumberField label="ε натяжения" value={s.epsilon} min={0} max={.1} change={v=>settings({epsilon:v})}/><NumberField label="Коэффициент демпфирования yaw" value={s.yawDamping} min={0} max={10} change={v=>settings({yawDamping:v})}/>
      </fieldset>
      <fieldset disabled={structural}><legend>Численные настройки</legend><label>Физика<select aria-label="Физика" value={cfg.numerics.tickRate} onChange={e=>change(c=>{c.numerics.tickRate=Number(e.currentTarget.value);})}>{[30,60,120].map(v=><option value={v}>{v} Гц</option>)}</select></label>
        {([['substeps',128],['maxAdaptiveSubsteps',4096],['solverIterations',128],['maxContactEvents',4096]] as const).map(([key,max])=><NumberField label={key} value={cfg.numerics[key]} min={1} max={max} change={v=>{if(!Number.isInteger(v))throw new Error('Бюджет должен быть целым');change(c=>{c.numerics[key]=v;});}}/>)}
      </fieldset>
    </details>
  </aside>;
}
