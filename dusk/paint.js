/* Dusk: homepage adapter of the supplied 600px vertical-drips sketch.
   Original palette, seed, and mark generation retained; 40s paint + 10s hold.
   Prepaint the opening washes so every cycle starts at the pink layer.
   The standalone sheet, caption, and gallery canvas-switching API are omitted. */
const W=600,H=600,m=600;
const S={water:.7,coverage:.5,density:.35,scale:1,soft:.6,glaze:.4,touch:.2,detail:.6,brushSize:1};
const C={seed:1874,ground:'#f4ece6',washes:['#8f7fa8','#c68aa0','#e6b39a','#f0cfa0'],accents:['#6d5c8a','#e28f8f','#d9a56b'],highlights:['#f9dc9c','#fff3e0']};
const duration=40000,hold=10000;
const rr=(a,b)=>random(a,b), pick=a=>a[Math.floor(random(a.length))];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let paint,buf,strokes=[],idx=0,started=null,cycle=-1;
function bboxOf(pts,pad){
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 return [Math.max(0,Math.floor(Math.min(...xs)-pad)),Math.max(0,Math.floor(Math.min(...ys)-pad)),Math.min(W,Math.ceil(Math.max(...xs)+pad)),Math.min(H,Math.ceil(Math.max(...ys)+pad))];
}
function jitterEllipse(cx,cy,rx,ry,n,jitter){
 const pts=[],a0=rr(0,TWO_PI);
 for(let i=0;i<n;i++){const a=a0+i/n*TWO_PI,k=1+rr(-jitter,jitter);pts.push([cx+Math.cos(a)*rx*k,cy+Math.sin(a)*ry*k]);}
 return pts;
}
function column(x0,x1,wobble,n=9){
 const left=[],right=[];
 for(let i=0;i<=n;i++){const y=-20+(H+40)*i/n;left.push([x0+rr(-wobble,wobble),y]);right.push([x1+rr(-wobble,wobble),y]);}
 return left.concat(right.reverse());
}
function fillStyle(color,opacity,bleed,texture,border=.3){
 brush.noStroke();brush.noHatch();brush.noWash();
 brush.fill(color,opacity);brush.fillBleed(bleed,'out');brush.fillTexture(texture,border);
}
function washStyle(color,opacity){
 brush.noStroke();brush.noHatch();brush.noFill();brush.wash(color,opacity);
}
function strokeStyle(name,color,weight){
 brush.noFill();brush.noWash();brush.noHatch();brush.set(name,color,weight);
}
const descriptor=(fn,bb,axis,dir,dur,gap=60)=>({fn,bb,axis,dir,dur,gap});
function ground(pts,color,opacity,bleed,texture){
 return descriptor(()=>{fillStyle(color,opacity,bleed,texture);brush.polygon(pts);},bboxOf(pts,m*.25),'y',1,520,90);
}
function glaze(x0,y0,x1,y1,color,weight){
 const bb=bboxOf([[x0,y0],[x1,y1]],14+weight*4*S.brushSize);
 const axis=Math.abs(x1-x0)>=Math.abs(y1-y0)?'x':'y';
 const dir=(axis==='x'?Math.sign(x1-x0):Math.sign(y1-y0))||1;
 return descriptor(()=>{brush.field('hand');strokeStyle('marker',color,weight*S.brushSize);brush.line(x0,y0,x1,y1);brush.noField();},bb,axis,dir,90+Math.hypot(x1-x0,y1-y0)*.45,45);
}
function mark(pts,color,opacity,bleed,texture){
 const bb=bboxOf(pts,m*.08+14);
 return descriptor(()=>{fillStyle(color,opacity,bleed,texture);brush.polygon(pts);},bb,'y',1,180+(bb[3]-bb[1])*.9,70);
}
function flick(x,y,len,a,color,weight){
 const dx=Math.cos(a)*len/2,dy=Math.sin(a)*len/2;
 const bb=bboxOf([[x-dx,y-dy],[x+dx,y+dy]],10+weight*5);
 return descriptor(()=>{strokeStyle('flick',color,weight*S.brushSize);brush.line(x-dx,y-dy,x+dx,y+dy);},bb,Math.abs(Math.cos(a))>=Math.abs(Math.sin(a))?'x':'y',1,90,25);
}
function composition(){
 const out=[];
 function group(items,t0,t1){const step=(t1-t0)/Math.max(items.length,1);items.forEach((it,i)=>{it.t=t0+step*(i+.5)+rr(-.3,.3)*step;});out.push(...items);}
 if(S.coverage>.02){
  const pts=[[-20,-20],[W+20,-20],[W+20,H+20],[-20,H+20]];
  const s=descriptor(()=>{washStyle(C.washes[0],Math.round(S.coverage*200));brush.polygon(pts);},[0,0,W,H],'y',1,700,120);
  s.t=.02;s.opening=true;out.push(s);
 }
 const groundCount=2+Math.round(S.density*2),grounds=[];
 for(let i=0;i<groundCount;i++){
  const x=-20+i/groundCount*W+rr(-30,30),w=W/groundCount*rr(1.2,1.8);
  const layer=ground(column(x,x+w,14+S.soft*20),C.washes[i%C.washes.length],Math.round(225-S.water*80),.25+S.water*.55,.3+S.water*.5);
  layer.opening=i<2;grounds.push(layer);
 }
 group(grounds,.03,.16);
 const glazes=[];
 for(let i=0;i<Math.round(S.glaze*22);i++){
  const color=random()<.7?pick(C.washes):pick(C.accents);
  const weight=rr(1.2,3.2)*Math.sqrt(S.scale),x=rr(0,W),y=rr(-10,H*.5),y1=y+rr(H*.25,H*.8),x1=x+rr(-8,8);
  glazes.push(glaze(x,y,x1,y1,color,weight));
 }
 const veil=glazes.splice(0,Math.round(glazes.length*.25));group(glazes,.16,.30);
 const attractors=[];
 for(let i=0,n=2+Math.floor(rr(0,3));i<n;i++)attractors.push([rr(W*.15,W*.85),rr(H*.15,H*.85)]);
 const marks=[],centers=[];
 for(let i=0,n=Math.round(3+S.density*34);i<n;i++){
  let x,y;
  if(random()<.25){x=rr(0,W);y=rr(0,H);}else{const a=pick(attractors),sd=m*.16;x=a[0]+randomGaussian(0,sd);y=a[1]+randomGaussian(0,sd);}
  const r=m*.06*S.scale*rr(.5,1.6),color=random()<.2?pick(C.highlights):pick(C.accents);
  const pts=jitterEllipse(x,y,r*rr(.3,.5),r*rr(2,4),14,(.08+S.soft*.3)*.7);
  const d=mark(pts,color,Math.round(200-S.water*60),.4+S.water*.4,.4+S.water*.4);
  d.r=r;marks.push(d);centers.push([x,y,r]);
 }
 group(marks.sort((a,b)=>b.r-a.r),.30,.86);group(veil,.86,.92);
 const touches=[];
 for(let i=0,n=Math.round(Math.round(S.touch*20)*(.4+.6*S.detail));i<n;i++){
  const p=pick(centers),x=p[0]+rr(-p[2],p[2]),y=p[1]+rr(-p[2]*.6,p[2]*.6);
  const color=random()<.85?pick(C.highlights):pick(C.accents);
  const len=rr(8,22)*S.scale,weight=rr(.6,1.1)*S.scale,a=HALF_PI+rr(-.15,.15);
  touches.push(flick(x,y,len,a,color,weight));
 }
 group(touches,.92,1);return out.sort((a,b)=>a.t-b.t);
}
function flushWash(){
 brush.noStroke();brush.noHatch();brush.noWash();brush.fill('#000000',0);brush.fillBleed(0);brush.fillTexture(0,0);
 brush.polygon([[-8,-8],[-6,-8],[-6,-6]]);
}
function setup(){
 pixelDensity(1);
 createCanvas(W,H,WEBGL);
 frameRate(24);
 brush.add('flick',{weight:.7,vibration:.12,definition:.9,quality:.8,opacity:200,spacing:.1,pressure:{curve:[.25,.25],min_max:[1.1,.85]}});
 brush.add('rim',{weight:.45,vibration:.35,definition:.7,quality:.8,opacity:190,spacing:.1,pressure:{curve:[.15,.2],min_max:[1.2,1]}});
 brush.scaleBrushes(3*m/600);
 paint=createGraphics(W,H,WEBGL);buf=createGraphics(W,H,WEBGL);
 paint.imageMode(CORNER);buf.imageMode(CORNER);imageMode(CORNER);
 brush.load(buf);
 buf.push();buf.translate(-W/2,-H/2);fillStyle('#7a86bd',200,.3,.5);brush.circle(W/2,H/2,12);buf.pop();buf.clear();
 background('#e8dce5');
}
function resetPainting(){
 brush.load(buf);randomSeed(C.seed);noiseSeed(C.seed);strokes=composition();
 let cursor=0;
 for(const s of strokes){s.seed=Math.floor(random()*1e9);s.start=cursor;cursor+=s.dur+s.gap;s.begun=false;}
 // Finish the lavender and pink washes before exposing the canvas.
 const openingCount=strokes.findIndex(s=>!s.opening);
 const offset=strokes[openingCount].start,k=duration/(cursor-offset);
 for(const s of strokes){s.start=(s.start-offset)*k;s.dur*=k;}
 idx=0;paint.background(C.ground);
 while(idx<openingCount){
  beginStroke(strokes[idx]);
  paint.push();paint.translate(-W/2,-H/2);paint.image(buf,0,0,W,H);paint.pop();idx++;
 }
}
function beginStroke(s){
 buf.clear();buf.push();buf.translate(-W/2,-H/2);buf.image(paint,0,0,W,H);
 randomSeed(s.seed);noiseSeed(s.seed);s.fn();flushWash();buf.pop();s.begun=true;
}
function reveal(s,p){
 const [x0,y0,x1,y1]=s.bb;if(x1<=x0||y1<=y0||p<=0)return;
 if(s.axis==='x'){
  const w=Math.round((x1-x0)*p),a=s.dir>0?x0:x1-w;
  if(w)image(buf,a,y0,w,y1-y0,a,y0,w,y1-y0);
 }else{
  const h=Math.round((y1-y0)*p),a=s.dir>0?y0:y1-h;
  if(h)image(buf,x0,a,x1-x0,h,x0,a,x1-x0,h);
 }
}
function draw(){
 if(started===null)started=millis();
 const elapsed=millis()-started,nextCycle=Math.floor(elapsed/(duration+hold));
 if(cycle!==nextCycle){cycle=nextCycle;resetPainting();}
 const t=reduced?duration:Math.min(elapsed%(duration+hold),duration);
 translate(-W/2,-H/2);
 while(idx<strokes.length&&strokes[idx].start<=t){
  const s=strokes[idx];if(!s.begun)beginStroke(s);
  if(t<s.start+s.dur)break;
  paint.push();paint.translate(-W/2,-H/2);paint.image(buf,0,0,W,H);paint.pop();idx++;
 }
 image(paint,0,0,W,H);
 const s=strokes[idx];if(s?.begun)reveal(s,Math.min(1,(t-s.start)/s.dur));
 if(reduced)noLoop();
}
