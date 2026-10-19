import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parse as parsePartial} from 'partial-json';

export const deepseekModels=[
  {id:'deepseek-flash',name:'DeepSeek Flash',image:true},
  {id:'deepseek-v4-pro',name:'DeepSeek V4 Pro',image:false}
];
export const defaultModel='deepseek-flash';
const endpoint='https://api.deepseek.com';
const validKey=key=>typeof key==='string' && /^sk-[A-Za-z0-9_-]{16,240}$/.test(key);

export class DeepSeekError extends Error{
  constructor(status,code=''){
    const messages={400:'DeepSeek 请求格式或模型参数无效，请重试或更换模型。',401:'DeepSeek API Key 无效，请重新配置。',402:'DeepSeek API 余额不足，请在官方平台充值后重试。',403:'DeepSeek 拒绝了请求，请检查 API Key 权限和服务可用地区。',429:'DeepSeek 调用速率达到限制，请稍后重试。',500:'DeepSeek 服务暂时异常，请稍后重试。',503:'DeepSeek 服务繁忙，请稍后重试。'};
    super(messages[status] || 'DeepSeek 请求失败，请稍后重试。');this.name='DeepSeekError';this.status=status;this.code=code;
  }
}

function usageOf(usage={}){
  const cache=usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {input:Math.max(0,(usage.prompt_tokens || 0)-cache),output:usage.completion_tokens || 0,cacheRead:cache,cacheWrite:0,reasoning:usage.completion_tokens_details?.reasoning_tokens || 0,totalTokens:usage.total_tokens || 0};
}

