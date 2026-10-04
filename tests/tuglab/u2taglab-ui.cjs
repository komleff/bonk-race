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
 await page.addInitScript(()=>{const draw=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){if((w===140&&h===140)||(w===105&&h===136)){const t=this.getTransform();window.__minimapRect={x:x*t.a+t.e,y:y*t.d+t.f,w:w*t.a,h:h*t.d};}return draw.call(this,x,y,w,h);};const arc=CanvasRenderingContext2D.prototype.arc;CanvasRenderingContext2D.prototype.arc=function(x,y,r,...args){const t=this.getTransform();if(r===68&&Math.abs(t.a/devicePixelRatio-1)<1e-6)window.__minimapRect={x:(x-r)*t.a+t.e,y:(y-r)*t.d+t.f,w:r*2*t.a,h:r*2*t.d};return arc.call(this,x,y,r,...args);};});
 await page.goto(process.env.U2TAGLAB_URL||'http://127.0.0.1:5175/u2taglab.html');await page.waitForFunction(()=>window.__bonkLab);
 report.defaults=await page.evaluate(()=>({params:window.__bonkLab.exportSpaceShareSnapshot().params,coupling:window.__bonkLab.getState().towing.coupling,distance:window.__bonkLab.getState().towing.distance}));
 assert.equal(report.defaults.params['tow.length'],360);assert.equal(report.defaults.params['tow.dampingRatio'],1);assert.ok(Math.abs(report.defaults.coupling.k-360000)<1e-6);assert.ok(Math.abs(report.defaults.coupling.c-710000)<1e-6);assert.ok(Math.abs(report.defaults.distance-360)<1e-8);
 report.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));if(process.env.U2TAGLAB_BUILT==='1'){assert.ok(report.resources.length>0);const prefix=process.env.U2TAGLAB_URL;assert.ok(report.resources.every(url=>url.startsWith(prefix)),JSON.stringify(report.resources));}
 await require('./u2taglab-hud-checks.cjs')(page,report,out);
 await require('./u2taglab-radar-checks.cjs')(page,report,out);
 await require('./u2taglab-controls-checks.cjs')(page,report,out);
 const toolbarFA=page.locator('.space-secondary-controls').getByRole('button',{name:'Flight Assist',exact:true});assert.equal(await toolbarFA.count(),1);assert.equal(await page.locator('.tug-race-toolbar .space-fa').count(),0);
 assert.deepEqual(await page.locator('.space-flight-controls button').allTextContents(),['FA ON','Расцепить','Тормоз']);
 const protectedClick=async(target,button)=>{const direct=(await button.getAttribute('aria-label'))==='Flight Assist'||(await button.innerText())==='Сцепить';await button.click();if(direct)return;await target.getByRole('group',{name:'Подтверждение действия'}).getByRole('button',{name:/^Подтвердить/}).click();};
 report.layouts=[];
 for(const [width,height]of [[360,800],[390,844],[412,915],[844,390],[1280,900]]){
  await page.setViewportSize({width,height});
  for(const paused of [true,false]){
   await page.evaluate(paused=>paused?window.__bonkLab.pause():window.__bonkLab.resume(),paused);await page.waitForTimeout(150);
   const fa=await toolbarFA.boundingBox(),brake=await page.getByRole('button',{name:'Тормоз',exact:true}).boundingBox();
   const layout=await page.evaluate(()=>({map:window.__minimapRect,dpr:devicePixelRatio,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),toolbar:document.querySelector('.tug-race-toolbar').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.tug-race-toolbar button')].map(button=>({label:button.getAttribute('aria-label')||button.textContent,...button.getBoundingClientRect().toJSON()})),faNext:document.querySelector('[aria-label="Flight Assist"]').nextElementSibling.textContent,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.ok(fa.width>=44&&fa.height>=44&&brake.width>=96&&brake.height>=64);assert.ok(brake.y>=height-100&&brake.x+brake.width<=width);
   assert.match(layout.faNext,/^(Расцепить|Сцепить)$/,'FA расположен непосредственно перед сцепкой');
   assert.ok(layout.buttons.every(button=>button.width>=44&&button.height>=44&&button.x>=0&&button.x+button.width<=width&&button.y===layout.buttons[0].y),'все верхние кнопки помещаются в одну строку');assert.equal(layout.overflow,false);
   assert.ok(layout.map&&layout.map.y/layout.dpr<30,'карта должна быть вверху Canvas');assert.ok(layout.canvas.height>height-150);assert.equal(layout.toolbar.height,52);
   const coupling=await page.locator('.space-secondary-controls button').last().boundingBox();assert.ok(brake.x-(coupling.x+coupling.width)>=16);assert.ok(fa.x<=12&&fa.y>=height-150&&coupling.y>=fa.y+fa.height);assert.ok(coupling.x<=12);assert.ok(layout.canvas.top+(layout.map.y+layout.map.h)/layout.dpr<brake.y,'карта не перекрывает тормоз');
   report.layouts.push({width,height,paused,fa:true,buttons:layout.buttons});
   if(paused){
    await protectedClick(page,toolbarFA);assert.equal(await toolbarFA.getAttribute('aria-pressed'),'false');
    const offButtons=await page.locator('.tug-race-toolbar button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().toJSON()));
    assert.ok(offButtons.every(button=>button.width>=44&&button.height>=44&&button.x>=0&&button.right<=width&&button.y===offButtons[0].y),'FA OFF тоже помещается в компактной строке');
    report.layouts.push({width,height,paused,fa:false,buttons:offButtons});await page.screenshot({path:`${out}/layout-${width}x${height}-fa-off.png`});await protectedClick(page,toolbarFA);
   }
   await page.screenshot({path:`${out}/layout-${width}x${height}${paused?'':'-running'}.png`});
  }
  await page.evaluate(()=>window.__bonkLab.pause());
  if(width===360||width===390){
   const cdp=await page.context().newCDPSession(page),canvas=await page.locator('canvas').boundingBox(),point={x:100,y:canvas.y+330,id:7};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x+25,y:point.y-35}]});await page.waitForTimeout(150);
   assert.ok(await page.evaluate(()=>window.__labInput.getState().isTouch&&window.__labInput.getState().magnitude>0));await page.screenshot({path:`${out}/joystick-${width}.png`});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }
  report.checks.push(`layout ${width}x${height}: paused/running protected footer FA order, targets, no overflow`);
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
 const mobileEdit=async(label,value)=>{const control=mobile.getByLabel(label,{exact:true});await control.fill(String(value));await control.press('Enter');};
 // Проверяем реальные selector и range c до ручного набора параметров.
 const moduleBefore=await mobile.evaluate(()=>window.__bonkLab.getState());
 await mobile.getByLabel('Модуль пружины',{exact:true}).selectOption('XL');
 const moduleAfter=await mobile.evaluate(()=>({s:window.__bonkLab.getState(),p:window.__bonkLab.params}));
 assert.equal(moduleAfter.p['tow.module'],'XL');assert.equal(moduleAfter.s.towing.coupling.k,810000);assert.equal(moduleAfter.s.towing.coupling.c,4260000);
 const moduleExpected=structuredClone(moduleBefore);moduleExpected.towing.coupling.k=810000;moduleExpected.towing.coupling.c=4260000;assert.deepEqual(moduleAfter.s,moduleExpected);
 const cSlider=mobile.locator('.lab-param').filter({has:mobile.getByLabel('Демпфирование пружины c',{exact:true})}).locator('input[type="range"]');
 await cSlider.scrollIntoViewIfNeeded();const cBox=await cSlider.boundingBox();
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cBox.x+cBox.width*0.2,y:cBox.y+cBox.height/2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const sliderResult=await mobile.evaluate(()=>({p:window.__bonkLab.params,c:window.__bonkLab.getState().towing.coupling.c}));assert.ok(sliderResult.c>1e7);assert.equal(sliderResult.c,sliderResult.p['tow.dampingCoefficient']);assert.equal(sliderResult.p['tow.module'],'custom');
 await mobile.getByLabel('Модуль пружины',{exact:true}).selectOption('M');
 report.checks.push('actual XL module selector preserves all state except k/c; physical c touch slider updates c and Custom');
 await mobileEdit('Длина между креплениями',270);await mobileEdit('Жёсткость пружины k',123456);await mobileEdit('Демпфирование пружины c',750000);
 const beforeType=await mobile.evaluate(()=>window.__bonkLab.getState());
 report.couplingModes=[];
 for(const type of ['rope','rod','spring']){
  await mobile.getByLabel('Сцепка',{exact:true}).selectOption(type);
  assert.equal(await mobile.getByLabel('Жёсткость пружины k',{exact:true}).count(),type==='spring'?1:0);assert.equal(await mobile.getByLabel('Демпфирование пружины c',{exact:true}).count(),type==='spring'?1:0);assert.equal(await mobile.getByLabel('Модуль пружины',{exact:true}).count(),type==='spring'?1:0);
  const state=await mobile.evaluate(()=>({params:window.__bonkLab.exportSpaceShareSnapshot().params,state:window.__bonkLab.getState()}));
  assert.equal(state.params['tow.length'],270);assert.equal(state.params['tow.stiffness'],123456);assert.equal(state.params['tow.dampingCoefficient'],750000);
  for(const key of ['x','y','vx','vy','angle','angularVelocity','elapsedTime','spaceWorld'])assert.deepEqual(state.state[key],beforeType[key]);assert.deepEqual(state.state.towing.B,beforeType.towing.B);
  const length=mobile.getByLabel('Длина между креплениями',{exact:true});assert.equal(await length.getAttribute('min'),'20');assert.equal(await length.getAttribute('max'),'2000');
  if(type!=='spring'){
   await mobile.getByRole('button',{name:'Поделиться',exact:true}).click();const modeLink=await mobile.getByLabel('Ссылка на заезд',{exact:true}).inputValue();await mobile.getByRole('button',{name:'Закрыть',exact:true}).click();
   const target=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});track(target);await target.goto(modeLink);await target.waitForFunction(()=>window.__bonkLab);
   assert.deepEqual(await target.evaluate(()=>window.__bonkLab.exportSpaceShareSnapshot().params),state.params);assert.deepEqual(await target.evaluate(()=>window.__bonkLab.getState().spaceWorld),beforeType.spaceWorld);
   await target.getByRole('button',{name:'Настройки',exact:true}).click();assert.equal(await target.getByLabel('Жёсткость пружины k',{exact:true}).count(),0);assert.equal(await target.getByLabel('Демпфирование пружины c',{exact:true}).count(),0);
   await target.getByLabel('Сцепка',{exact:true}).selectOption('spring');assert.equal(await target.getByLabel('Жёсткость пружины k',{exact:true}).inputValue(),'123456');assert.equal(await target.getByLabel('Демпфирование пружины c',{exact:true}).inputValue(),'750000');await target.close();
  }
  report.couplingModes.push({type,length:state.params['tow.length'],springControlsVisible:type==='spring',hiddenSharePreserved:true});
 }
 report.sliderTargets=[];
 for(const type of ['spring','rope','rod'])for(const [width,height]of [[390,844],[360,800],[412,915],[844,390]]){
  await mobile.getByLabel('Сцепка',{exact:true}).selectOption(type);
  await mobile.setViewportSize({width,height});
  const sliders=await mobile.locator('.lab-panel input[type="range"]').evaluateAll(inputs=>inputs.map(input=>{
   const box=input.getBoundingClientRect();
   return {label:input.getAttribute('aria-label')||input.closest('.lab-param').querySelector('.lab-param-label').textContent.trim(),width:box.width,height:box.height};
  }));
  assert.equal(sliders.length,type==='spring'?23:21,'должны быть раскрыты все применимые числовые параметры и насыщенность');
  for(const slider of sliders)assert.ok(slider.width>=44&&slider.height>=44,`${width}×${height}: ${slider.label} — область касания ${slider.width}×${slider.height}`);
  await massSlider.scrollIntoViewIfNeeded();
  const box=await massSlider.boundingBox(),y=box.y+box.height/2-16;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*0.15,y}]});
  for(const fraction of [0.25,0.4,0.55]){
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*fraction,y}]});
  }
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const mass=await mobile.evaluate(()=>window.__bonkLab.params.mass);assert.equal(await mobile.evaluate(()=>window.__bonkLab.getState().towing.coupling.c),750000,'mass slider must not rescale physical damping');
  assert.ok(mass>4000000&&mass<7000000,'перетаскивание вне видимой4px дорожки должно менять массу');
  assert.equal(await mobile.evaluate(()=>window.__labInput.getState().magnitude),0);
  report.sliderTargets.push({type,viewport:{width,height},sliders,dragMass:mass});
 }
 await mobile.getByLabel('Сцепка',{exact:true}).selectOption('spring');
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
 report.checks.push('common360 defaults; actual spring→rope→rod→spring preserves270 and bodies; hidden k/c survive rope/rod share; all23 spring/21 rope/rod mobile sliders >=44px at360/390/412/landscape, off-track touch drag and panel swipe do not steer game');
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
 const lengthRow=page.locator('.lab-param').filter({has:page.getByLabel('Длина между креплениями',{exact:true})});await lengthRow.getByRole('button',{name:'i',exact:true}).click();assert.match(await lengthRow.locator('.lab-param-tooltip').innerText(),/20–2000/);assert.match(await lengthRow.locator('.lab-param-tooltip').innerText(),/360/);
 await page.getByLabel('Масса A',{exact:true}).focus();await page.keyboard.down('w');assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);await page.keyboard.up('w');
 await page.screenshot({path:out+'/desktop-help.png'});
 await page.getByRole('button',{name:'Скрыть',exact:true}).click();await protectedClick(page,page.getByRole('button',{name:'Flight Assist',exact:true}));
 const before=await page.evaluate(()=>window.__bonkLab.getState());await protectedClick(page,page.getByRole('button',{name:'Flight Assist',exact:true}));assert.deepEqual(await page.evaluate(()=>window.__bonkLab.getState()),before);await protectedClick(page,page.getByRole('button',{name:'Flight Assist',exact:true}));
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
   await protectedClick(target,target.getByRole('button',{name:'Расцепить',exact:true}));assert.equal(await target.evaluate(()=>window.__bonkLab.getState().towing.coupling.connected),false);
   await protectedClick(target,target.getByRole('button',{name:'Сцепить',exact:true}));assert.equal(await target.evaluate(()=>window.__bonkLab.getState().towing.coupling.connected),true);
   await target.getByRole('button',{name:'Restart',exact:true}).click();await target.getByRole('button',{name:'Пауза',exact:true}).click();assert.deepEqual(await target.evaluate(()=>window.__bonkLab.getState().spaceWorld),initialWorld);
   await target.getByRole('button',{name:'Настройки',exact:true}).click();await target.getByRole('button',{name:'Радиус B по ТТХ',exact:true}).click();assert.ok(Math.abs(await target.evaluate(()=>window.__bonkLab.params['tow.radiusB'])-49.75862068965517)<1e-9);
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
 // Настоящая ссылка schema1/v2 и последующий явный новый legacy/fixed mode roundtrip.
 const fixture=require('./fixtures/u2-space-v2.json');
 const legacyUrl=(process.env.U2TAGLAB_URL||'http://127.0.0.1:5175/u2taglab.html').replace(/#.*$/,'')+'#u2tag='+Buffer.from(JSON.stringify(fixture)).toString('base64url');
 const old=await browser.newPage({viewport:{width:390,height:844}});track(old);await old.goto(legacyUrl);await old.waitForFunction(()=>window.__bonkLab);
 assert.deepEqual(await old.evaluate(()=>window.__bonkLab.exportSpaceShareSnapshot()),fixture);
 await old.getByRole('button',{name:'Настройки',exact:true}).click();assert.equal(await old.getByLabel('Демпфирование пружины c',{exact:true}).count(),0);assert.equal(await old.getByLabel('Демпфирование пружины ζ (legacy)',{exact:true}).inputValue(),'0.5');
 await old.getByRole('button',{name:'Радиус B по ТТХ',exact:true}).click();assert.ok(Math.abs(await old.evaluate(()=>window.__bonkLab.params['tow.radiusB'])-44.76923076923077)<1e-9);
 await old.getByLabel('Модуль пружины',{exact:true}).selectOption('M');const converted=await old.evaluate(()=>window.__bonkLab.exportSpaceShareSnapshot());assert.equal(converted.schema,2);assert.deepEqual(converted.geometry.B,{length:108,width:48});
 await old.getByLabel('Режим демпфирования',{exact:true}).selectOption('legacy');const mixed=await old.evaluate(()=>window.__bonkLab.exportSpaceShareSnapshot());
 // После перехода на фиксированный модуль новая ссылка хранит скрытый c и старую геометрию.
 assert.equal(mixed.schema,2);assert.equal(mixed.params['tow.dampingCoefficient'],710000);await old.getByLabel('Модуль пружины',{exact:true}).selectOption('M');
 const explicitLegacy=await page.evaluate(()=>{window.__bonkLab.updateParams('tow.dampingMode','legacy');return window.__bonkLab.exportSpaceShareSnapshot();});assert.equal(explicitLegacy.schema,2);assert.equal(explicitLegacy.params['tow.dampingMode'],'legacy');assert.equal(explicitLegacy.params['tow.module'],'custom');
 const fixed=await browser.newPage();track(fixed);await fixed.goto(legacyUrl.replace(/#.*$/,'')+'#u2tag='+Buffer.from(JSON.stringify(explicitLegacy)).toString('base64url'));await fixed.waitForFunction(()=>window.__bonkLab);assert.deepEqual(await fixed.evaluate(()=>window.__bonkLab.exportSpaceShareSnapshot()),explicitLegacy);await fixed.close();await old.close();
 report.checks.push('actual schema1 disk-v2 import/export, automatic ζ UI, legacy radius restore, preserved geometry on fixed conversion, schema2 explicit legacy roundtrip');
 assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
