const crypto=require('node:crypto');
const path=require('node:path');
const compiled=process.env.TUGLAB2_COMPILED_ROOT?path.resolve(process.env.TUGLAB2_COMPILED_ROOT):path.resolve(__dirname,'../../.cache/tuglab2-tests/client/src');
const load=name=>require(path.join(compiled,name));
const {createDefaultTrainConfig,fitTrainShip,fitTrainLink}=load('tuglab2/config.js');
const {createScene}=load('tuglab2/scenes.js');
const {TrainSession}=load('tuglab2/session.js');
const {defaultAssistantSettings}=load('tuglab2/assistant.js');
const {trainConnectionGeometry,trainNamedBodies}=load('tuglab2/train.js');
const SEED=20261011,MODES=['coast','guard','brake'],MIRRORS=[-1,1];
const idle={x:0,y:0,magnitude:0,brake:false};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inputAt=(c,k)=>{
  const t=k/c.hz;if(t>=c.brakeAt)return {...idle,brake:true};
  if(c.template==='empty')return t<5?{...idle,x:1,magnitude:1}:idle;
  if(c.template==='moving-detach')return t<2?{...idle,x:1,magnitude:1}:idle;
  if(c.template==='passage-straight')return {...idle,x:1,magnitude:1};
  if(c.template==='passage-turn90')return t<10?{...idle,x:1,magnitude:1}:{...idle,y:c.mirror,magnitude:1};
  if(c.template==='turn'){
    if(t<5)return {...idle,x:1,magnitude:1};if(t>=15)return idle;
    const u=(t-5)/10,angle=c.variant==='arc'?c.mirror*Math.PI/2*(3*u*u-2*u*u*u):c.mirror*Number(c.variant)*Math.PI/180;
    return {...idle,x:Math.cos(angle),y:Math.sin(angle),magnitude:1};
  }
  return {...idle,brake:true};
};
function makeCase(cohort,index,options,identity){
  const c={id:`${cohort}-${String(index).padStart(3,'0')}`,cohort,hz:60,speed:40,mirror:1,mode:'coast',delay:.25,g:1,
    aSize:'M',bSize:'L',cSize:'M',rest:360,module:'M',template:'brake0',brakeAt:0,composition:'train',...options};
  c.dt=1/c.hz;c.requestedSeconds=c.brakeAt+60;c.requestedTicks=c.requestedSeconds*c.hz;c.seed=SEED;
  c.settings={...defaultAssistantSettings(),mode:c.mode,g:c.g,delay:c.delay};c.fa=true;
  c.events=c.template==='moving-detach'?[{tick:2*c.hz,type:'detach',id:c.variant},{tick:3*c.hz,type:'capture',id:c.variant},
    {tick:3*c.hz+1,type:'mode',value:c.mode}]:[];
  c.inputTemplate={name:c.template,hz:c.hz,mirror:c.mirror,variant:c.variant??null,brakeAt:c.brakeAt,requestedTicks:c.requestedTicks,
    intervals:c.template==='brake0'?'brake A from t0':c.template==='empty'?'+X 0..5;idle5..10;brake10..70':c.template==='turn'?'+X0..5;declared-turn5..15;idle15..20;brake20..80':
      c.template.startsWith('passage')?'declared route0..20;brake20..80':'+X0..2;idle2..4;brake4..64',rearBrake:false};
  c.inputHash=hash(c.inputTemplate);c.identity=identity;c.effectiveDelay=Math.ceil(c.delay/c.dt-1e-10)*c.dt;
  const config=createDefaultTrainConfig();config.composition=c.composition;config.world.seed=SEED;config.numerics.tickRate=c.hz;
  config.ships.A=fitTrainShip(c.aSize);config.ships.B=fitTrainShip(c.bSize,true);config.ships.C=fitTrainShip(c.cSize);
  if(c.ratio!==undefined)config.ships.B.mass=config.ships.A.mass*c.ratio;
  config.links.AB=fitTrainLink(c.module,c.rest);config.links.BC=fitTrainLink(c.module,c.rest);
  if(cohort==='failure'&&c.variant==='lateral0')config.ships.C.lateralForce=0;
  if(cohort==='failure'&&c.variant==='retro0')config.ships.C.reverseForce=0;
  const sceneId=c.template==='empty'?'empty':c.template==='turn'?'turn':c.template.startsWith('passage')?'passage':c.template==='moving-detach'?'disconnect':'braking';
  const initScene={id:sceneId,seed:SEED,mirror:c.mirror,speed:c.speed};
  const metadata={...initScene,...(c.variant?{variant:c.variant}:{}),...(cohort==='failure'?{id:'failure'}:{})};
  // Выход passage отражается явно: сама factory сохраняет seed, но не зеркалит препятствия.
  try{
    const initial=createScene(config,initScene);
    if(sceneId==='passage'&&c.mirror===-1){for(const o of initial.world.statics)o.position.y*=-1;for(const o of initial.config.world.statics)o.position.y*=-1;}
    const s=new TrainSession(initial.config,{...identity,initialState:initial,scene:metadata,settings:c.settings,fa:c.fa,dt:c.dt});
    c.config=structuredClone(s.recording.config);c.initialState=structuredClone(s.recording.initialState);c.scene=s.recording.scene;
    c.experimental=c.bSize==='XXL';c.characteristic=Math.max(...Object.values(c.initialState.bodies).map(b=>b.radius),...c.initialState.connections.map(l=>l.restLength));
    c.normalizedIdentity=hash({config:c.config,initial:c.initialState,settings:c.settings,fa:c.fa,scene:c.scene,input:c.inputTemplate,events:c.events});
  }catch(e){c.config=config;c.initialState=null;c.scene=metadata;c.initialError=e.message;c.characteristic=c.rest;}
  return c;
}
function buildManifest(identity){
  const list=[],counts={};const add=(cohort,options)=>{counts[cohort]=(counts[cohort]??0)+1;list.push(makeCase(cohort,counts[cohort],options,identity));};
  for(const speed of[40,80])for(const mirror of MIRRORS)for(const mode of MODES)add('standard',{speed,mirror,mode});
  for(const ratio of[.1,.25,.5,1,2,5,10])for(const mirror of MIRRORS)for(const mode of MODES)for(const delay of[0,.25,1])add('mass60',{ratio,mirror,mode,delay});
  for(const ratio of[.1,1,10,1556800/401200])for(const hz of[30,120])for(const mirror of MIRRORS)for(const mode of MODES)for(const delay of[0,.25,1])add('rate-control',{ratio,hz,mirror,mode,delay});
  for(const g of[0,.5])for(const mirror of MIRRORS)for(const mode of MODES)add('strength',{g,mirror,mode});
  for(const cSize of['S','L','XL'])for(const mirror of MIRRORS)for(const mode of MODES)add('rear-size',{cSize,mirror,mode});
  for(const mirror of MIRRORS)for(const mode of MODES)add('delay2',{mirror,mode,delay:2});
  const sizes={S:[['S',120],['M',180]],L:[['L',480],['XL',720]],XL:[['XL',960],['XXL',1440]]};
  for(const[aSize,options]of Object.entries(sizes))for(const[bSize,rest]of options)for(const template of['empty','brake0'])for(const mirror of MIRRORS)for(const mode of MODES)
    add('size-scenes',{aSize,cSize:aSize,bSize,rest,module:aSize,template,speed:template==='empty'?0:40,brakeAt:template==='empty'?10:0,mirror,mode});
  for(const variant of['45','90','180','arc'])for(const mirror of MIRRORS)for(const mode of MODES)add('turns',{template:'turn',variant,brakeAt:20,mirror,mode});
  for(const template of['passage-straight','passage-turn90'])for(const mirror of MIRRORS)for(const mode of MODES)add('passage',{template,brakeAt:20,mirror,mode});
  for(const variant of['g0','delay2','lateral0','retro0'])for(const mirror of MIRRORS)for(const mode of MODES)add('failure',{variant,mirror,mode,...(variant==='g0'?{g:0}:{}),...(variant==='delay2'?{delay:2}:{})});
  for(const variant of['AB','BC'])for(const mirror of MIRRORS)for(const mode of MODES)add('moving-detach',{template:'moving-detach',variant,brakeAt:4,mirror,mode});
  for(const speed of[40,80])for(const mirror of MIRRORS)add('single-control',{composition:'single',speed,mirror});
  return list;
}
function finiteTree(value){if(typeof value==='number')return Number.isFinite(value);if(value&&typeof value==='object')return Object.values(value).every(finiteTree);return true;}
function createChecker(initial){
  const errors=[],previous=new Map(),report={maxLengthExcess:0,maxPenetration:0,maxConsecutiveLength:0,maxConsecutivePenetration:0,finite:true,errors};
  const violation=(key,kind,size,tick)=>{
    const count=size>.01?(previous.get(key)??0)+1:0;previous.set(key,count);
    if(kind==='length'){report.maxLengthExcess=Math.max(report.maxLengthExcess,size);report.maxConsecutiveLength=Math.max(report.maxConsecutiveLength,count);}
    else{report.maxPenetration=Math.max(report.maxPenetration,size);report.maxConsecutivePenetration=Math.max(report.maxConsecutivePenetration,count);}
    if(count===2)errors.push({kind,key,tick,value:size,consecutive:count});
  };
  report.sample=(state,tickRecord,tick,settings)=>{
    if(!finiteTree(state)||tickRecord&&!finiteTree(tickRecord)){report.finite=false;if(!errors.some(e=>e.kind==='finite'))errors.push({kind:'finite',tick});}
    for(const l of state.connections){const d=trainConnectionGeometry(state,l).distance;
      violation(l.id,'length',l.connected?Math.max(0,d-l.maxLength,l.minLength-d)/l.restLength:0,tick);}
    const dynamic=trainNamedBodies(state).map(({id,body})=>({id,...body}));
    for(let i=0;i<dynamic.length;i++){
      const a=dynamic[i];for(let j=i+1;j<dynamic.length;j++){const b=dynamic[j];violation([a.id,b.id].sort().join('|'),'penetration',Math.max(0,a.radius+b.radius-Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y))/Math.min(a.radius,b.radius),tick);}
      for(const o of state.world.statics)violation(`${a.id}|${o.id}`,'penetration',Math.max(0,a.radius+o.radius-Math.hypot(a.position.x-o.position.x,a.position.y-o.position.y))/Math.min(a.radius,o.radius),tick);
      violation(`${a.id}|bounds`,'penetration',Math.max(0,Math.abs(a.position.x)+a.radius-state.world.width/2,Math.abs(a.position.y)+a.radius-state.world.height/2)/a.radius,tick);
    }
    if(tickRecord){const cmd=tickRecord.commandC;
      if(cmd.forward!==0||cmd.retro<0||cmd.retro>1||Math.abs(cmd.lateral)>.5+1e-12||Math.abs(cmd.yaw)>.5+1e-12)errors.push({kind:'command-range',tick});
      if(settings){const assistant=tickRecord.telemetry.assistant,off=settings.mode==='coast'||settings.g===0||!state.bodies.C||!state.config.ships.C.enginesEnabled
          ||['waiting','disconnected'].includes(assistant.status),retroLimit=settings.mode==='brake'&&tickRecord.observation?.brakeRequest?1:.25;
        if(cmd.retro>(off?0:retroLimit*settings.g)+1e-12||Math.abs(cmd.lateral)>(off?0:.5*settings.g)+1e-12||Math.abs(cmd.yaw)>(off?0:.5*settings.g)+1e-12
          ||assistant.retroBlocked&&cmd.retro!==0)errors.push({kind:'mode-command-limit',tick});
        const engine=tickRecord.engineWrenches.C;if(off&&engine&&(engine.force.x!==0||engine.force.y!==0||engine.torque!==0))errors.push({kind:'zero-C-engine',tick});
        const dt=1/state.config.numerics.tickRate,delay=Math.ceil(settings.delay/dt-1e-10)*dt;
        if(tickRecord.observation&&tickRecord.observation.time>tickRecord.time-dt-delay+1e-7)errors.push({kind:'causal-delay',tick});
      }
      for(const id of['B',...state.world.asteroids.map(b=>b.id)]){const engine=tickRecord.engineWrenches[id];if(engine&&(engine.force.x!==0||engine.force.y!==0||engine.torque!==0))errors.push({kind:'passive-engine',id,tick});}
    }
  };
  report.sample(initial,undefined,0);return report;
}
function trajectoryCheck(source,replay,characteristic){
  let maxCenterError=0,maxAngleError=0,commandMismatch=0,contactMismatch=0;
  for(let i=0;i<Math.min(source.ticks.length,replay.ticks.length);i++){
    const a=source.ticks[i],b=replay.ticks[i];
    for(const[id,body]of Object.entries(a.telemetry.bodies)){const other=b.telemetry.bodies[id];if(!other){maxCenterError=Infinity;continue;}
      maxCenterError=Math.max(maxCenterError,Math.hypot(body.position.x-other.position.x,body.position.y-other.position.y));maxAngleError=Math.max(maxAngleError,Math.abs(body.angle-other.angle));}
    if(JSON.stringify(a.commandC)!==JSON.stringify(b.commandC))commandMismatch++;
    if(JSON.stringify(a.contacts)!==JSON.stringify(b.contacts))contactMismatch++;
  }
  return {pass:source.ticks.length===replay.ticks.length&&maxCenterError<=1e-6*characteristic&&maxAngleError<=1e-6&&!commandMismatch&&!contactMismatch,
    sourceTicks:source.ticks.length,replayedTicks:replay.ticks.length,maxCenterError,maxAngleError,commandMismatch,contactMismatch};
}
function evaluatePrimary(coast,assisted){
  const sideImprovement=coast.sidePeak>0?1-assisted.sidePeak/coast.sidePeak:null,angleImprovement=coast.anglePeak>0?1-assisted.anglePeak/coast.anglePeak:null;
  const noAddedContacts=Object.entries(assisted.contacts.pairs).every(([id,pair])=>pair.count<=(coast.contacts.pairs[id]?.count??0));
  const validOutcome=r=>r.measurementComplete&&['stopped','not_stopped_timeout'].includes(r.outcome);
  const eligible=validOutcome(coast)&&validOutcome(assisted)&&noAddedContacts;
  return {pass:eligible&&(sideImprovement>=.2||angleImprovement>=.2),eligible,noAddedContacts,sideImprovement,angleImprovement};
}
module.exports={compiled,load,buildManifest,inputAt,createChecker,trajectoryCheck,evaluatePrimary,hash,SEED,MODES,MIRRORS,idle};
