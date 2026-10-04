const {test}=require('node:test');
const {assert,near,momentum,energy}=require('./helpers.cjs');
const {LabTowing}=require('../../.cache/tuglab-tests/client/src/tuglab/labTowing.js');
const {createSpaceProfile,createSpaceBody,spaceTowingProfile}=require('../../.cache/tuglab-tests/client/src/u2taglab/profile.js');
const {advanceSpaceWorld}=require('../../.cache/tuglab-tests/client/src/u2taglab/physics/advanceWorld.js');
const empty=()=>({width:10000,height:10000,spawnPoint:{x:0,y:0},obstacles:[]});
function pair(attachmentA='tail',attachmentB='nose'){
 const p=createSpaceProfile(),a=createSpaceBody(p,'A'),t=new LabTowing(a,spaceTowingProfile(p));
 t.params['tow.type']='rigid';t.coupling.type='rigid';t.coupling.connected=false;
 const sign=attachmentA==='nose'?1:-1;t.B.position.x=sign*(a.radius+t.B.radius+10);
 t.B.angle=attachmentA===attachmentB?Math.PI:0;
 return {p,a,t};
}
for(const aa of ['nose','tail'])for(const ab of ['nose','tail'])test(`rigid captures nearest ${aa}/${ab}, tangent, preserving COM/P/L without energy`,()=>{
 const {a,t}=pair(aa,ab);a.velocity={x:40,y:-15};t.B.velocity={x:38,y:-14};
 const before={A:structuredClone(a),B:structuredClone(t.B)},P=momentum(before),K=energy(before),M=a.mass+t.B.mass;
 const C={x:(a.mass*a.position.x+t.B.mass*t.B.position.x)/M,y:0};
 const r=t.setConnection(true,a,175,empty());assert.equal(r.ok,true,r.reason);
 assert.equal(t.coupling.attachmentA,aa);assert.equal(t.coupling.attachmentB,ab);
 near(Math.hypot(a.position.x-t.B.position.x,a.position.y-t.B.position.y),a.radius+t.B.radius,1e-8);
 near(t.B.angle-a.angle,aa===ab?Math.PI:0,1e-8);
 const after={A:a,B:t.B},Q=momentum(after);near(Q.x,P.x,1e-7);near(Q.y,P.y,1e-7);near(Q.angular,P.angular,1e-4);
 near((a.mass*a.position.x+t.B.mass*t.B.position.x)/M,C.x,1e-8);near((a.mass*a.position.y+t.B.mass*t.B.position.y)/M,C.y,1e-8);
 assert.ok(energy(after)<=K+K*1e-12);
});
test('rigid capture ignores configured spring length and accepts common V_FA drift',()=>{
 const {a,t}=pair();t.params['tow.length']=20;a.velocity.x=t.B.velocity.x=175;t.B.position.x-=20;
 assert.equal(t.setConnection(true,a,175,empty()).ok,true);
});
test('rigid capture obstacle sweep and infeasible energy fail atomically',()=>{
 for(const obstacle of [true,false]){
 const {a,t}=pair();t.B.position.y=30;t.B.angle=0;
 if(!obstacle){const M=a.mass+t.B.mass,Cx=(a.mass*a.position.x+t.B.mass*t.B.position.x)/M,Cy=(a.mass*a.position.y+t.B.mass*t.B.position.y)/M;for(const body of [a,t.B]){body.angularVelocity=1;body.velocity={x:-(body.position.y-Cy),y:body.position.x-Cx};}}
 const arena=empty();if(obstacle)arena.obstacles=[{x:t.B.position.x+8,y:28,radius:2,alive:true}];
 const before=structuredClone({a,B:t.B,c:t.coupling});const r=t.setConnection(true,a,1000,arena);
 assert.equal(r.ok,false);assert.deepEqual({a,B:t.B,c:t.coupling},before);
 }
});
function space(){return {width:10000,height:10000,time:0,tick:0,seed:1,density:1,spawnPoint:{x:0,y:0},asteroids:[],statics:[],fields:[]};}
test('rigid engine wrench accelerates total mass and off-axis thrust rotates common inertia',()=>{
 const {a,t}=pair();assert.equal(t.setConnection(true,a,175,empty()).ok,true);
 const M=a.mass+t.B.mass,C=(a.mass*a.position.x+t.B.mass*t.B.position.x)/M;
 const I=a.inertia+t.B.inertia+a.mass*(a.position.x-C)**2+t.B.mass*(t.B.position.x-C)**2;
 const r=advanceSpaceWorld(a,t.B,t.coupling,space(),.01,{...t.physicsConfig(),substeps:1},({id})=>({force:{x:id==='A'?100000:0,y:id==='A'?50000:0},torque:id==='A'?20000:0}));
 assert.equal(r.stopReason,undefined);const v={x:(a.mass*r.A.velocity.x+t.B.mass*r.B.velocity.x)/M,y:(a.mass*r.A.velocity.y+t.B.mass*r.B.velocity.y)/M};
 near(v.x,1000/M,1e-10);near(v.y,500/M,1e-10);near(r.A.angularVelocity,((a.position.x-C)*50000+20000)*.01/I,1e-12);
 near(r.B.angularVelocity,r.A.angularVelocity);near(Math.hypot(r.A.position.x-r.B.position.x,r.A.position.y-r.B.position.y),a.radius+t.B.radius,1e-8);
});
module.exports={pair,empty,space};

