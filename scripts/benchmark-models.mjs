import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {models,provider,authStatus,publicError} from '../lib/auth.mjs';
import {solve} from '../lib/tutor.mjs';

const out=new URL(`../evidence/${process.env.MATH_BENCHMARK_DIR || 'model-benchmark-2026-10-13'}/`,import.meta.url);
const questions=[
 ['radical','根式方程','在实数域解方程 sqrt(x+2)=x，检查增根。','x=2；候选 -1 不满足原式，定义域及右侧非负限制。'],
 ['rational','分式与定义域','在实数域解方程 (x^2-1)/(x-1)=2，保留原式定义域。','无解；x≠1，约分后候选 x=1 被排除。'],
 ['logarithm','对数方程','解 log_2(x-1)+log_2(x-3)=3。','x=5；定义域 x>3；候选 -1 排除。'],
 ['derivative','乘积求导','求 f(x)=x^3*exp(x) 的导数并说明所用法则。','f′(x)=exp(x)*(x^3+3*x^2)，乘积法则。'],
 ['integral','反常积分','计算从 0 到正无穷的反常积分 ∫ x*exp(-x^2) dx，并说明收敛性。','1/2；有限截断积分为 (1-exp(-R^2))/2，R→∞。'],
 ['limit','极限','计算 lim_{x→0} (x-sin(x))/x^3。','1/6；Taylor 展开至三阶并说明余项或三次洛必达。'],
 ['matrix','矩阵','求矩阵 A=[[1,2,3],[0,1,4],[5,6,0]] 的行列式，并判断是否可逆。','det(A)=1，非零所以可逆。'],
 ['bayes','条件概率','某病患病率 1%，检测灵敏度 90%，未患病者假阳性率 5%。随机一人检测阳性，求其实际患病概率（精确分数和百分比）。','P(D|+)=0.009/(0.009+0.0495)=2/13≈15.3846%；贝叶斯与全概率。'],
 ['geometry','三角形面积','三角形三边长分别为 13、14、15 厘米，求面积及内切圆半径。','半周长21，Heron面积84 cm²，r=S/s=4 cm。'],
 ['optimization','最优化','用长20厘米、宽12厘米的矩形纸片，在四角各剪去边长x厘米的正方形，折成无盖盒子。求使体积最大的x和最大体积，检查可行域与边界。','0<x<6；V=x(20-2x)(12-2x)；x=(16-2*sqrt(19))/3≈2.4274；Vmax=(1792+1216*sqrt(19))/27≈262.682；边界体积0，另一个驻点不可行。'],
].map(([id,topic,question,expected])=>({id,topic,question,expected}));
const suffix='请用简体中文给出关键公式、使用理由、必要推导、最终结论和检验。讲解尽量控制在500字以内，无需图形。';
const retryOnly=process.argv.includes('--retry-failures');
const report=retryOnly?JSON.parse(await readFile(new URL('results.json',out),'utf8')):{startedAt:new Date().toISOString(),node:process.version,method:{models:['gpt-6.1-sol','gpt-6-luna'],reasoning:'medium',mode:'detailed',level:'大学',order:'先 Sol 10 题，再 Luna 同样10题；逐题串行；每题独立上下文；首轮不重试，补测另记',timing:'performance.now()；solve开始至完整返回；含工具、鉴权和全部模型回合',tokens:'Pi provider usage；input不含缓存，cacheRead/cacheWrite单列；output含reasoning子集；totalTokens为服务返回总量；失败未返回usage时不能把SDK默认0认定为实际0消耗',scope:'现有数学助手 Agent 与计算工具的端到端表现，非纯模型闭卷测试',timeoutMs:240000,suffix},questions,records:[]};
await mkdir(out,{recursive:true});
if(!retryOnly){
  try{await readFile(new URL('results.json',out));throw new Error('输出目录已有结果，请用MATH_BENCHMARK_DIR指定新目录；补测用--retry-failures。');}catch(error){if(error.code!=='ENOENT')throw error;}
  report.sourceHashes=Object.fromEntries(await Promise.all(['lib/tutor.mjs','lib/tutor-policy.mjs','lib/skills.mjs','lib/schema.mjs','lib/verified-turn.mjs','lib/solution-draft.mjs'].map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
}
const status=await authStatus();
if(!status.connected)throw new Error(status.message);
for(const id of report.method.models)if(!models.getModel(provider,id))throw new Error(`模型不存在：${id}`);
report.authSource=status.source;
let current;
const original=models.streamSimple.bind(models);
models.streamSimple=(model,context,options)=>{
 const record=current;
 const turn={index:record.turns.length+1,requestedModel:model.id,startedAt:new Date().toISOString()};
 record.turns.push(turn);
 const start=performance.now();
 const stream=original(model,context,{...options,onPayload(payload){turn.payloadModel=payload.model;turn.reasoning=payload.reasoning;turn.toolNames=payload.tools?.map(t=>t.name);turn.requestBytes=Buffer.byteLength(JSON.stringify(payload));},onProviderStreamEvent(event){if(event.response?.usage)turn.providerUsage=event.response.usage;if(event.type==='response.function_call_arguments.delta' && turn.firstArgumentDeltaMs===undefined)turn.firstArgumentDeltaMs=performance.now()-start;}});
 stream.result().then(message=>{turn.durationMs=performance.now()-start;turn.usage=message.usage;turn.stopReason=message.stopReason;turn.model=message.model;turn.toolCalls=message.content?.filter(c=>c.type==='toolCall').map(c=>({name:c.name,arguments:c.arguments}));if(message.errorMessage)turn.error=publicError(message.errorMessage);});
 return stream;
};
await writeFile(new URL('results.json',out),JSON.stringify(report,null,2));
const requestedCase=process.argv.includes('--case')?process.argv[process.argv.indexOf('--case')+1]:undefined;
if(requestedCase && !questions.some(q=>q.id===requestedCase))throw new Error('未知题目。');
const plan=(retryOnly?[...new Map(report.records.filter(r=>!r.success && !report.records.some(s=>s.success && s.model===r.model && s.id===r.id)).map(r=>[r.model+':'+r.id,{model:r.model,q:questions.find(q=>q.id===r.id)}])).values()]:report.method.models.flatMap(model=>questions.map(q=>({model,q})))).filter(({q})=>!requestedCase || q.id===requestedCase);
for(const {model,q} of plan){
  const record={model,id:q.id,topic:q.topic,attempt:report.records.filter(r=>r.model===model && r.id===q.id).length+1,startedAt:new Date().toISOString(),turns:[],checks:[]};
  current=record;report.records.push(record);
  console.log(JSON.stringify({event:'start',model,id:q.id}));
  const start=performance.now();
  try{record.result=await solve({question:q.question+'\n'+suffix,model,reasoning:'medium',mode:'detailed',level:'大学'},e=>{if(e.type==='check')record.checks.push(e.check);},AbortSignal.timeout(240000));record.success=true;}
  catch(error){record.success=false;record.error=publicError(error);}
  record.durationMs=performance.now()-start;
  record.finishedAt=new Date().toISOString();
  record.usage={input:0,output:0,cacheRead:0,cacheWrite:0,reasoning:0,totalTokens:0};
  for(const turn of record.turns)for(const key of Object.keys(record.usage))record.usage[key]+=turn.usage?.[key] || 0;
  record.usage.inputIncludingCache=record.usage.input+record.usage.cacheRead+record.usage.cacheWrite;
  record.usage.tokenIdentityValid=record.usage.totalTokens===record.usage.inputIncludingCache+record.usage.output;
  await writeFile(new URL('results.json',out),JSON.stringify(report,null,2));
  console.log(JSON.stringify({event:'done',model,id:q.id,success:record.success,seconds:record.durationMs/1000,usage:record.usage,turns:record.turns.length,error:record.error}));
}
report.finishedAt=new Date().toISOString();
await writeFile(new URL('results.json',out),JSON.stringify(report,null,2));
console.log('BENCHMARK_COMPLETE');
