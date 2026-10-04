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
   for(const [speed,limit]of cases){
    const frame=await page.evaluate(async({speed,limit})=>{
     const lab=window.__bonkLab,originalState=lab.getState,originalInterpolated=lab.getInterpolatedState,oldLimit=lab.params['space.speedLimit'],wasPaused=lab.getState().towing.paused;
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
     patch('fillRect',function(x,y,w,h){if(this.canvas.id==='lab-canvas'){if((w===140&&h===140)||(w===105&&h===136)){const a=point(this,x,y),b=point(this,x+w,y+h);map={left:a.x,right:b.x,top:a.y,bottom:b.y};}if(active){const a=point(this,x,y),b=point(this,x+w,y+h);calls.bars.push({left:a.x,right:b.x,top:a.y,bottom:b.y});}}return originals.fillRect.call(this,x,y,w,h);});
     // Пауза исключает физические шаги с временным лимитом; скорость меняется только в снимке.
     lab.pause();lab.updateParams('space.speedLimit',limit);const before=originalState.call(lab);
     lab.getInterpolatedState=function(alpha){return {...originalInterpolated.call(this,alpha),vx:speed*0.6,vy:speed*0.8};};
     try{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {...calls,map,dpr,image:canvas.toDataURL(),beforeVelocity:[before.vx,before.vy],afterVelocity:[originalState.call(lab).vx,originalState.call(lab).vy]};}
     finally{lab.getInterpolatedState=originalInterpolated;lab.updateParams('space.speedLimit',oldLimit);if(!wasPaused)lab.resume();for(const [name,original]of Object.entries(originals))proto[name]=original;}
    },{speed,limit});
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
    assert.ok(frame.texts.slice(angular).every(t=>t.size===7),'остальные строки уменьшаются вдвое: 7CSSpx');
    assert.equal(frame.map.bottom-frame.map.top,136);
    assert.ok(speedTexts.every(t=>!overlap(t,frame.map)),'новый блок скорости не перекрывает карту');
    assert.deepEqual(frame.afterVelocity,frame.beforeVelocity,'снимок рендера не меняет скорость тела');
    report.hud.push({width,height,dpr:frame.dpr,paused,speed,limit,panel:frame.panel,current});
    if(paused&&speed===175&&(width===360||width===390))fs.writeFileSync(`${out}/hud-${width}-dpr${frame.dpr}-175.png`,Buffer.from(frame.image.split(',')[1],'base64'));
   }
  }
 }
 }}finally{for(const surface of surfaces.slice(1))await surface.page.close();}
 page=originalPage;await page.evaluate(()=>window.__bonkLab.pause());await page.setViewportSize(viewport);report.checks.push('actual HUD glyph metrics: hypot 0/175/250/1000/2000, V_FA250/1000, surrounding paused/running, DPR1/2/3, current24CSS, separate unit/label/limit/bar, HUD105x136CSS/radarheight136CSS, background0.35, other rows7CSS');
};
