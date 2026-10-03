const {test}=require('node:test');
const {assert,near}=require('./helpers.cjs');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const {PRESETS}=require('../../.cache/tuglab-tests/client/src/lab/ui/presets.js');
const make=()=>new BonkLab({}, {towing:true});
const share=()=>require('../../.cache/tuglab-tests/client/src/tuglab/share.js');
const exportSnapshot=lab=>lab.exportShareSnapshot();
test('full snapshot restores actual seed/density, manual orbs, fresh paused bodies atomically',()=>{
 const a=make();a.regenerateArena(98765,7.3);a.updateParams('orbs.density',0.27);a.updateParams('tow.massRatio',2.5);a.updateParams('tow.length',40);
 a.reset();a.regenerateArena(98765,7.3);a.updateParams('orbs.density',0.27);
 const snapshot=exportSnapshot(a);assert.equal(snapshot.seed,98765);assert.equal(snapshot.density,7.3);assert.equal(snapshot.orbDensityManual,true);assert.equal(snapshot.params['arena.objectDensity'],7.3);
 const codec=share(),decoded=codec.decodeShareFragment(codec.encodeShareFragment(snapshot),a.getDefaults());
 const b=make();let builds=0;const build=b.buildArena.bind(b);b.buildArena=(...args)=>{builds++;return build(...args);};
 b.applyShareSnapshot(decoded);assert.equal(builds,1);assert.deepEqual(exportSnapshot(b),snapshot);
 const sa=a.getState(),sb=b.getState();assert.deepEqual(sb.arena,sa.arena);assert.deepEqual(sb.orbs,sa.orbs);assert.deepEqual(sb.towing.B,sa.towing.B);near(sb.x,sa.x);near(sb.y,sa.y);
 assert.equal(b.isRunning,false);near(sb.elapsedTime,0);b.update(1);near(b.getState().elapsedTime,0);b.updateParams('orbs.count',31);assert.equal(b.isRunning,false);
 b.start();assert.equal(b.isRunning,true);
});
test('all stock presets roundtrip complete settings including hidden parameters and automatic orb density',()=>{
 const codec=share();for(const preset of PRESETS){const a=make();for(const [k,v] of Object.entries(preset.values))a.updateParams(k,v);
 const snapshot=exportSnapshot(a),b=make();b.applyShareSnapshot(codec.decodeShareFragment(codec.encodeShareFragment(snapshot),a.getDefaults()));
 assert.deepEqual(exportSnapshot(b),snapshot);b.updateParams('mass',150);near(b.params['orbs.density'],150/(Math.PI*400));}
});
test('invalid snapshots reject before any application',()=>{
 const lab=make(),codec=share(),good=exportSnapshot(lab),before=lab.getState();
 const cases=[s=>s.schema=2,s=>s.generator='other',s=>s.seed=-1,s=>s.seed=1.5,s=>s.density=26,s=>s.orbDensityManual='yes',s=>s.extra=1,
 s=>delete s.params.mass,s=>s.params.unknown=1,s=>Object.defineProperty(s.params,'__proto__',{value:{polluted:true},enumerable:true}),
 s=>s.params['constructor.x']=1,s=>s.params.mass=Infinity,s=>s.params.mass=NaN,s=>s.params.mass=0,s=>s.params['tow.length']=101,
 s=>s.params['tow.type']='rigid',s=>s.params['trail.primaryColor']='url(javascript:bad)',s=>s.params['orbs.count']=3.5,
 s=>s.params['arena.objectDensity']=9,s=>s.params['worldPhysics.widthM']=1e9,s=>s.params['orbs.minRadius']=30,s=>s.params['orbs.minSpeed']=60];
 for(const mutate of cases){const s=structuredClone(good);mutate(s);assert.throws(()=>codec.decodeShareFragment(codec.encodeShareFragment(s),lab.getDefaults()));assert.throws(()=>lab.applyShareSnapshot(s));assert.deepEqual(lab.getState(),before);assert.deepEqual(exportSnapshot(lab),good);}
 for(const f of ['#tug=','other','#tug=abc','#tug='+('a'.repeat(20000)),codec.encodeShareFragment(good).slice(0,-3)])assert.throws(()=>codec.decodeShareFragment(f,lab.getDefaults()));
 assert.equal({}.polluted,undefined);
});
test('share link preserves local and nested shell URLs and never resets a live race',()=>{
 const codec=share(),lab=make();lab.start();for(let i=0;i<240;i++)lab.update(1/60);lab.setInput(0,-1,1);for(let i=0;i<60;i++)lab.update(1/60);
 const state=lab.getState();for(const url of ['http://localhost:5174/tuglab.html?x=1','https://example.com/bonk-race/tuglab/']){
 const link=codec.createShareUrl(url,exportSnapshot(lab));assert.ok(link.startsWith(url+'#tug='));codec.decodeShareFragment(new URL(link).hash,lab.getDefaults());}
 assert.deepEqual(lab.getState(),state);assert.equal(lab.isRunning,true);
});

test('share starts connected at configured length instead of transferring captured length or disconnection',()=>{
 const a=make();a.setTowingConnection(false);a.towing.B.position.y-=2;assert.equal(a.setTowingConnection(true).ok,true);near(a.getState().towing.coupling.restLength,6);a.setTowingConnection(false);
 const snapshot=exportSnapshot(a);assert.equal(snapshot.params['tow.length'],8);const b=make();b.applyShareSnapshot(snapshot);
 assert.equal(b.getState().towing.coupling.connected,true);near(b.getState().towing.distance,8);near(b.getState().towing.coupling.restLength,8);assert.equal(b.isRunning,false);
});
