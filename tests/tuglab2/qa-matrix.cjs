const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {gzipSync}=require('node:zlib');
const {spawnSync,execFileSync}=require('node:child_process');
const {compiled,load,buildManifest,inputAt,createChecker,trajectoryCheck,evaluatePrimary,hash,idle}=require('./qa-helpers.cjs');
const {TrainSession,buildIdentity}=load('tuglab2/session.js');
const {importRecording,exportRecording,replayRecording,recomputeRecording,serializeCSVCell}=load('tuglab2/recording.js');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.cache/tuglab2-qa/matrix');
const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
const csvRow=values=>values.map(serializeCSVCell).join(',');
const safeName=id=>id.replace(/[^a-zA-Z0-9_-]/g,'_');
function retained(name,record){const text=exportRecording(record);fs.writeFileSync(path.join(out,'records',`${safeName(name)}.json.gz`),gzipSync(text));return Buffer.byteLength(text);}
function event(s,e){if(e.type==='mode'){s.setMode(e.value);return {ok:true};}return s.setConnection(e.id,e.type==='capture');}
function contactSummary(record){
  const pairs=Object.create(null),events=[];let impulse=0;
  for(let i=0;i<record.ticks.length;i++)for(const contact of record.ticks[i].contacts){const key=[contact.body,contact.other].sort().join('|');
    const pair=pairs[key]??={count:0,impulse:0};pair.count++;pair.impulse+=contact.impulse;impulse+=contact.impulse;events.push({tick:i+1,time:record.ticks[i].time,pair:key,...contact});}
  return {count:events.length,impulse,pairs,events};
}
const seriesColumns=['id','speed_m_s','mirror','mode','time_s','side_B_m','angle_B_rad','peak_side_B_m','peak_angle_B_rad',
  'A_speed_m_s','B_speed_m_s','C_speed_m_s','A_omega_rad_s','B_omega_rad_s','C_omega_rad_s','path_B_m','braking_distance_m',
  'AB_distance_m','AB_l0_m','AB_force_N','BC_distance_m','BC_l0_m','BC_force_N','C_retro_fraction','C_lateral_fraction','C_yaw_fraction',
  'retro_saturation_s','lateral_saturation_s','yaw_saturation_s','contacts','min_clearance_m'];
