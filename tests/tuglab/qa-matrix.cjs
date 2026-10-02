// Матрица настоящего BonkLab и изолированного ядра; результаты сохраняются даже при отказе.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { core, world, input, momentum, energy } = require('./helpers.cjs');
const { BonkLab } = require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const { PRESETS, DEFAULT_PRESET_IDX } = require('../../.cache/tuglab-tests/client/src/lab/ui/presets.js');
const { defaultConfig } = core('config/validate.js');
const { stepWorld } = core('physics/step.js');
const ratios = [0.1, 0.25, 0.5, 1, 2, 5, 10];
const types = ['rod', 'rope', 'spring'];
const preset = PRESETS[DEFAULT_PRESET_IDX];
const normalized = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const values = s => [s.x, s.y, s.vx, s.vy, s.angle, s.angularVelocity, ...Object.values(s.towing.B.position),
  ...Object.values(s.towing.B.velocity), s.towing.B.angle, s.towing.B.angularVelocity, s.towing.distance,
  ...s.orbs.flatMap(o => [o.x, o.y, o.vx, o.vy])];
function stock(type, ratio, renderRate) {
  const lab = new BonkLab({}, { towing: true });
  for (const [key, value] of Object.entries(preset.values)) lab.updateParams(key, value);
  lab.updateParams('tow.type', type); lab.updateParams('tow.massRatio', ratio); lab.reset();
  const start = lab.getState(), map = JSON.stringify(start.arena);
  const result = { type, ratio, renderRate, seed: 42, obstacleCount: start.arena.obstacles.length,
    orbCount: start.orbs.length, massA: start.mass, radiusA: start.radius, params: lab.params,
    contacts: { A: 0, B: 0, pair: 0, wall: 0, arena: 0 }, maxSubsteps: 0, maxRodError: 0,
    maxCouplingImpulse: 0, maxSpeed: 0, maxSpeedA: 0, maxSpeedB: 0, firstExcessSpeed: null,
    outsideSpeedRangeFrames: 0, minStaticClearance: Infinity, deaths: 0, failures: [] };
  let lastContacts = [];
  const advance = lab.towing.advance.bind(lab.towing);
  lab.towing.advance = (...args) => {
    const r = advance(...args);
    lastContacts = r.contacts.map(c=>({...c,obstacleType:c.other.startsWith('arena:')?start.arena.obstacles[Number(c.other.slice(6))]?.type:undefined}));
    for (const c of r.contacts) {
      result.contacts[c.body]++;
      result.contacts[c.other === 'A' || c.other === 'B' ? 'pair' : c.other.startsWith('arena:') ? 'arena' : 'wall']++;
    }
    return r;
  };
  lab.start(); let dead = false;
  // Четыре секунды штатного отсчёта, затем пять трёхсекундных участков.
  const controls = [[0,-1,1],[Math.SQRT1_2,-Math.SQRT1_2,1],[1,0,1],[0,0,0],[0,-1,1]];
  for (let frame = 0; frame < 19 * renderRate; frame++) {
    const section = Math.floor(frame / (3 * renderRate) - 4 / 3);
    lab.setInput(...(frame < 4 * renderRate ? [0,0,0] : controls[section]));
    const alpha = lab.update(1 / renderRate); lab.getInterpolatedState(alpha);
    const s = lab.getState(), d = s.towing.diagnostics;
    if (s.deathTimer > 0 && !dead) result.deaths++;
    dead = s.deathTimer > 0;
    result.maxSubsteps = Math.max(result.maxSubsteps, d.solverSubsteps || 0);
    if (d.outsideSpeedRange) result.outsideSpeedRangeFrames++;
    result.maxRodError = Math.max(result.maxRodError, d.rodError);
    result.maxCouplingImpulse = Math.max(result.maxCouplingImpulse, Math.abs(d.couplingImpulse));
    const speedA=Math.hypot(s.vx,s.vy),speedB=Math.hypot(s.towing.B.velocity.x,s.towing.B.velocity.y);
    result.maxSpeedA=Math.max(result.maxSpeedA,speedA);result.maxSpeedB=Math.max(result.maxSpeedB,speedB);
    result.maxSpeed=Math.max(result.maxSpeed,speedA,speedB);
    if(!result.firstExcessSpeed&&Math.max(speedA,speedB)>200) result.firstExcessSpeed={frame,time:frame/renderRate,speedA,speedB,zone:s.currentZone,contacts:lastContacts};
    for (const b of [{position:{x:s.x,y:s.y},radius:s.radius},s.towing.B]) {
      const {x,y} = b.position;
      const clearances = [s.arena.width/2-Math.abs(x)-b.radius,s.arena.height/2-Math.abs(y)-b.radius,
        ...s.arena.obstacles.filter(o=>o.alive!==false).map(o=>Math.hypot(x-o.x,y-o.y)-b.radius-o.radius)];
      result.minStaticClearance = Math.min(result.minStaticClearance,...clearances);
    }
    if (!values(s).every(Number.isFinite) || s.towing.needsRestart || !lab.isRunning) {
      result.failures.push({frame,time:frame/renderRate,reason:s.towing.reason || 'nonfinite/stopped',diagnostics:d}); break;
    }
  }
  const end = lab.getState(); result.final = values(end); result.elapsed = end.elapsedTime;
  result.mapUnchanged = JSON.stringify(end.arena) === map;
  if(result.minStaticClearance < -1e-6 || result.maxRodError > 0.01 * Number(lab.params['tow.length']))
    result.failures.push({reason:'penetration or rod tolerance exceeded'});
  lab.stop(); return result;
}
function isolated(type, ratio, tickRate) {
  const config = {...defaultConfig, couplingType:type, massRatio:ratio, enginesEnabled:false, tickRate,
    springStiffness:1250,springDamping:0};
  let w = world(config);
  w.A.velocity = {x:3,y:2}; w.B.velocity = {x:3,y:-1};
  w.A.angularVelocity = 0.03; w.B.angularVelocity = -0.02;
  const p = momentum(w);
  const totalEnergy = state => energy(state) + (type === 'spring' ? 0.5*state.coupling.k*(state.coupling.length-config.length)**2 : 0);
  const initialEnergy = totalEnergy(w);
  const row = {type,ratio,tickRate,seconds:60,maxLinearError:0,maxAngularError:0,maxEnergyGrowth:0,maxConstraintError:0,failures:[]};
  for (let tick=0;tick<60*tickRate;tick++) {
    const r=stepWorld(w,input,config);
    if(r.stopReason) {row.failures.push({tick,reason:r.stopReason});break;}
    w=r.world; const q=momentum(w);
    row.maxLinearError=Math.max(row.maxLinearError,normalized(q.x,p.x),normalized(q.y,p.y));
    row.maxAngularError=Math.max(row.maxAngularError,normalized(q.angular,p.angular));
    row.maxEnergyGrowth=Math.max(row.maxEnergyGrowth,(totalEnergy(w)-initialEnergy)/initialEnergy);
    const c=w.coupling;
    const error=type==='rod'?Math.abs(c.length-c.restLength):type==='rope'?Math.max(0,c.length-c.restLength):Math.max(0,c.minLength-c.length,c.length-c.maxLength);
    row.maxConstraintError=Math.max(row.maxConstraintError,error/config.length);
  }
  row.energyChange=(totalEnergy(w)-initialEnergy)/initialEnergy;
  const mass=w.A.mass+w.B.mass;
  row.metrics={comX:(w.A.mass*w.A.position.x+w.B.mass*w.B.position.x)/mass,
    comY:(w.A.mass*w.A.position.y+w.B.mass*w.B.position.y)/mass,
    comVx:momentum(w).x/mass,comVy:momentum(w).y/mass,energy:totalEnergy(w)};
  if(row.maxLinearError>1e-5||row.maxAngularError>1e-5||row.maxConstraintError>0.01||row.maxEnergyGrowth>0.005) row.failures.push({reason:'acceptance threshold exceeded'});
  return row;
}
const report={codeSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),timestamp:new Date().toISOString(),
  node:process.version,platform:process.platform,arch:process.arch,preset:preset.label,stock:[],isolated:[],renderComparisons:[],tickComparisons:[]};
