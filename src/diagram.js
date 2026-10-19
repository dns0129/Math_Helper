const esc=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['var(--plot-primary, #4a63e7)','#dd9c36','#269782','#b779d3','#df6a7d','#597b92'];
const format=n=>Math.abs(n)<1e-9?'0':Number(n.toPrecision(4)).toString();
function ticks(min,max){const raw=(max-min)/7;const power=10**Math.floor(Math.log10(raw));const step=[1,2,5,10].find(n=>n*power>=raw)*power;const result=[];for(let n=Math.ceil(min/step)*step;n<=max+step*1e-8&&result.length<30;n+=step)result.push(n);return result;}
export function mountDiagram(container,diagram,{compact=false}={}){
  let range={...diagram.range};const original={...range};const width=640,height=compact?350:430;const pad={left:48,right:30,top:28,bottom:42};
  const id='plot-'+crypto.randomUUID();
  container.innerHTML=`<div class="diagram-stage"></div>${compact?'':`<div class="diagram-controls"><span class="plot-readout">${diagram.curves?.length?'移动到曲线上查看坐标':'几何示意 · 等比例坐标'}</span><div><button data-zoom="in" aria-label="放大图形">＋</button><button data-zoom="out" aria-label="缩小图形">−</button><button data-zoom="reset" aria-label="重置图形">↺</button><button data-download aria-label="下载 SVG 图形">↓</button></div></div>`}<div class="plot-legend">${(diagram.curves || []).map((c,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(c.label)}</span>`).join('')}</div>`;
  const stage=container.querySelector('.diagram-stage');
  const labelMeasure=document.createElement('canvas').getContext('2d');
  if(labelMeasure)labelMeasure.font='13px system-ui,sans-serif';
  const draw=()=>{
    if(diagram.kind==='geometry'){
      const target=(width-pad.left-pad.right)/(height-pad.top-pad.bottom);const actual=(range.xMax-range.xMin)/(range.yMax-range.yMin);
      if(actual>target){const mid=(range.yMin+range.yMax)/2,span=(range.xMax-range.xMin)/target;range.yMin=mid-span/2;range.yMax=mid+span/2;}
      else{const mid=(range.xMin+range.xMax)/2,span=(range.yMax-range.yMin)*target;range.xMin=mid-span/2;range.xMax=mid+span/2;}
    }
    const x=n=>pad.left+(n-range.xMin)/(range.xMax-range.xMin)*(width-pad.left-pad.right);
    const y=n=>height-pad.bottom-(n-range.yMin)/(range.yMax-range.yMin)*(height-pad.top-pad.bottom);
    const axisX=x(0),axisY=y(0);let pieces=[];
    for(const n of ticks(range.xMin,range.xMax))pieces.push(`<line x1="${x(n)}" x2="${x(n)}" y1="${pad.top}" y2="${height-pad.bottom}" stroke="var(--plot-grid, #e9ecf4)"/><text x="${x(n)}" y="${height-16}" text-anchor="middle" fill="var(--plot-text, #9199ae)" font-size="12">${format(n)}</text>`);
    for(const n of ticks(range.yMin,range.yMax))pieces.push(`<line x1="${pad.left}" x2="${width-pad.right}" y1="${y(n)}" y2="${y(n)}" stroke="var(--plot-grid, #e9ecf4)"/><text x="${pad.left-12}" y="${y(n)+4}" text-anchor="end" fill="var(--plot-text, #9199ae)" font-size="12">${format(n)}</text>`);
    if(axisX>=pad.left && axisX<=width-pad.right)pieces.push(`<line x1="${axisX}" x2="${axisX}" y1="${pad.top}" y2="${height-pad.bottom}" stroke="var(--plot-axis, #a8b0c3)" stroke-width="1.2"/>`);
    if(axisY>=pad.top && axisY<=height-pad.bottom)pieces.push(`<line x1="${pad.left}" x2="${width-pad.right}" y1="${axisY}" y2="${axisY}" stroke="var(--plot-axis, #a8b0c3)" stroke-width="1.2"/>`);
    pieces.push(`<text x="${width-7}" y="${height-16}" text-anchor="end" fill="var(--plot-text, #626d88)" font-size="13">${esc(diagram.xLabel || 'x')}</text><text x="${pad.left+6}" y="${pad.top-8}" fill="var(--plot-text, #626d88)" font-size="13">${esc(diagram.yLabel || 'y')}</text>`);
    let data=[];
    (diagram.curves || []).forEach((curve,i)=>{
      let path='',prev;
      for(const p of curve.samples || []){
        if(!p || Math.abs(p[1])>Math.max(Math.abs(range.yMin),Math.abs(range.yMax))*30+1){prev=null;continue;}
        const jump=prev && Math.abs(p[1]-prev[1])>(range.yMax-range.yMin)*1.3;
        path+=`${prev&&!jump?'L':'M'}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)} `;prev=p;
      }
      data.push(`<path data-curve-path="${i}" class="plot-curve" d="${path}" stroke="${colors[i%colors.length]}" stroke-width="3" stroke-linecap="round" fill="none"/>`);
    });
    for(const s of diagram.segments || []){
      data.push('<g data-construction-kind="segment">');
      data.push(`<line x1="${x(s.from.x)}" y1="${y(s.from.y)}" x2="${x(s.to.x)}" y2="${y(s.to.y)}" stroke="${s.dashed?'#a4aec8':'var(--plot-primary, #4a63e7)'}" stroke-width="${s.dashed?1.5:2.5}" ${s.dashed?'stroke-dasharray="5 5"':''}/>`);
      if(s.label)data.push(`<text x="${x((s.from.x+s.to.x)/2)+8}" y="${y((s.from.y+s.to.y)/2)-9}" fill="var(--plot-text, #5b6480)" font-size="13">${esc(s.label)}</text>`);
      data.push('</g>');
    }
    for(const c of diagram.circles || [])data.push(`<g data-construction-kind="circle"><ellipse cx="${x(c.center.x)}" cy="${y(c.center.y)}" rx="${x(c.center.x+c.radius)-x(c.center.x)}" ry="${y(c.center.y)-y(c.center.y+c.radius)}" stroke="var(--plot-primary, #4a63e7)" stroke-width="2.5" fill="var(--plot-primary, #4a63e7)" fill-opacity="0.035"/></g>`);
    const labelBoxes=[];
    for(const p of diagram.points || []){
      const label=p.label || `(${format(p.x)}, ${format(p.y)})`,px=x(p.x),py=y(p.y);
      const labelWidth=labelMeasure?.measureText(label).width || label.length*13;
      const candidates=[];
      for(const dy of [-10,22,-30,42,-50,62])for(const side of (px>(pad.left+width-pad.right)/2?[-1,1]:[1,-1])){
        const left=Math.max(pad.left+3,Math.min(width-pad.right-labelWidth-3,px+(side===1?8:-labelWidth-8)));
        const baseline=Math.max(pad.top+16,Math.min(height-pad.bottom-3,py+dy));
        const box={left,right:left+labelWidth,top:baseline-13,bottom:baseline+3};
        const overlaps=labelBoxes.filter(b=>box.left<b.right+5&&box.right+5>b.left&&box.top<b.bottom+4&&box.bottom+4>b.top).length;
        candidates.push({left,baseline,box,overlaps});
      }
      const position=candidates.find(c=>!c.overlaps) || candidates.reduce((best,c)=>c.overlaps<best.overlaps?c:best,candidates[0]);
      const visible=px>=pad.left&&px<=width-pad.right&&py>=pad.top&&py<=height-pad.bottom;
      if(visible)labelBoxes.push(position.box);
      data.push(`<g data-construction-kind="point"><circle cx="${px}" cy="${py}" r="4.5" fill="var(--plot-primary, #4a63e7)" stroke="var(--plot-bg, white)" stroke-width="2"/><text x="${position.left}" y="${position.baseline}" visibility="${visible?'visible':'hidden'}" fill="var(--plot-text, #4f5b7b)" font-size="13"><title>${esc(label)}</title>${esc(label)}</text></g>`);
    }
    stage.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(diagram.title)}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif"><title>${esc(diagram.title)}</title><rect width="${width}" height="${height}" fill="var(--plot-bg, #fff)"/><defs><clipPath id="${id}"><rect x="${pad.left}" y="${pad.top}" width="${width-pad.left-pad.right}" height="${height-pad.top-pad.bottom}"/></clipPath></defs>${pieces.join('')}<g clip-path="url(#${id})">${data.join('')}</g><g class="plot-cursor" visibility="hidden"><line y1="${pad.top}" y2="${height-pad.bottom}" stroke="#7584c7" stroke-dasharray="4 4"/><circle r="5" fill="var(--plot-primary, #4a63e7)" stroke="var(--plot-bg, white)" stroke-width="2"/></g></svg>`;
    if(!compact)stage.querySelector('svg').addEventListener('pointermove',event=>{
      const svg=event.currentTarget;const bounds=svg.getBoundingClientRect();const px=(event.clientX-bounds.left)/bounds.width*width;
      const xx=range.xMin+(px-pad.left)/(width-pad.left-pad.right)*(range.xMax-range.xMin);
      const samples=diagram.curves?.[0]?.samples?.filter(Boolean) || [];
      const closest=samples.reduce((best,p)=>Math.abs(p[0]-xx)<Math.abs((best?.[0] ?? Infinity)-xx)?p:best,null);
      const cursor=svg.querySelector('.plot-cursor');
      if(!closest || px<pad.left || px>width-pad.right || closest[1]<range.yMin || closest[1]>range.yMax){cursor.setAttribute('visibility','hidden');return;}
      const line=cursor.querySelector('line'),dot=cursor.querySelector('circle');line.setAttribute('x1',x(closest[0]));line.setAttribute('x2',x(closest[0]));dot.setAttribute('cx',x(closest[0]));dot.setAttribute('cy',y(closest[1]));cursor.setAttribute('visibility','visible');
      container.querySelector('.plot-readout').textContent=`x = ${format(closest[0])}　y = ${format(closest[1])}`;
    });
    stage.querySelector('svg').addEventListener('pointerleave',()=>{stage.querySelector('.plot-cursor').setAttribute('visibility','hidden');const readout=container.querySelector('.plot-readout');if(readout)readout.textContent=diagram.curves?.length?'移动到曲线上查看坐标':'几何示意 · 等比例坐标';});
  };
  container.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.zoom==='reset')range={...original};
    else{
      const factor=button.dataset.zoom==='in'?0.75:1.33;
      for(const axis of ['x','y']){const min=range[axis+'Min'],max=range[axis+'Max'],mid=(min+max)/2,span=(max-min)*factor;if(span>1e-8&&span<1e7){range[axis+'Min']=mid-span/2;range[axis+'Max']=mid+span/2;}}
    }
    draw();
  }));
  container.querySelector('[data-download]')?.addEventListener('click',()=>{
    const svg=stage.querySelector('svg').cloneNode(true);
    svg.querySelectorAll('.plot-cursor').forEach(el=>el.remove());
    svg.querySelectorAll('.plot-curve,[data-construction-kind]').forEach(el=>{el.removeAttribute('class');el.removeAttribute('style');});
    const blob=new Blob([svg.outerHTML],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(diagram.title || '数学图形')+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  });
  draw();
  return ()=>{};
}
