// Проверяем реальные SI-контролы, Canvas-поля и общие часы мира в Chrome.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/bonk-tuglab-ui/node_modules/playwright');
const out=process.env.U2TAGLAB_FIELDS_QA_DIR||'/tmp/u2taglab-fields-qa';fs.mkdirSync(out,{recursive:true});
const report={errors:[],checks:[],physicalAndroid:false};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 report.browser=browser.version();
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{window.__fieldDraws=[];const draw=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(/Плазменный поток|Сопротивляющаяся среда|Горячая область|Холодная область|Пылевое облако|Электромагнитная буря/.test(text))window.__fieldDraws.push(text);return draw.call(this,text,...args);};});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>fs.appendFileSync(out+'/console.log',m.text()+'\n'));
  page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);});
  await page.goto(process.env.U2TAGLAB_URL||'http://127.0.0.1:5175/u2taglab.html');
  await page.waitForFunction(()=>window.__bonkLab?.getState().startCountdown<=0);
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  const initial=await page.evaluate(()=>({fields:window.__bonkLab.getState().spaceWorld.fields,params:window.__bonkLab.params}));
  assert.ok(initial.fields.length>=8);assert.equal(initial.params['space.fieldPressure'],50);assert.equal(initial.params['space.resistiveK'],0.5);
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.locator('.lab-group-header').filter({hasText:'Локальные поля'}).click();
  const pressure=page.getByLabel('Давление плазменного потока (LAB)',{exact:true});
  await pressure.fill('1000');await pressure.press('Enter');
  assert.equal(await page.evaluate(()=>window.__bonkLab.params['space.fieldPressure']),1000);
  assert.equal(await page.evaluate(()=>window.__bonkLab.getState().spaceWorld.time),0);
  const resistance=page.getByLabel('Сопротивление k_R (LAB)',{exact:true});
  await resistance.fill('100');await resistance.press('Enter');
  assert.equal(await page.evaluate(()=>window.__bonkLab.params['space.resistiveK']),100);
  await pressure.fill('1001');await pressure.press('Enter');
  assert.equal(await page.evaluate(()=>window.__bonkLab.params['space.fieldPressure']),1000);
  await pressure.fill('50');await pressure.press('Enter');await resistance.fill('0.5');await resistance.press('Enter');
  const pressureRow=page.locator('.lab-param').filter({has:pressure});
  await pressureRow.getByRole('button',{name:'i',exact:true}).click();
  assert.match(await pressureRow.locator('.lab-param-tooltip').innerText(),/лабораторное замыкание/);
  assert.match(await pressureRow.locator('.lab-param-tooltip').innerText(),/момент 0/);
  await page.screenshot({path:out+'/desktop-settings.png'});
  await page.locator('summary').filter({hasText:'Поля: законы'}).click();
  assert.match(await page.locator('details').innerText(),/температуры|Температура/);
  assert.match(await page.locator('details').innerText(),/датчики/);
  report.checks.push('Desktop SI settings, limits, source help and model boundary details');
  await page.getByRole('button',{name:'Скрыть',exact:true}).click();
  const fieldView=await page.evaluate(()=>{
   const lab=window.__bonkLab,w=lab.spaceWorld,f=w.fields.find(f=>f.kind==='plasma'&&f.topology==='vortex');
   lab.x=f.center.x;lab.y=f.center.y;lab.vx=lab.vy=0;lab.towing.B.position={x:lab.x+300,y:lab.y+300};
   lab.towing.B.velocity={x:0,y:0};lab.setTowingConnection(false);w.statics=[];w.asteroids=[];lab.syncPrevState();
   return {field:f,time:w.time};
  });
  await page.waitForTimeout(100);await page.screenshot({path:out+'/desktop-vortex.png'});
  assert.ok(await page.evaluate(()=>window.__fieldDraws.includes('Плазменный поток · вихрь')));
  assert.equal(await page.evaluate(()=>window.__bonkLab.getState().spaceWorld.time),fieldView.time);
  await page.getByRole('button',{name:'Старт',exact:true}).click();
  try {await page.waitForFunction(()=>window.__bonkLab.getState().startCountdown<=0,{},{timeout:5000});}
  catch(e){report.diagnostic=await page.evaluate(()=>({state:window.__bonkLab.getState(),started:window.__bonkLab.hasStarted,running:window.__bonkLab.isRunning,hidden:document.hidden}));throw e;}
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  const paused=await page.evaluate(()=>window.__bonkLab.getState());await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(()=>window.__bonkLab.getState()),paused);
  await page.getByRole('button',{name:'Step',exact:true}).click();
  const stepped=await page.evaluate(()=>window.__bonkLab.getState());
  assert.ok(Math.abs(stepped.spaceWorld.time-paused.spaceWorld.time-1/60)<1e-9);
  await page.getByRole('button',{name:'Restart',exact:true}).click();
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__bonkLab.getState().spaceWorld.fields),initial.fields);
  report.checks.push('Seeded Canvas vortex rendering, Pause, UI Step and Restart field definitions');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  const header=page.locator('.lab-group-header').filter({hasText:'Локальные поля'});
  if(await pressure.count()===0)await header.click();
  await resistance.scrollIntoViewIfNeeded();
  const row=page.locator('.lab-param').filter({has:resistance});await row.getByRole('button',{name:'i',exact:true}).click();
  assert.match(await row.locator('.lab-param-tooltip').innerText(),/дрейф области не является движением материала/);
  const geom=await row.locator('.lab-param-tooltip').boundingBox();assert.ok(geom.x>=0&&geom.x+geom.width<=390);
  await page.screenshot({path:out+'/mobile-help.png'});report.checks.push('390x844 mobile emulation: field controls, tappable help, tooltip fits width');
  await page.goto(process.env.TUGLAB_URL||'http://127.0.0.1:5174/tuglab.html');await page.waitForFunction(()=>window.__bonkLab);
  assert.equal(await page.evaluate(()=>window.__bonkLab.getState().spaceWorld),undefined);
  assert.equal(await page.evaluate(()=>window.__bonkLab.params['space.fieldPressure']),undefined);
  report.checks.push('Existing 5174 TugLab remains live and opted out of space fields');
  assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
