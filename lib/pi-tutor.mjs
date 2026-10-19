import {Agent} from '@earendil-works/pi-agent-core';
import {models,provider,defaultModel,authSource,markVerified} from './pi-auth.mjs';
import {createTutorTools,instructions} from './tutor.mjs';
import {skillManifest} from './skills.mjs';
import {createDraftEmitter} from './solution-draft.mjs';

export async function solvePi(input,onEvent=()=>{},signal=AbortSignal.timeout(240000)){
  const model=models.getModel(provider,input.model || defaultModel);
  if(!model)throw new Error('所选模型不在 Pi 模型目录中，请重新选择。');
  if(input.image && !model.input.includes('image'))throw new Error('所选模型不支持图片，请换一个支持图片的模型。');
  const source=await authSource();
  let turns=0;const usage={input:0,output:0,cacheRead:0,cacheWrite:0,reasoning:0,totalTokens:0};
  const session=createTutorTools(input,onEvent,signal);
  const draft=createDraftEmitter(onEvent,{mode:input.mode});
  const agent=new Agent({
    initialState:{systemPrompt:instructions,model,thinkingLevel:input.reasoning || 'medium',tools:session.availableTools},
    streamFn:(m,c,o)=>models.streamSimple(m,c,{...o,transport:'sse',timeoutMs:240000,maxRetries:0}),
    toolExecution:'sequential',
    prepareNextTurnWithContext:turn=>({context:{...turn.context,tools:session.availableTools}}),
    finishTurn:()=>session.solution || session.recoveryExhausted?{action:'end'}:++turns>=8?{action:'end'}:undefined
  });
  agent.subscribe(event=>{
    draft.accept(event);
    if(event.type==='tool_execution_start')onEvent({type:'progress',message:event.toolName==='math_symbolic'?'正在用 SymPy 进行符号计算…':event.toolName==='math_calculate'?'正在复核关键计算…':'正在整理步骤与图形…'});
    if(event.type==='message_end' && event.message.role==='assistant'){
      const u=event.message.usage;for(const key of Object.keys(usage))usage[key]+=u?.[key] || 0;
    }
  });
  const abort=()=>agent.abort();signal.addEventListener('abort',abort,{once:true});
  try{
    signal.throwIfAborted();
    const context=input.context?`此前题目及解答（仅作追问上下文）：\n${JSON.stringify(input.context)}\n`:'';
    const content=[{type:'text',text:`学习程度：${input.level || '自动判断'}；模式：${input.mode || 'detailed'}。\n${context}用户本次题目：\n${input.question || '请解析图片中的题目。'}`}];
    if(input.image)content.push({type:'image',data:input.image.data,mimeType:input.image.mimeType});
    onEvent({type:'progress',message:'正在分析题意，选择解题方法…'});
    await agent.prompt({role:'user',content,timestamp:Date.now()});
    signal.throwIfAborted();
    if(!session.solution){const last=agent.state.messages.filter(m=>m.role==='assistant').at(-1);throw new Error(last?.errorMessage || '模型未生成完整的结构化解答，请重试。');}
    markVerified(model.id);
    return {solution:session.solution,checks:session.checks,skills:skillManifest,model:model.id,reasoning:input.reasoning || 'medium',source,usage,createdAt:new Date().toISOString(),mode:input.mode || 'detailed'};
  }finally{draft.close();signal.removeEventListener('abort',abort);}
}
