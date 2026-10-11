import type { TrainState } from './types';
export interface AssistantPathReference { point:{x:number;y:number}; tangent:{x:number;y:number}; progress:number }
interface PathPoint { x:number; y:number; progress:number }
// Храним принятый путь ведущего, а не его текущий курс: поворот достигает груза позже.
export class AssistantPathTracker {
  private points:PathPoint[];
  private progress:number;
  private lastB:{x:number;y:number};
  private unavailable=false;
  constructor(state:TrainState){
    const a=state.bodies.A,t={x:Math.cos(a.angle),y:Math.sin(a.angle)};
    this.points=[{x:a.position.x-8000*t.x,y:a.position.y-8000*t.y,progress:0},{...a.position,progress:8000}];
    this.progress=Math.max(0,Math.min(8000,8000+(state.bodies.B.position.x-a.position.x)*t.x+(state.bodies.B.position.y-a.position.y)*t.y));
    this.lastB={...state.bodies.B.position};
  }
  get pointCount(){return this.points.length;}
  reference(state:TrainState):AssistantPathReference|undefined {
    if(this.unavailable||this.progress<this.points[0].progress)return undefined;
    const b=state.bodies.B.position,travel=Math.hypot(b.x-this.lastB.x,b.y-this.lastB.y),end=this.progress+travel+2;
    let result:AssistantPathReference|undefined,best=Infinity;
    for(let i=1;i<this.points.length;i++){
      const a=this.points[i-1],z=this.points[i];if(z.progress<this.progress||a.progress>end)continue;
      const length=z.progress-a.progress,dx=z.x-a.x,dy=z.y-a.y;
      const lower=Math.max(0,(this.progress-a.progress)/length),upper=Math.min(1,(end-a.progress)/length);
      const u=Math.max(lower,Math.min(upper,((b.x-a.x)*dx+(b.y-a.y)*dy)/(length*length)));
      const point={x:a.x+u*dx,y:a.y+u*dy},square=(b.x-point.x)**2+(b.y-point.y)**2;
      // Равная дистанция оставляет ранний сегмент: пересечение пути не перескакивает виток.
      if(square<best){best=square;result={point,tangent:{x:dx/length,y:dy/length},progress:a.progress+u*length};}
    }
    return result;
  }
  accept(state:TrainState):void {
    const last=this.points[this.points.length-1],a=state.bodies.A.position,d=Math.hypot(a.x-last.x,a.y-last.y);
    // Разрешение 2 м ограничивает размер истории; неподвижный поворот не переписывает путь.
    if(d>=2)this.points.push({...a,progress:last.progress+d});
    const ref=this.reference(state);if(ref)this.progress=ref.progress;
    this.lastB={...state.bodies.B.position};
    const cutoff=this.points[this.points.length-1].progress-8000;
    while(this.points.length>2&&this.points[1].progress<=cutoff)this.points.shift();
    if(this.points[0].progress<cutoff){const a=this.points[0],b=this.points[1],u=(cutoff-a.progress)/(b.progress-a.progress);
      this.points[0]={x:a.x+u*(b.x-a.x),y:a.y+u*(b.y-a.y),progress:cutoff};}
    // При выходе груза за окно 8 км управление ждёт новый старт; физика не останавливается.
    if(this.progress<this.points[0].progress)this.unavailable=true;
  }
}
