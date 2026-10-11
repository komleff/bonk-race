// Проверяем поезд на настоящей космической странице: ввод, мир, связи и принятые обновления.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.U2TRAIN_QA_DIR||'.cache/u2taglab-train-qa');
async function serve(){const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname,nested=pathname.startsWith('/bonk-race/u2taglab/'),root=path.resolve(nested?'client/dist-pages':'client/dist-u2taglab');let relative=decodeURIComponent(pathname.slice(nested?'/bonk-race/'.length:1))||'index.html';if(relative.endsWith('/'))relative+='index.html';let file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,url:`http://127.0.0.1:${server.address().port}`};}
async function snapshot(page){return page.evaluate(()=>window.__bonkLab.getState());}
async function run(page,url,name){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.__bonkLab?.getState().startCountdown===0);
 const initialAB=await snapshot(page);assert.ok(initialAB.towing);assert.equal(initialAB.train,undefined);
 await page.getByRole('button',{name:'Пауза',exact:true}).click();
 const selector=page.getByLabel('Состав',{exact:true});await selector.waitFor({timeout:2500});assert.equal(await selector.inputValue(),'AB');
 await selector.selectOption('ABC');await page.waitForFunction(()=>!!window.__bonkLab.getState().train);
 await page.getByLabel('Помощь заднего тягача',{exact:true}).selectOption('guard');assert.equal((await snapshot(page)).train.settings.mode,'guard');assert.ok(!(await page.getByTestId('train-flight-status').textContent()).includes('guard'));await page.getByLabel('Помощь заднего тягача',{exact:true}).selectOption('coast');
 const initial=await snapshot(page);assert.equal(initial.train.paused,true);assert.equal(initial.elapsedTime,0);assert.ok(initial.spaceWorld.statics.length);assert.ok(initial.spaceWorld.asteroids.length);assert.ok(initial.spaceWorld.fields.length);assert.equal(initial.towing,undefined);
 assert.ok(initial.train.C);assert.equal(initial.train.connections.length,2);
 for(const id of ['AB','BC']){await page.getByRole('button',{name:`${id}: расцепить`,exact:true}).click();assert.equal((await snapshot(page)).train.connections.find(l=>l.id===id).connected,false);await page.getByRole('button',{name:`${id}: сцепить`,exact:true}).click();assert.equal((await snapshot(page)).train.connections.find(l=>l.id===id).connected,true);}
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByText('Ассистент C',{exact:true}).click();await page.getByLabel('Режим C',{exact:true}).selectOption('guard');assert.equal((await snapshot(page)).train.settings.mode,'guard');await page.getByLabel('Режим C',{exact:true}).selectOption('brake');
 await page.getByLabel('Задержка C, с',{exact:true}).fill('0');await page.getByLabel('Задержка C, с',{exact:true}).press('Enter');
 const source=await page.locator('.tug-build').textContent();await page.getByRole('button',{name:'Скрыть',exact:true}).click();await page.getByRole('button',{name:'Старт',exact:true}).click();
 await page.waitForFunction(()=>window.__bonkLab.getState().startCountdown===0);
 await page.keyboard.down('KeyW');await page.waitForTimeout(1800);await page.keyboard.up('KeyW');
 const flight=await snapshot(page);assert.ok(flight.elapsedTime>0);assert.ok(flight.y<initial.y);assert.ok(flight.train.C.position.y!==initial.train.C.position.y);assert.ok(flight.train.B.position.y!==initial.train.B.position.y);assert.ok(flight.train.diagnostics.solverSubsteps>0);assert.equal(flight.train.reason,undefined);
 assert.ok(flight.spaceWorld.tick>initial.spaceWorld.tick);assert.ok(flight.train.engineWrenches.A);assert.ok(flight.train.engineWrenches.C);
 assert.ok(flight.train.connections.every(l=>l.connected));
 await page.keyboard.down('KeyD');await page.waitForTimeout(1400);await page.keyboard.up('KeyD');
 const turned=await snapshot(page);assert.ok(Math.abs(turned.angle-initial.angle)>.01,'мировой D реально поворачивает A');
 const rear=page.getByRole('button',{name:'Тормоз заднего',exact:true}),r=await rear.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.keyboard.down('Space');await page.mouse.down();await page.waitForTimeout(700);
 const braking=await snapshot(page);assert.equal(braking.train.rearBrake,true);assert.ok(braking.train.commandC.retro>0,'задний запрос выдаёт фактическую ретрокоманду C');assert.ok(Math.hypot(braking.train.engineWrenches.C.force.x,braking.train.engineWrenches.C.force.y)>1);
 await page.mouse.up();assert.equal((await snapshot(page)).spaceBrake,true,'отпускание rear сохраняет клавиатурный A brake');await page.keyboard.up('Space');assert.equal((await snapshot(page)).train.rearBrake,false);assert.equal((await snapshot(page)).train.paused,false,'штатное отпускание не ставит паузу');

 fs.writeFileSync(path.join(output,`${name}-manual-flight.json`),JSON.stringify({source,initial,flight,turned,braking},null,2));
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 const moving=await snapshot(page);assert.equal(await page.getByLabel('Режим C',{exact:true}).isDisabled(),false);
 await page.getByLabel('Режим C',{exact:true}).selectOption('guard');assert.ok((await snapshot(page)).elapsedTime>=moving.elapsedTime,'mode в полёте сохраняет маршрут и время');
 await page.getByLabel('Участие C',{exact:true}).fill('0');await page.getByLabel('Участие C',{exact:true}).press('Enter');assert.deepEqual((await snapshot(page)).train.commandC,{forward:0,retro:0,lateral:0,yaw:0});
 await page.getByLabel('Участие C',{exact:true}).fill('1');await page.getByLabel('Участие C',{exact:true}).press('Enter');await page.getByLabel('Режим C',{exact:true}).selectOption('brake');
 await page.getByRole('button',{name:'Скрыть',exact:true}).click();
 if((name==='root'||name==='dev')&&process.env.U2TRAIN_LONG_ROUTE==='1'){
  const station=initial.spaceWorld.statics.filter(o=>o.kind==='station'&&o.position.y<initial.y).sort((a,b)=>b.position.y-a.position.y)[0];
  assert.ok(station);await page.evaluate(()=>{window.routeSamples=[];window.routeTimer=setInterval(()=>{const s=window.__bonkLab.getState();window.routeSamples.push({time:s.elapsedTime,A:{x:s.x,y:s.y},B:s.train.B.position,C:s.train.C.position,diagnostics:s.train.diagnostics,reason:s.train.reason});},2000);});
  await page.keyboard.down('KeyW');
  await page.waitForFunction(station=>{const s=window.__bonkLab.getState();return s.train.reason||s.train.C.position.y+s.train.C.radius<station.position.y-station.radius;},station,{timeout:60000});
  await page.keyboard.up('KeyW');const route=await snapshot(page),samples=await page.evaluate(()=>{clearInterval(window.routeTimer);return window.routeSamples;});fs.writeFileSync(path.join(output,'route-diagnostic.json'),JSON.stringify({source,station,samples,final:route},null,2));assert.equal(route.train.reason,undefined);assert.ok(samples.length>2);
  assert.ok(route.y<station.position.y&&route.train.C.position.y<station.position.y,'весь состав пролетел мимо первой станции');
  const closest=Math.min(...samples.map(s=>Math.hypot(s.A.x-station.position.x,s.A.y-station.position.y)-station.radius-initial.radius));assert.ok(closest>0,'станция обойдена, а не пересечена');
  fs.writeFileSync(path.join(output,'manual-route.json'),JSON.stringify({source,station,closestSurfaceClearance:closest,samples,final:route},null,2));console.log(`PASS route ${name} C passed station; clearance ${closest.toFixed(1)}m`);
 }
