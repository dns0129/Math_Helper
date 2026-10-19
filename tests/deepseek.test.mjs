import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDeepSeekClient,readCompletion,DeepSeekError} from '../lib/deepseek.mjs';
import {solve} from '../lib/tutor.mjs';

const key='sk-test-only-1234567890abcdefghijkl';
const solution={title:'根式方程',subject:'代数',overview:'平方后检查增根',givens:[],formulas:[],steps:[{title:'筛选',explanation:'排除负根并代回',why:''}],answer:'x=2',verification:'代回原式成立',pitfalls:[],diagrams:[],followups:[],needsClarification:false};
const verified={...solution,calculations:[{engine:'math_symbolic',operation:'solve',expression:'sqrt(x+2)',rhs:'x'}],approximations:[]};
const frame=value=>'data: '+JSON.stringify(value)+'\n\n';
function streamResponse(parts,{done=true,finish='tool_calls'}={}){
  const body=parts.map(delta=>frame({choices:[{delta}]})).join('')+frame({choices:[{delta:{},finish_reason:finish}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_cache_hit_tokens:30,completion_tokens_details:{reasoning_tokens:5}}})+(done?'data: [DONE]\n\n':'');
  const encoded=new TextEncoder().encode(body);
  return new Response(new ReadableStream({start(controller){for(let i=0;i<encoded.length;i+=43)controller.enqueue(encoded.slice(i,i+43));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});
}
const call=(name,args,id='test-call')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
async function temporary(t){
  const dir=await mkdtemp(join(tmpdir(),'math-deepseek-'));t.after(()=>rm(dir,{recursive:true,force:true}));return join(dir,'deepseek.json');
}
test('API Key 先经官方接口验证再以600权限持久保存，状态与重启读取不泄露密钥',async t=>{
  const configFile=await temporary(t);const requests=[];
  const fetchImpl=async(url,options)=>{requests.push({url,options});return Response.json({data:[{id:'deepseek-flash'},{id:'deepseek-v4-pro'}]});};
  const client=createDeepSeekClient({configFile,envKey:()=>undefined,fetchImpl});
  assert.equal((await client.status()).connected,false);
  const status=await client.configure(key);
  assert.equal(status.connected,true);assert.ok(status.connectionVerifiedAt);assert.doesNotMatch(JSON.stringify(status),new RegExp(key));
  assert.equal(requests[0].url,'https://api.deepseek.com/models');assert.equal(requests[0].options.redirect,'error');
  assert.equal(requests[0].options.headers.Authorization,'Bearer '+key);
  assert.equal((await stat(configFile)).mode&0o777,0o600);assert.equal(JSON.parse(await readFile(configFile,'utf8')).apiKey,key);
  const restarted=createDeepSeekClient({configFile,envKey:()=>undefined,fetchImpl});assert.equal((await restarted.status()).connected,true);
});
test('错误密钥和无权限模型不会覆盖原配置，余额与速率错误有明确提示',async t=>{
  const configFile=await temporary(t);let statusCode=200;
  const client=createDeepSeekClient({configFile,envKey:()=>undefined,fetchImpl:async()=>statusCode===200?Response.json({data:[{id:'deepseek-flash'}]}):new Response('private upstream text',{status:statusCode})});
  await client.configure(key);statusCode=401;
  await assert.rejects(client.configure('sk-another-test-only-1234567890'),/API Key 无效/);
  assert.equal(JSON.parse(await readFile(configFile,'utf8')).apiKey,key);
  await assert.rejects(client.configure('not-an-api-key'),/sk-/);
  assert.match(new DeepSeekError(402).message,/余额不足/);assert.match(new DeepSeekError(429).message,/速率/);
});
test('直接调用仅发送给官方固定地址，保留思考模式工具协议与用量',async t=>{
  const configFile=await temporary(t);let observed;
  const client=createDeepSeekClient({configFile,envKey:()=>key,fetchImpl:async(url,options)=>{observed={url,options,payload:JSON.parse(options.body)};return streamResponse([{reasoning_content:'PRIVATE_REASONING'},{tool_calls:[{index:0,...call('present_solution',solution)}]}]);}});
  const deltas=[];const result=await client.complete({messages:[{role:'user',content:'题目'}],tools:[{name:'present_solution',description:'提交',parameters:{type:'object'}}],reasoning:'high',onToolDelta:delta=>deltas.push(delta)});
  assert.equal(observed.url,'https://api.deepseek.com/chat/completions');assert.equal(observed.options.redirect,'error');assert.equal(observed.payload.reasoning_effort,'max');
  assert.equal(observed.payload.thinking.type,'enabled');assert.equal(observed.payload.stream,true);
  assert.equal(result.message.reasoning_content,'PRIVATE_REASONING');assert.doesNotMatch(JSON.stringify(deltas),/PRIVATE_REASONING|sk-test-only/);
  assert.equal(result.usage.totalTokens,120);assert.equal(result.usage.input,70);assert.equal(result.usage.cacheRead,30);assert.equal(result.usage.reasoning,5);
  assert.ok(deltas.some(delta=>delta.complete && delta.arguments.answer==='x=2'));
});
test('SSE 可拼合中文和分片参数，截断、长度限制与取消不会返回伪造完整结果',async()=>{
  const args=JSON.stringify(solution),cut=38;
  const result=await readCompletion(streamResponse([{tool_calls:[{index:0,id:'fragmented',type:'function',function:{name:'present_solution',arguments:args.slice(0,cut)}}]},{tool_calls:[{index:0,function:{arguments:args.slice(cut)}}]}]));
  assert.deepEqual(JSON.parse(result.message.tool_calls[0].function.arguments),solution);
  await assert.rejects(readCompletion(streamResponse([],{done:false})),/提前结束/);
  await assert.rejects(readCompletion(streamResponse([],{finish:'length'})),/长度/);
  const controller=new AbortController();controller.abort();await assert.rejects(readCompletion(streamResponse([]),{signal:controller.signal}),/abort/i);
});
test('直接 DeepSeek 流程执行真实 SymPy 验算后提交，不调用 Pi Agent',async()=>{
  const events=[];let count=0,verifiedModel;
  const client={status:async()=>({source:'mock DeepSeek',defaultModel:'deepseek-flash',models:[{id:'deepseek-flash',image:true}]}),markVerified:model=>verifiedModel=model,complete:async request=>{
    count++;assert.ok(request.tools.some(tool=>tool.name==='present_verified_solution'));assert.match(request.messages[0].content,/math-skill|数学技能/);
    return {message:{role:'assistant',content:null,reasoning_content:'PRIVATE',tool_calls:[call('present_verified_solution',verified)]},usage:{totalTokens:20}};
  }};
  const result=await solve({question:'在实数域解方程 sqrt(x+2)=x',mode:'detailed'},event=>events.push(event),AbortSignal.timeout(10000),{client});
  assert.equal(count,1);assert.equal(result.solution.answer,'x=2');assert.equal(result.checks[0].result,'{2}');assert.equal(verifiedModel,'deepseek-flash');assert.equal(result.usage.totalTokens,20);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('多轮工具调用保留 reasoning_content，并在本地拒绝未开放工具和参数错误',async()=>{
  let count=0;const seen=[];
  const client={status:async()=>({source:'test',defaultModel:'deepseek-flash',models:[{id:'deepseek-flash',image:true}]}),complete:async request=>{
    count++;seen.push(structuredClone(request.messages));
    if(count===1)return {message:{role:'assistant',content:null,reasoning_content:'KEEP_ONLY_ON_SERVER',tool_calls:[call('run_shell',{command:'anything'})]}};
    if(count===2)return {message:{role:'assistant',content:null,reasoning_content:'KEEP_TOO',tool_calls:[call('present_verified_solution',{...verified,steps:'invalid'})]}};
    return {message:{role:'assistant',content:null,reasoning_content:'DONE',tool_calls:[call('present_verified_solution',verified)]}};
  }};
  const result=await solve({question:'解方程 sqrt(x+2)=x'},()=>{},AbortSignal.timeout(10000),{client});
  assert.equal(result.solution.answer,'x=2');assert.equal(count,3);
  assert.equal(seen[1][2].reasoning_content,'KEEP_ONLY_ON_SERVER');assert.match(seen[1].at(-1).content,/未向本轮开放/);assert.match(seen[2].at(-1).content,/参数不符合/);
});
test('图片走官方图像格式，提示模式不开放计算工具或给出最终答案',async()=>{
  const client={status:async()=>({source:'test',defaultModel:'deepseek-flash',models:[{id:'deepseek-flash',image:true}]}),complete:async request=>{
    assert.equal(request.messages[1].content[1].type,'image_url');assert.match(request.messages[1].content[1].image_url.url,/^data:image\/png;base64,/);
    assert.ok(request.tools.every(tool=>!tool.name.startsWith('math_')));
    return {message:{role:'assistant',content:null,reasoning_content:'',tool_calls:[call('present_solution',{...solution,answer:'不应展示',overview:'尝试平方，但先检查非负条件'})]}};
  }};
  const result=await solve({question:'只给提示',mode:'hint',image:{mimeType:'image/png',data:'aGVsbG8='}},()=>{},AbortSignal.timeout(10000),{client});assert.equal(result.solution.answer,'');
});
