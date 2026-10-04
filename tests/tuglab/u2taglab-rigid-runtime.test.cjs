const {test}=require('node:test');
const {assert,near}=require('./helpers.cjs');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const share=require('../../.cache/tuglab-tests/client/src/u2taglab/share.js');
const {spaceGroups}=require('../../.cache/tuglab-tests/client/src/u2taglab/ui/paramDefs.js');
const make=()=>new BonkLab({}, {towing:true,space:true});
for(const arrangement of ['front','rear'])test(`rigid ${arrangement} reset/share drives A and leaves the source world recipe intact`,()=>{
 const lab=make(),world=structuredClone(lab.getState().spaceWorld),recipe=lab.exportSpaceShareSnapshot().world,initial=lab.getState();
 lab.updateParams('tow.type','rigid');lab.updateParams('tow.rigidArrangement',arrangement);assert.equal(lab.getState().towing.needsRestart,true);
 for(const key of ['x','y','vx','vy','angle','angularVelocity','spaceWorld'])assert.deepEqual(lab.getState()[key],initial[key]);assert.deepEqual(lab.getState().towing.B,initial.towing.B);
 lab.reset();let s=lab.getState();assert.equal(s.towing.needsRestart,false);near(s.towing.distance,0,1e-7);
 near(s.towing.B.position.y-s.y,(arrangement==='front'?1:-1)*(s.radius+s.towing.B.radius),1e-7);
 assert.deepEqual(s.spaceWorld,world);assert.deepEqual(lab.exportSpaceShareSnapshot().world,{...recipe,radiusA:initial.radius});
 lab.updateParams('space.fa',false);lab.updateParams('space.fieldsEnabled',false);lab.start();for(let i=0;i<250;i++)lab.update(1/60);lab.setInput(0,-1,1);for(let i=0;i<60;i++)lab.update(1/60);
 s=lab.getState();assert.equal(s.towing.needsRestart,false,s.towing.reason);assert.ok(s.vy<0);near(s.angularVelocity,s.towing.B.angularVelocity,1e-9);
 const snapshot=lab.exportSpaceShareSnapshot();assert.equal(snapshot.schema,4);assert.equal(snapshot.params['tow.rigidArrangement'],arrangement);
 const target=make();target.applySpaceShareSnapshot(share.decodeSpaceShareFragment(share.encodeSpaceShareFragment(snapshot)));assert.equal(target.params['tow.type'],'rigid');assert.equal(target.params['tow.rigidArrangement'],arrangement);near(target.getState().towing.distance,0,1e-7);
 const before=target.getState(),bad=structuredClone(snapshot);bad.params['tow.rigidArrangement']='sideways';assert.throws(()=>target.applySpaceShareSnapshot(bad));assert.deepEqual(target.getState(),before);
});
test('rigid runtime capture commits A, syncs previous transforms, refuses a live asteroid atomically',()=>{
 const lab=make();lab.updateParams('tow.type','rigid');lab.reset();lab.setTowingConnection(false);
 lab.towing.B.position.y+=15;const before=lab.getState();assert.equal(lab.setTowingConnection(true).ok,true);
 const after=lab.getState();assert.notEqual(after.y,before.y);near(after.towing.distance,0,1e-7);near(lab.prevY,after.y);assert.equal(after.towing.coupling.connected,true);
 lab.setTowingConnection(false);lab.towing.B.position.y+=15;const a=lab.towingBodyA(),b=lab.towing.B;
 lab.spaceWorld.asteroids.push({id:'capture-blocker',position:{x:b.position.x,y:b.position.y-3},radius:1,mass:1000,inertia:500,velocity:{x:0,y:0},angle:0,angularVelocity:0});
 const blocked=lab.getState();assert.equal(lab.setTowingConnection(true).ok,false);const result=lab.getState();
 for(const key of ['x','y','vx','vy','angle','angularVelocity','spaceWorld'])assert.deepEqual(result[key],blocked[key]);assert.deepEqual(result.towing.B,blocked.towing.B);assert.deepEqual(result.towing.coupling,blocked.towing.coupling);assert.deepEqual(lab.towingBodyA(),a);
});
test('rigid UI exposes one type and only its initial arrangement, old shells reject it',()=>{
 const defs=spaceGroups('rigid').flatMap(g=>g.params),keys=defs.map(p=>p.key);
 assert.ok(keys.includes('tow.rigidArrangement'));for(const key of ['tow.length','tow.stiffness','tow.module','tow.dampingCoefficient','tow.dampingRatio','tow.dampingMode'])assert.equal(keys.includes(key),false,key);
 assert.ok(defs.find(p=>p.key==='tow.type').options.some(o=>o.value==='rigid'));
 assert.equal(spaceGroups('spring').flatMap(g=>g.params).some(p=>p.key==='tow.rigidArrangement'),false);
 const stock=new BonkLab({}, {towing:true});stock.updateParams('tow.type','rigid');assert.equal(stock.params['tow.type'],'spring');
 const lab=make();assert.equal(lab.exportSpaceShareSnapshot().schema,2);assert.equal(Object.hasOwn(lab.exportSpaceShareSnapshot().params,'tow.rigidArrangement'),false);
 const bad=lab.exportSpaceShareSnapshot();bad.params['tow.type']='rigid';assert.throws(()=>share.validateSpaceShareSnapshot(bad));
});
test('rigid interpolated render retains tangent circles and zero anchor gap during rotation',()=>{
 const lab=make();lab.updateParams('tow.type','rigid');lab.reset();lab.updateParams('space.enginesEnabled',false);lab.updateParams('space.fieldsEnabled',false);lab.start();for(let i=0;i<250;i++)lab.update(1/60);
 const a=lab.towingBodyA(),b=lab.towing.B,M=a.mass+b.mass,Cx=(a.mass*a.position.x+b.mass*b.position.x)/M,Cy=(a.mass*a.position.y+b.mass*b.position.y)/M;
 lab.angVel=b.angularVelocity=2;lab.vx=-2*(a.position.y-Cy);lab.vy=2*(a.position.x-Cx);b.velocity={x:-2*(b.position.y-Cy),y:2*(b.position.x-Cx)};lab.syncPrevState();lab.update(1/60);
 for(const alpha of [0,.25,.5,.75,1]){const s=lab.getInterpolatedState(alpha);near(Math.hypot(s.x-s.towing.B.position.x,s.y-s.towing.B.position.y),s.radius+s.towing.B.radius,1e-8);}
});
test('all 24 catalog pairs in both rigid arrangements start, step, share and Restart without changing the recipe',()=>{
 for(const arrangement of ['front','rear'])for(const sizeA of ['S','M','L','XL'])for(const sizeB of ['XS','S','M','L','XL','XXL']){
  const lab=make();lab.updateParams('space.fieldsEnabled',false);lab.updateParams('tow.type','rigid');lab.updateParams('tow.rigidArrangement',arrangement);lab.reset();lab.selectSpaceSize('A',sizeA);lab.selectSpaceSize('B',sizeB);
  const start=lab.getState(),recipe=lab.exportSpaceShareSnapshot().world;assert.equal(start.towing.needsRestart,false,`${arrangement} ${sizeA}/${sizeB}: ${start.towing.reason}`);near(start.towing.distance,0,1e-7);
  lab.start();for(let i=0;i<250;i++)lab.update(1/60);lab.setSpaceFA(false);lab.setInput(1,-1,1);for(let i=0;i<20;i++)lab.update(1/60);
  const moving=lab.getState();assert.equal(moving.towing.needsRestart,false,`${arrangement} ${sizeA}/${sizeB}: ${moving.towing.reason}`);near(moving.angularVelocity,moving.towing.B.angularVelocity,1e-7);near(Math.hypot(moving.x-moving.towing.B.position.x,moving.y-moving.towing.B.position.y),moving.radius+moving.towing.B.radius,1e-7);
  const target=make();target.applySpaceShareSnapshot(lab.exportSpaceShareSnapshot());assert.equal(target.params['tow.rigidArrangement'],arrangement);assert.equal(target.getSpaceSize('A'),sizeA);assert.equal(target.getSpaceSize('B'),sizeB);assert.deepEqual(target.exportSpaceShareSnapshot().world,recipe);
  lab.reset();const reset=lab.getState();for(const key of ['x','y','angle','vx','vy','angularVelocity','spaceWorld'])assert.deepEqual(reset[key],start[key]);assert.deepEqual(reset.towing.B,start.towing.B);
 }
});
test('schema4 strict rejection, sticky settings and malformed links preserve running state atomically',()=>{
 const lab=make();lab.updateParams('tow.type','rigid');lab.updateParams('tow.rigidArrangement','rear');lab.reset();lab.start();
 const s=lab.exportSpaceShareSnapshot(),before=lab.getState(),params=lab.params;
 for(const mutate of [s=>s.extra=1,s=>delete s.params['tow.rigidArrangement'],s=>s.params['tow.rigidArrangement']=false,s=>s.params.extra=1,s=>s.schema=5,s=>s.model='u2-space-circles-catalog-v4',s=>s.params.mass=NaN,s=>s.world.couplingLength=0,s=>s.geometry.A.length=61]){
  const bad=structuredClone(s);mutate(bad);assert.throws(()=>lab.applySpaceShareSnapshot(bad));assert.deepEqual(lab.getState(),before);assert.deepEqual(lab.params,params);assert.equal(lab.isRunning,true);
 }
 for(const fragment of ['#u2tag=e30','#u2tag='+ 'a'.repeat(16001),'#u2tag=%%%'])assert.throws(()=>share.decodeSpaceShareFragment(fragment));
 lab.updateParams('tow.type','spring');const converted=lab.exportSpaceShareSnapshot();assert.equal(converted.schema,4);assert.equal(converted.params['tow.rigidArrangement'],'rear');lab.reset();near(lab.getState().towing.distance,360,1e-7);
});

test('HUD mass uses three significant digits and promotes rounded unit boundaries',()=>{
 const {formatHudMass}=require('../../.cache/tuglab-tests/client/src/u2taglab/overlayLayout.js');
 for(const [mass,text]of [[30,'30 кг'],[0,'0 кг'],[999,'999 кг'],[1000,'1 т'],[401200,'401 т'],[1556800,'1.56 кт'],[1e9,'1 Мт'],[999499,'999 т'],[999500,'1 кт'],[999500000,'1 Мт'],[1e12,'1000 Мт']])assert.equal(formatHudMass(mass),text);
});
