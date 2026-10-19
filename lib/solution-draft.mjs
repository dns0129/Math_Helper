// Only public teaching fields are streamed. Thinking, raw JSON and tool arguments
// for the calculator are never turned into the visible answer.
export function solutionDraftBlocks(solution,mode='detailed',complete=false){
  const blocks=[];
  const add=(id,group,heading,text,kind='text')=>{
    if(typeof text==='string' && text.length)blocks.push({id,group,heading,text:text.slice(0,8000),kind});
  };
  if(!solution || typeof solution!=='object')return blocks;
  add('title','overview','解题讲解',solution.title,'heading');
  add('overview','overview','解题讲解',solution.overview);
  for(const [i,value] of (Array.isArray(solution.givens)?solution.givens.slice(0,12):[]).entries())add(`given-${i}`,'givens','已知条件',value);
  for(const [i,f] of (Array.isArray(solution.formulas)?solution.formulas.slice(0,12):[]).entries()){
    if(!f || typeof f!=='object')continue;
    const group=`formula-${i}`;
    add(`${group}-name`,group,'公式与依据',f.name,'heading');
    if(complete || typeof f.why==='string' || typeof f.conditions==='string')add(`${group}-latex`,group,'公式与依据',f.latex,'math');
    add(`${group}-why`,group,'公式与依据',f.why);
    add(`${group}-conditions`,group,'公式与依据',f.conditions);
  }
  for(const [i,step] of (Array.isArray(solution.steps)?solution.steps.slice(0,20):[]).entries()){
    if(!step || typeof step!=='object')continue;
    const group=`step-${i}`,heading=`第 ${i+1} 步`;
    add(`${group}-title`,group,heading,step.title,'heading');
    add(`${group}-explanation`,group,heading,step.explanation);
    if(complete || typeof step.why==='string')add(`${group}-latex`,group,heading,step.latex,'math');
    add(`${group}-why`,group,heading,step.why);
  }
  if(mode!=='hint')add('answer','answer','结论',solution.answer);
  add('verification','verification','检验',solution.verification);
  for(const [i,value] of (Array.isArray(solution.pitfalls)?solution.pitfalls.slice(0,8):[]).entries())add(`pitfall-${i}`,'pitfalls','易错点',value);
  return blocks;
}

export function createDraftEmitter(send,{mode='detailed',intervalMs=80}={}){
  let pending,timer,last='',closed=false;
  const flush=()=>{
    clearTimeout(timer);timer=undefined;
    if(closed || !pending)return;
    const encoded=JSON.stringify(pending);
    if(encoded!==last){send(pending);last=encoded;}
    pending=undefined;
  };
  return {
    accept(event){
      if(closed || event.type!=='message_update')return;
      const update=event.assistantMessageEvent;
      if(!update || !['toolcall_start','toolcall_delta','toolcall_end'].includes(update.type))return;
      const call=update.partial?.content?.[update.contentIndex] || update.toolCall;
      if(call?.type!=='toolCall' || !['present_solution','present_verified_solution'].includes(call.name))return;
      const blocks=solutionDraftBlocks(call.arguments,mode,update.type==='toolcall_end');
      if(!blocks.length)return;
      pending={type:'answer_delta',id:call.id,blocks};
      if(update.type==='toolcall_end' || !last)flush();
      else if(!timer)timer=setTimeout(flush,intervalMs);
    },
    close(){flush();closed=true;clearTimeout(timer);}
  };
}
