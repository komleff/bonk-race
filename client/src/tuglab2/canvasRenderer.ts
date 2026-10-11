import { spaceFieldCenter, SPACE_FIELD_INFO } from '../u2taglab/fields';
import { trainConnectionGeometry } from './train';
import type { TrainState, TrainBodyId, TrainWrench } from './types';
import type { TrainControls } from './controls';
export interface TrainCamera { mode: 'A'|'B'|'train'; scale:number; fit:boolean; fitLimit:number }
export const defaultCamera = (): TrainCamera => ({mode:'train',scale:1,fit:true,fitLimit:1});
export function drawTrain(canvas:HTMLCanvasElement,state:TrainState,camera:TrainCamera,controls?:TrainControls,
  engines:Record<string,TrainWrench>={}) :void {
  const ctx=canvas.getContext('2d')!,rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=window.devicePixelRatio||1;
  if(w<=0||h<=0)return;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const bodies=Object.values(state.bodies),points:{x:number;y:number}[]=[];
  for(const b of bodies){const g=state.config.ships[b.id].geometry;
    for(const x of [-g.length/2,g.length/2])for(const y of [-g.width/2,g.width/2])points.push({x:b.position.x+x*Math.cos(b.angle)-y*Math.sin(b.angle),y:b.position.y+x*Math.sin(b.angle)+y*Math.cos(b.angle)});
  }
  for(const l of state.connections){const g=trainConnectionGeometry(state,l);points.push(g.a.position,g.b.position);}
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  const trainCenter={x:(minX+maxX)/2,y:(minY+maxY)/2};
  const fit=Math.min((w-100)/Math.max(200,maxX-minX),(h-100)/Math.max(200,maxY-minY));
  camera.fitLimit=Math.max(.005,fit);
  if(camera.fit){camera.scale=Math.max(.005,fit);camera.fit=false;}
  else if(camera.mode==='train'&&camera.scale>fit)camera.scale=Math.max(.005,fit);
  const center=camera.mode==='train'?trainCenter:state.bodies[camera.mode].position,scale=camera.scale;
  const sx=(x:number)=>w/2+(x-center.x)*scale,sy=(y:number)=>h/2+(y-center.y)*scale;
  ctx.strokeStyle='#1a3448';ctx.lineWidth=1;
  const spacing=10**Math.ceil(Math.log10(60/scale));
  for(let x=Math.floor((center.x-w/2/scale)/spacing)*spacing;x<center.x+w/2/scale;x+=spacing){ctx.beginPath();ctx.moveTo(sx(x),0);ctx.lineTo(sx(x),h);ctx.stroke();}
  for(let y=Math.floor((center.y-h/2/scale)/spacing)*spacing;y<center.y+h/2/scale;y+=spacing){ctx.beginPath();ctx.moveTo(0,sy(y));ctx.lineTo(w,sy(y));ctx.stroke();}
  for(const f of state.world.fields){const p=spaceFieldCenter(f,state.world.time);ctx.fillStyle=SPACE_FIELD_INFO[f.kind].color+'25';ctx.beginPath();ctx.arc(sx(p.x),sy(p.y),f.radius*scale,0,2*Math.PI);ctx.fill();ctx.fillStyle=SPACE_FIELD_INFO[f.kind].color;ctx.font='12px sans-serif';ctx.fillText(SPACE_FIELD_INFO[f.kind].label,sx(p.x),sy(p.y));}
  for(const o of [...state.world.statics,...state.world.asteroids]){ctx.fillStyle='kind'in o&&o.kind==='station'?'#59727f':'#655d62';ctx.strokeStyle='#9eabb6';ctx.beginPath();ctx.arc(sx(o.position.x),sy(o.position.y),o.radius*scale,0,2*Math.PI);ctx.fill();ctx.stroke();}
  ctx.strokeStyle='#64819b';ctx.strokeRect(sx(-state.world.width/2),sy(-state.world.height/2),state.world.width*scale,state.world.height*scale);
  ctx.font='bold 13px sans-serif';
  for(const l of state.connections)if(l.connected){const g=trainConnectionGeometry(state,l);ctx.strokeStyle=l.id==='AB'?'#70e8dd':'#c4a7ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx(g.a.position.x),sy(g.a.position.y));ctx.lineTo(sx(g.b.position.x),sy(g.b.position.y));ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.fillText(l.id,sx((g.a.position.x+g.b.position.x)/2),sy((g.a.position.y+g.b.position.y)/2)-10);}
  const colors:Record<TrainBodyId,string>={A:'#46ccde',B:'#90a7b8',C:'#b28cf0'};
  for(const b of bodies){const p=state.config.ships[b.id],g=p.geometry,x=sx(b.position.x),y=sy(b.position.y);
    ctx.save();ctx.translate(x,y);ctx.rotate(b.angle);ctx.fillStyle=colors[b.id];ctx.strokeStyle='#e8f1f8';ctx.lineWidth=1.5;ctx.fillRect(-g.length*scale/2,-g.width*scale/2,g.length*scale,g.width*scale);ctx.strokeRect(-g.length*scale/2,-g.width*scale/2,g.length*scale,g.width*scale);
    ctx.beginPath();ctx.moveTo(g.length*scale/2+8,0);ctx.lineTo(g.length*scale/2,-5);ctx.lineTo(g.length*scale/2,5);ctx.closePath();ctx.fill();
    if(!state.paused&&b.id!=='B'){const e=engines[b.id];if(e){const f=e.force.x*Math.cos(b.angle)+e.force.y*Math.sin(b.angle),lat=e.force.x*Math.sin(b.angle)-e.force.y*Math.cos(b.angle);
      ctx.strokeStyle='#ffce76';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.sign(f)*Math.min(60,Math.abs(f)/Math.max(1,p.forwardForce)*60),-Math.sign(lat)*Math.min(45,Math.abs(lat)/Math.max(1,p.lateralForce)*45));ctx.stroke();
      if(Math.abs(e.torque)>1){ctx.beginPath();ctx.arc(0,0,Math.max(15,g.width*scale),-Math.PI/2,-Math.PI/2+Math.sign(e.torque)*1.6,e.torque<0);ctx.stroke();}}
    }ctx.restore();ctx.fillStyle=colors[b.id];ctx.font='bold 16px sans-serif';ctx.fillText(b.id,x-5,y-g.width*scale/2-12);
    if((b.id==='B'||b.id==='C')&&(x<18||x>w-18||y<18||y>h-18)){const a=Math.atan2(y-h/2,x-w/2),r=Math.min((w/2-28)/Math.max(.001,Math.abs(Math.cos(a))),(h/2-28)/Math.max(.001,Math.abs(Math.sin(a))));const px=w/2+Math.cos(a)*r,py=h/2+Math.sin(a)*r;ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-6);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();ctx.fillText(b.id,px-6,py-12);}
  }
  controls?.pilot.setCharacterScreenPos(rect.left+sx(state.bodies.A.position.x),rect.top+sy(state.bodies.A.position.y));
  const joystick=controls?.pilot.getState();if(joystick?.active&&joystick.isTouch){ctx.strokeStyle='#65e5ea';ctx.lineWidth=2;ctx.beginPath();ctx.arc(joystick.baseScreenX-rect.left,joystick.baseScreenY-rect.top,70,0,2*Math.PI);ctx.stroke();ctx.beginPath();ctx.arc(joystick.screenX-rect.left,joystick.screenY-rect.top,10,0,2*Math.PI);ctx.stroke();}
  ctx.fillStyle='#b0c8d8';ctx.font='12px sans-serif';ctx.fillText(`${spacing.toLocaleString('ru-RU')} м / клетка`,12,h-12);
}
