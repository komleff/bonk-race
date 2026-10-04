const {test}=require('node:test');
const {assert,near}=require('./helpers.cjs');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const share=require('../../.cache/tuglab-tests/client/src/u2taglab/share.js');
const legacy=require('./fixtures/u2-space-v2.json');
const make=()=>new BonkLab({}, {towing:true,space:true});
test('fixed M damping survives mass, radius, measured capture, reset and share',()=>{
 const lab=make();near(lab.getState().towing.coupling.c,710000);
 for(const [key,value] of [['mass',10000],['tow.massRatio',0.1],['tow.radiusB',2],['tow.length',1000]]){lab.updateParams(key,value);near(lab.getState().towing.coupling.c,710000);}
 lab.reset();lab.setTowingConnection(false);lab.towing.B.position.y-=800;assert.equal(lab.setTowingConnection(true).ok,true);near(lab.getState().towing.coupling.restLength,200);near(lab.getState().towing.coupling.c,710000);
 const target=make();target.applySpaceShareSnapshot(share.decodeSpaceShareFragment(share.encodeSpaceShareFragment(lab.exportSpaceShareSnapshot())));near(target.getState().towing.coupling.c,710000);target.reset();near(target.getState().towing.coupling.c,710000);
});
test('module presets change only k/c and preserve configured length, captured anchors and complete state',()=>{
 const lab=make();lab.updateParams('tow.length',1000);lab.reset();lab.setTowingConnection(false);lab.towing.B.position.y-=800;assert.equal(lab.setTowingConnection(true).ok,true);
 for(const [module,k,c] of [['S',240000,290000],['M',360000,710000],['L',540000,1740000],['XL',810000,4260000]]){
  const before=lab.getState();lab.updateParams('tow.module',module);const after=lab.getState();near(after.towing.coupling.k,k);near(after.towing.coupling.c,c);assert.equal(lab.params['tow.module'],module);assert.equal(lab.params['tow.dampingMode'],'fixed');near(lab.params['tow.length'],1000);
  const expected=structuredClone(before);expected.towing.coupling.k=k;expected.towing.coupling.c=c;assert.deepEqual(after,expected);
 }
 lab.updateParams('tow.dampingCoefficient',100);assert.equal(lab.params['tow.module'],'custom');near(lab.getState().towing.coupling.c,100);lab.updateParams('tow.module','M');lab.updateParams('tow.stiffness',1);assert.equal(lab.params['tow.module'],'custom');
});
test('actual schema1 disk-v2 fixture retains old geometry, adaptive reduced mass and exact roundtrip',()=>{
 assert.equal(legacy.schema,1);assert.equal(legacy.model,'u2-space-circles-disk-v2');const lab=make();lab.applySpaceShareSnapshot(share.decodeSpaceShareFragment(share.encodeSpaceShareFragment(legacy)));
 near(lab.getState().towing.B.inertia,791520000);near(lab.getState().radius,24.879310344827587);near(lab.getState().towing.B.radius,44.76923076923077);near(lab.getState().towing.coupling.c,196189.25550989318);assert.deepEqual(lab.exportSpaceShareSnapshot(),legacy);
 lab.updateParams('mass',600000);near(lab.getState().towing.coupling.c,196189.25550989318*Math.sqrt(2));lab.reset();near(lab.getState().towing.coupling.c,196189.25550989318*Math.sqrt(2));
 lab.updateParams('tow.module','L');const next=lab.exportSpaceShareSnapshot();assert.equal(next.schema,2);assert.deepEqual(next.geometry.B,{length:108,width:48});const target=make();target.applySpaceShareSnapshot(next);near(target.getState().towing.B.inertia,1583040000);near(target.getState().towing.coupling.c,1740000);
});
test('new explicit mode, preset and geometry contract rejects incomplete/unsafe inputs atomically',()=>{
 const lab=make(),s=lab.exportSpaceShareSnapshot();assert.equal(s.schema,2);assert.deepEqual(s.geometry,{A:{length:60,width:27},B:{length:120,width:54}});
 lab.start();const before=lab.getState(),params=lab.params;
 for(const mutate of [s=>delete s.geometry,s=>delete s.params['tow.dampingMode'],s=>delete s.params['tow.dampingCoefficient'],s=>s.params['tow.dampingMode']='magic',s=>s.params['tow.module']='XXL',s=>s.params['tow.dampingCoefficient']=1e8+1,s=>s.params['tow.dampingCoefficient']=NaN,s=>s.params['tow.dampingCoefficient']='710000',s=>s.params['tow.dampingCoefficient']=10,s=>s.geometry.B.width=0,s=>s.geometry.B.extra=1,s=>Object.setPrototypeOf(s.geometry.B,{poison:1}),s=>Object.defineProperty(s.params,'__proto__',{value:{},enumerable:true})]){
  const bad=structuredClone(s);mutate(bad);assert.throws(()=>lab.applySpaceShareSnapshot(bad),/U2TagLab/);assert.deepEqual(lab.getState(),before);assert.deepEqual(lab.params,params);assert.equal(lab.isRunning,true);
 }
});
test('radius restoration and full settings reset respect imported legacy then fitted geometry',()=>{
 const lab=make();lab.applySpaceShareSnapshot(legacy);lab.updateParams('tow.radiusB',100);lab.restoreSpaceRadiusB();near(lab.params['tow.radiusB'],44.76923076923077);
 lab.resetSpaceParams();near(lab.getState().towing.B.inertia,2246462400);near(lab.params['tow.radiusB'],49.75862068965517);near(lab.getState().towing.coupling.c,710000);assert.equal(lab.exportSpaceShareSnapshot().schema,2);
});
test('conversion to fixed permanently uses explicit contract preserving hidden c on return to legacy',()=>{
 const lab=make();lab.applySpaceShareSnapshot(legacy);lab.updateParams('tow.module','XL');lab.updateParams('tow.dampingMode','legacy');const s=lab.exportSpaceShareSnapshot();assert.equal(s.schema,2);assert.equal(s.params['tow.dampingCoefficient'],4260000);const target=make();target.applySpaceShareSnapshot(s);assert.deepEqual(target.exportSpaceShareSnapshot(),s);target.updateParams('tow.dampingMode','fixed');near(target.getState().towing.coupling.c,4260000);
});