for(const hitBody of ['A','B']) for(const moving of [false,true]) test(`rigid ${hitBody} high-speed contact with ${moving?'asteroid':'station'} transfers compound impulse`,()=>{
 const {a,t}=pair();assert.equal(t.setConnection(true,a,175,empty()).ok,true);a.velocity.y=t.B.velocity.y=1000;
 const w=space(), struck=hitBody==='A'?a:t.B;
 const obstacle={id:'target',position:{x:struck.position.x,y:100},radius:5};
 if(moving)w.asteroids=[{...obstacle,mass:1e6,inertia:1e7,velocity:{x:0,y:0},angle:0,angularVelocity:0}];else w.statics=[obstacle];
 const before={A:structuredClone(a),B:structuredClone(t.B)},P=momentum(before);
 const r=advanceSpaceWorld(a,t.B,t.coupling,w,.2,t.physicsConfig());assert.equal(r.stopReason,undefined,r.stopReason);
 assert.ok(r.contacts.some(c=>c.body===hitBody&&c.other==='target'));assert.ok(Math.abs(r.A.angularVelocity)>0);
 near(r.A.angularVelocity,r.B.angularVelocity);near(Math.hypot(r.A.position.x-r.B.position.x,r.A.position.y-r.B.position.y),a.radius+t.B.radius,1e-7);
 if(moving){const Q=momentum(r),o=r.world.asteroids[0];near(Q.x+o.mass*o.velocity.x,P.x,1e-4);near(Q.y+o.mass*o.velocity.y,P.y,.001);near(Q.angular+o.mass*(o.position.x*o.velocity.y-o.position.y*o.velocity.x)+o.inertia*o.angularVelocity,P.angular,.01);}
});
test('rigid rotating centers hit a small station on the arc, not merely endpoint/chord',()=>{
 const {a,t}=pair();assert.equal(t.setConnection(true,a,175,empty()).ok,true);const M=a.mass+t.B.mass,C=(a.mass*a.position.x+t.B.mass*t.B.position.x)/M;
 for(const body of [a,t.B]){body.angularVelocity=8;body.velocity={x:0,y:8*(body.position.x-C)};}
 const radius=a.position.x-C,w=space();w.statics=[{id:'arc',position:{x:C+radius*Math.cos(.6),y:radius*Math.sin(.6)},radius:1}];
 const r=advanceSpaceWorld(a,t.B,t.coupling,w,.15,t.physicsConfig());
 assert.equal(r.stopReason,undefined,r.stopReason);assert.ok(r.contacts.some(c=>c.other==='arc'));
});
test('rigid factory has zero anchor length regardless of configured spring length',()=>{
 const {createCoupling}=require('../../.cache/tuglab-tests/client/src/tuglab/physics/coupling.js');
 const c=createCoupling({...require('../../.cache/tuglab-tests/client/src/tuglab/config/tuglab_defaults.json'),couplingType:'rigid',length:360});
 near(c.restLength,0);near(c.minLength,0);near(c.maxLength,0);
});
for(const arrangement of ['front','rear'])test(`rigid ${arrangement} rotating vacuum/disconnect retains geometry and P/L/E`,()=>{
 const {a,t}=pair(arrangement==='front'?'tail':'nose');assert.equal(t.setConnection(true,a,175,empty()).ok,true);
 const M=a.mass+t.B.mass,C={x:(a.mass*a.position.x+t.B.mass*t.B.position.x)/M,y:0};
 for(const b of [a,t.B]){b.angularVelocity=2;b.velocity={x:175,y:2*(b.position.x-C.x)};}
 let r={A:a,B:t.B,coupling:t.coupling,world:space()},P=momentum(r),K=energy(r);
 for(let i=0;i<200;i++){r=advanceSpaceWorld(r.A,r.B,r.coupling,r.world,1/60,t.physicsConfig());assert.equal(r.stopReason,undefined,r.stopReason);near(Math.hypot(r.A.position.x-r.B.position.x,r.A.position.y-r.B.position.y),a.radius+t.B.radius,1e-7);}
 const Q=momentum(r);near(Q.x,P.x,1e-5);near(Q.y,P.y,1e-5);near(Q.angular,P.angular,.01);near(energy(r),K,.01);
 t.B=r.B;t.coupling=r.coupling;const before=structuredClone(r);assert.equal(t.setConnection(false,r.A,175,empty()).ok,true);
 assert.deepEqual(r.A,before.A);assert.deepEqual(t.B,before.B);near(momentum({A:r.A,B:t.B}).angular,Q.angular,.01);
});
test('rigid diagonal corner resolves both bounds on the common clock without internal A/B contacts',()=>{
 const {a,t}=pair();assert.equal(t.setConnection(true,a,175,empty()).ok,true);
 for(const b of [a,t.B])b.velocity={x:1000,y:1000};const w=space();w.width=w.height=500;
 const r=advanceSpaceWorld(a,t.B,t.coupling,w,.3,t.physicsConfig());assert.equal(r.stopReason,undefined,r.stopReason);
 assert.ok(r.contacts.some(c=>c.other==='bounds:maxX'));assert.ok(r.contacts.some(c=>c.other==='bounds:maxY'));
 assert.equal(r.contacts.some(c=>c.body==='A'&&c.other==='B'),false);near(r.world.time,.3);
});
test('rigid guards roll back all moving bodies and world on late force and contact budget failure',()=>{
 const {a,t}=pair();assert.equal(t.setConnection(true,a,175,empty()).ok,true);for(const body of [a,t.B])body.velocity={x:1000,y:1000};
 const w=space();w.width=w.height=500;w.statics=[];w.asteroids=[{id:'free',position:{x:-150,y:-150},radius:2,mass:1000,inertia:2000,velocity:{x:50,y:0},angle:0,angularVelocity:0}];
 const before=structuredClone({a,B:t.B,c:t.coupling,w});
 for(const sampler of [undefined,({time})=>{if(time>0)throw new Error('late');return {force:{x:0,y:0},torque:0};}]){
  const r=advanceSpaceWorld(a,t.B,t.coupling,w,.4,{...t.physicsConfig(),maxContactEvents:1,substeps:sampler?4:1,maxAdaptiveSubsteps:sampler?4:1},sampler);
  assert.ok(r.stopReason);assert.equal(r.A,a);assert.equal(r.B,t.B);assert.equal(r.world,w);assert.deepEqual({a,B:t.B,c:t.coupling,w},before);
 }
});
for(const e of [0,1])test(`rigid contact restitution ${e} does not add energy or stop a simple impact`,()=>{
 const {a,t}=pair();assert.equal(t.setConnection(true,a,175,empty()).ok,true);a.velocity.y=t.B.velocity.y=100;
 const w=space();w.statics=[{id:'target',position:{x:a.position.x,y:70},radius:5}];const K=energy({A:a,B:t.B});
 const r=advanceSpaceWorld(a,t.B,t.coupling,w,.8,{...t.physicsConfig(),restitution:e});assert.equal(r.stopReason,undefined,r.stopReason);assert.ok(r.contacts.length);assert.ok(energy(r)<=K+K*1e-10);if(e===1)near(energy(r),K,.01);
});
test('rigid capture rejects an obstacle crossed between two free endpoint poses',()=>{
 const {a,t}=pair('nose','tail');a.radius=t.B.radius=2;a.mass=t.B.mass=1000;a.inertia=t.B.inertia=2000;a.position={x:0,y:0};t.B.position={x:8,y:0};
 const arena=empty();arena.obstacles=[{x:7,y:2.9,radius:1,alive:true}];
 assert.ok(Math.hypot(t.B.position.x-7,t.B.position.y-2.9)>3);assert.ok(Math.hypot(6-7,0-2.9)>3);
 const before=structuredClone({a,B:t.B,c:t.coupling}),r=t.setConnection(true,a,175,arena);assert.equal(r.ok,false);assert.match(r.reason,/путь.*препятствие/i);assert.deepEqual({a,B:t.B,c:t.coupling},before);
});
for(const gap of [0,49,51])test(`rigid diameter capture threshold accepts or rejects gap ${gap} independently of spring length`,()=>{
 const {a,t}=pair();t.B.position.x=-(a.radius+t.B.radius+gap);t.params['tow.length']=2000;const before=structuredClone({a,B:t.B,c:t.coupling});
 const r=t.setConnection(true,a,175,empty());assert.equal(r.ok,gap<=a.radius*2);if(!r.ok)assert.deepEqual({a,B:t.B,c:t.coupling},before);
});
for(const wall of ['minX','maxX','minY','maxY'])for(const masses of [[401200,1556800],[1000,1000],[100300,24908800],[6419200,24371.875]])for(const e of [0,1])for(const speed of [.3,100])test(`aligned rigid ${wall} e${e} masses ${masses.join('/')} speed${speed} completes tangent wall contact`,()=>{
 const {createCoupling}=require('../../.cache/tuglab-tests/client/src/tuglab/physics/coupling.js'),defaults=require('../../.cache/tuglab-tests/client/src/tuglab/config/tuglab_defaults.json');
 const positive=wall.startsWith('max'),vertical=wall.endsWith('Y'),sign=positive?1:-1,angle=vertical?sign*-Math.PI/2:positive?Math.PI:0;
 const a={position:{x:vertical?0:sign*49,y:vertical?sign*49:0},velocity:{x:vertical?0:sign*speed,y:vertical?sign*speed:0},angle,angularVelocity:0,mass:masses[0],radius:1,inertia:masses[0]};
 const b=structuredClone(a);b.position.x+=2*Math.cos(angle);b.position.y+=2*Math.sin(angle);b.mass=b.inertia=masses[1];
 const config={...defaults,couplingType:'rigid',attachmentA:'nose',attachmentB:'tail',restitution:e,substeps:1},c=createCoupling(config),w=space();w.width=w.height=100;
 const r=advanceSpaceWorld(a,b,c,w,1/60,config);assert.equal(r.stopReason,undefined,r.stopReason);assert.ok(r.contacts.some(c=>c.other===`bounds:${wall}`));
 for(const body of [r.A,r.B])assert.ok(Math.abs(body.position[vertical?'y':'x'])+1<=50+config.normalEpsilon);
 assert.ok(r.A.velocity[vertical?'y':'x']*sign<=1e-12);
});
for(const dt of [1/60,1000])test(`rigid zero-curvature tiny closing rate is safely resolved for horizon ${dt}`,()=>{
 const {createCoupling}=require('../../.cache/tuglab-tests/client/src/tuglab/physics/coupling.js'),defaults=require('../../.cache/tuglab-tests/client/src/tuglab/config/tuglab_defaults.json');
 const a={position:{x:-49,y:0},velocity:{x:-1e-9,y:0},angle:0,angularVelocity:0,mass:401200,radius:1,inertia:401200},b={...structuredClone(a),position:{x:-47,y:0},mass:1556800,inertia:1556800};
 const config={...defaults,couplingType:'rigid',attachmentA:'nose',attachmentB:'tail',restitution:0,substeps:1},w=space();w.width=w.height=100;
 const r=advanceSpaceWorld(a,b,createCoupling(config),w,dt,config);assert.equal(r.stopReason,undefined,r.stopReason);assert.ok(r.A.position.x>=-49-config.normalEpsilon/4);assert.ok(r.A.velocity.x>=-1e-15);
});
