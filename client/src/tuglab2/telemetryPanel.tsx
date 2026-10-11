import type { TrainSession } from './session';
import type { TrainState } from './types';
import type { TrainTelemetry } from './telemetry';
import type { TrainRecording } from './recording';
import type { RunResult } from './io';
import type { AssistantSettings } from './assistant';
import { trainConnectionGeometry } from './train';
import { RECORDING_REASON } from './recordingLimits';
export const fmt=(n:number|undefined,digits=2):string=>n===undefined?'н/д':Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:digits}):'н/д';
export const outcomeName=(t:TrainTelemetry,reason?:string):string=>{
  if(reason===RECORDING_REASON)return 'Ресурсная остановка';
  if(t.outcome==='numerical-stop'||reason&&/^(Исчерпан численный бюджет:|Недопустимое состояние или численные настройки|Вырожденная геометрия:)/.test(reason))return 'Численная остановка';
  if(reason)return 'Заезд завершён · причина из записи';
  return ({running:'Окно записи не завершено',stopped:'Остановлен',timeout:'Не остановлен (60 с)', 'numerical-stop':'Численная остановка'})[t.outcome];
};
export function TelemetryPanel({session,state,t,record,input,rear,brake,preview,stopReason,sourceStopReason,settings=session.settings,fa=session.fa}:{session:TrainSession;state:TrainState;t:TrainTelemetry;record:TrainRecording;input:number;rear:boolean;brake:boolean;preview:boolean;stopReason?:string;sourceStopReason?:string;settings?:AssistantSettings;fa?:boolean}) {
  const last=record.ticks.at(-1),c=t.assistant,bodyB=state.bodies.B,initialA=record.initialState.bodies.A;
  const transverse=-bodyB.velocity.x*Math.sin(initialA.angle)+bodyB.velocity.y*Math.cos(initialA.angle);
  return <section class="telemetry" data-testid="train-hud" data-time={state.world.time} data-input={input} data-rear={rear}>
    <h2>{preview?'Повтор · финальный кадр':state.paused?'Пауза':'Полёт'} · {fmt(state.world.time)} с</h2>
    <p>FA A: {fa?'ON':'OFF'} · C: {settings.mode} · {state.paused?'двигатели сейчас OFF':session.assistantStatus} · g={fmt(settings.g*100)}% · задержка {fmt(Math.ceil(settings.delay/record.dt-1e-10)*record.dt,3)} с</p>
    <div class="hud-grid">{Object.values(state.bodies).map(b=><div key={b.id} data-testid={`body-${b.id}`} data-speed={Math.hypot(b.velocity.x,b.velocity.y)}><b>{b.id}</b>: {fmt(Math.hypot(b.velocity.x,b.velocity.y))} м/с · направление {Math.hypot(b.velocity.x,b.velocity.y)>1e-9?fmt(Math.atan2(b.velocity.y,b.velocity.x)*180/Math.PI)+'°':'—'} · ω {fmt(b.angularVelocity*180/Math.PI)} °/с · {fmt(b.mass)} кг</div>)}</div>
    <p>Связи сейчас · геометрия и мгновенная сила:</p>
    <div class="hud-grid">{(['AB','BC'] as const).map(id=>{const l=state.connections.find(link=>link.id===id),g=l?trainConnectionGeometry(state,l):undefined;return <div key={id}><b>{id}</b>: {l&&g?`${l.connected?'ON':'OFF'} · d ${fmt(g.distance)} / l₀ ${fmt(l.restLength)} м · d/l₀ ${fmt(g.distance/l.restLength,3)} · Δ ${fmt((g.distance-l.restLength)/l.restLength*100)}% · q ${fmt(g.radialVelocity)} м/с · T ${fmt(l.connected?l.k*(g.distance-l.restLength)+l.c*g.radialVelocity:0)} Н · ограничители (принятые тики) ${t.links[id]?.limitCount??'н/д'}`:'отсутствует'}</div>;})}</div>
    <p>Brake A {brake?'ON':'OFF'} · задний запрос {rear?'ON':'OFF'} · задержанный запрос {last?.observation?.brakeRequest?'ON':'OFF'} · C команды: ретро {state.paused?'0':fmt(session.commandC.retro,3)}, бок {state.paused?'0':fmt(session.commandC.lateral,3)}, момент {state.paused?'0':fmt(session.commandC.yaw,3)}. Маршевая 0.</p>
    {stopReason&&<p role="alert">{stopReason}</p>}
    {!preview&&sourceStopReason&&<p>Исход сохранённого заезда: {sourceStopReason}. Сейчас показан начальный кадр на паузе; итог доступен после воспроизведения.</p>}
    <details><summary>Подробная телеметрия и итог</summary>
      <p>Запрос C: ретро {fmt(c.requested.retro)} Н · бок {fmt(c.requested.lateral)} Н · момент {fmt(c.requested.yaw)} Н·м. Насыщение: {Object.entries(c.saturation).filter(([,v])=>v).map(([k])=>k).join(', ')||'нет'}; блок ретро {c.retroBlocked?'ON':'OFF'}.</p>
      <p>Поперечная скорость B {fmt(transverse)} м/с · угол B–A {fmt(t.relativeAngleBA*180/Math.PI)}° · B–C {t.relativeAngleBC===null?'н/д':fmt(t.relativeAngleBC*180/Math.PI)+'°'} · скорость центра масс {fmt(t.comSpeed)} м/с</p>
      {Object.entries(t.anchors).map(([id,a])=><p>{id} нос ({fmt(a!.nose.x)}; {fmt(a!.nose.y)}) м · хвост ({fmt(a!.tail.x)}; {fmt(a!.tail.y)}) м</p>)}
      <p>Двигатели сейчас: {state.paused?'0 Н / 0 Н·м':'см. последний принятый средний'}. Последний принятый средний за тик:</p>
      {Object.entries(last?.engineWrenches??{}).map(([id,w])=><p>{id}: Fx {fmt(w.force.x)} Н · Fy {fmt(w.force.y)} Н · τ {fmt(w.torque)} Н·м</p>)}
      <p>Контакты за тик: {t.contacts.map(contact=>`${contact.body}–${contact.other}: ${fmt(contact.impulse)} Н·с`).join('; ')||'нет'}; всего {t.contactCount}, пик {fmt(t.maxContactImpulse)} Н·с. Попытки {t.solverAttempts}, принятые подшаги {t.solverSubsteps}, бюджет {state.config.numerics.maxAdaptiveSubsteps}.</p>
      <p><b>{outcomeName(t,stopReason)}</b> · торможение {t.brakeTime===null?'не запрошено':fmt(t.time-t.brakeTime)+' с'} · путь B после запроса {fmt(t.brakingDistance)} м · весь путь B {fmt(t.pathB)} м</p>
      <p>Остаток B: {fmt(t.bodies.B?.speed)} м/с / {fmt((t.bodies.B?.angularVelocity??0)*180/Math.PI)} °/с · боковой уход max {fmt(t.maxLateralB)} м · развёрнутый угол max {fmt(t.maxAngleB*180/Math.PI)}° · зазор min {fmt(t.minClearance)} м</p>
      <p>Пик AB {fmt(t.linkPeaks.AB?.force)} Н / {fmt((t.linkPeaks.AB?.extension??0)*100)}% · BC {fmt(t.linkPeaks.BC?.force)} Н / {fmt((t.linkPeaks.BC?.extension??0)*100)}%</p>
      <p>Насыщение C: ретро {fmt(t.saturationByChannel.retro)} с · бок {fmt(t.saturationByChannel.lateral)} с · момент {fmt(t.saturationByChannel.yaw)} с</p>
    </details>
  </section>;
}
export function ComparisonTable({results}:{results:RunResult[]}) {
  return <div class="table-scroll"><table data-testid="comparison-table"><caption>Одинаковый принятый ввод A. Один тягач меняет состав и общую массу.</caption><thead><tr>{['Вариант','Итог / окно','Масса, кг','Торможение, с','Путь B, м','B остаток, м/с; °/с','Бок max, м','Угол max, °','AB / BC пик, Н','Зазор, м','Контакты','Насыщение C, с'].map(v=><th>{v}</th>)}</tr></thead><tbody>{results.map(r=>{const t=r.telemetry,comparison=r.comparison;return <tr key={r.name}><th>{r.name}</th><td>{r.stopReason??outcomeName(t)}<br/>{comparison?.measurementComplete?'Измерение завершено':'Неполное окно'} · {comparison?.acceptedTicks??r.recording.ticks.length}/{comparison?.sourceTicks??r.recording.ticks.length} тиков{comparison?.compositionChanged?' · состав изменён':''}</td><td>{fmt(Object.values(r.state.bodies).reduce((v,b)=>v+b.mass,0))}</td><td>{t.brakeTime===null?'н/д':fmt(t.time-t.brakeTime)}</td><td>{fmt(t.brakingDistance)}</td><td>{fmt(t.bodies.B?.speed)}; {fmt((t.bodies.B?.angularVelocity??0)*180/Math.PI)}</td><td>{fmt(t.maxLateralB)}</td><td>{fmt(t.maxAngleB*180/Math.PI)}</td><td>{fmt(t.linkPeaks.AB?.force)} / {fmt(t.linkPeaks.BC?.force)}</td><td>{fmt(t.minClearance)}</td><td>{t.contactCount}</td><td>{fmt(t.saturationTime)}</td></tr>;})}</tbody></table></div>;
}
