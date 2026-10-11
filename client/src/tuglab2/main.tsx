import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { LabInput } from '../lab/LabInput';
import { spaceEngineWrench, spaceInputFrame } from '../u2taglab/physics/flightAssist';
import { createDefaultTrainConfig, trainSpaceProfile } from './config';
import { createTrain, setTrainConnection, trainConnectionGeometry } from './train';
import { advanceTrain } from './physics';
import './style.css';

let state = createTrain(createDefaultTrainConfig());
let paused = true, fa = true, brake = false, stopReason = '';
let input: LabInput | undefined;
let scale = 1, fitRequested = true;
const clear = (): void => { input?.clear(); brake = false; };
const pause = (): void => { paused = true; state.paused = true; clear(); };

function App() {
  const [, refresh] = useState(0);
  const update = (): void => refresh(n => n + 1);
  useEffect(() => {
    const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
    input = new LabInput(canvas, { keyboard: true });
    let last = performance.now(), accumulator = 0, raf = 0, lastHUD = 0;
    const focus = (): void => { pause(); update(); };
    const visibility = (): void => { if (document.hidden) focus(); };
    const keydown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input,select,textarea,button')) return;
      e.preventDefault(); if (!e.repeat) brake = true;
    };
    const keyup = (e: KeyboardEvent): void => { if (e.code === 'Space') { brake = false; e.preventDefault(); } };
    const frame = (now: number): void => {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      if (paused) accumulator = 0;
      else {
        accumulator += dt;
        while (accumulator >= 1 / 60) {
          const s = input!.getState(), profile = trainSpaceProfile(state.config, 'A');
          const command = spaceInputFrame(state.bodies.A, s.x, s.y, s.magnitude, profile, brake);
          const next = advanceTrain(state, 1 / 60, sample => sample.id === 'A'
            ? spaceEngineWrench(sample.body, command, fa, profile, sample.subDt) : { force: { x: 0, y: 0 }, torque: 0 });
          if (next.stopReason) { stopReason = next.stopReason; pause(); update(); break; }
          state = next.state; accumulator -= 1 / 60;
        }
      }
      const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
      const bodies = Object.values(state.bodies), minX = Math.min(...bodies.map(b => b.position.x - b.radius)),
        maxX = Math.max(...bodies.map(b => b.position.x + b.radius)), minY = Math.min(...bodies.map(b => b.position.y - b.radius)),
        maxY = Math.max(...bodies.map(b => b.position.y + b.radius));
      if (fitRequested) { scale = Math.min((rect.width - 120) / Math.max(200, maxX - minX), (rect.height - 180) / Math.max(200, maxY - minY)); fitRequested = false; }
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const sx = (x: number): number => rect.width / 2 + (x - center.x) * scale;
      const sy = (y: number): number => rect.height / 2 + (y - center.y) * scale;
      ctx.strokeStyle = '#19324a'; ctx.lineWidth = 1;
      for (let x = 0; x < rect.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
      for (let y = 0; y < rect.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
      for (const c of state.connections) if (c.connected) {
        const g = trainConnectionGeometry(state, c); ctx.strokeStyle = c.id === 'AB' ? '#67dded' : '#b495ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx(g.a.position.x), sy(g.a.position.y)); ctx.lineTo(sx(g.b.position.x), sy(g.b.position.y)); ctx.stroke();
        ctx.fillStyle = '#c9ddec'; ctx.font = '12px sans-serif'; ctx.fillText(c.id, sx((g.a.position.x + g.b.position.x) / 2), sy((g.a.position.y + g.b.position.y) / 2) - 12);
      }
      for (const b of bodies) {
        const g = state.config.ships[b.id].geometry;
        ctx.save(); ctx.translate(sx(b.position.x), sy(b.position.y)); ctx.rotate(b.angle);
        ctx.fillStyle = b.id === 'A' ? '#35b9cc' : b.id === 'B' ? '#8095a5' : '#9376d6';
        ctx.strokeStyle = '#d9eaff'; ctx.lineWidth = 1.5;
        ctx.fillRect(-g.length * scale / 2, -g.width * scale / 2, g.length * scale, g.width * scale);
        ctx.strokeRect(-g.length * scale / 2, -g.width * scale / 2, g.length * scale, g.width * scale);
        ctx.beginPath(); ctx.moveTo(b.radius * scale + 7, 0); ctx.lineTo(b.radius * scale - 3, -5); ctx.lineTo(b.radius * scale - 3, 5); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#e5f5ff'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(b.id, sx(b.position.x) - 5, sy(b.position.y) - b.radius * scale - 12);
      }
      input!.setCharacterScreenPos(rect.left + sx(state.bodies.A.position.x), rect.top + sy(state.bodies.A.position.y));
      const joystick = input!.getState();
      if (joystick.active && joystick.isTouch) {
        ctx.strokeStyle = '#68e8f5'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joystick.baseScreenX - rect.left, joystick.baseScreenY - rect.top, 70, 0, 2 * Math.PI); ctx.stroke();
      }
      if (now - lastHUD > 100) { lastHUD = now; update(); }
      raf = requestAnimationFrame(frame);
    };
    window.addEventListener('blur', focus); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    canvas.addEventListener('pointercancel', focus); raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); input?.destroy(); window.removeEventListener('blur', focus); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); canvas.removeEventListener('pointercancel', focus); };
  }, []);
  const connect = (id: 'AB' | 'BC'): void => {
    const link = state.connections.find(c => c.id === id)!;
    const next = setTrainConnection(state, id, !link.connected); state = next.state; stopReason = next.reason ?? ''; update();
  };
  return <>
    <header><h1>TugLab-2</h1><span>Поезд A–B–C · космос</span><nav onClick={e => { (e.target as HTMLElement).closest('button')?.blur(); }}>
      <button onClick={() => { if (paused) { paused = false; state.paused = false; } else pause(); update(); }}>{paused ? 'Старт' : 'Пауза'}</button>
      <button onClick={() => { pause(); state = createTrain(state.config); stopReason = ''; fitRequested = true; update(); }}>Restart</button>
      <button onClick={() => { fa = !fa; update(); }}>FA A: {fa ? 'ON' : 'OFF'}</button>
      {state.connections.map(c => <button key={c.id} onClick={() => connect(c.id)}>{c.id}: {c.connected ? 'расцепить' : 'сцепить'}</button>)}
      <button onClick={() => { fitRequested = true; }}>Весь поезд</button>
      <button aria-label="Увеличить" onClick={() => { scale *= 1.2; }}>+</button><button aria-label="Уменьшить" onClick={() => { scale /= 1.2; }}>−</button>
    </nav></header>
    <canvas aria-label="Космический поезд" />
    <aside data-testid="train-hud" data-time={state.world.time}>
      <b>{paused ? 'Пауза' : 'Полёт'} · {state.world.time.toFixed(1)} с</b><p>Накат · двигатели C OFF</p>
      {Object.values(state.bodies).map(b => <div key={b.id}>{b.id}: {Math.hypot(b.velocity.x, b.velocity.y).toFixed(2)} м/с · {(b.mass / 1000).toFixed(1)} т</div>)}
      {state.connections.map(c => { const g = trainConnectionGeometry(state, c); return <div key={c.id}>{c.id}: {c.connected ? `${g.distance.toFixed(1)} / ${c.restLength.toFixed(1)} м · ${(c.k * (g.distance - c.restLength) + c.c * g.radialVelocity).toFixed(0)} Н` : 'OFF'}</div>; })}
      {stopReason && <p role="alert">{stopReason}</p>}
    </aside>
    <footer><span>WASD / мышь / сенсорный джойстик. Пробел — тормоз A. B пассивен.</span><button onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); brake = true; e.preventDefault(); }} onPointerUp={() => { brake = false; }} onPointerCancel={() => { pause(); update(); }} onLostPointerCapture={() => { brake = false; }}>Тормоз A</button></footer>
  </>;
}
render(<App />, document.getElementById('app')!);
