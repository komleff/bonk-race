const {test}=require('node:test');
const {core,near,world,input,momentum,assert}=require('./helpers.cjs');
const {defaultConfig}=core('config/validate.js');const {createBody}=core('physics/body.js');
const {stepWorld}=core('physics/step.js');
function advance(...args){let module;try{module=core('physics/advance.js');}catch{}assert.equal(typeof module?.advancePair,'function','shared advancePair must exist');return module.advancePair(...args);}
const config={...defaultConfig,enginesEnabled:false,restitution:1};
function pair(){const w=world(config);w.coupling.connected=false;w.A=createBody(100,0.1,{x:-1,y:0});w.B=createBody(100,0.1,{x:1,y:0});return w;}
test('swept pair contact catches 200 relative speed and conserves P/L',()=>{
  const w=pair();w.A.velocity.x=100;w.B.velocity.x=-100;const snapshot=structuredClone(w),p=momentum(w);
  const r=stepWorld(w,input,config);assert.equal(r.stopReason,undefined);
  near(r.world.A.velocity.x,-100);near(r.world.B.velocity.x,100);assert.ok(r.world.A.position.x<r.world.B.position.x);
  near(momentum(r.world).x,p.x);near(momentum(r.world).angular,p.angular);assert.deepEqual(w,snapshot);
  assert.ok(r.contacts.some(e=>e.body==='A'&&e.other==='B'&&e.impulse>0));
});
for(const body of ['A','B']) test(`swept circle contact catches thin obstacle for ${body} and uses its ID/restitution`,()=>{
  const w=pair();w.A.position.y=body==='A'?0:10;w.B.position.y=body==='B'?0:10;
  w[body].position.x=-1;w[body].velocity.x=100;
  w.obstacles=[{id:'passage',position:{x:0,y:0},radius:0.01,restitution:0.5}];
  const r=stepWorld(w,input,config);assert.equal(r.stopReason,undefined);
  near(r.world[body].velocity.x,-50);assert.ok(r.world[body].position.x<-0.11);
  assert.ok(r.contacts.some(e=>e.body===body&&e.other==='passage'&&e.impulse===15000));
});
test('tangent circle sweep does not invent a normal impulse',()=>{
  const w=pair();w.B.position.y=10;w.A.position.y=0.2;w.A.velocity.x=100;
  w.obstacles=[{id:'tangent',position:{x:0,y:0},radius:0.1}];
  const r=stepWorld(w,input,config);assert.equal(r.stopReason,undefined);near(r.world.A.velocity.x,100);near(r.world.A.velocity.y,0);
});
test('initial overlap including zero distance separates finitely without tunneling',()=>{
  for(const x of [0,0.05]){const w=pair();w.A.position={x,y:0};w.B.position.y=10;
    w.obstacles=[{id:'overlap',position:{x:0,y:0},radius:0.1}];
    const r=stepWorld(w,input,config);assert.equal(r.stopReason,undefined);
    assert.ok(Math.hypot(r.world.A.position.x,r.world.A.position.y)>=0.2-1e-6);
  }
});
test('stock bodies advance at stock speed with velocity-only callback and one total drift',()=>{
  const w=pair();w.A=createBody(100,20);w.B=createBody(100,20,{x:-100,y:0});w.A.velocity.x=380;
  let elapsed=0;const snapshot=structuredClone(w);
  const r=advance(w.A,w.B,w.coupling,1/60,config,[],undefined,(a,b,h)=>{elapsed+=h;a.velocity.y+=60*h;});
  assert.equal(r.stopReason,undefined);near(elapsed,1/60);near(r.A.velocity.x,380);near(r.A.velocity.y,1);near(r.A.position.x,380/60);
  near(r.A.position.y,5/480);assert.equal(r.diagnostics.outsideSpeedRange,true);assert.deepEqual(w,snapshot);
});
test('bounds handles corner and multiple rebounds within one step',()=>{
  const w=pair();w.A.position={x:0,y:0};w.B.position={x:0,y:5};w.A.velocity={x:100,y:100};
  const bounds={minX:-1,maxX:1,minY:-1,maxY:6};
  const r=advance(w.A,w.B,w.coupling,0.1,config,[],bounds);assert.equal(r.stopReason,undefined);
  assert.ok(r.A.position.x>=-0.9-1e-6&&r.A.position.x<=0.9+1e-6);assert.ok(r.A.position.y<=5.9+1e-6);
  for(const other of ['bounds:minX','bounds:maxX','bounds:maxY'])assert.ok(r.contacts.some(e=>e.other===other),other);
});
test('exhausted CCD budget returns original pair and no speculative contacts or force',()=>{
  const w=pair();w.A.position={x:0,y:0};w.B.position={x:0,y:5};w.A.velocity.x=1e9;
  const snapshot=structuredClone(w),r=advance(w.A,w.B,w.coupling,1/60,{...config,maxAdaptiveSubsteps:4,maxContactEvents:2},[],{minX:-1,maxX:1,minY:-1,maxY:6},a=>{a.velocity.y+=1;});
  assert.ok(r.stopReason);assert.strictEqual(r.A,w.A);assert.strictEqual(r.B,w.B);assert.strictEqual(r.coupling,w.coupling);assert.deepEqual(r.contacts,[]);assert.deepEqual(w,snapshot);
});
test('callback position mutation is rejected atomically to prevent duplicate movement',()=>{
  const w=pair(),r=advance(w.A,w.B,w.coupling,1/60,config,[],undefined,a=>{a.position.x+=1;});
  assert.ok(r.stopReason);assert.strictEqual(r.A,w.A);
});
test('simultaneous bounds contacts at the exact interval endpoint both resolve now',()=>{
  const w=pair();w.A.position={x:0,y:0};w.B.position={x:-0.5,y:-0.5};w.A.velocity={x:54,y:54};
  const r=advance(w.A,w.B,w.coupling,1/60,{...config,substeps:1},[],{minX:-1,maxX:1,minY:-1,maxY:1});
  assert.equal(r.stopReason,undefined);near(r.A.velocity.x,-54);near(r.A.velocity.y,-54);
  assert.ok(r.contacts.some(e=>e.other==='bounds:maxX'));assert.ok(r.contacts.some(e=>e.other==='bounds:maxY'));
});
test('adaptive retry discards speculative callback kicks and restarts on cloned bodies',()=>{
  const c={...config,couplingType:'rod',substeps:1};const w=world(c);w.A.velocity.y=100;w.B.velocity.y=-100;
  const snapshot=structuredClone(w);let attemptedTime=0;
  const callback=(a,b,h)=>{a.velocity.x+=12*h;b.velocity.x+=12*h;};
  const result=advance(w.A,w.B,w.coupling,1/30,c,[],undefined,(a,b,h)=>{attemptedTime+=h;callback(a,b,h);});
  assert.equal(result.stopReason,undefined);assert.ok(result.diagnostics.solverSubsteps>1);assert.ok(attemptedTime>1/30);
  near(momentum(result).x,8000,1e-6);assert.deepEqual(w,snapshot);
  const direct=advance(w.A,w.B,w.coupling,1/30,{...c,substeps:result.diagnostics.solverSubsteps},[],undefined,callback);
  assert.equal(direct.stopReason,undefined);assert.deepEqual(result.A,direct.A);assert.deepEqual(result.B,direct.B);
});
test('spring is applied only once despite several contacts in a substep',()=>{
  const c={...config,substeps:1,couplingType:'spring',springStiffness:20000,springDamping:0};const w=world(c);
  w.B.position.x=-21;w.A.velocity.y=w.B.velocity.y=100;
  const r=advance(w.A,w.B,w.coupling,1/60,c,[],{minX:-100,maxX:100,minY:-10,maxY:7});
  assert.equal(r.stopReason,undefined);near(r.A.velocity.x,-1/30,1e-10);near(r.B.velocity.x,1/30,1e-10);
  assert.ok(r.contacts.some(e=>e.body==='A'));assert.ok(r.contacts.some(e=>e.body==='B'));
});
test('rod accepts obstacle impacts and preserves its tolerance without penetration',()=>{
  const c={...config,couplingType:'rod',restitution:0.1};let w=world(c);w.A.velocity.x=w.B.velocity.x=100;
  w.obstacles=[{id:'stone',position:{x:10,y:3},radius:2}];
  let hits=0;for(let i=0;i<90;i++) {const r=stepWorld(w,input,c);assert.equal(r.stopReason,undefined,`tick ${i}`);w=r.world;hits+=r.contacts.length;
    assert.ok(w.diagnostics.rodError<=0.08);for(const b of [w.A,w.B])assert.ok(Math.hypot(b.position.x-10,b.position.y-3)>=8-1e-6);
  }assert.ok(hits>0);
});
test('complete obstacle arrays beyond isolated scene count are preserved and checked',()=>{
  const w=pair();w.A.velocity.x=100;w.B.position.y=10;
  const obstacles=Array.from({length:50},(_,i)=>({id:`stone${i}`,position:{x:50,y:10+i},radius:0.01}));
  obstacles.push({id:'last',position:{x:0,y:0},radius:0.01});const before=structuredClone(obstacles);
  const r=advance(w.A,w.B,w.coupling,1/60,config,obstacles);assert.equal(r.stopReason,undefined);
  assert.ok(r.contacts.some(e=>e.other==='last'));assert.deepEqual(obstacles,before);
});
test('invalid pair, numeric limits, obstacle and callback outputs fail atomically',()=>{
  const w=pair();
  for(const c of [{...config,maxAdaptiveSubsteps:Infinity},{...config,solverIterations:0},{...config,maxContactEvents:NaN},{...config,normalEpsilon:0}]){
    const r=advance(w.A,w.B,w.coupling,1/60,c,[]);assert.ok(r.stopReason);assert.strictEqual(r.A,w.A);
  }
  for(const callback of [a=>{a.velocity.x=NaN;},a=>{a.mass=0;},()=>{throw new Error('failed external engine');}]){
    const r=advance(w.A,w.B,w.coupling,1/60,config,[],undefined,callback);assert.ok(r.stopReason);assert.strictEqual(r.A,w.A);
  }
  const r=advance(w.A,w.B,w.coupling,1/60,config,[{id:'bad',position:{x:0,y:0},radius:NaN}]);assert.ok(r.stopReason);
});
test('finite inputs whose relative geometry overflows cannot return a NaN coupling',()=>{
  const w=pair();w.A.position.x=1e308;w.B.position.x=-1e308;
  const r=advance(w.A,w.B,w.coupling,1/60,{...config,substeps:1},[]);assert.ok(r.stopReason);assert.strictEqual(r.A,w.A);assert.strictEqual(r.coupling,w.coupling);
});
for(const tickRate of [30,60]) for(const massRatio of [0.1,1,10]) for(const touching of [false,true]) {
  test(`slack rope leaves earlier ${touching?'initial':'swept'} impact unchanged at ${tickRate} Hz and mass ratio ${massRatio}`,()=>{
    const c={...config,couplingType:'rope',tickRate,massRatio};const w=world(c);
    w.B.position.x=touching?-19.95:-19.7;w.B.velocity.x=-100;
    const obstacle={id:'early',position:{x:touching?-27.95:-27.71,y:0},radius:2};
    const snapshot=structuredClone(w);const r=advance(w.A,w.B,w.coupling,1/tickRate,c,[obstacle]);
    assert.equal(r.stopReason,undefined);near(r.A.velocity.x,0,1e-8);near(r.B.velocity.x,100,1e-8);
    near(r.A.position.x,0,1e-8);near(r.B.position.x,(touching?-19.95:-19.72)+100/tickRate,1e-8);
    near(r.diagnostics.couplingImpulse,0,1e-8);near(r.contacts[0].impulse,2000000*massRatio,1e-6);assert.deepEqual(w,snapshot);
  });
}
test('accepted taut-rope impulse before a later impact remains physical after that impact',()=>{
  const c={...config,couplingType:'rope'};const w=world(c);w.B.velocity.x=-100;
  const r=advance(w.A,w.B,w.coupling,1/60,c,[{id:'late',position:{x:-28.01,y:0},radius:2}]);
  assert.equal(r.stopReason,undefined);near(r.A.velocity.x,-50,1e-8);near(r.B.velocity.x,50,1e-8);
  near(r.A.position.x,-50/60,1e-8);near(r.B.position.x,-20.02+50/60,1e-8);near(r.diagnostics.couplingImpulse,500000,1e-5);
});
for(const gap of [0,0.005]) test(`constraint-created ${gap===0?'zero-time':'earlier'} contact retries only its speculative horizon`,()=>{
  const c={...config,couplingType:'rope',substeps:1};const w=world(c);w.B.position.x=-19.7;w.B.velocity.x=-100;
  const r=advance(w.A,w.B,w.coupling,1/60,c,[{id:'blockingA',position:{x:-8-gap,y:0},radius:2}]);
  assert.equal(r.stopReason,undefined);near(r.A.position.x,-gap,1e-5);near(r.B.position.x,-20-gap,1e-5);
  near(r.A.velocity.x,0,1e-5);near(r.B.velocity.x,0,1e-5);
  assert.ok(r.contacts.some(e=>e.body==='A'&&e.other==='blockingA'));
});
