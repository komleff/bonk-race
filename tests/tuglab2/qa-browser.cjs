// Проверяется поведение реальных органов управления и самостоятельной статической поставки.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = path.resolve('.cache/tuglab2-qa/ui');
async function numberValue(page,label,value) {
  await page.waitForFunction(({label,value})=>[...document.querySelectorAll('input')].find(el=>el.getAttribute('aria-label')===label)?.value===String(value),{label,value},{timeout:5000});
  assert.equal(Number(await page.getByLabel(label,{exact:true}).inputValue()),value);
}
async function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'), nested = url.pathname.startsWith('/bonk-race/');
    const relative = decodeURIComponent(nested ? url.pathname.slice('/bonk-race/'.length) : url.pathname.slice(1));
    const root = path.resolve(nested ? 'client/dist-pages' : 'client/dist-tuglab2');
    let file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {server, base:`http://127.0.0.1:${server.address().port}`};
}
async function run(page, url, label) {
  const errors=[]; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.getByRole('heading',{name:'TugLab-2',exact:true}).waitFor();
  const rear=page.getByRole('button',{name:'Тормоз заднего',exact:true});
  await rear.waitFor({timeout:2500});
  const hud=page.getByTestId('train-hud');
  assert.equal(await hud.getAttribute('data-time'),'0');
  await page.getByRole('button',{name:'Step',exact:true}).click();
  assert.ok(Math.abs(Number(await hud.getAttribute('data-time'))-1/60)<1e-10);
  await page.getByRole('button',{name:'Старт',exact:true}).waitFor();
  await page.getByRole('button',{name:'Restart',exact:true}).click();
  await page.getByRole('button',{name:'Старт',exact:true}).click();
  await page.keyboard.down('KeyD'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  assert.ok(Number(await page.getByTestId('body-A').getAttribute('data-speed'))>1);
  const before=await hud.getAttribute('data-time');
  const input=page.locator('input[type=file]');
  await input.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await page.getByRole('alert').filter({hasText:/формат|JSON|Недопустим/}).waitFor();
  assert.equal(await hud.getAttribute('data-time'),before,'ошибка импорта сохраняет заезд');
  const downloaded=page.waitForEvent('download'); await page.getByRole('button',{name:'Сохранить JSON',exact:true}).click();
  const jsonPath=await (await downloaded).path(), recorded=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
  assert.ok(recorded.ticks.length>0); assert.ok(recorded.ticks[0].engineWrenches.A);
  await input.setInputFiles(jsonPath); await page.getByTestId('io-status').filter({hasText:/Импортировано/}).waitFor();
  await page.getByRole('button',{name:'Воспроизвести',exact:true}).click();
  await page.getByTestId('io-status').filter({hasText:/Воспроизведено/}).waitFor({timeout:30000});
  assert.equal(Number(await hud.getAttribute('data-time')),recorded.ticks.at(-1).time);
  const replayDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить JSON',exact:true}).click();
  const replayed=JSON.parse(fs.readFileSync(await (await replayDownload).path(),'utf8'));
  assert.deepEqual(replayed.ticks.map(t=>t.commandC),recorded.ticks.map(t=>t.commandC));
  assert.deepEqual(replayed.ticks.map(t=>t.contacts),recorded.ticks.map(t=>t.contacts));
  assert.deepEqual(replayed.ticks.at(-1).telemetry.bodies,recorded.ticks.at(-1).telemetry.bodies);
  await page.getByRole('button',{name:'Сравнить режимы',exact:true}).click();
  await page.getByTestId('comparison-table').waitFor({timeout:30000});
  assert.equal(await page.getByTestId('comparison-table').locator('tbody tr').count(),4);
  const compareDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Сравнение JSON',exact:true}).click();
  const comparison=JSON.parse(fs.readFileSync(await (await compareDownload).path(),'utf8'));assert.equal(comparison.variants.length,4);
  for(const variant of comparison.variants)assert.deepEqual(variant.recording.ticks.map(t=>t.inputA),recorded.ticks.slice(0,variant.recording.ticks.length).map(t=>t.inputA),'сравнение использует принятый префикс того же ввода A');
  const csvDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить CSV',exact:true}).click();
  const csv=fs.readFileSync(await (await csvDownload).path(),'utf8');assert.match(csv,/engine_Fx_N/);assert.match(csv,/external_Fx_N/);
  const graphDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить графики PNG',exact:true}).click();
  assert.equal(fs.readFileSync(await (await graphDownload).path()).subarray(1,4).toString(),'PNG');
  const altered={...recorded,sourceSHA:'foreign-build'};
  await input.setInputFiles({name:'foreign.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(altered))});
  await page.getByRole('alert').filter({hasText:/формат|несовместим/}).waitFor();
  assert.equal(Number(await hud.getAttribute('data-time')),recorded.ticks.at(-1).time,'чужая сборка не меняет текущий повтор');
  if(label==='root'||label==='dev') {
    const {TrainSession}=require('../../.cache/tuglab2-tests/client/src/tuglab2/session');
    const fixture=new TrainSession(recorded.config,{initialState:recorded.initialState,settings:recorded.settings,scene:recorded.scene,fa:recorded.fa,dt:recorded.dt,appVersion:recorded.appVersion,sourceSHA:recorded.sourceSHA});
    fixture.resume();for(let i=0;i<1000;i++){const accepted=fixture.step({x:0,y:0,magnitude:0,brake:false});assert.equal(accepted.accepted,true);}fixture.pause();
    const large=Buffer.from(JSON.stringify(fixture.recording));assert.ok(large.length>1000000,'журнал для проверки содержит больше 1 MB');
    const keepTime=await hud.getAttribute('data-time');
    await page.evaluate(()=>{window.heartbeat={count:0,last:performance.now(),maxGap:0};window.heartbeatTimer=setInterval(()=>{const h=window.heartbeat,n=performance.now();h.count++;h.maxGap=Math.max(h.maxGap,n-h.last);h.last=n;},16);});
    await input.setInputFiles({name:'large.json',mimeType:'application/json',buffer:large});
    await page.getByRole('button',{name:'Отменить операцию',exact:true}).click({timeout:1500});
    await page.getByRole('alert').filter({hasText:/отменена/}).waitFor();assert.equal(await hud.getAttribute('data-time'),keepTime);
    await input.setInputFiles({name:'large.json',mimeType:'application/json',buffer:large});
    await page.getByTestId('io-status').filter({hasText:/Импортировано 1000/}).waitFor({timeout:30000});
    const heartbeat=await page.evaluate(()=>{clearInterval(window.heartbeatTimer);return window.heartbeat;});assert.ok(heartbeat.count>=2);assert.ok(heartbeat.maxGap<1500,'основной поток не зависает на полной проверке журнала');
    fs.writeFileSync(path.join(evidence,'large-import.json'),JSON.stringify({bytes:large.length,heartbeat},null,2));
  }
  await page.getByRole('button',{name:'Restart',exact:true}).click();
  await page.getByRole('button',{name:'Старт',exact:true}).click();
  await page.keyboard.down('KeyD');
  await rear.dispatchEvent('pointerdown',{pointerId:71,pointerType:'touch',button:0});
  await rear.dispatchEvent('pointercancel',{pointerId:71,pointerType:'touch'});
  await page.getByRole('button',{name:'Старт',exact:true}).waitFor();
  assert.equal(await hud.getAttribute('data-input'),'0'); assert.equal(await hud.getAttribute('data-rear'),'false');
  await page.keyboard.up('KeyD');
  await page.getByRole('button',{name:'Старт',exact:true}).click();
  await rear.dispatchEvent('pointerdown',{pointerId:72,pointerType:'touch',button:0});
  await rear.dispatchEvent('pointerup',{pointerId:72,pointerType:'touch'});
  await rear.dispatchEvent('lostpointercapture',{pointerId:72,pointerType:'touch'});
  await page.getByRole('button',{name:'Пауза',exact:true}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.getByRole('button',{name:'Старт',exact:true}).waitFor();
  await page.getByRole('button',{name:'Старт',exact:true}).click();
  await rear.dispatchEvent('pointerdown',{pointerId:73,pointerType:'touch',button:0});
  await rear.dispatchEvent('lostpointercapture',{pointerId:73,pointerType:'touch'});
  await page.getByRole('button',{name:'Старт',exact:true}).waitFor();
  await page.getByRole('button',{name:'Старт',exact:true}).click();await page.keyboard.down('Space');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
  await page.getByRole('button',{name:'Старт',exact:true}).waitFor();await page.keyboard.up('Space');
  await page.getByRole('button',{name:'Старт',exact:true}).click();
  await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',repeat:true,bubbles:true})));
  await page.waitForTimeout(120);assert.match(await hud.textContent(),/Brake A OFF/);
  await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));await page.getByRole('button',{name:'Старт',exact:true}).waitFor();
  await input.setInputFiles({name:'oversize.json',mimeType:'application/json',buffer:Buffer.alloc(33554433,32)});
  await page.getByRole('alert').filter({hasText:/размер/}).waitFor();
  await page.getByRole('button',{name:'Restart',exact:true}).click();
  await page.getByLabel('Корпус A',{exact:true}).selectOption('XL');
  await page.getByRole('button',{name:'1000%',exact:true}).click();
  const ma=Number(await page.getByLabel('Масса A, кг',{exact:true}).inputValue());
  await numberValue(page,'Масса B, кг',ma*10);
  for(const ratio of [.1,.25,.5,1,2,5,10]){await page.getByRole('button',{name:`${ratio*100}%`,exact:true}).click();await numberValue(page,'Масса B, кг',ma*ratio);}
  await page.getByLabel('Корпус A',{exact:true}).selectOption('M');
  await page.getByLabel('Корпус B',{exact:true}).selectOption('L');
  await page.getByLabel('Корпус C',{exact:true}).selectOption('S');
  assert.equal(await page.getByLabel('Корпус A',{exact:true}).inputValue(),'M');
  await page.getByTestId('expert-settings').locator('summary').click();
  const abK=await page.getByLabel('AB: k, Н/м',{exact:true}).inputValue();
  await page.getByLabel('Модуль BC',{exact:true}).selectOption('XL');
  assert.equal(await page.getByLabel('AB: k, Н/м',{exact:true}).inputValue(),abK);
  await page.getByLabel('Физика',{exact:true}).selectOption('120');
  await page.getByRole('button',{name:'Step',exact:true}).click();assert.ok(Math.abs(Number(await hud.getAttribute('data-time'))-1/120)<1e-10);
  await page.getByRole('button',{name:'Restart',exact:true}).click();
  await page.getByLabel('Физика',{exact:true}).selectOption('60');
  const oldLength=await page.getByLabel('AB: l₀, м',{exact:true}).inputValue();
  await page.getByLabel('AB: l₀, м',{exact:true}).fill('0');await page.getByLabel('AB: l₀, м',{exact:true}).press('Tab');
  assert.equal(await hud.getAttribute('data-time'),'0');
  await page.getByLabel('AB: l₀, м',{exact:true}).fill(oldLength);await page.getByLabel('AB: l₀, м',{exact:true}).press('Tab');
  await page.getByLabel('Состав',{exact:true}).selectOption('single');assert.equal(await page.getByTestId('body-C').count(),0);
  assert.equal(await page.getByRole('button',{name:'BC: расцепить',exact:true}).count(),0);
  await page.getByLabel('Состав',{exact:true}).selectOption('train');
  await page.getByLabel('Корпус C',{exact:true}).selectOption('M');await page.getByLabel('Модуль BC',{exact:true}).selectOption('M');
  await page.getByLabel('Сцена',{exact:true}).selectOption('braking');await page.getByLabel('Зеркало',{exact:true}).selectOption('-1');
  assert.equal(Number(await page.getByTestId('body-A').getAttribute('data-speed')),40);
  await page.getByLabel('Начальная скорость',{exact:true}).selectOption('80');assert.equal(Number(await page.getByTestId('body-A').getAttribute('data-speed')),80);
  await page.getByLabel('Seed',{exact:true}).fill('42');await page.getByLabel('Seed',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'Поделиться',exact:true}).click();const shared=await page.getByLabel('Ссылка',{exact:true}).inputValue();
  const reopened=await page.context().newPage();await reopened.goto(shared);await reopened.getByTestId('io-status').filter({hasText:/новый старт/}).waitFor();assert.equal(await reopened.getByTestId('train-hud').getAttribute('data-time'),'0');assert.equal(await reopened.getByLabel('Seed',{exact:true}).inputValue(),'42');await reopened.close();
  await page.getByLabel('Seed',{exact:true}).fill('43');await page.getByLabel('Seed',{exact:true}).press('Tab');assert.equal(new URL(page.url()).hash,'');
  await page.goto(shared);await page.getByTestId('io-status').filter({hasText:/новый старт/}).waitFor();
  await page.getByLabel('Сцена',{exact:true}).selectOption('passage');await page.getByLabel('Масса B, кг',{exact:true}).fill('1556800');await page.getByLabel('Масса B, кг',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'Поделиться',exact:true}).click();const passageShare=await page.getByLabel('Ссылка',{exact:true}).inputValue();
  await page.goto(passageShare);await page.reload();await page.getByTestId('io-status').filter({hasText:/новый старт/}).waitFor();
  await page.getByLabel('Сцена',{exact:true}).selectOption('empty');
  await page.getByLabel('Камера',{exact:true}).selectOption('A');await page.getByRole('button',{name:'Уменьшить',exact:true}).click();
  await page.waitForTimeout(150);const scale=await page.getByTestId('camera-scale').textContent();await page.waitForTimeout(250);assert.equal(await page.getByTestId('camera-scale').textContent(),scale);
  await page.getByRole('button',{name:'Весь поезд',exact:true}).click();
  await page.getByRole('button',{name:'Старт',exact:true}).click();assert.equal(await page.getByLabel('Корпус A',{exact:true}).isDisabled(),true);
  await page.getByLabel('Задержка, с',{exact:true}).focus();await page.keyboard.down('KeyD');await page.waitForTimeout(100);assert.equal(await hud.getAttribute('data-input'),'0');await page.keyboard.up('KeyD');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(evidence,`${label}.png`),fullPage:true});
  return {label,ticks:recorded.ticks.length,errors};
}
async function viewportCheck(browser,url,width,height) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByTestId('pilot-canvas').waitFor();
  const layout=await page.evaluate(()=>{
    const canvas=document.querySelector('[data-testid=pilot-canvas]').getBoundingClientRect(),panel=document.querySelector('[data-testid=settings-panel]').getBoundingClientRect();
    const overlaps=!(canvas.right<=panel.left||panel.right<=canvas.left||canvas.bottom<=panel.top||panel.bottom<=canvas.top);
    const small=[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).filter(b=>b.getBoundingClientRect().width<43.9||b.getBoundingClientRect().height<43.9).map(b=>b.textContent);
    return {overlaps,small,overflow:document.documentElement.scrollWidth>window.innerWidth,canvasHeight:canvas.height};
  });
  assert.equal(layout.overlaps,false);assert.deepEqual(layout.small,[]);assert.equal(layout.overflow,false);assert.ok(layout.canvasHeight>=240);
  await page.getByRole('button',{name:'Старт',exact:true}).click();
  await page.getByTestId('pilot-canvas').evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-10));
  const c=await page.getByTestId('pilot-canvas').boundingBox(),r=await page.getByTestId('brake-rear').boundingBox();
  assert.ok(r.y+r.height<=height,'canvas и задний тормоз видны одновременно после прокрутки');
  const client=await context.newCDPSession(page),pilot={x:Math.round(c.x+c.width*.45),y:Math.round(c.y+c.height*.5),id:1},rear={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),id:2};
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pilot]});
  const moved={...pilot,x:pilot.x+65};await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moved,rear]});await page.waitForTimeout(150);
  assert.ok(Number(await page.getByTestId('train-hud').getAttribute('data-input'))>.2,'пилотирование продолжается со вторым пальцем');assert.equal(await page.getByTestId('train-hud').getAttribute('data-rear'),'true');
  // CDP touchEnd перечисляет заканчивающиеся пальцы, а не оставшиеся.
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[rear]});
  await page.waitForFunction(()=>document.querySelector('[data-testid=train-hud]').getAttribute('data-rear')==='false');
  assert.ok(Number(await page.getByTestId('train-hud').getAttribute('data-input'))>.2,'отпускание заднего тормоза сохраняет пилота');await page.getByRole('button',{name:'Пауза',exact:true}).waitFor();
  await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.getByRole('button',{name:'Старт',exact:true}).waitFor();assert.equal(await page.getByTestId('train-hud').getAttribute('data-input'),'0');
  await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));assert.equal(await page.getByTestId('train-hud').getAttribute('data-rear'),'false');
  await page.screenshot({path:path.join(evidence,`${width}x${height}.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();return {width,height,layout,errors};
}
(async()=>{
  fs.mkdirSync(evidence,{recursive:true});let staticServer;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  try {
    const routes=process.env.TUGLAB2_URL?[['dev',process.env.TUGLAB2_URL]]:(staticServer=await serve(),[['root',staticServer.base+'/'],['nested',staticServer.base+'/bonk-race/tuglab2/']]);
    const results=[];
    for(const [label,url] of routes){const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();results.push(await run(page,url,label));await context.close();}
    for(const [w,h] of [[1280,800],[820,1180],[1180,820],[390,844],[844,390]])results.push(await viewportCheck(browser,routes.at(-1)[1],w,h));
    fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
  } finally {await browser.close();if(staticServer)await new Promise(r=>staticServer.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
