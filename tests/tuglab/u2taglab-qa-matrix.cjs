// Ограниченная матрица реальной лаборатории: границы масс/сцепок/сил/полей и атомарный stop.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const cases=[
 {mass:401200,ratio:1556800/401200,length:360,radius:49.75862068965517,k:360000,force:16228800,pressure:50,drag:0.5,type:'spring'},
 {mass:10000,ratio:0.1,length:20,radius:2,k:1e8,force:1e8,pressure:1000,drag:100,type:'spring'},
 {mass:1e7,ratio:10,length:2000,radius:250,k:1e8,force:1e8,pressure:1000,drag:100,type:'spring'},
 {mass:10000,ratio:10,length:2000,radius:250,k:0,force:0,pressure:1000,drag:100,type:'rope'},
 {mass:1e7,ratio:0.1,length:288,radius:2,k:0,force:1e8,pressure:1000,drag:0,type:'rod'},
 {mass:300000,ratio:680000/300000,length:2000,radius:250,k:184904.0171469394,force:16228800,pressure:0,drag:0,type:'rope'},
];
const output=process.env.U2TAGLAB_MATRIX_DIR||'.cache/u2taglab-qa';fs.mkdirSync(output,{recursive:true});
const results=[];
for(const [index,config]of cases.entries())for(const fa of [true,false]){
 const lab=new BonkLab({}, {towing:true,space:true});
 for(const [key,value]of Object.entries({'mass':config.mass,'tow.massRatio':config.ratio,'tow.length':config.length,'tow.radiusB':config.radius,'tow.stiffness':config.k,'tow.type':config.type,'space.forwardForce':config.force,'space.fieldPressure':config.pressure,'space.resistiveK':config.drag,'space.asteroidMaxSpeed':100,'space.fa':fa}))lab.updateParams(key,value);
 lab.reset();assert.equal(lab.getState().towing.needsRestart,false);lab.start();while(lab.getState().startCountdown>0)lab.update(1/60);
 // Поле на текущем месте оставляет исходные тела/контакты: проверяем совместные силы на полном мире.
 const field=lab.spaceWorld.fields.find(f=>f.kind==='plasma');
 lab.spaceWorld.fields=[Object.freeze({...field,center:{x:lab.x,y:lab.y},radius:5000,pressure:config.pressure,drift:{x:0,y:0}}),
  Object.freeze({...field,id:'matrix:drag',kind:'resistive',center:{x:lab.x,y:lab.y},radius:5000,resistiveK:config.drag,drift:{x:0,y:0}})];
 lab.setInput(0,-1,1);let steps=0,stop;
 for(;steps<120;steps++){
  const before=lab.getState();lab.update(1/60);const after=lab.getState();
  assert.ok([after.x,after.y,after.vx,after.vy,after.angularVelocity,after.towing.B.position.x,after.towing.B.position.y,after.towing.B.velocity.x,after.towing.B.velocity.y,...after.spaceWorld.asteroids.flatMap(a=>[a.position.x,a.position.y,a.velocity.x,a.velocity.y])].every(Number.isFinite));
  if(after.towing.needsRestart){assert.equal(lab.isRunning,false);assert.deepEqual(after.spaceWorld,before.spaceWorld);assert.deepEqual(after.towing.B,before.towing.B);assert.deepEqual(after.towing.coupling,before.towing.coupling);assert.equal(after.x,before.x);assert.equal(after.y,before.y);assert.equal(after.elapsedTime,before.elapsedTime);stop=after.towing.reason;break;}
 }
 results.push({index,fa,config,steps,stop:stop||null});
}
const report={status:'PASS',runs:results.length,results};fs.writeFileSync(output+'/space-matrix.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
