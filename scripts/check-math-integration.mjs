import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {authStatus} from '../lib/auth.mjs';
import {solve} from '../lib/tutor.mjs';

if(!process.argv.includes('--live')){
  console.log('请加 --live 运行四道真实模型题目；会使用当前 ChatGPT 订阅额度。');
  process.exit(0);
}
const status=await authStatus();
if(!status.connected)throw new Error('未找到可用订阅登录，无法执行真实模型验证。');
const cases=[
  {id:'radical',mode:'detailed',question:'在实数域解方程 sqrt(x+2)=x。说明平方可能产生增根的原因，必须把原方程直接交给符号工具并检查候选解。',
    verify:r=>assert.ok(r.checks.some(c=>c.engine==='sympy' && c.operation==='solve' && c.result==='{2}' && c.completed))},
  {id:'improper-integral',mode:'detailed',question:'计算从 0 到正无穷的反常积分 ∫ x*exp(-x^2) dx。解释换元公式与收敛性，并用本地符号积分工具核对精确结果。',
    verify:r=>assert.ok(r.checks.some(c=>c.engine==='sympy' && c.operation==='definite_integral' && c.result==='1/2' && c.completed))},
  {id:'check-false-identity',mode:'check',question:'我的解法：对任意实数 x，sqrt(x^2)=x，因为平方和开根号互相抵消。请定位第一个错误，用符号工具直接比较这个等式并找出反例。整体讲解保持简洁，约 300 字，不需要图形。',
    verify:r=>assert.ok(r.checks.some(c=>c.engine==='sympy' && c.operation==='equivalent' && c.status==='FAIL' && c.witness))},
  {id:'hint',mode:'hint',question:'解 x^2-5*x+6=0。只给第一步提示，先让我自己思考，不要出现两个根或最终答案。',
    verify:r=>{assert.equal(r.solution.answer,'');assert.equal(r.checks.length,0);assert.doesNotMatch(JSON.stringify(r.solution),/x\s*(?:=|\\\\?=)\s*[23](?:\D|$)/);}}
];
const selected=process.argv.includes('--case')?process.argv[process.argv.indexOf('--case')+1]:undefined;
if(selected && !cases.some(c=>c.id===selected))throw new Error('未知测试题目。');
const evidencePath=new URL('../evidence/math-app-live-checks.json',import.meta.url);
const evidence=selected?JSON.parse(await readFile(evidencePath,'utf8')):{createdAt:new Date().toISOString(),node:process.version,model:process.env.MATH_MODEL || status.defaultModel,cases:[]};
for(const item of cases.filter(c=>!selected || c.id===selected)){
  const input={question:item.question,mode:item.mode,level:'大学',model:evidence.model,reasoning:'medium'};
  console.log(`开始 ${item.id}`);
  const oldIndex=evidence.cases.findIndex(c=>c.id===item.id);
  const previous=oldIndex<0?undefined:evidence.cases[oldIndex];
  const record={id:item.id,input,startedAt:new Date().toISOString(),observedChecks:[]};
  if(previous){record.previousAttempts=[...(previous.previousAttempts || []),{input:previous.input,pass:previous.pass,error:previous.error,startedAt:previous.startedAt}];evidence.cases[oldIndex]=record;}else evidence.cases.push(record);
  try{
    record.result=await solve(input,event=>{if(event.type==='progress')console.log(event.message);if(event.type==='check'){record.observedChecks.push(event.check);console.log(JSON.stringify({operation:event.check.operation,status:event.check.status}));}});
    assert.deepEqual(record.result.skills.map(s=>s.name),['math-skill','sympy']);
    item.verify(record.result);record.pass=true;
    console.log(JSON.stringify({id:item.id,pass:true,checks:record.result.checks.map(c=>({operation:c.operation,status:c.status,result:c.result}))}));
  }catch(error){record.pass=false;record.error=error.message;process.exitCode=1;console.log(JSON.stringify({id:item.id,pass:false,error:error.message}));}
  record.finishedAt=new Date().toISOString();
  await writeFile(evidencePath,JSON.stringify(evidence,null,2));
}
