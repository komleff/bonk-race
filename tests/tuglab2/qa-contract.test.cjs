const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildManifest,createChecker,trajectoryCheck,evaluatePrimary}=require('./qa-helpers.cjs');
test('frozen qualification manifest has exactly all 466 cases and standard matched input templates',()=>{
  const cases=buildManifest({appVersion:'0.1.0',sourceSHA:'a'.repeat(40)});
  const expected={standard:12,mass60:126,'rate-control':144,strength:12,'rear-size':18,delay2:6,'size-scenes':72,turns:24,passage:12,failure:24,'moving-detach':12,'single-control':4};
  assert.equal(cases.length,466);assert.equal(new Set(cases.map(c=>c.id)).size,466);
  for(const [cohort,count]of Object.entries(expected))assert.equal(cases.filter(c=>c.cohort===cohort).length,count,cohort);
  for(const speed of[40,80])for(const mirror of[-1,1]){
    const pair=cases.filter(c=>c.cohort==='standard'&&c.speed===speed&&c.mirror===mirror);
    assert.equal(new Set(pair.map(c=>c.inputHash)).size,1);assert.equal(new Set(pair.map(c=>JSON.stringify(c.initialState.bodies))).size,1);
  }
});
test('accepted-tick checker detects a repeated >1% length violation and clears isolated duration',()=>{
  const c=buildManifest({appVersion:'0.1.0',sourceSHA:'a'.repeat(40)})[0];
  const bad=structuredClone(c.initialState);bad.bodies.B.position.x-=300;
  const checker=createChecker(c.initialState);checker.sample(bad,undefined,1);assert.equal(checker.errors.length,0);
  checker.sample(c.initialState,undefined,2);checker.sample(bad,undefined,3);assert.equal(checker.errors.length,0);
  checker.sample(bad,undefined,4);assert.ok(checker.errors.some(e=>e.kind==='length'&&e.consecutive>=2));
});
test('trajectory gate checks intermediate accepted snapshots even when final bodies agree',()=>{
  const c=buildManifest({appVersion:'0.1.0',sourceSHA:'a'.repeat(40)})[0],body=c.initialState.bodies.A;
  const tick=x=>({commandC:{forward:0,retro:0,lateral:0,yaw:0},contacts:[],telemetry:{bodies:{A:{position:{x,y:0},angle:0}}}});
  const source={ticks:[tick(body.position.x),tick(10)]},replay=structuredClone(source);replay.ticks[0].telemetry.bodies.A.position.x+=1;
  const result=trajectoryCheck(source,replay,360);assert.equal(result.pass,false);assert.equal(result.maxCenterError,1);
});
test('primary usefulness rejects premature windows and new contacts despite 50% peak improvement',()=>{
  const baseline={outcome:'stopped',sidePeak:10,anglePeak:1,contacts:{pairs:{}},measurementComplete:true};
  const good={...baseline,sidePeak:5};assert.equal(evaluatePrimary(baseline,good).pass,true);
  assert.equal(evaluatePrimary(baseline,{...good,outcome:'numerical_stop',measurementComplete:false}).pass,false);
  assert.equal(evaluatePrimary(baseline,{...good,contacts:{pairs:{'A|rock':{count:1,impulse:1}}}}).pass,false);
});
