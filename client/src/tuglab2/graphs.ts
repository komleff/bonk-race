import type { TrainRecording } from './recording';
export function drawGraphs(canvas:HTMLCanvasElement,record:TrainRecording):void {
  const ctx=canvas.getContext('2d')!,w=900,h=720;canvas.width=w;canvas.height=h;ctx.fillStyle='#0b1b2b';ctx.fillRect(0,0,w,h);
  const charts=[
    {label:'d / l₀ (1)',series:[{name:'AB',color:'#63e3d5',get:(i:number)=>{const l=record.ticks[i].telemetry.links.AB;return l?l.distance/l.restLength:0;}},{name:'BC',color:'#bc99fa',get:(i:number)=>{const l=record.ticks[i].telemetry.links.BC;return l?l.distance/l.restLength:0;}}]},
    {label:'Сила связи (Н)',series:[{name:'AB',color:'#63e3d5',get:(i:number)=>record.ticks[i].telemetry.links.AB?.force??0},{name:'BC',color:'#bc99fa',get:(i:number)=>record.ticks[i].telemetry.links.BC?.force??0}]},
    {label:'Боковой уход B от исходной линии (м)',series:[{name:'B',color:'#f6c47b',get:(i:number)=>{const b=record.ticks[i].telemetry.bodies.B!.position,a=record.initialState.bodies.A;return -(b.x-a.position.x)*Math.sin(a.angle)+(b.y-a.position.y)*Math.cos(a.angle);}}]},
    {label:'ω B (рад/с)',series:[{name:'B',color:'#f6c47b',get:(i:number)=>record.ticks[i].telemetry.bodies.B!.angularVelocity}]},
    {label:'Команды C (доля)',series:[{name:'Ретро',color:'#6be3d3',get:(i:number)=>record.ticks[i].commandC.retro},{name:'Бок',color:'#87bfff',get:(i:number)=>record.ticks[i].commandC.lateral},{name:'Момент',color:'#f3b57d',get:(i:number)=>record.ticks[i].commandC.yaw}]},
  ];
  const n=record.ticks.length,maxTime=record.ticks.at(-1)?.time??record.dt;
  charts.forEach((chart,idx)=>{
    const top=idx*140+36,bottom=top+84,left=95,right=w-25;let lo=0,hi=0;
    for(let i=0;i<n;i++)for(const s of chart.series){const v=s.get(i);lo=Math.min(lo,v);hi=Math.max(hi,v);}
    if(hi-lo<1e-12)hi=lo+1;
    ctx.font='14px sans-serif';ctx.fillStyle='#d5e5ef';ctx.fillText(chart.label,left,top-16);
    ctx.font='12px sans-serif';chart.series.forEach((s,j)=>{ctx.fillStyle=s.color;ctx.fillText(s.name,right-210+j*70,top-16);});
    ctx.strokeStyle='#385369';ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();ctx.fillStyle='#b7ccda';
    ctx.fillText(hi.toPrecision(3),5,top+6);ctx.fillText(lo.toPrecision(3),5,bottom);ctx.fillText('0 с',left,bottom+16);ctx.fillText(`${maxTime.toFixed(2)} с`,right-65,bottom+16);
    for(const s of chart.series){ctx.strokeStyle=s.color;ctx.lineWidth=1.8;ctx.beginPath();
      for(let i=0;i<n;i++){const x=left+record.ticks[i].time/maxTime*(right-left),y=bottom-(s.get(i)-lo)/(hi-lo)*(bottom-top);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
  });
}