function seriesRow(c,t){const b=t.bodies.B,start=c.initialState.bodies.A,l=t.links,cmd=t.commandC;
  return csvRow([c.id,c.speed,c.mirror,c.mode,t.time,-(b.position.x-start.position.x)*Math.sin(start.angle)+(b.position.y-start.position.y)*Math.cos(start.angle),
    b.unwrappedAngle-start.angle,t.maxLateralB,t.maxAngleB,...['A','B','C'].map(id=>t.bodies[id]?.speed??''),...['A','B','C'].map(id=>t.bodies[id]?.angularVelocity??''),
    t.pathB,t.brakingDistance,l.AB?.distance??'',l.AB?.restLength??'',l.AB?.force??'',l.BC?.distance??'',l.BC?.restLength??'',l.BC?.force??'',
    cmd.retro,cmd.lateral,cmd.yaw,t.saturationByChannel.retro,t.saturationByChannel.lateral,t.saturationByChannel.yaw,t.contactCount,t.minClearance]);
}
function simulate(c,identity){
  const start=Date.now(),base={id:c.id,cohort:c.cohort,hz:c.hz,speed:c.speed,mirror:c.mirror,mode:c.mode,delay:c.delay,g:c.g,
    requestedTicks:c.requestedTicks,requestedSeconds:c.requestedSeconds,inputHash:c.inputHash,experimental:c.experimental??false};
  if(c.initialError)return {...base,outcome:'invalid_config',reason:c.initialError,acceptedTicks:0,hardFailure:true,measurementComplete:false};
  const s=new TrainSession(c.config,{...identity,initialState:c.initialState,scene:c.scene,settings:c.settings,fa:true,dt:c.dt});
  const checker=createChecker(s.state),prefix=crypto.createHash('sha256'),events=[],series=c.cohort==='standard'?[seriesRow(c,s.telemetry)]:null;
  let error,failedTick;
  try{
    s.resume();for(let k=0;k<c.requestedTicks;k++){
      for(const e of c.events.filter(e=>e.tick===k)){const before=structuredClone(s.state),r=event(s,e);events.push({event:e,result:r,before,after:structuredClone(s.state)});}
      const input=inputAt(c,k),result=s.step(input,false);
      if(!result.accepted){failedTick=k+1;break;}
      const t=s.recording.ticks.at(-1);prefix.update(JSON.stringify({inputA:t.inputA,rearBrake:t.rearBrake}));
      if(JSON.stringify(t.inputA)!==JSON.stringify(input)||t.rearBrake!==false)throw new Error('Accepted input differs from frozen template');
      checker.sample(s.state,t,k+1,s.settings);if(series)series.push(seriesRow(c,s.telemetry));
      if(s.telemetry.outcome!=='running')break;
    }
  }catch(e){error=e.message;failedTick=s.recording.ticks.length+1;}
  const m=s.telemetry,b=s.state.bodies.B,contacts=contactSummary(s.recording);
  const outcome=error?'runner_error':s.stoppedReason?(s.stoppedReason.includes('предел записи')?'recording_budget_stop':'numerical_stop'):
    m.outcome==='stopped'?'stopped':m.outcome==='timeout'?'not_stopped_timeout':'censored';
  const result={...base,outcome,reason:error??s.stoppedReason??null,failedTick:failedTick??checker.errors[0]?.tick??null,acceptedTicks:s.recording.ticks.length,
    acceptedSeconds:s.state.world.time,brakeTime:m.brakeTime,deadline:c.brakeAt+60,measurementComplete:['stopped','not_stopped_timeout'].includes(outcome),
    inputComplete:s.recording.ticks.length===c.requestedTicks,acceptedInputHash:prefix.digest('hex'),sidePeak:m.maxLateralB,anglePeak:m.maxAngleB,
    pathB:m.pathB,brakingDistance:m.brakingDistance,residualB:{vx:b.velocity.x,vy:b.velocity.y,omega:b.angularVelocity,speed:Math.hypot(b.velocity.x,b.velocity.y)},
    finalBodies:structuredClone(s.state.bodies),links:structuredClone(m.links),linkPeaks:m.linkPeaks,saturation:m.saturationByChannel,stopHold:m.stoppedFor,
    minClearance:m.minClearance,maxAngleBC:m.maxAngleBC,comSpeed:m.comSpeed,contacts,events,checks:{...checker,sample:undefined},
    recordingBytes:Buffer.byteLength(exportRecording(s.recording)),hardFailure:Boolean(error||s.stoppedReason||checker.errors.length),wallMs:Date.now()-start};
  if(c.template.startsWith('passage')){const exit=Math.max(...c.initialState.world.statics.map(o=>o.position.x+o.radius));
    result.routeComplete=Object.values(s.state.bodies).every(body=>body.position.x-body.radius>exit);result.routeExit=exit;}
  if(series)fs.appendFileSync(path.join(out,'standard-series.csv'),series.join('\n')+'\n');
  if(c.cohort==='standard'||result.hardFailure){result.retainedRecord=`records/${c.id}.json.gz`;retained(c.id,s.recording);}
  if(c.cohort==='standard'){
    try{const imported=importRecording(exportRecording(s.recording),identity);result.exportImport={pass:true,ticks:imported.ticks.length};}
    catch(e){result.exportImport={pass:false,reason:e.message};result.hardFailure=true;}
  }
  return result;
}
function writeSummary(results){
  const columns=['id','cohort','hz','speed_m_s','mirror','mode','delay_s','g','outcome','accepted_ticks','accepted_s','brake_s','side_peak_m','angle_peak_rad',
    'path_B_m','braking_distance_m','B_vx_m_s','B_vy_m_s','B_omega_rad_s','contacts','contact_impulse_N_s','AB_peak_force_N','BC_peak_force_N',
    'retro_saturation_s','lateral_saturation_s','yaw_saturation_s','min_clearance_m','max_length_excess_fraction','max_penetration_fraction','measurement_complete','reason'];
  const rows=[csvRow(columns)];for(const r of results)rows.push(csvRow([r.id,r.cohort,r.hz,r.speed,r.mirror,r.mode,r.delay,r.g,r.outcome,r.acceptedTicks,r.acceptedSeconds??0,r.brakeTime??'',
    r.sidePeak??'',r.anglePeak??'',r.pathB??'',r.brakingDistance??'',r.residualB?.vx??'',r.residualB?.vy??'',r.residualB?.omega??'',r.contacts?.count??0,r.contacts?.impulse??0,
    r.linkPeaks?.AB?.force??'',r.linkPeaks?.BC?.force??'',r.saturation?.retro??'',r.saturation?.lateral??'',r.saturation?.yaw??'',r.minClearance??'',
    r.checks?.maxLengthExcess??'',r.checks?.maxPenetration??'',Number(r.measurementComplete),r.reason??'']));fs.writeFileSync(path.join(out,'summary.csv'),rows.join('\n')+'\n');
}
function reusedTests(){
  let code=fs.readFileSync(path.join(__dirname,'physics.test.cjs'),'utf8');const originalHash=hash(code);
  code=code.replaceAll('../../.cache/tuglab2-tests/client/src',compiled);
  code=code.replace('let maxEnergyError = 0;','let maxEnergyError=0,maxPDrift=0,maxLDrift=0;');
  code=code.replace('const q = invariants(s);\n      assert.ok','const q = invariants(s); maxPDrift=Math.max(maxPDrift,Math.hypot(q.px-initial.px,q.py-initial.py)/pScale);maxLDrift=Math.max(maxLDrift,Math.abs(q.angular-initial.angular)/lScale);\n      assert.ok');
  code=code.replace('assert.ok(maxEnergyError <= .005,','console.log("QA_INVARIANT "+JSON.stringify({damping,pScale,lScale,maxPDrift,maxLDrift,maxEnergyError}));assert.ok(maxEnergyError <= .005,');
  const file=path.join(out,'reused-physics.test.cjs');fs.writeFileSync(file,code);
  const sessionFile=path.join(out,'reused-session.test.cjs');
  fs.writeFileSync(sessionFile,fs.readFileSync(path.join(__dirname,'session.test.cjs'),'utf8').replaceAll('../../.cache/tuglab2-tests/client/src',compiled));
  const result=spawnSync(process.execPath,['--test',file,sessionFile,path.join(__dirname,'qa-contract.test.cjs')],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
  const log=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(out,'reused-tests.log'),log);
  return {pass:result.status===0,exitCode:result.status,originalPhysicsTestHash:originalHash,
    testCount:Number(log.match(/# tests (\d+)/)?.[1]??0),invariants:[...log.matchAll(/QA_INVARIANT (\{[^\n]+\})/g)].map(m=>JSON.parse(m[1])),
    legacyBlob:execFileSync('git',['hash-object','client/src/u2taglab/physics/advanceWorld.ts'],{cwd:root,encoding:'utf8'}).trim()};
}
async function main(){
  fs.mkdirSync(path.join(out,'records'),{recursive:true});
  const identity={...buildIdentity(),sourceSHA:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()},dirty=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
  const cases=buildManifest(identity),manifest={schema:1,identity,dirtyTree:Boolean(dirty),dirtyFiles:dirty.split('\n').filter(Boolean),protocol:'8c372cb',seed:20261011,
    logicalCount:cases.length,uniqueExecutedCount:cases.length,deduplicated:false,createdAt:new Date().toISOString(),cases};
  if(cases.length!==466)throw new Error('Frozen logical denominator differs from 466');
  save('configs.json',manifest);fs.writeFileSync(path.join(out,'standard-series.csv'),csvRow(seriesColumns)+'\n');
  const reused=reusedTests();save('reused-evidence.json',reused);console.log(`Reused tests ${reused.testCount}, pass=${reused.pass}`);
  const results=[];let cohort;
  for(const c of cases){if(process.argv.includes('--standard-only')&&c.cohort!=='standard')break;
    if(c.cohort!==cohort){cohort=c.cohort;console.log(`Cohort ${cohort}, progress ${results.length}/466`);}
    const r=simulate(c,identity);results.push(r);save('results.json',{identity,dirtyTree:Boolean(dirty),planned:466,attempted:results.length,results});
    if(c.cohort==='standard')console.log(`STANDARD ${JSON.stringify({id:r.id,speed:r.speed,mirror:r.mirror,mode:r.mode,outcome:r.outcome,time:r.acceptedSeconds,side:r.sidePeak,angle:r.anglePeak,contacts:r.contacts?.count,reason:r.reason})}`);
    if(results.length%50===0)console.log(`Progress ${results.length}/466, hard=${results.filter(r=>r.hardFailure).length}`);
  }
  const primary=[];for(const mirror of[-1,1]){const coast=results.find(r=>r.cohort==='standard'&&r.speed===40&&r.mirror===mirror&&r.mode==='coast');
    for(const mode of['guard','brake']){const assisted=results.find(r=>r.cohort==='standard'&&r.speed===40&&r.mirror===mirror&&r.mode===mode);primary.push({mirror,mode,baseline:coast.id,assisted:assisted.id,...evaluatePrimary(coast,assisted)});}}
  if(process.argv.includes('--standard-only')){save('early-standard.json',results);writeSummary(results);console.log('Preliminary standard subset retained; full 466 qualification pending');return;}
  const fixtures=require('./qa-fixtures.cjs').runFixtures({out,identity,retained});
  const totals={planned:466,attempted:results.length,uniqueExecuted:results.length,hardFailures:results.filter(r=>r.hardFailure).length,outcomes:{}};
  for(const r of results)totals.outcomes[r.outcome]=(totals.outcomes[r.outcome]??0)+1;
  const hardFailure=!reused.pass||totals.hardFailures>0||!fixtures.pass;
  const final={identity,dirtyTree:Boolean(dirty),manifest:'configs.json',totals,primary,AC23:primary.some(p=>p.pass)?'PASS':'OPEN_CALIBRATION',technicalPass:!hardFailure,reused,fixtures,results};
  save('results.json',final);writeSummary(results);save('early-standard.json',results.filter(r=>r.cohort==='standard'));
  const python=process.env.TUGLAB2_PLOT_PYTHON??'/tmp/bonk-tuglab2-tools/plot-env/bin/python';
  const plot=spawnSync(python,[path.join(__dirname,'plot-matrix.py'),out],{cwd:root,encoding:'utf8'});fs.writeFileSync(path.join(out,'plots.log'),(plot.stdout??'')+(plot.stderr??''));
  final.plots={pass:plot.status===0,exitCode:plot.status,error:plot.error?.message};if(plot.status!==0)final.technicalPass=false;save('results.json',final);
  console.log(JSON.stringify({identity,totals,AC23:final.AC23,fixtures:fixtures.pass,plots:final.plots.pass,technicalPass:final.technicalPass}));
  if(!final.technicalPass)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{fs.mkdirSync(out,{recursive:true});save('runner-fatal.json',{reason:e.stack});console.error(e.stack);process.exitCode=1;});
module.exports={simulate,contactSummary};
