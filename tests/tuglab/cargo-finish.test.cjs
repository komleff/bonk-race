const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const compiled=process.env.TUGLAB_FINISH_COMPILED_ROOT??path.resolve(__dirname,'../../.cache/tuglab-tests/client/src');
const {BonkLab}=require(path.join(compiled,'lab/BonkLab.js'));
const dt=1/60;
const variants=[['TugLab AB',{towing:true}],['U2TagLab AB',{towing:true,space:true}],['U2TagLab ABC',{towing:true,space:true},true]];
function fixture(options,abc,from,to,aAtFinish=false){
 const lab=new BonkLab({},options);if(abc)assert.equal(lab.setTowingComposition('ABC').ok,true);
 lab.start();lab.startCountdown=0;lab.elapsedTime=10;
 const finish=lab.getState().arena.finishPoint,cargo=abc?lab.train.state.bodies.B:lab.towing.B;
 const halfWidth=lab.getState().arena.width*.3;
 lab.x=finish.x;lab.y=finish.y-(aAtFinish?5:200);
 cargo.position={x:finish.x+from.x,y:finish.y+from.y};
 if(abc)lab.train.state.bodies.C.position={x:finish.x,y:finish.y+500};
 // Подставляем принятый шаг физики: проверяется общий игровой финиш, а не интегратор.
 lab[options.space?'tickSpace':'tickTowing']=()=>{cargo.position={x:finish.x+to.x,y:finish.y+to.y};return true;};
 return {lab,cargo,finish,halfWidth};
}
for(const [name,options,abc]of variants){
 test(`${name}: tractor on finish strip does not score while cargo center is behind`,()=>{
  const {lab}=fixture(options,abc,{x:0,y:2},{x:0,y:1},true);lab.update(dt);assert.equal(lab.getState().finished,false);
 });
 test(`${name}: cargo center crossing scores with C behind and freezes timer and best record once`,()=>{
  const {lab}=fixture(options,abc,{x:0,y:1},{x:0,y:-1});lab.bestTime=11;lab.update(dt);
  const result=lab.getState();assert.equal(result.finished,true);assert.equal(result.finishTime,10+dt);assert.equal(result.bestTime,result.finishTime);assert.equal(result.isNewRecord,true);
  lab.update(.1);assert.equal(lab.getState().finishTime,result.finishTime);assert.equal(lab.getState().elapsedTime,result.elapsedTime);assert.equal(lab.getState().bestTime,result.bestTime);
  if(abc){assert.equal(lab.isRunning,false);assert.equal(lab.getState().train.paused,true);}
 });
 test(`${name}: touching by cargo nose, reverse crossing and starting beyond line do not score`,()=>{
  for(const [from,to]of [[{x:0,y:20},{x:0,y:1}],[{x:0,y:-1},{x:0,y:1}],[{x:0,y:-2},{x:0,y:-3}]]){
   const {lab}=fixture(options,abc,from,to);lab.update(dt);assert.equal(lab.getState().finished,false);
  }
 });
 test(`${name}: swept cargo intersection must be within gate, including a finite large overshoot`,()=>{
  const width=new BonkLab({},options).getState().arena.width*.3;
  for(const [from,to,expected]of [
   [{x:0,y:10000},{x:0,y:-10000},true],
   [{x:2*width,y:1},{x:2*width,y:-1},false],
   [{x:2*width,y:1},{x:0,y:-3},false],
   [{x:0,y:1},{x:2*width,y:-3},true],
   [{x:width,y:1},{x:width,y:0},true],
   [{x:1e308,y:1e308},{x:-1e308,y:-1e308},true],
  ]){const {lab}=fixture(options,abc,from,to);lab.update(dt);assert.equal(lab.getState().finished,expected,JSON.stringify({from,to}));}
 });
 test(`${name}: slower cargo finish preserves previous best time`,()=>{
  const {lab}=fixture(options,abc,{x:0,y:1},{x:0,y:-1});lab.bestTime=9;lab.update(dt);assert.equal(lab.getState().finished,true);assert.equal(lab.getState().bestTime,9);assert.equal(lab.getState().isNewRecord,false);
 });
}
for(const [name,options]of variants.filter(v=>!v[2]))test(`${name}: real accepted physics cargo crossing scores with tractor beyond strip`,()=>{
 const lab=new BonkLab({},options);lab.start();lab.startCountdown=0;
 const finish=lab.getState().arena.finishPoint;lab.x=finish.x+150;lab.y=finish.y-60;lab.vx=lab.vy=0;
 lab.towing.coupling.connected=false;lab.towing.B.position={x:finish.x,y:finish.y+5};lab.towing.B.velocity={x:0,y:-600};
 if(options.space){lab.spaceWorld.fields=[];lab.spaceWorld.statics=[];lab.spaceWorld.asteroids=[];}
 else{lab.arena.obstacles=[];lab.orbs=[];}
 lab.update(dt);assert.equal(lab.getState().finished,true);assert.ok(lab.getState().towing.B.position.y<=finish.y);
});
test('ordinary BonkLab retains its existing circle versus finish strip scoring',()=>{
 const lab=new BonkLab({});lab.start();lab.startCountdown=0;const finish=lab.getState().arena.finishPoint;
 lab.x=finish.x;lab.y=finish.y;lab.vx=lab.vy=0;lab.arena.obstacles=[];lab.orbs=[];
 lab.update(dt);assert.equal(lab.getState().finished,true);
});
