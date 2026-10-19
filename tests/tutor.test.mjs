import test from 'node:test';
import assert from 'node:assert/strict';
import {needsCalculation,createTutorTools,instructions} from '../lib/tutor.mjs';
import {skillManifest} from '../lib/skills.mjs';
import {calculationTools,normalizeLogCalls} from '../lib/tutor-policy.mjs';
test('数值解题要求工具复核，提示与纯符号证明不强制算出答案',()=>{
  assert.equal(needsCalculation({question:'解方程 2x+5=17'},'x=6'),true);
  assert.equal(needsCalculation({question:'2+3=?'},'5'),true);
  assert.equal(needsCalculation({question:'求二次函数 x^2-4x+3 的零点'},'1 和 3'),true);
  assert.equal(needsCalculation({question:'请给出正确解法：2x+5=17'},'x=6'),true);
  assert.equal(needsCalculation({image:{data:'image'}},'x=6'),true);
  assert.equal(needsCalculation({question:'求 2x+5=17 的解',mode:'hint'},''),false);
  assert.equal(needsCalculation({question:'证明勾股定理'},'证明完毕'),false);
});
test('真实双参数对数错误以换底公式恢复，保留错误与修正证据',async()=>{
  const session=createTutorTools({question:'解 log_2(x-1)=2。'});
  const response=await session.tools.find(t=>t.name==='math_symbolic').execute('log',{operation:'solve',expression:'log(x-1,2)',rhs:'2'});
  // An algebraic candidate check also covers SymPy versions that leave the logarithmic solve inconclusive.
  assert.equal(session.checks[0].status,'ERROR');
  assert.equal(response.details.recovery.kind,'log-change-of-base');
  assert.equal(response.details.expression,'(log(x-1)/log(2))');
  if(response.details.status==='INCONCLUSIVE')await session.tools.find(t=>t.name==='math_symbolic').execute('algebra',{operation:'solve',expression:'x-1',rhs:'4'});
  await session.tools.find(t=>t.name==='present_solution').execute('present',{...candidate,answer:'x=5'});
  assert.equal(session.checks.at(-1).completed,true);
});
test('换底处理嵌套与单参数log，其他表达式仍交给安全白名单',()=>{
  assert.equal(normalizeLogCalls('log(log(x,2)+1,3)'),'(log((log(x)/log(2))+1)/log(3))');
  assert.equal(normalizeLogCalls('log(x)+sqrt(x)'), 'log(x)+sqrt(x)');
  assert.equal(normalizeLogCalls('log(x,2,3)'), 'log(x,2,3)');
  assert.equal(normalizeLogCalls('log(x,2'), 'log(x,2');
});
test('重复计算复用结果，后续错误仍须恢复；错误恢复有上限',async()=>{
  let calls=0;
  const session=createTutorTools({question:'解方程 x=2'},()=>{},undefined,{symbolicRunner:async args=>{calls++;if(args.expression==='bad')throw new Error('bad');return {engine:'sympy',status:'COMPUTED',completed:true,result:'{2}'};}});
  const tools=Object.fromEntries(session.tools.map(t=>[t.name,t]));
  await tools.math_symbolic.execute('one',{operation:'solve',expression:'x',rhs:'2'});
  const reused=await tools.math_symbolic.execute('two',{rhs:'2',expression:'x',operation:'solve'});
  assert.equal(calls,1);assert.equal(reused.details.reused,true);
  for(let i=0;i<3;i++)await tools.math_symbolic.execute('bad',{operation:'solve',expression:'bad'});
  assert.equal(session.recoveryExhausted,true);
  await assert.rejects(tools.present_solution.execute('present',candidate),/重新计算/);
});
test('检查模式可报告真实反例，不能把用户错误候选当工具故障',async()=>{
  const session=createTutorTools({mode:'check',question:'检查 sqrt(x^2)=x'},()=>{},undefined,{symbolicRunner:async()=>({status:'FAIL',completed:true,result:'Abs(x)-x',witness:{x:'-2'}})});
  await session.tools.find(t=>t.name==='math_symbolic').execute('check',{operation:'equivalent',expression:'sqrt(x^2)',candidate:'x'});
  await session.tools.find(t=>t.name==='present_solution').execute('present',{...candidate,answer:'等式错误，x=-2是反例'});
  assert.equal(session.recoveryExhausted,false);
});
test('明确题型缩小工具范围，图像与混合题保留能力；无图题移除图形schema',()=>{
  assert.deepEqual(calculationTools({question:'求 x^3*exp(x) 的导数'}),['math_symbolic']);
  assert.deepEqual(calculationTools({question:'求患病概率'}),['math_calculate']);
  assert.deepEqual(calculationTools({question:'求最大体积'}),['math_symbolic','math_calculate']);
  assert.deepEqual(calculationTools({image:{},question:'求概率'}),['math_symbolic','math_calculate']);
  const noGraph=createTutorTools({question:'求导数，无需图形'}).tools.at(-1).parameters;
  const withGraph=createTutorTools({question:'求导数，请画图'}).tools.at(-1).parameters;
  assert.equal(noGraph.properties.diagrams.maxItems,0);assert.equal(withGraph.properties.diagrams.maxItems,3);
});
const candidate={answer:'x=2',diagrams:[],needsClarification:false};
test('计算题先复核后开放提交，条件不足仍可澄清',async()=>{
  const session=createTutorTools({question:'解方程 x=2'});
  const initial=session.availableTools || session.tools;
  assert.ok(!initial.some(t=>t.name==='present_solution'));
  assert.ok(initial.some(t=>t.name==='request_clarification'));
  await session.tools.find(t=>t.name==='math_symbolic').execute('calc',{operation:'solve',expression:'x',rhs:'2'});
  assert.ok(session.availableTools.some(t=>t.name==='present_solution'));
  assert.ok(!session.availableTools.some(t=>t.name==='request_clarification'));
  const incomplete=createTutorTools({question:'求三角形面积'});
  await incomplete.availableTools.find(t=>t.name==='request_clarification').execute('ask',{question:'请提供底边与对应高。'});
  assert.equal(incomplete.solution.needsClarification,true);assert.equal(incomplete.solution.answer,'');
  const photoProof=createTutorTools({image:{data:'image'},question:'证明图中的结论'});
  assert.ok(photoProof.availableTools.some(t=>t.name==='present_solution'));
});
test('对数题工具出错后不能绕过复核提交答案',async()=>{
  const session=createTutorTools({question:'解 log_2(x-1)+log_2(x-3)=3。'},()=>{},undefined,{symbolicRunner:async()=>{throw new Error('不支持的函数参数');}});
  await session.tools.find(t=>t.name==='math_symbolic').execute('bad',{operation:'solve',expression:'log(x-1,2)+log(x-3,2)',rhs:'3'});
  await assert.rejects(session.tools.find(t=>t.name==='present_solution').execute('present',{...candidate,answer:'x=5'}),/复核|相关计算/);
});
test('Agent 加载两份固定来源技能，提示模式没有会泄露计算结果的工具',async()=>{
  assert.deepEqual(skillManifest.map(s=>s.name),['math-skill','sympy']);
  assert.ok(skillManifest.every(s=>s.commit.length===40 && s.sha256.length===64));
  assert.match(instructions,/求全部解时说明解集完整性/);assert.match(instructions,/ConditionSet/);
  const session=createTutorTools({mode:'hint',question:'求 x^2-4=0'});
  assert.deepEqual(session.tools.map(t=>t.name),['present_solution']);
  await session.tools[0].execute('hint',candidate);
  assert.equal(session.solution.answer,'');assert.equal(session.checks.length,0);
});
test('真实 SymPy 工具调用会进入解答记录和进度事件，满足计算要求',async()=>{
  const events=[],session=createTutorTools({question:'解方程 x^2-4=0'},e=>events.push(e));
  const tools=Object.fromEntries(session.tools.map(t=>[t.name,t]));
  await assert.rejects(tools.present_solution.execute('too-early',candidate),/相关计算/);
  const response=await tools.math_symbolic.execute('solve',{operation:'solve',expression:'x^2-4'});
  assert.equal(response.details.result,'{-2, 2}');assert.equal(events[0].type,'check');
  await tools.present_solution.execute('present',candidate);
  assert.ok(session.solution);assert.equal(session.checks[0].engine,'sympy');
});
test('错误、未确认和失败验证不能让待求解的题目跳过复核',async()=>{
  for(const status of ['ERROR','FAIL','INCONCLUSIVE']){
    const session=createTutorTools({question:'解方程 x^2-4=0'},()=>{},undefined,{symbolicRunner:async()=>{
      if(status==='ERROR')throw new Error('未安装 SymPy');
      return {status,completed:status==='FAIL',result:'未通过'};
    }});
    await session.tools.find(t=>t.name==='math_symbolic').execute('bad',{operation:'solve',expression:'x^2-4'});
    assert.equal(session.checks[0].status,status);
    await assert.rejects(session.tools.find(t=>t.name==='present_solution').execute('present',candidate),/不能代替/);
  }
});
