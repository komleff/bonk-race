// Проверяем настоящий Canvas, часы мира и ручной полёт без продуктовых зависимостей.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/bonk-tuglab-ui/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const errors=[];
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.U2TAGLAB_URL||'http://localhost:5175/u2taglab.html');await page.waitForFunction(()=>window.__bonkLab?.getState().startCountdown===0);
  await page.evaluate(()=>{window.__worldDraws={};const original=CanvasRenderingContext2D.prototype.fill;CanvasRenderingContext2D.prototype.fill=function(...args){window.__worldDraws[this.fillStyle]=(window.__worldDraws[this.fillStyle]||0)+1;return original.apply(this,args);};});
  await page.waitForTimeout(100);const draws=await page.evaluate(()=>window.__worldDraws);
  for(const color of ['#152a36','#322b25','#4c515b'])assert.ok(draws[color]>0,`семантический Canvas цвет ${color} должен рисоваться`);
  await page.getByRole('button',{name:'Пауза',exact:true}).click();const initial=await page.evaluate(()=>window.__bonkLab.getState());
  assert.equal(initial.distanceM,0);assert.equal(initial.progressPct,0);assert.equal(initial.y,initial.arena.spawnPoint.y);
  await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>window.__bonkLab.getState().spaceWorld),initial.spaceWorld);
  await page.getByRole('button',{name:'Step',exact:true}).click();const stepped=await page.evaluate(()=>window.__bonkLab.getState());
  assert.ok(Math.abs(stepped.elapsedTime-initial.elapsedTime-1/60)<1e-9);assert.equal(stepped.elapsedTime,stepped.spaceWorld.time);
  assert.notDeepEqual(stepped.spaceWorld.asteroids,initial.spaceWorld.asteroids);
  await page.screenshot({path:'/tmp/u2taglab-space-world-desktop.png'});
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();await page.locator('canvas').click({position:{x:700,y:300}});
  await page.keyboard.down('w');await page.waitForFunction(y=>window.__bonkLab.getState().y<y-50,initial.y);await page.keyboard.up('w');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();const flight=await page.evaluate(()=>window.__bonkLab.getState());
  assert.ok(flight.towing.B.velocity.y<0);assert.equal(flight.towing.reason,undefined);assert.equal(flight.elapsedTime,flight.spaceWorld.time);
  await page.getByRole('button',{name:'Restart',exact:true}).click();await page.getByRole('button',{name:'Пауза',exact:true}).click();
  const restarted=await page.evaluate(()=>window.__bonkLab.getState());assert.equal(restarted.spaceWorld.time,0);assert.equal(restarted.spaceWorld.tick,0);
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  assert.equal(await page.getByLabel('Максимальная начальная скорость астероидов',{exact:true}).count(),1);
  assert.equal(await page.getByLabel('Коэффициент столкновения',{exact:true}).count(),1);
  await page.getByLabel('Максимальная начальная скорость астероидов',{exact:true}).fill('100');
  await page.getByLabel('Максимальная начальная скорость астероидов',{exact:true}).press('Enter');
  await page.getByLabel('Коэффициент столкновения',{exact:true}).fill('0.95');await page.getByLabel('Коэффициент столкновения',{exact:true}).press('Enter');
  const configured=await page.evaluate(()=>({params:window.__bonkLab.params,s:window.__bonkLab.getState()}));
  assert.equal(configured.params['space.collisionRestitution'],0.95);assert.equal(configured.params['space.asteroidMaxSpeed'],100);
  assert.ok(configured.s.spaceWorld.asteroids.some(b=>Math.hypot(b.velocity.x,b.velocity.y)>5));assert.equal(configured.s.elapsedTime,0);
  await page.getByRole('button',{name:'Скрыть',exact:true}).click();
  const collision=await page.evaluate(()=>{
   const lab=window.__bonkLab;lab.updateParams('space.enginesEnabled',false);lab.start();lab.pause();
   while(lab.getState().startCountdown>0)lab.stepOnce();lab.setTowingConnection(false);
   const start=lab.getState(),original=start.spaceWorld.asteroids[0];
   const body={...original,position:{x:start.x-start.radius-original.radius-0.1,y:start.y},velocity:{x:100,y:0}};
   lab.spaceWorld.asteroids=[body];
   const initialMomentum=start.mass*start.vx+start.towing.B.mass*start.towing.B.velocity.x+body.mass*100;
   lab.stepOnce();const hit=lab.getState(),after=hit.spaceWorld.asteroids[0];
   const finalMomentum=hit.mass*hit.vx+hit.towing.B.mass*hit.towing.B.velocity.x+after.mass*after.velocity.x;
   const station=hit.spaceWorld.statics.find(o=>o.kind==='station');
   lab.spaceWorld.asteroids[0].position={x:station.position.x-station.radius-body.radius-0.1,y:station.position.y};
   lab.spaceWorld.asteroids[0].velocity={x:100,y:0};lab.stepOnce();const wallHit=lab.getState();
   return {initialMomentum,finalMomentum,shipVelocity:hit.vx,asteroidVelocity:after.velocity.x,stationBounce:wallHit.spaceWorld.asteroids[0].velocity.x,
    staticBefore:station,staticAfter:wallHit.spaceWorld.statics.find(o=>o.id===station.id),reason:wallHit.towing.reason,time:wallHit.elapsedTime,worldTime:wallHit.spaceWorld.time};
  });
  assert.ok(collision.shipVelocity>0);assert.ok(Math.abs(collision.initialMomentum-collision.finalMomentum)<0.0001);
  assert.ok(Math.abs(collision.stationBounce+95)<1e-8);assert.deepEqual(collision.staticAfter,collision.staticBefore);
  assert.equal(collision.reason,undefined);assert.equal(collision.time,collision.worldTime);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.screenshot({path:'/tmp/u2taglab-space-world-mobile.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',statics:initial.spaceWorld.statics.length,asteroids:initial.spaceWorld.asteroids.length,flight:{distance:flight.distanceM,time:flight.elapsedTime},collision,draws,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
