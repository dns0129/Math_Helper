const graphemes=new Intl.Segmenter('zh',{granularity:'grapheme'});
const split=value=>Array.from(graphemes.segment(value),part=>part.segment);

// Formulas are atomic units: an unfinished LaTeX expression is held until its
// closing delimiter arrives. Chinese characters and emoji use grapheme boundaries.
export function textUnits(text,kind='text'){
  if(kind==='math')return text?[text]:[];
  const units=[];let cursor=0;
  const opening=/(?<!\\)\$/g;
  while(cursor<text.length){
    opening.lastIndex=cursor;
    const match=opening.exec(text);
    if(!match){units.push(...split(text.slice(cursor)));break;}
    units.push(...split(text.slice(cursor,match.index)));
    const delimiter=text[match.index+1]==='$'?'$$':'$';
    let end=text.indexOf(delimiter,match.index+delimiter.length);
    while(end>=0 && text[end-1]==='\\')end=text.indexOf(delimiter,end+delimiter.length);
    if(end<0)break;
    units.push(text.slice(match.index,end+delimiter.length));cursor=end+delimiter.length;
  }
  return units;
}

export class TextQueue{
  constructor(){this.blocks=[];this.credit=0;}
  update(blocks){
    const previous=new Map(this.blocks.map(b=>[b.id,b]));
    this.blocks=blocks.map(block=>{
      const units=textUnits(block.text,block.kind),old=previous.get(block.id);
      let shown=0;
      if(old)while(shown<old.shown && shown<units.length && units[shown]===old.units[shown])shown++;
      return {...block,units,shown};
    });
  }
  get pending(){return this.blocks.reduce((n,b)=>n+b.units.length-b.shown,0);}
  advance(milliseconds){
    if(!this.pending){this.credit=0;return;}
    const speed=90+Math.min(510,Math.max(0,this.pending-240)*0.7);
    this.credit+=Math.min(64,Math.max(0,milliseconds))*speed/1000;
    let count=Math.min(24,Math.floor(this.credit));this.credit-=count;
    for(const block of this.blocks){const amount=Math.min(count,block.units.length-block.shown);block.shown+=amount;count-=amount;if(!count)break;}
  }
  finish(){for(const block of this.blocks)block.shown=block.units.length;this.credit=0;}
  visible(){return this.blocks.map(b=>({...b,text:b.units.slice(0,b.shown).join('')}));}
}

export function createTextStream(container,{renderText,renderMath,onUpdate=()=>{},signal}={}){
  const queue=new TextQueue(),nodes=new Map(),groups=new Map();
  const body=container.querySelector('.live-answer-body'),label=container.querySelector('.live-answer-label');
  let generation,frame=0,lastPaint,finished=false,disposed=false,resolveFinished;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  function paint(){
    let active;
    const visible=queue.visible(),ids=new Set(visible.map(b=>b.id));
    for(const [id,node] of nodes)if(!ids.has(id)){node.remove();nodes.delete(id);}
    for(const block of visible){
      if(!block.text)continue;
      let group=groups.get(block.group);
      if(!group){
        group=document.createElement('section');group.className='live-answer-section';
        const heading=document.createElement('h3');heading.textContent=block.heading;group.append(heading);groups.set(block.group,group);
      }
      // Move existing sections/fields into semantic order without replacing them.
      body.append(group);
      let node=nodes.get(block.id);
      if(!node){node=document.createElement('div');node.className=block.kind==='math'?'math-display':block.kind==='heading'?'live-answer-subtitle prose':'prose';nodes.set(block.id,node);}
      group.append(node);
      if(node.dataset.source!==block.text){
        node.innerHTML=block.kind==='math'?renderMath(block.text):renderText(block.text);node.dataset.source=block.text;
      }
      active=node;
    }
    for(const [key,group] of groups)if(group.children.length===1){group.remove();groups.delete(key);}
    container.hidden=!visible.some(b=>b.text);
    onUpdate(active);
  }
  function settle(){
    if(finished && !queue.pending){label.textContent='解答已生成';container.classList.remove('is-typing');resolveFinished?.();resolveFinished=undefined;}
  }
  function tick(time){
    frame=0;if(disposed || signal?.aborted)return;
    if(lastPaint===undefined)lastPaint=time-16;
    if(time-lastPaint>=16){queue.advance(time-lastPaint);lastPaint=time;paint();}
    settle();if(queue.pending)frame=requestAnimationFrame(tick);else lastPaint=undefined;
  }
  function schedule(){
    if(disposed)return;
    if(document.hidden || motion.matches){queue.finish();paint();settle();return;}
    if(!frame && queue.pending)frame=requestAnimationFrame(tick);
  }
  function update(event){
    if(disposed)return;
    if(generation!==event.id){
      generation=event.id;body.replaceChildren();nodes.clear();groups.clear();queue.blocks=[];
      label.textContent='推演正在解答';
    }
    queue.update(event.blocks);container.classList.add('is-typing');schedule();
  }
  const flush=()=>{queue.finish();paint();settle();};
  const abort=()=>{disposed=true;cancelAnimationFrame(frame);label.textContent='解答尚未完成';container.classList.remove('is-typing');resolveFinished?.();resolveFinished=undefined;};
  const visibility=()=>{if(document.hidden)flush();};
  signal?.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',flush);
  return {
    update,
    async finish(blocks){
      if(disposed)return;
      update({id:generation || 'completed',blocks});finished=true;
      if(!queue.pending){flush();return;}
      await new Promise(resolve=>{resolveFinished=resolve;schedule();});
    },
    dispose(){disposed=true;cancelAnimationFrame(frame);signal?.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',flush);resolveFinished?.();},
    flush
  };
}