assert.equal(flight.spaceWorld.statics.length,initial.spaceWorld.statics.length);
 await page.getByRole('button',{name:'Пауза',exact:true}).click();const paused=await snapshot(page);assert.ok(paused.train.paused);
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByText('Пружина BC',{exact:true}).click();const old=(await page.evaluate(()=>window.__bonkLab.getTrainConfig())).links.BC.restLength;
 await page.getByLabel('BC: длина, м',{exact:true}).fill('0');await page.getByLabel('BC: длина, м',{exact:true}).press('Enter');assert.equal((await page.evaluate(()=>window.__bonkLab.getTrainConfig())).links.BC.restLength,old);assert.equal((await snapshot(page)).elapsedTime,paused.elapsedTime);await page.getByRole('alert').filter({hasText:/длин|параметр|значен|положит/}).waitFor();
 await page.getByRole('button',{name:'Скрыть',exact:true}).click();
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Поделиться',exact:true}).click();
 const shared=await page.getByLabel('Ссылка на заезд',{exact:true}).inputValue();assert.ok(shared.includes('#u2train='));await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.getByRole('button',{name:'Скрыть',exact:true}).click();
 const reopened=await page.context().newPage();await reopened.goto(shared);await reopened.waitForFunction(()=>!!window.__bonkLab?.getState().train);assert.equal((await snapshot(reopened)).elapsedTime,0);assert.equal((await snapshot(reopened)).train.paused,true);assert.equal((await snapshot(reopened)).spaceWorld.seed,42);await reopened.close();
 await selector.selectOption('AB');assert.ok((await snapshot(page)).towing);assert.equal((await snapshot(page)).train,undefined);await selector.selectOption('ABC');assert.ok((await snapshot(page)).train);
 await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,`${name}.json`),JSON.stringify({url,source,initial,flight,turned,braking,paused,errors},null,2));
 console.log(`PASS train ${name}`);return shared;
}
async function viewport(browser,url,width,height){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>!!window.__bonkLab?.getState().train);
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.tug-race-toolbar button,.space-flight-controls button,.space-composition select')].map(b=>({text:b.textContent,rect:b.getBoundingClientRect().toJSON()})),canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()}));
 assert.equal(layout.overflow,false);assert.ok(layout.buttons.every(b=>b.rect.x>=0&&b.rect.right<=width&&b.rect.width>=44&&b.rect.height>=44),JSON.stringify(layout));assert.ok(layout.canvas.height>=200);if(layout.canvas.height<350){const fa=await page.getByRole('button',{name:'Flight Assist',exact:true}).boundingBox();assert.ok(layout.canvas.y+5+7*14+12<=fa.y,'короткий ABC HUD не перекрывает прежнюю FA кнопку');}
 await page.getByRole('button',{name:'Старт',exact:true}).click();await page.waitForFunction(()=>window.__bonkLab.getState().startCountdown===0);
 const canvas=await page.locator('canvas').boundingBox(),rear=await page.getByRole('button',{name:'Тормоз заднего',exact:true}).boundingBox(),client=await context.newCDPSession(page);
 const finger={id:1,x:Math.round(canvas.x+canvas.width*.48),y:Math.round(canvas.y+canvas.height*.55)},moved={...finger,y:finger.y-60},brake={id:2,x:Math.round(rear.x+rear.width/2),y:Math.round(rear.y+rear.height/2)};
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});await page.waitForFunction(()=>window.__labInput.getState().magnitude>.2);
 await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});const cancelled=await snapshot(page);assert.equal(cancelled.train.paused,true);assert.deepEqual(cancelled.train.commandC,{forward:0,retro:0,lateral:0,yaw:0});assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);
 await page.waitForTimeout(100);assert.equal((await snapshot(page)).elapsedTime,cancelled.elapsedTime);await page.getByRole('button',{name:'Продолжить',exact:true}).click();
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moved,brake]});
 await page.waitForFunction(()=>window.__labInput.getState().magnitude>.2&&window.__bonkLab.getState().train.rearBrake);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[brake]});
 await page.waitForFunction(()=>!window.__bonkLab.getState().train.rearBrake);assert.ok(await page.evaluate(()=>window.__labInput.getState().magnitude)>.2);assert.equal((await snapshot(page)).train.paused,false);
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[moved]});assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);assert.equal((await snapshot(page)).train.paused,false,'штатное отпускание единственного pilot не ставит паузу');
 if(width===820){
  await page.evaluate(()=>document.querySelector('canvas').addEventListener('pointerdown',e=>{window.cancelPointerId=e.pointerId;},{once:true}));
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
  await page.evaluate(()=>document.querySelector('canvas').releasePointerCapture(window.cancelPointerId));await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...moved,y:moved.y-5}]});
  await page.waitForFunction(()=>window.__bonkLab.getState().train.paused);assert.deepEqual((await snapshot(page)).train.commandC,{forward:0,retro:0,lateral:0,yaw:0});assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[moved]});await page.getByRole('button',{name:'Продолжить',exact:true}).click();
 }
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[brake]});await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForFunction(()=>window.__bonkLab.getState().train.paused);
 assert.equal((await snapshot(page)).train.rearBrake,false);assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);
 await page.getByRole('button',{name:'Продолжить',exact:true}).click();await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[brake]});
 await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));await page.waitForFunction(()=>window.__bonkLab.getState().train.paused);assert.equal((await snapshot(page)).train.rearBrake,false);
 await page.waitForFunction(()=>document.querySelector('[aria-label="Продолжить"]'));await page.screenshot({path:path.join(output,`${width}x${height}.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();return {width,height,layout,errors};
}
(async()=>{fs.mkdirSync(output,{recursive:true});let staticServer;const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});try{const routes=process.env.U2TAGLAB_URL?[['dev',process.env.U2TAGLAB_URL]]:(staticServer=await serve(),(process.env.U2TRAIN_ROUTE_ONLY==='1'?[['root',staticServer.url+'/']]:[['root',staticServer.url+'/'],['nested',staticServer.url+'/bonk-race/u2taglab/']]));let share;for(const [name,url]of routes){const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();share=await run(page,url,name);await context.close();}const viewports=[];if(process.env.U2TRAIN_ROUTE_ONLY!=='1')for(const [w,h]of [[1280,800],[820,1180],[1180,820],[390,844],[844,390]])viewports.push(await viewport(browser,share,w,h));fs.writeFileSync(path.join(output,'viewports.json'),JSON.stringify(viewports,null,2));}finally{await browser.close();if(staticServer)await new Promise(r=>staticServer.server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
