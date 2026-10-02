const {test}=require('node:test');
const {core,near,assert,momentum}=require('./helpers.cjs');
test('disk inertia follows mass and independent radius',()=>{
  const {createBody}=core('physics/body.js');
  near(createBody(10000,6).inertia,180000);near(createBody(1000,12).inertia,72000);
});
test('off-axis attachment impulse changes both spins and preserves total momentum',()=>{
  const {createBody}=core('physics/body.js');
  const {attachmentState, couplingGeometry, applyCouplingImpulse}=core('physics/coupling.js');
  const A=createBody(10000,6);const B=createBody(20000,3,{x:8,y:3});B.angle=Math.PI/2;
  const c={attachmentA:'nose',attachmentB:'tail',lastNormal:{x:1,y:0}};
  const g=couplingGeometry(A,B,c);near(g.normal.x,1);near(g.normal.y,0);
  const initial=momentum({A,B});applyCouplingImpulse(A,B,g,1000);
  near(A.velocity.x,0.1);near(B.velocity.x,-0.05);near(A.angularVelocity,0);near(B.angularVelocity,-1/30);
  near(momentum({A,B}).angular,initial.angular);near(momentum({A,B}).x,0);
  near(couplingGeometry(A,B,c).radialVelocity,-g.inverseMass*1000);
  const p=attachmentState(B,'tail');near(p.velocity.x,-0.15);
});
test('coincident attachments retain a finite last normal',()=>{
  const {createBody}=core('physics/body.js');const {couplingGeometry}=core('physics/coupling.js');
  const a=createBody(10000,6),b=createBody(10000,6,{x:12,y:0});
  const g=couplingGeometry(a,b,{attachmentA:'nose',attachmentB:'tail',lastNormal:{x:0,y:1}});
  assert.deepEqual(g.normal,{x:0,y:1});assert.ok(Number.isFinite(g.inverseMass));
});
test('both off-axis moments have the required impulse signs',()=>{
  const {createBody}=core('physics/body.js');const {couplingGeometry,applyCouplingImpulse}=core('physics/coupling.js');
  const A=createBody(10000,6), B=createBody(20000,3,{x:12,y:8});
  const g=couplingGeometry(A,B,{attachmentA:'nose',attachmentB:'tail',lastNormal:{x:1,y:0}});
  applyCouplingImpulse(A,B,g,1000);
  near(A.angularVelocity,48000/Math.sqrt(73)/180000);
  near(B.angularVelocity,24000/Math.sqrt(73)/90000);
  near(momentum({A,B}).angular,0);
});
test('invalid mass or radius cannot create a physical body',()=>{
  const {createBody}=core('physics/body.js');for(const values of [[0,6],[10000,0],[Infinity,6]])assert.throws(()=>createBody(...values));
});