for(const type of types) for(const ratio of ratios) {
  const games=[30,60,120].map(rate=>stock(type,ratio,rate)); report.stock.push(...games);
  const base=games[1].final;
  for(const game of [games[0],games[2]]) {
    const maxDelta=Math.max(...game.final.map((value,i)=>Math.abs(value-base[i])));
    report.renderComparisons.push({type,ratio,renderRate:game.renderRate,maxDelta,pass:maxDelta<=1e-7});
  }
  const numerics=[30,60].map(rate=>isolated(type,ratio,rate)); report.isolated.push(...numerics);
  const maxMetricDifference=Math.max(...Object.keys(numerics[0].metrics).map(key=>normalized(numerics[0].metrics[key],numerics[1].metrics[key])));
  report.tickComparisons.push({type,ratio,metrics:Object.keys(numerics[0].metrics),maxMetricDifference,pass:maxMetricDifference<=0.05});
  console.log(`${type} B/A=${ratio}: stock=${games.every(r=>!r.failures.length)} isolated=${numerics.every(r=>!r.failures.length)}`);
}
report.pass=report.stock.every(r=>!r.failures.length)&&report.isolated.every(r=>!r.failures.length)&&report.renderComparisons.every(r=>r.pass)&&report.tickComparisons.every(r=>r.pass);
const output=process.env.TUGLAB_QA_OUTPUT||'.cache/tuglab-qa/matrix.json';
fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`${report.pass?'PASS':'FAILED'} matrix; evidence ${output}`); process.exitCode=report.pass?0:1;
