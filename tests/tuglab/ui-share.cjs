// Мобильная эмуляция и обмен настоящими начальными состояниями двух страниц.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/bonk-tuglab-ui/node_modules/playwright');
const out=process.env.TUGLAB_SHARE_QA_DIR||'.cache/tuglab-qa/share';
const url=process.env.TUGLAB_URL||'http://localhost:5174/tuglab.html';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const errors=[],checks=[];
try{const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
// Адресные переходы из review: независимые страницы, без дополнительного regenerateArena.
const regressions=[];
const regression=async(name,body)=>{try{await body();checks.push({name,status:'PASS'});console.log(`PASS ${name}`);}catch(error){regressions.push(`${name}: ${error.message}`);console.log(`FAIL ${name}: ${error.message}`);}};
const shareFrom=async sender=>{
 await sender.getByRole('button',{name:'Настройки',exact:true}).click();await sender.getByRole('button',{name:'Поделиться',exact:true}).click();
 return sender.getByLabel('Ссылка на заезд').inputValue();
};
for(const [key,value] of [['mass',150],['geometry.baseRadiusM',30]])for(const manual of [false,true])await regression(`Restart/share ${key} only, ${manual?'manual':'auto'} orb density`,async()=>{
 const sender=await context.newPage(),receiver=await context.newPage();
 try{
  await sender.goto(url);await sender.waitForFunction(()=>window.__bonkLab);
  await sender.evaluate(({key,value,manual})=>{const lab=window.__bonkLab;lab.pause();if(manual)lab.updateParams('orbs.density',0.27);lab.updateParams(key,value);lab.reset();},{key,value,manual});
  const source=await sender.evaluate(()=>({snapshot:window.__bonkLab.exportShareSnapshot(),state:window.__bonkLab.getState()}));
  assert.equal(source.snapshot.orbDensityManual,manual);if(manual)assert.equal(source.snapshot.params['orbs.density'],0.27);
  const challenge=await shareFrom(sender);await receiver.goto(challenge);await receiver.waitForFunction(()=>window.__bonkLab);
  const target=await receiver.evaluate(()=>({snapshot:window.__bonkLab.exportShareSnapshot(),state:window.__bonkLab.getState()}));
  assert.deepEqual(target.snapshot,source.snapshot);assert.deepEqual(target.state.arena,source.state.arena);assert.deepEqual(target.state.orbs,source.state.orbs);assert.deepEqual(target.state.towing.B,source.state.towing.B);assert.equal(target.state.x,source.state.x);assert.equal(target.state.y,source.state.y);
 }finally{await sender.close();await receiver.close();}
});
await regression('waiting shared Step disabled and inert; Step works after Start/pause',async()=>{
 const sender=await context.newPage(),receiver=await context.newPage();
 try{
  await sender.goto(url);await sender.waitForFunction(()=>window.__bonkLab);await sender.evaluate(()=>{window.__bonkLab.pause();window.__bonkLab.reset();});
  await receiver.goto(await shareFrom(sender));await receiver.waitForFunction(()=>window.__bonkLab);
  const initial=await receiver.evaluate(()=>window.__bonkLab.getState());assert.equal(await receiver.getByRole('button',{name:'Step',exact:true}).isDisabled(),true);
  assert.equal(await receiver.evaluate(()=>window.__bonkLab.stepOnce()),false);assert.deepEqual(await receiver.evaluate(()=>window.__bonkLab.getState()),initial);
  await receiver.getByRole('button',{name:'Настройки',exact:true}).click();await receiver.getByLabel('Seed',{exact:true}).fill('456');await receiver.getByRole('button',{name:'Скрыть',exact:true}).click();
  const edited=await receiver.evaluate(()=>window.__bonkLab.getState());assert.equal(await receiver.getByRole('button',{name:'Step',exact:true}).isDisabled(),true);assert.equal(await receiver.evaluate(()=>window.__bonkLab.stepOnce()),false);assert.deepEqual(await receiver.evaluate(()=>window.__bonkLab.getState()),edited);
  await receiver.getByRole('button',{name:'Старт',exact:true}).click();await receiver.getByRole('button',{name:'Пауза',exact:true}).click();
  const countdown=await receiver.evaluate(()=>window.__bonkLab.getState().startCountdown);assert.ok(countdown>0);assert.equal(await receiver.getByRole('button',{name:'Step',exact:true}).isEnabled(),true);
  await receiver.getByRole('button',{name:'Step',exact:true}).click();assert.ok(Math.abs(countdown-await receiver.evaluate(()=>window.__bonkLab.getState().startCountdown)-1/60)<1e-9);
  await receiver.evaluate(()=>{const lab=window.__bonkLab;lab.resume();for(let i=0;i<240;i++)lab.update(1/60);lab.pause();});
  const elapsed=await receiver.evaluate(()=>window.__bonkLab.getState().elapsedTime);await receiver.getByRole('button',{name:'Step',exact:true}).click();assert.ok(Math.abs(await receiver.evaluate(()=>window.__bonkLab.getState().elapsedTime)-elapsed-1/60)<1e-9);
 }finally{await sender.close();await receiver.close();}
});
await regression('same invalid fragment shows error and recovery after each recovery',async()=>{
 const invalid=await context.newPage();try{
  await invalid.goto(url+'#tug=bad');await invalid.getByRole('alert').waitFor();
  for(let attempt=0;attempt<2;attempt++){
   await invalid.getByRole('button',{name:'Начать обычный заезд',exact:true}).click();assert.equal(await invalid.evaluate(()=>location.hash),'');assert.equal(await invalid.evaluate(()=>window.__bonkLab.isRunning),true);
   await invalid.evaluate(()=>location.hash='#tug=bad');await invalid.getByRole('button',{name:'Начать обычный заезд',exact:true}).waitFor({timeout:3000});assert.ok(await invalid.getByRole('alert').isVisible());assert.equal(await invalid.evaluate(()=>window.__bonkLab.isRunning),false);
  }
 }finally{await invalid.close();}
});
assert.deepEqual(regressions,[]);
for(const viewport of [{width:360,height:800},{width:390,height:844},{width:412,height:915},{width:844,height:390}]){
 await page.setViewportSize(viewport);await page.goto(url);await page.waitForFunction(()=>window.__bonkLab);
 await page.waitForFunction(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return Math.abs(r.width-innerWidth)<1 && Math.abs(c.width-r.width*devicePixelRatio)<2 && r.bottom>=innerHeight-1;});
 assert.equal(await page.locator('.lab-panel').count(),0,'settings start collapsed');
 const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,top:document.querySelector('.lab-toolbar').getBoundingClientRect().height,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.lab-toolbar button')].map(b=>b.getBoundingClientRect().toJSON())}));
 assert.ok(layout.scroll<=viewport.width);assert.ok(layout.top<=60,'compact single row');assert.equal(layout.canvas.width,viewport.width);assert.ok(layout.canvas.height>viewport.height-140);assert.ok(layout.buttons.every(b=>b.height>=44&&b.width>=44&&b.right<=viewport.width));
 await page.getByRole('button',{name:'Пауза',exact:true}).click();const before=await page.evaluate(()=>window.__bonkLab.getState().startCountdown);await page.getByRole('button',{name:'Step',exact:true}).click();assert.ok(Math.abs(before-await page.evaluate(()=>window.__bonkLab.getState().startCountdown)-1/60)<1e-9);
 await page.getByRole('button',{name:'Расцепить',exact:true}).click();await page.getByRole('button',{name:'Сцепить',exact:true}).click();assert.ok(await page.evaluate(()=>window.__bonkLab.getState().towing.coupling.connected));
 await page.screenshot({path:path.join(out,`mobile-${viewport.width}x${viewport.height}.png`)});
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByLabel('Длина между креплениями',{exact:true}).fill('100');await page.getByLabel('Длина между креплениями',{exact:true}).press('Enter');assert.equal(await page.evaluate(()=>window.__bonkLab.params['tow.length']),100);
 await page.keyboard.press('w');assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);
 assert.ok(await page.evaluate(()=>{const p=document.querySelector('.lab-panel');return p.scrollHeight>p.clientHeight;}));
 await page.screenshot({path:path.join(out,`settings-${viewport.width}x${viewport.height}.png`)});await page.getByRole('button',{name:'Скрыть',exact:true}).click();await page.waitForFunction(()=>document.querySelector('canvas').getBoundingClientRect().width===innerWidth);assert.equal(await page.locator('.lab-panel').count(),0);assert.equal(await page.locator('canvas').evaluate(c=>c.getBoundingClientRect().width),viewport.width);checks.push({viewport,layout,status:'PASS'});
}
await page.setViewportSize({width:390,height:844});await page.goto(url);await page.waitForFunction(()=>window.__bonkLab);await page.getByRole('button',{name:'Пауза',exact:true}).click();
await page.evaluate(()=>{const l=window.__bonkLab;l.regenerateArena(98765,7.3);l.updateParams('tow.length',40);l.updateParams('tow.massRatio',2.5);l.updateParams('orbs.density',0.27);l.regenerateArena(98765,7.3);});
await page.getByRole('button',{name:'Настройки',exact:true}).click();
assert.equal(await page.getByLabel('Seed',{exact:true}).inputValue(),'98765');assert.equal(await page.getByLabel('Пресет движения').inputValue(),'-1');
await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('denied'))},configurable:true}));
const original=await page.evaluate(()=>({snapshot:window.__bonkLab.exportShareSnapshot(),state:window.__bonkLab.getState()}));
await page.getByRole('button',{name:'Поделиться',exact:true}).click();const link=await page.getByLabel('Ссылка на заезд').inputValue();assert.ok(link.includes('#tug='));assert.equal(await page.getByText('Скопировано!',{exact:true}).count(),0);assert.deepEqual(await page.evaluate(()=>window.__bonkLab.getState()),original.state);
await page.screenshot({path:path.join(out,'clipboard-fallback.png')});await page.getByRole('button',{name:'Закрыть',exact:true}).click();
const friend=await context.newPage();friend.on('pageerror',e=>errors.push(e.message));await friend.goto(link);await friend.waitForFunction(()=>window.__bonkLab);const restored=await friend.evaluate(()=>({snapshot:window.__bonkLab.exportShareSnapshot(),state:window.__bonkLab.getState()}));
assert.deepEqual(restored.snapshot,original.snapshot);assert.deepEqual(restored.state.arena,original.state.arena);assert.deepEqual(restored.state.orbs,original.state.orbs);assert.deepEqual(restored.state.towing.B,original.state.towing.B);assert.equal(restored.state.x,original.state.x);assert.equal(restored.state.y,original.state.y);assert.equal(restored.state.elapsedTime,0);assert.equal(restored.state.vx,0);assert.ok(restored.state.towing.paused);
await friend.waitForTimeout(350);assert.equal(await friend.evaluate(()=>window.__bonkLab.getState().elapsedTime),0);await friend.getByRole('button',{name:'Настройки',exact:true}).click();await friend.getByLabel('Seed',{exact:true}).fill('456');assert.equal(await friend.evaluate(()=>window.__bonkLab.isRunning),false);await friend.getByRole('button',{name:'Скрыть',exact:true}).click();await friend.getByRole('button',{name:'Старт',exact:true}).click();assert.equal(await friend.evaluate(()=>window.__bonkLab.isRunning),true);
await page.evaluate(()=>{window.__bonkLab.start();for(let i=0;i<240;i++)window.__bonkLab.update(1/60);window.__bonkLab.setInput(0,-1,1);for(let i=0;i<60;i++)window.__bonkLab.update(1/60);window.__bonkLab.pause();});
const progress=await page.evaluate(()=>window.__bonkLab.getState().elapsedTime);assert.ok(progress>0);await page.getByRole('button',{name:'Поделиться',exact:true}).click();const liveLink=await page.getByLabel('Ссылка на заезд').inputValue();assert.equal(await page.evaluate(()=>window.__bonkLab.getState().elapsedTime),progress);await friend.goto(liveLink);await friend.waitForFunction(()=>window.__bonkLab);assert.equal(await friend.evaluate(()=>window.__bonkLab.getState().elapsedTime),0);assert.equal(await friend.evaluate(()=>window.__bonkLab.getState().vx),0);
await friend.goto(url+'#tug=bad');await friend.getByRole('alert').waitFor();assert.ok(await friend.getByRole('alert').count());assert.equal(await friend.evaluate(()=>window.__bonkLab.isRunning),false);await friend.getByRole('button',{name:'Начать обычный заезд',exact:true}).click();assert.equal(await friend.evaluate(()=>window.__bonkLab.isRunning),true);assert.equal(await friend.evaluate(()=>location.hash),'');
await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copiedShare=text;}},configurable:true}));await page.getByRole('button',{name:'Поделиться',exact:true}).click();await page.getByText('Скопировано!',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>window.__copiedShare.includes('#tug=')));
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-share-report.json'),JSON.stringify({url,checks,errors,share:'actual arenas/orbs/parameters/initial bodies; fresh paused import; settings preserve waiting; clipboard deny/success; invalid recovery PASS',emulation:true},null,2));console.log('PASS mobile viewport/settings/actions/share/atomic waiting/copy/recovery');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
