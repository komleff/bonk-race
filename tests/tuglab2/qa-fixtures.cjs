const fs=require('node:fs');
const path=require('node:path');
const {load,createChecker,trajectoryCheck,idle,hash}=require('./qa-helpers.cjs');
const {createDefaultTrainConfig}=load('tuglab2/config.js');
const {createScene}=load('tuglab2/scenes.js');
const {TrainSession}=load('tuglab2/session.js');
const {exportRecording,importRecording,replayRecording,recomputeRecording}=load('tuglab2/recording.js');
function replayDefinitions(identity){
  const cases=[];for(const hz of[30,60,120])for(const family of['standard','contact','runtime-events','detach-capture','single']){
    const config=createDefaultTrainConfig();config.world.seed=20261011;config.numerics.tickRate=hz;
    if(family==='single')config.composition='single';
    if(family==='contact')config.world.statics=[{id:'fixture-rock',kind:'station',position:{x:680,y:0},radius:20}];
    const scene={id:['standard','single'].includes(family)?'braking':'empty',seed:20261011,mirror:1,speed:40};
    const initial=createScene(config,scene),events=[];
    const settings={mode:family==='detach-capture'?'coast':'brake',delay:.25};
    if(family==='runtime-events')events.push({tick:hz/2,type:'mode',value:'guard'},{tick:hz,type:'settings',value:{g:.5,delay:.5}},
      {tick:1.5*hz,type:'fa',value:false},{tick:2*hz,type:'pause'},{tick:2*hz,type:'resume'},{tick:2.5*hz,type:'mode',value:'brake'},
      {tick:3*hz,type:'settings',value:{g:1,delay:.25}},{tick:3*hz,type:'fa',value:true});
    if(family==='detach-capture')events.push(...['AB','BC'].map(id=>({tick:hz/2,type:'connection',value:{id,connected:false}})),
      ...['AB','BC'].map(id=>({tick:hz,type:'connection',value:{id,connected:true}})),{tick:hz+1,type:'mode',value:'brake'});
    const c={id:`replay-${family}-${hz}`,family,hz,dt:1/hz,requestedTicks:8*hz,config:initial.config,initialState:initial,scene,settings,fa:true,identity,events,
      inputTemplate:family==='runtime-events'?'+X0..5;brake5..8':family==='contact'?'idle0..1;brake1..8':family==='detach-capture'?'idle0..2;brake2..8':'brake0..8'};
    c.normalizedIdentity=hash(c);cases.push(c);
  }return cases;
}
function replayFixture(c,{identity,retained}){
  const s=new TrainSession(c.config,{...identity,initialState:c.initialState,scene:c.scene,settings:c.settings,fa:true,dt:c.dt});
  const snapshots=[],checker=createChecker(s.state);let error,eventCount=0;
  try{
    s.resume();for(let k=0;k<c.requestedTicks;k++){
      for(const e of c.events.filter(e=>e.tick===k)){
        const before=structuredClone(s.state);
        if(e.type==='mode')s.setMode(e.value);if(e.type==='settings')s.setAssistantSettings(e.value);if(e.type==='fa')s.setFA(e.value);
        if(e.type==='pause')s.pause();if(e.type==='resume')s.resume();
        if(e.type==='connection'){const r=s.setConnection(e.value.id,e.value.connected);if(!r.ok)throw new Error(`Capture fixture refused: ${r.reason}`);
          if(JSON.stringify(before.bodies)!==JSON.stringify(s.state.bodies))throw new Error('Connection action changed moving bodies');}
        snapshots.push({event:e,before,after:structuredClone(s.state)});eventCount++;
      }
      const t=k/c.hz,input=c.family==='runtime-events'&&t<5?{...idle,x:1,magnitude:1}:
        (c.family==='contact'&&t<1||c.family==='detach-capture'&&t<2)?idle:{...idle,brake:true};
      const r=s.step(input);if(!r.accepted)throw new Error(r.stopReason??'Unexpected pause');checker.sample(s.state,s.recording.ticks.at(-1),k+1,s.settings);
      if(s.telemetry.outcome!=='running')break;
    }
  }catch(e){error=e.message;}
  let replay,recompute;
  try{
    const imported=importRecording(exportRecording(s.recording),identity),r=replayRecording(imported,{identity}),causal=recomputeRecording(imported,{identity});
    const characteristic=Math.max(...Object.values(c.initialState.bodies).map(b=>b.radius),...c.initialState.connections.map(l=>l.restLength));
    replay=trajectoryCheck(imported,r.recording,characteristic);recompute=trajectoryCheck(imported,causal.recording,characteristic);
  }catch(e){error=error??e.message;}
  const contacts=s.recording.ticks.reduce((count,t)=>count+t.contacts.length,0);
  if(c.family==='contact'&&contacts===0)error='Contact fixture produced no accepted contacts';
  if(eventCount!==c.events.length)error=error??'Runtime fixture ended before declared events';
  const pass=!error&&checker.errors.length===0&&replay?.pass&&recompute?.pass;
  const result={id:c.id,hz:c.hz,family:c.family,pass:Boolean(pass),reason:error??null,acceptedTicks:s.recording.ticks.length,
    contacts,eventCount,outcome:s.telemetry.outcome,censored:s.telemetry.outcome==='running',replay,recompute,checks:{...checker,sample:undefined},events:snapshots,
    retainedRecord:`records/${c.id}.json.gz`};retained(c.id,s.recording);return result;
}
function ccdDefinitions(identity){
  const cases=[];
  for(const hz of[30,60,120]){
    const descriptors=[...['AB','BC','AC'].map(pair=>({type:'pair',pair})),...['A','B','C'].flatMap(body=>[{type:'asteroid',body},{type:'static',body},
      ...['minX','maxX','minY','maxY'].map(plane=>({type:'bounds',body,plane}))])];
    for(const d of descriptors){
      const config=createDefaultTrainConfig();config.world.width=config.world.height=10000;config.numerics.tickRate=hz;config.world.seed=20261011;
      const scene={id:'empty',seed:20261011,mirror:1,speed:0},initial=createScene(config,scene),dt=1/hz;
      for(const l of initial.connections)l.connected=false;
      for(const[id,b]of Object.entries(initial.bodies)){b.position={x:id==='A'?-2000:id==='B'?0:2000,y:2000};b.velocity={x:0,y:0};}
      let expected,order;
      if(d.type==='pair'){
        const[a,b]=d.pair.split('');initial.bodies[a].position={x:-150,y:0};initial.bodies[b].position={x:150,y:0};
        initial.bodies[a].velocity.x=300/dt;initial.bodies[b].velocity.x=-300/dt;expected=[a,b];order=[a,b];
      }else{
        const b=initial.bodies[d.body];b.position={x:-150,y:0};b.velocity.x=300/dt;
        if(d.type==='asteroid'){initial.world.asteroids=[{id:'ccd-rock',kind:'asteroid',position:{x:0,y:0},velocity:{x:0,y:0},angle:0,angularVelocity:0,mass:1000,radius:10,inertia:50000}];expected=[d.body,'ccd-rock'];order=[d.body,'ccd-rock'];}
        if(d.type==='static'){initial.world.statics=[{id:'ccd-station',kind:'station',position:{x:0,y:0},radius:20}];expected=[d.body,'ccd-station'];}
        if(d.type==='bounds'){
          const axis=d.plane.endsWith('X')?'x':'y',sign=d.plane.startsWith('min')?-1:1;b.position={x:0,y:0};b.position[axis]=sign*(5000-b.radius-100);b.velocity={x:0,y:0};b.velocity[axis]=sign*300/dt;expected=[d.body,`bounds:${d.plane}`];
        }
      }
      initial.config.world=structuredClone(initial.world);
      cases.push({id:`ccd-${hz}-${d.type}-${d.pair??d.body}-${d.plane??'contact'}`,hz,dt,...d,expected,order,config:initial.config,initialState:initial,scene,identity,
        inputTemplate:'one idle tick with high velocity; engine/fields OFF; free prediction crosses target'});
    }
  }return cases;
}
function ccdFixture(c,{identity,retained}){
  let s,error,contacts=[],checker,trajectory;
  try{
    s=new TrainSession(c.config,{...identity,initialState:c.initialState,scene:c.scene,settings:{mode:'coast'},fa:false,dt:c.dt});checker=createChecker(s.state);s.resume();
    const result=s.step(idle);if(!result.accepted)throw new Error(result.stopReason??'No accepted CCD tick');contacts=result.contacts;
    if(!contacts.some(e=>[e.body,e.other].sort().join('|')===[...c.expected].sort().join('|')))throw new Error('Missing accepted swept contact');
    checker.sample(s.state,s.recording.ticks[0],1);
    if(c.order){const[a,b]=c.order.map(id=>s.state.bodies[id]??s.state.world.asteroids.find(b=>b.id===id));
      if(b.position.x-a.position.x<(a.radius+b.radius)*.99)throw new Error('Bodies tunneled through the expected collision order');}
    if(c.type==='static'&&s.state.bodies[c.body].position.x>-(s.state.bodies[c.body].radius+20)*.99)throw new Error('Ship tunneled through station');
    if(c.type==='bounds'){const b=s.state.bodies[c.body],axis=c.plane.endsWith('X')?'x':'y';if(Math.abs(b.position[axis])+b.radius>5000+.01*b.radius)throw new Error('Ship tunneled through world bound');}
    const source=importRecording(exportRecording(s.recording),identity);trajectory=trajectoryCheck(source,replayRecording(source,{identity}).recording,360);
  }catch(e){error=e.message;}
  if(s)retained(c.id,s.recording);
  return {id:c.id,hz:c.hz,type:c.type,pair:c.pair??c.body,plane:c.plane??null,pass:!error&&checker?.errors.length===0&&trajectory?.pass,
    reason:error??null,contacts,checks:checker?{...checker,sample:undefined}:null,trajectory,retainedRecord:s?`records/${c.id}.json.gz`:null};
}
function runFixtures(options){
  const replays=replayDefinitions(options.identity),ccd=ccdDefinitions(options.identity);
  fs.writeFileSync(path.join(options.out,'fixture-configs.json'),JSON.stringify({identity:options.identity,replaySourceCount:15,replayRuns:15,recomputeRuns:15,ccdCount:ccd.length,replays,ccd},null,2));
  const replayResults=[],ccdResults=[];
  for(const c of replays){console.log(`Replay fixture ${c.id}`);replayResults.push(replayFixture(c,options));fs.writeFileSync(path.join(options.out,'replay-results.json'),JSON.stringify(replayResults,null,2));}
  for(const c of ccd)ccdResults.push(ccdFixture(c,options));
  fs.writeFileSync(path.join(options.out,'ccd-results.json'),JSON.stringify(ccdResults,null,2));
  return {pass:replayResults.every(r=>r.pass)&&ccdResults.every(r=>r.pass),replay:replayResults,ccd:ccdResults};
}
module.exports={runFixtures,replayDefinitions,ccdDefinitions};
