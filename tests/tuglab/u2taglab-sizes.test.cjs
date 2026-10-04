const {test}=require('node:test');
const {assert,near}=require('./helpers.cjs');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const share=require('../../.cache/tuglab-tests/client/src/u2taglab/share.js');
const make=()=>new BonkLab({}, {towing:true,space:true});
const tugs=[['S',100300,30,13.5,5428000,48,240000,290000],['M',401200,60,27,16228800,24,360000,710000],['L',1604800,120,54,48760000,12,540000,1740000],['XL',6419200,240,108,146096000,6,810000,4260000]];
const trailers=[['XS',24371.875,15,6.75],['S',97300,30,13.5],['M',389200,60,27],['L',1556800,120,54],['XL',6227200,240,108],['XXL',24908800,480,216]];
test('all24 size combinations fit full profiles, bounded links and reproduce geometry in fresh receivers',()=>{
 for(const [a,massA,L,W,force,yaw,k,c]of tugs)for(const [b,massB,LB,WB]of trailers){
  const lab=make();lab.selectSpaceSize('A',a);lab.selectSpaceSize('B',b);const s=lab.getState(),p=lab.params;
  near(s.mass,massA);near(s.towing.B.mass,massB);near(s.radius,(L*L+W*W)/(2*(L+W)));near(s.towing.B.inertia,massB*(LB*LB+WB*WB)/12);
  near(p['space.yawTorque'],{S:7581229.414644962,M:45333181.99130072,L:272410277.27198845,XL:1632405737.01101}[a],1e-6);near(p['space.forwardForce'],force);near(p['space.reverseForce'],force*3/7);near(p['space.lateralForce'],force*9/35);near(p['space.yawLimit'],yaw*Math.PI/180);near(s.towing.coupling.k,k);near(s.towing.coupling.c,c);
  assert.ok(p['tow.length']>=4*(s.radius+s.towing.B.radius));assert.equal(lab.getSpaceSize('A'),a);assert.equal(lab.getSpaceSize('B'),b);assert.equal(s.towing.needsRestart,false);
  const snapshot=lab.exportSpaceShareSnapshot(),fragment=share.encodeSpaceShareFragment(snapshot);assert.ok(fragment.length<16000);assert.deepEqual(snapshot.geometry,{A:{length:L,width:W},B:{length:LB,width:WB}});
  for(let i=0;i<2;i++){const target=make();target.applySpaceShareSnapshot(share.decodeSpaceShareFragment(fragment));assert.deepEqual(target.exportSpaceShareSnapshot(),snapshot);assert.deepEqual(target.getState(),s);target.reset();near(target.getState().towing.B.inertia,s.towing.B.inertia);}
 }
});
test('tug selection preserves absolute customized B and controls, then clears motion/input on safe start',()=>{
 const lab=make();lab.selectSpaceSize('B','XS');lab.updateParams('tow.massRatio',0.5);lab.updateParams('tow.radiusB',100);lab.updateParams('tow.type','rod');lab.setSpaceFA(false);lab.updateParams('space.enginesEnabled',false);lab.start();lab.setInput(1,0,1);lab.setSpaceBrake(true);
 const before=lab.getState();lab.selectSpaceSize('A','XL');const s=lab.getState();near(s.towing.B.mass,before.towing.B.mass);near(s.towing.B.radius,100);near(s.towing.B.inertia,before.towing.B.inertia);assert.equal(lab.params['tow.type'],'rod');assert.equal(lab.params['space.fa'],false);assert.equal(lab.params['space.enginesEnabled'],false);assert.equal(lab.isRunning,false);assert.equal(lab.hasStarted,false);assert.equal(lab.spaceBrake,false);assert.equal(lab.inputMagnitude,0);assert.deepEqual(s.spaceWorld.asteroids,before.spaceWorld.asteroids);assert.equal(lab.getSpaceSize('B'),undefined);
 lab.updateParams('mass',10000);near(lab.getState().towing.coupling.c,4260000);assert.equal(lab.getSpaceSize('A'),undefined);
});
test('trailer selection preserves custom tug engines/module, restores radius from selected geometry, reset resets all geometry',()=>{
 const lab=make();lab.selectSpaceSize('A','S');lab.updateParams('space.forwardForce',123456);lab.updateParams('tow.stiffness',1);lab.selectSpaceSize('B','XXL');near(lab.params['space.forwardForce'],123456);near(lab.params['tow.stiffness'],1);near(lab.params['tow.length'],1440);lab.updateParams('tow.radiusB',100);lab.restoreSpaceRadiusB();near(lab.params['tow.radiusB'],199.0344827586207);lab.resetSpaceParams();near(lab.getState().radius,24.879310344827587);near(lab.getState().towing.B.inertia,2246462400);assert.equal(lab.getSpaceSize('A'),'M');assert.equal(lab.getSpaceSize('B'),'L');
});
test('refused size selection retains entire running state and parameters',()=>{
 const lab=make();lab.start();lab.setInput(1,0,1);lab.setSpaceBrake(true);const before=lab.getState(),params=lab.params;
 const {LabTowing}=require('../../.cache/tuglab-tests/client/src/tuglab/labTowing.js'),reset=LabTowing.prototype.reset;LabTowing.prototype.reset=function(){this.fail('Отказ');};
 try{assert.throws(()=>lab.selectSpaceSize('A','XL'),/U2TagLab.*старт/);assert.deepEqual(lab.getState(),before);assert.deepEqual(lab.params,params);assert.equal(lab.isRunning,true);assert.equal(lab.spaceBrake,true);assert.equal(lab.inputMagnitude,1);}finally{LabTowing.prototype.reset=reset;}
});
test('genuine fixed-v3 snapshot is unchanged on import/export and rejects arbitrary catalog geometry',()=>{
 const v3=require('./fixtures/u2-space-fixed-v3.json'),lab=make();lab.applySpaceShareSnapshot(v3);assert.deepEqual(lab.exportSpaceShareSnapshot(),v3);lab.selectSpaceSize('A','XL');const v4=lab.exportSpaceShareSnapshot();assert.equal(v4.schema,3);
 for(const mutate of [s=>s.geometry.A.length=480,s=>s.geometry.B.width=2000,s=>s.world.radiusA=1000]){const bad=structuredClone(v4);mutate(bad);assert.throws(()=>lab.applySpaceShareSnapshot(bad),/U2TagLab/);assert.deepEqual(lab.exportSpaceShareSnapshot(),v4);}
});
test('catalog size keeps effective A radius and field areas current across all couplings and restart',()=>{
 for(const type of ['spring','rope','rod'])for(const [a]of tugs)for(const [b]of trailers){
  const lab=make();lab.updateParams('tow.type',type);lab.selectSpaceSize('A',a);lab.selectSpaceSize('B',b);let s=lab.getState();near(lab.params['geometry.baseRadiusM'],s.radius);near(s.spaceWorld.fieldShipRadii.A,s.radius);near(s.spaceWorld.fieldShipRadii.B,s.towing.B.radius);
  lab.start();lab.pause();while(lab.getState().startCountdown>0)lab.stepOnce();lab.setInput(0,-1,1);for(let i=0;i<12;i++)lab.stepOnce();s=lab.getState();assert.ok(s.vy<0);assert.equal(s.towing.needsRestart,false);assert.ok(Number.isFinite(s.towing.B.inertia));lab.reset();s=lab.getState();near(s.radius,lab.params['geometry.baseRadiusM']);assert.equal(s.towing.needsRestart,false);
 }
});
test('approved adjacent and LAB nonadjacent lengths are available independently of coupling type',()=>{
 const rows={S:[90,120,180,360,720,1440],M:[180,180,240,360,720,1440],L:[360,360,360,480,720,1440],XL:[720,720,720,720,960,1440]};
 for(const [a,lengths]of Object.entries(rows))for(let i=0;i<6;i++){const lab=make();lab.selectSpaceSize('A',a);lab.selectSpaceSize('B',trailers[i][0]);near(lab.params['tow.length'],lengths[i]);}
});
test('legacy disk-v2 tug selection keeps Caravan geometry and absolute mass until trailer is selected',()=>{
 const legacy=require('./fixtures/u2-space-v2.json');
 for(const size of ['S','XL']){
  const lab=make();lab.applySpaceShareSnapshot(legacy);const before=lab.getState();lab.selectSpaceSize('A',size);let s=lab.getState();near(s.towing.B.mass,before.towing.B.mass);near(s.towing.B.radius,before.towing.B.radius);assert.deepEqual(lab.exportSpaceShareSnapshot().geometry.B,{length:108,width:48});assert.equal(lab.getSpaceSize('B'),undefined);
  const target=make();target.applySpaceShareSnapshot(lab.exportSpaceShareSnapshot());assert.deepEqual(target.getState(),s);target.restoreSpaceRadiusB();near(target.params['tow.radiusB'],44.76923076923077);target.reset();near(target.getState().towing.B.inertia,s.towing.B.inertia);target.resetSpaceParams();near(target.getState().radius,24.879310344827587);near(target.getState().towing.B.inertia,2246462400);
 }
});
