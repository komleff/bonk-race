const {test}=require('node:test');
const {core,near,world,assert}=require('./helpers.cjs');
const {defaultConfig}=core('config/validate.js');
const {createBody,driftBody}=core('physics/body.js');
const {firstContact,resolveContact}=core('physics/contacts.js');
function interval(...args){let module;try{module=core('physics/coupledAdvance.js');}catch{}assert.equal(typeof module?.advanceCoupledInterval,'function','общий владелец временной логики сцепки должен существовать');return module.advanceCoupledInterval(...args);}
test('shared coupled interval resolves simultaneous endpoint contacts and advances every body once',()=>{
 const config={...defaultConfig,substeps:1,restitution:1},w=world(config);w.coupling.connected=false;
 w.A=createBody(100,0.1);w.B=createBody(100,0.1,{x:-0.5,y:-0.5});w.A.velocity={x:54,y:54};
 const passive=createBody(500,0.1,{x:5,y:5});passive.velocity={x:7,y:-3};
 const bounds={minX:-1,maxX:1,minY:-1,maxY:1},contacts=[];
 const ok=interval(w.A,w.B,w.coupling,1/60,config,{
  findContact:(a,b,h)=>firstContact(a,b,[],bounds,h,config),
  advanceBodies:h=>[w.A,w.B,passive].forEach(b=>driftBody(b,h)),
  resolveContact:hit=>contacts.push(resolveContact(w.A,w.B,hit)),
 });
 assert.equal(ok,true);near(w.A.velocity.x,-54);near(w.A.velocity.y,-54);
 assert.deepEqual(contacts.map(c=>c.other),['bounds:maxX','bounds:maxY']);near(passive.position.x,5+7/60);near(passive.position.y,5-3/60);
});
for(const touching of [false,true])test(`shared coupled interval discards slack-rope tension before an ${touching?'initial':'earlier'} impact`,()=>{
 const config={...defaultConfig,couplingType:'rope',restitution:1},w=world(config),contacts=[];
 w.B.position.x=touching?-19.95:-19.7;w.B.velocity.x=-100;
 const obstacle={id:'early',position:{x:touching?-27.95:-27.71,y:0},radius:2};
 const ok=interval(w.A,w.B,w.coupling,1/60,config,{
  findContact:(a,b,h)=>firstContact(a,b,[obstacle],undefined,h,config),
  advanceBodies:h=>{driftBody(w.A,h);driftBody(w.B,h);},
  resolveContact:hit=>contacts.push(resolveContact(w.A,w.B,hit)),
 });
 assert.equal(ok,true);near(w.A.velocity.x,0,1e-8);near(w.B.velocity.x,100,1e-8);near(w.coupling.accumulatedImpulse,0,1e-8);
 near(contacts[0].impulse,2000000,1e-6);near(w.B.position.x,(touching?-19.95:-19.72)+100/60,1e-8);
});
