// Снимок меняет только вход рендера; реальные Canvas-метрики работают и в готовой сборке.
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function checkHUD(page,report,out){
 const originalPage=page,viewport=page.viewportSize();report.hud=[];
 const surfaces=[{page,views:[[360,800],[390,844],[412,915],[844,390],[1280,900]]}];
 for(const dpr of [2,3]){const mobile=await page.context().browser().newPage({viewport:{width:390,height:844},deviceScaleFactor:dpr});mobile.on('pageerror',e=>report.errors.push(e.message));await mobile.goto(page.url());await mobile.waitForFunction(()=>window.__bonkLab);surfaces.push({page:mobile,views:[[360,800],[390,844]]});}
 try{for(const surface of surfaces){page=surface.page;for(const [width,height]of surface.views){
  await page.setViewportSize({width,height});await page.waitForTimeout(80);
  for(const paused of [true,false]){
   await page.evaluate(paused=>paused?window.__bonkLab.pause():window.__bonkLab.resume(),paused);
   const cases=[[175,250],[0,250],[250,250],[1000,250],[2000,1000]];if(page===originalPage&&width===360&&paused)cases.push([1.2345678912345e100,250]);
   if(width===360&&paused)for(const fixture of [
    {size:'S',rest:104,distance:90,min:90,max:270}, {size:'M',rest:360,distance:540,min:180,max:540,configured:270},
    {size:'L',rest:104,distance:360,min:360,max:1080}, {size:'XL',rest:1440,distance:2161,min:720,max:2160},
    {size:'M',rest:104,distance:179,min:180,max:540}, {size:'M',rest:360,distance:361,min:180,max:540,connected:false},
    {size:'M',rest:360,distance:360,type:'rod'}, {size:'M',rest:360,distance:360,type:'rope'}])cases.push([175,250,fixture]);
   for(const [speed,limit,fixture]of cases){
    const frame=await page.evaluate(async({speed,limit,fixture})=>{
     const lab=window.__bonkLab,originalState=lab.getState,originalInterpolated=lab.getInterpolatedState,oldLimit=lab.params['space.speedLimit'],oldLength=lab.params['tow.length'],wasPaused=lab.getState().towing.paused;
     const proto=CanvasRenderingContext2D.prototype,originals={},calls={texts:[],bars:[]};let path=[],panel,alpha,active=false,map;
     const canvas=document.querySelector('#lab-canvas'),dpr=devicePixelRatio;
     const point=(ctx,x,y)=>{const t=ctx.getTransform();return {x:(x*t.a+t.e)/dpr,y:(y*t.d+t.f)/dpr};};
     const patch=(name,fn)=>{originals[name]=proto[name];proto[name]=fn;};
     patch('beginPath',function(...args){path=[];return originals.beginPath.apply(this,args);});
     for(const name of ['moveTo','lineTo','arcTo'])patch(name,function(...args){for(let i=0;i<(name==='arcTo'?4:2);i+=2)path.push(point(this,args[i],args[i+1]));return originals[name].apply(this,args);});
     patch('fill',function(...args){if(this.canvas.id==='lab-canvas'&&/rgba\(0,\s*0,\s*0,\s*[0-9.]+\)/.test(this.fillStyle)&&path.length){alpha=Number(this.fillStyle.match(/[0-9.]+(?=\))/)[0]);panel={left:Math.min(...path.map(p=>p.x)),right:Math.max(...path.map(p=>p.x)),top:Math.min(...path.map(p=>p.y)),bottom:Math.max(...path.map(p=>p.y))};}return originals.fill.apply(this,args);});
     patch('fillText',function(text,x,y,...args){
      if(this.canvas.id==='lab-canvas'){
       if(text==='Скорость'){active=true;calls.texts=[];calls.bars=[];calls.panel=panel;calls.alpha=alpha;}
       if(active){const m=this.measureText(text),advanceLeft=this.textAlign==='right'?x-m.width:x,advanceRight=this.textAlign==='right'?x:x+m.width,a=point(this,Math.min(x-m.actualBoundingBoxLeft,advanceLeft),y-m.actualBoundingBoxAscent),b=point(this,Math.max(x+m.actualBoundingBoxRight,advanceRight),y+m.actualBoundingBoxDescent);calls.texts.push({text:String(text),font:this.font,size:parseFloat(this.font)*this.getTransform().a/dpr,left:a.x,right:b.x,top:a.y,bottom:b.y,x,y});}
      }
      return originals.fillText.call(this,text,x,y,...args);
     });
     patch('arc',function(x,y,r,...args){if(r===68&&Math.abs(this.getTransform().a/dpr-1)<1e-6){const a=point(this,x-r,y-r),b=point(this,x+r,y+r);map={left:a.x,right:b.x,top:a.y,bottom:b.y};}return originals.arc.call(this,x,y,r,...args);});
     patch('fillRect',function(x,y,w,h){if(this.canvas.id==='lab-canvas'){if((w===140&&h===140)||(w===105&&h===136)){const a=point(this,x,y),b=point(this,x+w,y+h);map={left:a.x,right:b.x,top:a.y,bottom:b.y};}if(active){const a=point(this,x,y),b=point(this,x+w,y+h);calls.bars.push({left:a.x,right:b.x,top:a.y,bottom:b.y,color:this.fillStyle});}}return originals.fillRect.call(this,x,y,w,h);});
     // Пауза исключает физические шаги с временным лимитом; скорость меняется только в снимке.
     lab.pause();lab.updateParams('space.speedLimit',limit);if(fixture?.configured)lab.updateParams('tow.length',fixture.configured);const before=originalState.call(lab);
     lab.getInterpolatedState=function(alpha){const snapshot=originalInterpolated.call(this,alpha);return {...snapshot,vx:speed*0.6,vy:speed*0.8,...(fixture?{spaceTugSize:fixture.size,towing:{...snapshot.towing,distance:fixture.distance,coupling:{...snapshot.towing.coupling,restLength:fixture.rest,type:fixture.type||'spring',connected:fixture.connected!==false}}}:{})};};
     try{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {...calls,map,dpr,image:canvas.toDataURL(),beforeVelocity:[before.vx,before.vy],afterVelocity:[originalState.call(lab).vx,originalState.call(lab).vy]};}
     finally{lab.getInterpolatedState=originalInterpolated;lab.updateParams('space.speedLimit',oldLimit);if(fixture?.configured)lab.updateParams('tow.length',oldLength);if(!wasPaused)lab.resume();for(const [name,original]of Object.entries(originals))proto[name]=original;}
    },{speed,limit,fixture});
    const label=frame.texts[0],current=frame.texts[1],overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    assert.equal(label.text,'Скорость');assert.equal(overlap(label,current),false,`Скорость перекрывает ${current.text}: ${JSON.stringify({label,current})}`);
    assert.equal(frame.panel.right-frame.panel.left,105);assert.equal(frame.panel.bottom-frame.panel.top,136);assert.ok(frame.alpha<=0.4,'полупрозрачный фон панели');
    assert.ok(speed>2000||current.size>=24,`текущая скорость должна быть заметно крупнее остальных значений: ${JSON.stringify({label,current})}`);assert.equal(current.text,speed===1.2345678912345e100?'1.2e+100':`${speed}`);
    const angular=frame.texts.findIndex(t=>t.text==='Угл.скор.'),speedTexts=frame.texts.slice(0,angular),bar=frame.bars[0];
    assert.ok(frame.texts.some(t=>t.text==='м/с'),'единица скорости отдельным компактным текстом');
    assert.ok(angular>=4&&speedTexts.some(t=>t.text===`V_FA ${limit} м/с`),'лимит V_FA отделён от текущей скорости');
    for(const [i,a]of speedTexts.entries())for(const b of speedTexts.slice(i+1))assert.equal(overlap(a,b),false,'текущая скорость, подпись и V_FA разнесены');
    for(const t of speedTexts)assert.equal(overlap(t,bar),false,'шкала не перекрывает текст');
    for(const t of frame.texts)assert.ok(t.left>=frame.panel.left&&t.right<=frame.panel.right&&t.top>=frame.panel.top&&t.bottom<=frame.panel.bottom,`текст внутри панели: ${t.text}`);
    assert.ok(bar.left>=frame.panel.left&&bar.right<=frame.panel.right&&bar.top>=frame.panel.top&&bar.bottom<=frame.panel.bottom);
    assert.ok(frame.texts.slice(angular).every(t=>t.size>=6&&t.size<=7),'компактные строки6–7CSSpx');const f=fixture||{rest:360,distance:360,min:180,max:540},type=f.type||'spring';assert.ok(frame.texts.some(t=>t.text===`${{spring:'Пружина',rod:'Штанга',rope:'Трос'}[type]}: ${f.connected===false?'расцеплено':'соединено'}`),'статус сцепки перемещен вHUD');assert.ok(frame.texts.some(t=>t.text===`L ${f.distance} / N ${f.rest} м`),'actual distance и normal вHUD');
    if(type==='spring'){const suffix=(name,value)=>value<f.min?` ${name}<`:value>f.max?` ${name}>`:'';assert.ok(frame.texts.some(t=>t.text===`${f.min}–${f.max} м${f.connected===false?' —':suffix('L',f.distance)}${suffix('N',f.rest)}`),'fixed A шкала и явный overflow');const normal=frame.bars.find(b=>b.right-b.left===1&&b.bottom-b.top===5);assert.ok(normal,'отдельная отметка actual normal');const expected=10+Math.min(94,95*Math.max(0,Math.min(1,(f.rest-f.min)/(f.max-f.min))));assert.ok(Math.abs(normal.left-expected)<1e-6,'normal marker использует captured restLength');if(f.connected===false)assert.equal(frame.bars.filter(b=>b.top===128&&b.color!=='#333333').length,0,'disconnected не показывает spring load');}else assert.equal(frame.bars.some(b=>b.bottom-b.top===5),false,'rod/rope без spring gauge');
    assert.equal(frame.map.bottom-frame.map.top,136);
    assert.ok(speedTexts.every(t=>!overlap(t,frame.map)),'новый блок скорости не перекрывает карту');
    assert.deepEqual(frame.afterVelocity,frame.beforeVelocity,'снимок рендера не меняет скорость тела');
    report.hud.push({width,height,dpr:frame.dpr,paused,speed,limit,fixture,panel:frame.panel,current});
    if(paused&&speed===175&&(width===360||width===390))fs.writeFileSync(`${out}/hud-${width}-dpr${frame.dpr}-175.png`,Buffer.from(frame.image.split(',')[1],'base64'));
   }
  }
 }
 }}finally{for(const surface of surfaces.slice(1))await surface.page.close();}
 page=originalPage;
 for(const width of[360,390]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>{window.__bonkLab.start();window.dispatchEvent(new Event('blur'));});await page.waitForTimeout(150);
  const header=await page.evaluate(()=>{const el=document.querySelector('.space-pause-status'),bar=document.querySelector('.tug-race-toolbar'),pause=document.querySelector('[aria-label="Продолжить"]');return {reason:window.__bonkLab.getState().towing.reason,text:el.textContent,title:el.title,aria:el.getAttribute('aria-label'),bar:bar.getBoundingClientRect().toJSON(),status:document.querySelector('.tug-status'),canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),adjacent:pause.nextElementSibling===el};});
  assert.equal(header.reason,'Потеря фокуса: нажмите Продолжить');assert.equal(header.text.trim(),'Пауза: фокус');assert.equal(header.title,header.reason);assert.equal(header.aria,header.reason);assert.equal(header.adjacent,true);assert.equal(header.bar.height,52);assert.equal(header.canvas.top,52);assert.equal(header.status,null,'лишняя строка статуса удалена');
  await page.evaluate(()=>{const lab=window.__bonkLab;window.__headerOriginalState=lab.getState;lab.getState=function(){const s=window.__headerOriginalState.call(this);return {...s,towing:{...s.towing,needsRestart:true,reason:'Численная остановка: ошибка геометрии 12345.67 м; требуется перезапуск безопасного мира'}};};});
  try{await page.waitForTimeout(150);const details=page.locator('.space-stop-reason');await details.locator('summary').click();const alert=details.getByRole('alert');assert.match(await alert.innerText(),/12345.67 м/);const box=await alert.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.height>20);assert.equal(await page.locator('.tug-race-toolbar').evaluate(el=>el.getBoundingClientRect().height),52);}finally{await page.evaluate(()=>{window.__bonkLab.getState=window.__headerOriginalState;window.__bonkLab.pause();});}
 }
 page=originalPage;await page.evaluate(()=>window.__bonkLab.pause());await page.setViewportSize(viewport);report.checks.push('actual HUD glyph metrics: hypot 0/175/250/1000/2000, V_FA250/1000, surrounding paused/running, DPR1/2/3, current24CSS, separate unit/label/limit/bar, HUD105x136CSS/radarheight136CSS, background0.35, compact rows6–7CSS; fixed A springranges/capturednormal/overflow/disconnected/rodrope; no secondstatusstrip/canvas52top/focusreason nearPause/numericaldetails accessible');
};
