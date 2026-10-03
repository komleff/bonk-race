// Реальная ручная схема ввода в браузере; зависимости взяты из существующего QA-окружения.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/tmp/bonk-tuglab-ui/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),headless:true});
 const errors=[];
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.U2TAGLAB_URL || 'http://localhost:5175/u2taglab.html');await page.waitForFunction(()=>window.__bonkLab?.getState().startCountdown===0);
  assert.equal(await page.evaluate(()=>window.__bonkLab.isSpace),true);
  const initial=await page.evaluate(()=>window.__bonkLab.getState());assert.equal(initial.mass,300000);assert.equal(initial.towing.B.mass,680000);
  await page.screenshot({path:'/tmp/u2taglab-default.png'});
  await page.keyboard.down('w');await page.waitForFunction(y=>window.__bonkLab.getState().y<y-10,initial.y);await page.keyboard.up('w');
  const flight=await page.evaluate(()=>{const s=window.__bonkLab.getState();return {y:s.y,by:s.towing.B.position.y,vy:s.vy,bvy:s.towing.B.velocity.y,reason:s.towing.reason};});
  assert.ok(flight.vy<0 && flight.bvy<0);assert.ok(flight.by<initial.towing.B.position.y);assert.equal(flight.reason,undefined);
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  const before=await page.evaluate(()=>({s:window.__bonkLab.getState(),seed:window.__bonkLab.getScenarioInfo().seed}));
  await page.getByRole('button',{name:'Flight Assist',exact:true}).click();
  const after=await page.evaluate(()=>({s:window.__bonkLab.getState(),seed:window.__bonkLab.getScenarioInfo().seed}));
  assert.deepEqual(after,before);assert.equal(await page.getByRole('button',{name:'Flight Assist'}).getAttribute('aria-pressed'),'false');
  await page.getByRole('button',{name:'Flight Assist',exact:true}).click();
  await page.getByRole('button',{name:'Restart',exact:true}).click();await page.getByRole('button',{name:'Пауза',exact:true}).click();
  await page.getByRole('button',{name:'Расцепить',exact:true}).click();await page.getByRole('button',{name:'Сцепить',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__bonkLab.getState().towing.coupling.connected),true);
  await page.evaluate(()=>{while(window.__bonkLab.getState().startCountdown>0)window.__bonkLab.stepOnce();});
  const t=await page.evaluate(()=>window.__bonkLab.getState().elapsedTime);await page.getByRole('button',{name:'Step',exact:true}).click();
  assert.ok(Math.abs(await page.evaluate(()=>window.__bonkLab.getState().elapsedTime)-t-1/60)<1e-9);
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  const brake=await page.getByRole('button',{name:'Тормоз',exact:true}).boundingBox();await page.mouse.move(brake.x+10,brake.y+10);await page.mouse.down();
  assert.equal(await page.evaluate(()=>window.__bonkLab.spaceBrake),true);await page.mouse.up();assert.equal(await page.evaluate(()=>window.__bonkLab.spaceBrake),false);
  await page.locator('canvas').click({position:{x:700,y:300}});await page.keyboard.down('Space');assert.equal(await page.evaluate(()=>window.__bonkLab.spaceBrake),true);await page.keyboard.up('Space');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.getByLabel('Сцепка',{exact:true}).selectOption('rope');await page.getByLabel('Длина между креплениями',{exact:true}).fill('2000');await page.getByLabel('Длина между креплениями',{exact:true}).press('Enter');
  await page.getByRole('button',{name:'Restart',exact:true}).click();await page.getByRole('button',{name:'Скрыть',exact:true}).click();
  await page.waitForFunction(()=>window.__bonkLab.getState().startCountdown===0);
  const visible=await page.evaluate(()=>{const r=window.__labRenderer,s=window.__bonkLab.getState(),b=s.towing.B,rect=r.getCanvasRect();
    const y=rect.height*0.65+(b.position.y-s.y)*r.scale/devicePixelRatio;
    return {y,h:rect.height,radius:b.radius*r.scale/devicePixelRatio,range:r.viewRange,reason:s.towing.reason};});
  assert.ok(visible.y+visible.radius<visible.h);assert.equal(visible.reason,undefined);assert.ok(visible.range>2000);
  await page.screenshot({path:'/tmp/u2taglab-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  const layout=await page.evaluate(()=>({width:innerWidth,buttons:[...document.querySelectorAll('.tug-race-toolbar button')].map(x=>x.getBoundingClientRect().toJSON())}));
  assert.ok(layout.buttons.every(b=>b.x>=0 && b.right<=layout.width && b.width>=44 && b.height>=44));
  const cdp=await page.context().newCDPSession(page);const rect=await page.locator('canvas').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:rect.y+300}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y:rect.y+200}]});assert.equal(await page.evaluate(()=>window.__labInput.getState().y),-1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);
  await page.screenshot({path:'/tmp/u2taglab-mobile.png'});
  for(const url of ['http://localhost:5174/tuglab.html','http://localhost:5174/lab.html']) {
   await page.goto(url);await page.waitForFunction(()=>window.__bonkLab);assert.equal(await page.evaluate(()=>window.__bonkLab.isSpace),false);
   assert.equal(await page.evaluate(()=>window.__bonkLab.getState().mass),40);assert.equal(await page.getByRole('button',{name:'Flight Assist',exact:true}).count(),0);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',flight,visible,mobile:layout.width,stock:'TugLab + root BonkLab',errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