export async function readCompletion(response,{signal,onToolDelta=()=>{}}={}){
  if(!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('DeepSeek 未返回有效的流式解答，请重试。');
  const decoder=new TextDecoder();let buffer='',size=0,done=false,finishReason=null,content='',reasoning='',usage={};
  const calls=new Map();
  const notify=(call,complete=false)=>{
    if(!['present_solution','present_verified_solution'].includes(call.function.name))return;
    if(!complete && Date.now()-(call.lastDelta || 0)<80)return;
    try{onToolDelta({id:call.id,name:call.function.name,arguments:complete?JSON.parse(call.function.arguments):parsePartial(call.function.arguments),complete});call.lastDelta=Date.now();}catch{}
  };
  const frame=text=>{
    const data=text.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
    if(!data)return;
    if(data==='[DONE]'){done=true;return;}
    let chunk;try{chunk=JSON.parse(data);}catch{throw new Error('DeepSeek 流式数据格式无效，请重试。');}
    if(chunk.error)throw new DeepSeekError(500);
    if(chunk.usage)usage=usageOf(chunk.usage);
    const choice=chunk.choices?.[0];if(!choice)return;
    if(choice.finish_reason)finishReason=choice.finish_reason;
    const delta=choice.delta || {};
    if(typeof delta.content==='string')content+=delta.content;
    if(typeof delta.reasoning_content==='string')reasoning+=delta.reasoning_content;
    for(const part of delta.tool_calls || []){
      if(!Number.isInteger(part.index) || part.index<0 || part.index>31)throw new Error('DeepSeek 工具调用过多或格式无效。');
      let call=calls.get(part.index);
      if(!call){call={id:'',type:'function',function:{name:'',arguments:''}};calls.set(part.index,call);}
      if(part.id)call.id=part.id;
      if(part.function?.name)call.function.name+=part.function.name;
      if(part.function?.arguments)call.function.arguments+=part.function.arguments;
      if(call.function.arguments.length>512000)throw new Error('DeepSeek 解答过长，请缩小题目范围。');
      notify(call);
    }
  };
  for await(const chunk of response.body){
    signal?.throwIfAborted();size+=chunk.length;
    if(size>16*1024*1024)throw new Error('DeepSeek 响应过长，请缩小题目范围。');
    buffer+=decoder.decode(chunk,{stream:true}).replace(/\r/g,'');let index;
    while((index=buffer.indexOf('\n\n'))>=0){frame(buffer.slice(0,index));buffer=buffer.slice(index+2);}
  }
  signal?.throwIfAborted();
  if(!done || !finishReason)throw new Error('DeepSeek 解答连接提前结束，尚未接收完整结果，请重试。');
  if(finishReason==='length')throw new Error('DeepSeek 生成长度达到限制，解答尚未完成；请缩小题目范围或选择深入推理。');
  if(!['stop','tool_calls'].includes(finishReason))throw new Error('DeepSeek 未完成本次解答，请稍后重试。');
  const toolCalls=[...calls.entries()].sort(([a],[b])=>a-b).map(([,call])=>{
    if(!call.id || !call.function.name)throw new Error('DeepSeek 工具调用缺少必要信息。');
    notify(call,true);return {id:call.id,type:'function',function:call.function};
  });
  return {message:{role:'assistant',content:content || null,reasoning_content:reasoning,...(toolCalls.length?{tool_calls:toolCalls}:{})},usage};
}

export function createDeepSeekClient({fetchImpl=(...args)=>globalThis.fetch(...args),configFile=process.env.DEEPSEEK_CONFIG_FILE || resolve('.local/deepseek.json'),envKey=()=>process.env.DEEPSEEK_API_KEY}={}){
  let queue=Promise.resolve(),lastVerification=null;
  const stored=async()=>{
    try{return JSON.parse(await readFile(configFile,'utf8'));}
    catch(error){if(error.code==='ENOENT')return {};throw new Error('DeepSeek 配置无法读取，请重新配置 API Key。');}
  };
  const config=async()=>{
    const saved=await stored();const apiKey=saved.apiKey || envKey();
    if(apiKey && !validKey(apiKey))throw new Error('DeepSeek API Key 格式无效，请重新配置。');
    return {...saved,apiKey,source:saved.apiKey?'DeepSeek 官方 API · 后端保存':'DeepSeek 官方 API · 环境配置'};
  };
  const send=async(path,{apiKey,signal,body}={})=>{
    if(!validKey(apiKey))throw new Error('请先配置 DeepSeek API Key。');
    const response=await fetchImpl(endpoint+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal || AbortSignal.timeout(15000)});
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new DeepSeekError(response.status);}
    return response;
  };
  const status=async()=>{
    try{
      const saved=await config();const models=deepseekModels.filter(model=>!saved.availableModels || saved.availableModels.includes(model.id));
      return {provider:'deepseek',defaultModel:models.some(model=>model.id===defaultModel)?defaultModel:models[0]?.id || defaultModel,models,connected:Boolean(saved.apiKey),source:saved.source,billing:'DeepSeek API 按量计费',lastVerification,connectionVerifiedAt:saved.verifiedAt || null,...(!saved.apiKey?{message:'请配置 DeepSeek 官方 API Key。'}:{})};
    }catch{return {provider:'deepseek',defaultModel,models:deepseekModels,connected:false,billing:'DeepSeek API 按量计费',lastVerification,message:'DeepSeek 配置无法读取，请重新配置 API Key。'};}
  };
  return {
    status,
    markVerified(model){lastVerification={model,at:new Date().toISOString()};},
    async source(){const saved=await config();if(!saved.apiKey)throw new Error('请先配置 DeepSeek API Key。');return saved.source;},
    async configure(value,signal=AbortSignal.timeout(15000)){
      const apiKey=typeof value==='string'?value.trim():'';
      if(!validKey(apiKey))throw new Error('请输入有效的 DeepSeek API Key（sk- 开头），不要填写网页登录密码。');
      const response=await send('/models',{apiKey,signal});
      const data=await response.json();
      const availableModels=deepseekModels.filter(model=>data.data?.some(item=>item.id===model.id)).map(model=>model.id);
      if(!availableModels.length)throw new Error('此 API Key 尚未返回受支持的 DeepSeek 模型，请检查官方账户。');
      const action=queue.then(async()=>{
        await mkdir(dirname(configFile),{recursive:true,mode:0o700});
        const temporary=configFile+'.'+randomBytes(8).toString('hex')+'.tmp';
        await writeFile(temporary,JSON.stringify({apiKey,availableModels,verifiedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});
        await rename(temporary,configFile);lastVerification=null;
      });queue=action.catch(()=>{});await action;
      return status();
    },
    async complete({model=defaultModel,messages,tools,reasoning='medium',signal,onToolDelta}){
      if(!deepseekModels.some(item=>item.id===model))throw new Error('所选 DeepSeek 模型无效。');
      const saved=await config();
      const response=await send('/chat/completions',{apiKey:saved.apiKey,signal:signal || AbortSignal.timeout(240000),body:{model,messages,tools:tools.map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters}})),thinking:{type:'enabled'},reasoning_effort:reasoning==='high'?'max':'high',max_tokens:reasoning==='high'?16384:8192,stream:true,stream_options:{include_usage:true}}});
      return readCompletion(response,{signal,onToolDelta});
    }
  };
}
