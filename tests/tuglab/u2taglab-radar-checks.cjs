// Подменяем только снимок рендера; круг, метки и лучи проверяем по настоящим вызовам Canvas.
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function checkRadar(page,report,out){
 const browser=page.context().browser(),surfaces=[page];report.radar=[];
 for(const dpr of [2,3]){const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:dpr});p.on('pageerror',e=>report.errors.push(e.message));await p.goto(page.url());await p.waitForFunction(()=>window.__bonkLab);surfaces.push(p);}
 const fixtures=[{x:100,y:200,angle:0,rock:1000,objectDirection:[0,-1],velocityDirection:[1,0]},{x:11100,y:-2200,angle:0,rock:1000,objectDirection:[0,-1],velocityDirection:[1,0]},{x:100,y:200,angle:Math.PI/2,rock:1000,objectDirection:[-1,0],velocityDirection:[0,-1]},{x:100,y:200,angle:Math.PI,rock:2000,objectDirection:[0,1],velocityDirection:[-1,0]},{x:100,y:200,angle:-Math.PI/2,rock:1000,objectDirection:[1,0],velocityDirection:[0,1]},{x:100,y:200,angle:0,rock:1000,objectDirection:[0,-1],velocityDirection:[1,0],speed:0}];
 try{for(const p of surfaces)for(const fixture of fixtures){
  const frame=await p.evaluate(async fixture=>{
   const lab=window.__bonkLab,original=lab.getInterpolatedState,wasRunning=lab.isRunning;lab.pause();const before=lab.getState();
   const canvas=document.querySelector('#lab-canvas'),proto=CanvasRenderingContext2D.prototype,originals={},calls={arcs:[],rects:[],lines:[],texts:[],clips:0};let active=false,path=[],ring,pendingRects=[];
   const point=(ctx,x,y)=>{const t=ctx.getTransform();return {x:(x*t.a+t.e)/devicePixelRatio,y:(y*t.d+t.f)/devicePixelRatio};};
   const patch=(name,fn)=>{originals[name]=proto[name];proto[name]=fn;};
   patch('beginPath',function(...args){path=[];return originals.beginPath.apply(this,args);});
   patch('arc',function(x,y,r,...args){if(this.canvas===canvas&&r===68&&this.getTransform().e===0&&this.getTransform().f===0){active=true;calls.arcs=[];calls.rects=[...pendingRects];calls.lines=[];calls.texts=[];calls.clips=0;ring={...point(this,x,y),r:r*this.getTransform().a/devicePixelRatio};}if(active&&this.canvas===canvas)path.push({type:'arc',...point(this,x,y),r:r*this.getTransform().a/devicePixelRatio});return originals.arc.call(this,x,y,r,...args);});
   for(const name of ['moveTo','lineTo'])patch(name,function(x,y){if(active&&this.canvas===canvas)path.push({type:name,...point(this,x,y)});return originals[name].call(this,x,y);});
   patch('fill',function(...args){if(active&&this.canvas===canvas)for(const v of path)if(v.type==='arc')calls.arcs.push({...v,color:this.fillStyle});return originals.fill.apply(this,args);});
   patch('stroke',function(...args){if(active&&this.canvas===canvas)calls.lines.push({color:this.strokeStyle,path:structuredClone(path)});return originals.stroke.apply(this,args);});
   patch('clip',function(...args){if(active&&this.canvas===canvas)calls.clips++;return originals.clip.apply(this,args);});
   patch('fillRect',function(x,y,w,h){if(this.canvas===canvas){if(x===0&&y===0&&w===canvas.width&&h===canvas.height)pendingRects=[];const t=this.getTransform(),right=canvas.clientWidth-5,left=right-136;if(x>0&&y>0&&x<right&&y<141&&x+w>left&&y+h>5&&t.e===0&&t.f===0)pendingRects.push({x,y,w,h,color:this.fillStyle});if(active)calls.rects.push({x,y,w,h,color:this.fillStyle});}return originals.fillRect.call(this,x,y,w,h);});
   patch('fillText',function(text,x,y,...args){if(this.canvas===canvas&&text==='Скорость')active=false;if(active&&this.canvas===canvas){const m=this.measureText(text),a=point(this,x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent),b=point(this,x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent);calls.texts.push({text,color:this.fillStyle,...point(this,x,y),left:a.x,right:b.x,top:a.y,bottom:b.y});}return originals.fillText.call(this,text,x,y,...args);});
   lab.getInterpolatedState=function(alpha){const s=original.call(this,alpha),{x,y,angle,rock}=fixture,pos=(dx,dy)=>({x:x+dx,y:y+dy});return {...s,x,y,angle,vx:0,vy:fixture.speed??50,startCountdown:0,finished:false,deathTimer:0,orbs:[],towing:{...s.towing,B:{...s.towing.B,position:pos(-1000,0)}},spaceWorld:{...s.spaceWorld,statics:[{id:'near',kind:'station',position:pos(4999,0),radius:100},{id:'edge',kind:'derelict',position:pos(5000,0),radius:100},{id:'outside',kind:'station',position:pos(5001,0),radius:100},{id:'diagonal',kind:'station',position:pos(4000,4000),radius:100}],asteroids:[{...s.spaceWorld.asteroids[0],id:'live',kind:'asteroid',position:pos(rock,0),radius:10}]}};};
   try{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {...calls,ring,cssWidth:canvas.clientWidth,dpr:devicePixelRatio,image:canvas.toDataURL(),before,after:lab.getState()};}
   finally{lab.getInterpolatedState=original;for(const [name,fn]of Object.entries(originals))proto[name]=fn;if(wasRunning)lab.resume();}
  },fixture);
  assert.ok(frame.ring,'радар — локальный круг136CSS, а не прямоугольная карта всей арены');assert.deepEqual(frame.ring,{x:frame.cssWidth-73,y:73,r:68});assert.ok(frame.clips>0,'объекты обрезаются кругом');assert.equal(frame.rects.length,0,'вокруг радара нет чёрного прямоугольника');assert.ok(frame.texts.some(t=>t.text==='5 км'));
  const byColor=color=>frame.arcs.filter(v=>v.color===color),station=byColor('#63c9e5'),derelict=byColor('#b48b62'),rocks=byColor('#91969e'),ship=byColor('#44aaff'),trailer=byColor('#ddaa55');
  assert.equal(station.length,1,'4999 включён,5001 и диагональ за5км исключены');assert.equal(derelict.length,1,'ровно5000 включено');assert.equal(rocks.length,1);assert.equal(ship.length,1);assert.equal(trailer.length,1);
  const near=(actual,want)=>assert.ok(Math.abs(actual-want)<1e-6,`${actual} != ${want}`),project=distance=>({x:frame.ring.x+fixture.objectDirection[0]*distance*68/5000,y:frame.ring.y+fixture.objectDirection[1]*distance*68/5000});
  const north=frame.texts.find(v=>v.text==='N'),range=frame.texts.find(v=>v.text==='5 км');assert.ok(north,'направление мирового Севера отмечено');assert.equal(north.color,'#ffffff');near(north.x,frame.ring.x-fixture.velocityDirection[0]*68*0.78);near(north.y,frame.ring.y-fixture.velocityDirection[1]*68*0.78);
  assert.equal(north.left<range.right&&north.right>range.left&&north.top<range.bottom&&north.bottom>range.top,false,'Север не перекрывает подпись дальности');
  for(const [v,distance]of [[station[0],4999],[derelict[0],5000],[rocks[0],fixture.rock],[trailer[0],-1000]]){const want=project(distance);near(v.x,want.x);near(v.y,want.y);}
  near(ship[0].x,frame.ring.x);near(ship[0].y,frame.ring.y);
  const nose=frame.lines.find(v=>v.color==='#44aaff'&&v.path.some(p=>p.type==='lineTo')),velocity=frame.lines.find(v=>v.color==='#63c9e5'&&v.path.some(p=>p.type==='lineTo'));assert.ok(nose,'нос всегда показан');assert.equal(Boolean(velocity),fixture.speed!==0,'при остановке луча скорости нет');
  const noseTip=nose.path.find(v=>v.type==='lineTo');near(noseTip.x,frame.ring.x);assert.ok(noseTip.y<frame.ring.y,'нос всегда вверх');
  const ray=velocity?.path.find(v=>v.type==='lineTo');if(ray){near(ray.x,frame.ring.x+fixture.velocityDirection[0]*68*0.65);near(ray.y,frame.ring.y+fixture.velocityDirection[1]*68*0.65);}
  assert.deepEqual(frame.after,frame.before,'радар не меняет состояние мира/тел');report.radar.push({fixture,dpr:frame.dpr,ring:frame.ring,north,range,station:station[0],rock:rocks[0],velocity:ray});
  if(fixture.angle===0&&fixture.x===100&&fixture.speed!==0)fs.writeFileSync(`${out}/radar-dpr${frame.dpr}.png`,Buffer.from(frame.image.split(',')[1],'base64'));
 }}finally{for(const p of surfaces.slice(1))await p.close();}
 report.checks.push('local heading-up radar136CSS radius5km: inclusive4999/5000, excluded5001/diagonal, translated A, live asteroids/B, four bearings, white North top/left/bottom/right separated from range caption, nose+velocity rays, circular clip/no outer black rect, DPR1/2/3, render-only fixtures preserve world');
};
