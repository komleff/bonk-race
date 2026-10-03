// Проверяем реальную оболочку, геометрию Canvas и независимые страницы обмена.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/bonk-tuglab-ui/node_modules/playwright');
const out=process.env.U2TAGLAB_QA_DIR||'/tmp/u2taglab-task4-ui';fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],physicalAndroid:false};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
 const track=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);});};
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});track(page);
 await page.addInitScript(()=>{const draw=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){if(w===140&&h===140)window.__minimapRect={x,y,w,h};return draw.call(this,x,y,w,h);};});
 await page.goto(process.env.U2TAGLAB_URL||'http://127.0.0.1:5175/u2taglab.html');await page.waitForFunction(()=>window.__bonkLab);
 report.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));if(process.env.U2TAGLAB_BUILT==='1'){assert.ok(report.resources.length>0);const prefix=process.env.U2TAGLAB_URL;assert.ok(report.resources.every(url=>url.startsWith(prefix)),JSON.stringify(report.resources));}
 const toolbarFA=await page.locator('.tug-race-toolbar').getByRole('button',{name:'Flight Assist',exact:true}).count();assert.equal(toolbarFA,0,'FA должен находиться внизу рядом с тормозом');
 for(const [width,height]of [[360,800],[390,844],[412,915],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150);
  const fa=await page.getByRole('button',{name:'Flight Assist',exact:true}).boundingBox(),brake=await page.getByRole('button',{name:'Тормоз',exact:true}).boundingBox();
  assert.ok(fa.width>=44&&fa.height>=44&&brake.width>=44&&brake.height>=44);assert.ok(fa.y>=height-100&&brake.y>=height-100&&fa.x+fa.width<=brake.x);
  const layout=await page.evaluate(()=>({map:window.__minimapRect,dpr:devicePixelRatio,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),toolbar:document.querySelector('.tug-race-toolbar').getBoundingClientRect().toJSON()}));
  assert.ok(layout.map&&layout.map.y/layout.dpr<30,'карта должна быть вверху Canvas');assert.ok(layout.canvas.height>height-150);assert.equal(layout.toolbar.height,52);
  assert.ok(layout.canvas.top+(layout.map.y+layout.map.h)/layout.dpr<fa.y,'карта не перекрывает тормоз/FA');
  await page.screenshot({path:`${out}/layout-${width}x${height}.png`});report.checks.push(`layout ${width}x${height}`);
 }
 // Проверяем реальные области касания всех слайдеров, включая раскрываемые группы.
 const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 track(mobile);
 await mobile.goto(process.env.U2TAGLAB_URL||'http://127.0.0.1:5175/u2taglab.html');
 await mobile.waitForFunction(()=>window.__bonkLab);
 await mobile.evaluate(()=>{window.__bonkLab.pause();window.__bonkLab.reset();});
 await mobile.getByRole('button',{name:'Настройки',exact:true}).click();
 for(const title of ['Локальные поля','Двигатели A','FA и вращение A']){
  await mobile.locator('.lab-group-header').filter({hasText:title}).click();
 }
 const touch=await mobile.context().newCDPSession(mobile);
 const massSlider=mobile.locator('.lab-param').filter({has:mobile.getByLabel('Масса A',{exact:true})}).locator('input[type="range"]');
 report.sliderTargets=[];
 for(const [width,height]of [[390,844],[360,800],[412,915],[844,390]]){
  await mobile.setViewportSize({width,height});
  const sliders=await mobile.locator('.lab-panel input[type="range"]').evaluateAll(inputs=>inputs.map(input=>{
   const box=input.getBoundingClientRect();
   return {label:input.getAttribute('aria-label')||input.closest('.lab-param').querySelector('.lab-param-label').textContent.trim(),width:box.width,height:box.height};
  }));
  assert.equal(sliders.length,23,'должны быть раскрыты все22 числовых параметра и насыщенность');
  for(const slider of sliders)assert.ok(slider.width>=44&&slider.height>=44,`${width}×${height}: ${slider.label} — область касания ${slider.width}×${slider.height}`);
  await massSlider.scrollIntoViewIfNeeded();
  const box=await massSlider.boundingBox(),y=box.y+box.height/2-16;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*0.15,y}]});
  for(const fraction of [0.25,0.4,0.55]){
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*fraction,y}]});
  }
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const mass=await mobile.evaluate(()=>window.__bonkLab.params.mass);
  assert.ok(mass>4000000&&mass<7000000,'перетаскивание вне видимой4px дорожки должно менять массу');
  assert.equal(await mobile.evaluate(()=>window.__labInput.getState().magnitude),0);
  report.sliderTargets.push({viewport:{width,height},sliders,dragMass:mass});
 }
 await mobile.setViewportSize({width:390,height:844});
 await massSlider.scrollIntoViewIfNeeded();
 await mobile.screenshot({path:out+'/mobile-slider-targets.png'});
 const panel=mobile.locator('.lab-panel'),scrollBefore=await panel.evaluate(el=>el.scrollTop);
 const panelBox=await panel.boundingBox(),swipeX=panelBox.x+8;
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:swipeX,y:650}]});
 for(const y of [620,570,500])await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipeX,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await mobile.waitForFunction(before=>document.querySelector('.lab-panel').scrollTop>before,scrollBefore);
 report.panelSwipe={before:scrollBefore,after:await panel.evaluate(el=>el.scrollTop)};
 assert.equal(await mobile.evaluate(()=>window.__labInput.getState().magnitude),0);
 await mobile.close();
 report.checks.push('all23 mobile slider targets >=44px at360/390/412/landscape; off-track touch drag and panel swipe do not steer game');
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>{const l=window.__bonkLab;l.pause();l.reset();});
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Справка: Seed',exact:true}).click();assert.match(await page.locator('.tug-settings-controls').innerText(),/начальные движения/);
 await page.getByRole('button',{name:'Справка: Насыщенность',exact:true}).click();assert.match(await page.locator('.tug-settings-controls').innerText(),/LAB-множитель/);
 await page.locator('.lab-group-header').filter({hasText:'Локальные поля'}).click();
 const edit=async(label,value)=>{const control=page.getByLabel(label,{exact:true});await control.fill(value);await control.press('Enter');};
 await edit('Давление плазменного потока (LAB)','321');
 const initialWorld=await page.evaluate(()=>window.__bonkLab.getState().spaceWorld);assert.equal(Object.hasOwn(initialWorld,'asteroidMassReference'),false);assert.ok(initialWorld.asteroids.every(b=>b.mass>=1000&&b.mass<=200000000));assert.ok(initialWorld.asteroids.every(b=>Math.abs(b.mass-1000*Math.PI*b.radius*b.radius)<=1e-5));
 await edit('Масса A','456789');await edit('Длина между креплениями','1000');await edit('Радиус B','100');
 for(const title of ['Двигатели A','FA и вращение A'])await page.locator('.lab-group-header').filter({hasText:title}).click();
 const helpRows=page.locator('.lab-param');
 for(let i=0;i<await helpRows.count();i++){const row=helpRows.nth(i),info=row.getByRole('button',{name:'i',exact:true});assert.equal(await info.count(),1);await info.click();assert.ok((await row.locator('.lab-param-tooltip').innerText()).length>40);await info.click();}
 const lengthRow=page.locator('.lab-param').filter({has:page.getByLabel('Длина между креплениями',{exact:true})});await lengthRow.getByRole('button',{name:'i',exact:true}).click();assert.match(await lengthRow.locator('.lab-param-tooltip').innerText(),/270–288/);
 await page.getByLabel('Масса A',{exact:true}).focus();await page.keyboard.down('w');assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);await page.keyboard.up('w');
 await page.screenshot({path:out+'/desktop-help.png'});
 await page.getByRole('button',{name:'Скрыть',exact:true}).click();await page.getByRole('button',{name:'Flight Assist',exact:true}).click();
 const before=await page.evaluate(()=>window.__bonkLab.getState());await page.getByRole('button',{name:'Flight Assist',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__bonkLab.getState()),before);await page.getByRole('button',{name:'Flight Assist',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Flight Assist',exact:true}).innerText(),'FA OFF');
 const brakeButton=page.getByRole('button',{name:'Тормоз',exact:true}),brakeBox=await brakeButton.boundingBox();await page.mouse.move(brakeBox.x+10,brakeBox.y+10);await page.mouse.down();assert.equal(await page.evaluate(()=>window.__bonkLab.spaceBrake),true);
 await brakeButton.dispatchEvent('pointercancel',{pointerId:1});assert.equal(await page.evaluate(()=>window.__bonkLab.spaceBrake),false);await page.mouse.up();
 await page.mouse.down();await page.mouse.move(brakeBox.x+11,brakeBox.y+11);assert.equal(await page.evaluate(()=>window.__bonkLab.spaceBrake),true);await brakeButton.evaluate(el=>el.releasePointerCapture(1));await page.mouse.move(brakeBox.x+12,brakeBox.y+12);assert.equal(await page.evaluate(()=>window.__bonkLab.spaceBrake),false);await page.mouse.up();
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Поделиться',exact:true}).click();
 const link=await page.getByLabel('Ссылка на заезд',{exact:true}).inputValue();assert.match(link,/#u2tag=/);assert.ok(link.length<16000);
 const sourceParams=await page.evaluate(()=>window.__bonkLab.exportSpaceShareSnapshot().params);
 const scenes=[];
 for(let i=0;i<2;i++){
  const target=await browser.newPage({viewport:{width:390,height:844}});track(target);await target.goto(link);await target.waitForFunction(()=>window.__bonkLab);
  await target.waitForTimeout(200);const scene=await target.evaluate(()=>({s:window.__bonkLab.getState(),params:window.__bonkLab.exportSpaceShareSnapshot().params,started:window.__bonkLab.hasStarted,running:window.__bonkLab.isRunning}));
  assert.equal(scene.started,false);assert.equal(scene.running,false);assert.equal(scene.s.elapsedTime,0);assert.equal(scene.s.spaceWorld.time,0);assert.deepEqual(scene.s.spaceWorld,initialWorld);assert.deepEqual(scene.params,sourceParams);assert.equal(scene.s.towing.needsRestart,false);
  scenes.push(scene);await target.screenshot({path:`${out}/shared-page-${i}.png`});
  if(i===1){await target.getByRole('button',{name:'Старт',exact:true}).click();await target.waitForFunction(()=>window.__bonkLab.getState().startCountdown<=0);await target.getByRole('button',{name:'Пауза',exact:true}).click();const clock=await target.evaluate(()=>window.__bonkLab.getState().spaceWorld.time);await target.getByRole('button',{name:'Step',exact:true}).click();assert.ok(Math.abs(await target.evaluate(()=>window.__bonkLab.getState().spaceWorld.time)-clock-1/60)<1e-9);
   await target.getByRole('button',{name:'Расцепить',exact:true}).click();assert.equal(await target.evaluate(()=>window.__bonkLab.getState().towing.coupling.connected),false);
   await target.getByRole('button',{name:'Сцепить',exact:true}).click();assert.equal(await target.evaluate(()=>window.__bonkLab.getState().towing.coupling.connected),true);
   await target.getByRole('button',{name:'Restart',exact:true}).click();await target.getByRole('button',{name:'Пауза',exact:true}).click();assert.deepEqual(await target.evaluate(()=>window.__bonkLab.getState().spaceWorld),initialWorld);
   await target.getByRole('button',{name:'Настройки',exact:true}).click();await target.getByRole('button',{name:'Радиус B по ТТХ',exact:true}).click();assert.ok(Math.abs(await target.evaluate(()=>window.__bonkLab.params['tow.radiusB'])-44.76923076923077)<1e-9);
   await target.locator('.lab-group-header').filter({hasText:'FA и вращение A'}).click();await target.getByLabel('Остановка вращения',{exact:true}).scrollIntoViewIfNeeded();assert.equal(await target.evaluate(()=>window.__labInput.getState().magnitude),0);await target.screenshot({path:out+'/mobile-scroll.png'});
  }
  await target.close();
 }
 assert.deepEqual(scenes[0],scenes[1]);report.checks.push('full source/live mass/geometry override share: two fresh pages, same exact objects/motions/fields and params; Start/Step/Restart/reconnect');
 const recovery=await browser.newPage();track(recovery);await recovery.goto(link);await recovery.waitForFunction(()=>window.__bonkLab);const preserved=await recovery.evaluate(()=>({state:window.__bonkLab.getState(),params:window.__bonkLab.params}));
 const runningError=await recovery.evaluate(()=>{
  const lab=window.__bonkLab;lab.start();const before={state:lab.getState(),params:lab.params,running:lab.isRunning};
  location.hash='#u2tag=e30';window.dispatchEvent(new HashChangeEvent('hashchange'));
  return {before,after:{state:lab.getState(),params:lab.params,running:lab.isRunning}};
 });
 assert.equal(runningError.before.running,true);assert.equal(runningError.after.running,false);assert.deepEqual(runningError.after.params,runningError.before.params);
 for(const key of ['spaceWorld','x','y','vx','vy','elapsedTime'])assert.deepEqual(runningError.after.state[key],runningError.before.state[key]);
 assert.deepEqual(runningError.after.state.towing.B,runningError.before.state.towing.B);assert.deepEqual(runningError.after.state.towing.coupling,runningError.before.state.towing.coupling);
 await recovery.getByRole('dialog',{name:'Ошибка ссылки'}).waitFor();await recovery.evaluate(hash=>location.hash=hash,new URL(link).hash);await recovery.waitForFunction(()=>!document.querySelector('[aria-label="Ошибка ссылки"]'));
 assert.deepEqual(await recovery.evaluate(()=>({state:window.__bonkLab.getState(),params:window.__bonkLab.params})),preserved);
 for(const hash of ['#u2tag=e30','#tug=abc']){await recovery.evaluate(hash=>location.hash=hash,hash);await recovery.getByRole('dialog',{name:'Ошибка ссылки'}).waitFor();assert.deepEqual(await recovery.evaluate(()=>({state:window.__bonkLab.getState(),params:window.__bonkLab.params})),preserved);}
 await recovery.evaluate(hash=>location.hash=hash,new URL(link).hash);await recovery.waitForFunction(()=>!document.querySelector('[aria-label="Ошибка ссылки"]'));assert.deepEqual(await recovery.evaluate(()=>({state:window.__bonkLab.getState(),params:window.__bonkLab.params})),preserved);await recovery.close();report.checks.push('invalid running hashchange pauses without partial world/profile change; repeated invalid links and valid recovery pass');
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.getByRole('button',{name:'Скрыть',exact:true}).click();
 const bad=await browser.newPage();track(bad);await bad.goto(link.replace(/#.*$/,'#tug=abc'));await bad.waitForFunction(()=>window.__bonkLab);assert.equal(await bad.getByRole('dialog',{name:'Ошибка ссылки'}).count(),1);assert.equal(await bad.evaluate(()=>window.__bonkLab.hasStarted),false);await bad.close();
 report.checks.push('new SI/world/tow help, keyboard UI isolation, FA preserves world, brake cancel/lostcapture, radius TTX, mobile scrolling, incompatible old link rejected');
 const reciprocal=await browser.newPage();track(reciprocal);await reciprocal.goto(link);await reciprocal.waitForFunction(()=>window.__bonkLab);
 const impact=await reciprocal.evaluate(()=>{
  const lab=window.__bonkLab;lab.start();lab.pause();while(lab.getState().startCountdown>0)lab.stepOnce();lab.updateParams('space.enginesEnabled',false);lab.setTowingConnection(false);
  const s=lab.getState(),original=s.spaceWorld.asteroids.find(b=>b.mass>=0.5*s.mass&&b.mass<=2*s.mass),body={...original,position:{x:s.x+s.radius+original.radius+0.1,y:s.y},velocity:{x:0,y:0}};
  lab.vx=100;lab.vy=0;lab.spaceWorld.asteroids=[body];lab.spaceWorld.statics=[];lab.spaceWorld.fields=[];lab.stepOnce();const hit=lab.getState(),after=hit.spaceWorld.asteroids[0];
  return {aMass:s.mass,bMass:body.mass,aVelocity:hit.vx,bVelocity:after.velocity.x,bMoved:after.position.x>body.position.x,reason:hit.towing.reason,e:lab.params['space.collisionRestitution']};
 });
 assert.equal(impact.reason,undefined);assert.ok(impact.bMoved&&impact.bVelocity>0&&impact.aVelocity<100);assert.ok(Math.abs(impact.aMass*impact.aVelocity+impact.bMass*impact.bVelocity-impact.aMass*100)<1e-4);
 const expectedA=(impact.aMass-impact.e*impact.bMass)*100/(impact.aMass+impact.bMass),expectedB=(1+impact.e)*impact.aMass*100/(impact.aMass+impact.bMass);assert.ok(Math.abs(impact.aVelocity-expectedA)<1e-7&&Math.abs(impact.bVelocity-expectedB)<1e-7);await reciprocal.close();report.impact=impact;report.checks.push('actual generated comparable mass asteroid receives reciprocal ship collision impulse with conserved momentum');
 assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
