import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorTools} from '../lib/tutor.mjs';

const answer={title:'根式方程',subject:'代数',overview:'平方并检查增根',givens:[],formulas:[],steps:[{title:'筛选',explanation:'排除负根并代回',why:''}],answer:'x=2',verification:'代回原式成立',pitfalls:[],diagrams:[],followups:[],needsClarification:false};
const request={...answer,calculations:[{engine:'math_symbolic',operation:'solve',expression:'sqrt(x+2)',rhs:'x'}],approximations:[]};

test('一次提交执行真实验算后才接收解答，不需要第二次模型请求',async()=>{
  const events=[],session=createTutorTools({question:'在实数域解方程 sqrt(x+2)=x'},e=>events.push(e));
  const tool=session.availableTools.find(t=>t.name==='present_verified_solution');
  assert.ok(tool,'计算与解答应在同一工具请求中提供');
  assert.ok(!session.availableTools.some(t=>t.name==='present_solution'));
  const result=await tool.execute('one',request);
  assert.equal(result.terminate,true);assert.equal(session.solution.answer,'x=2');
  assert.equal(session.checks[0].result,'{2}');assert.ok(events.some(e=>e.type==='check'));
  assert.equal(session.solution.calculations,undefined);
});
test('合并请求仍拦截工具未确认和错误数值近似，并开放纠错计算',async()=>{
  const session=createTutorTools({question:'求最大体积'},()=>{},undefined,{symbolicRunner:async()=>({status:'COMPUTED',completed:true,result:'exact'})});
  const tool=session.availableTools.find(t=>t.name==='present_verified_solution');assert.ok(tool);
  const response=await tool.execute('wrong',{...request,approximations:[{expression:'64*(28+19*sqrt(19))/27',value:272.3,decimalPlaces:1}]});
  assert.equal(response.terminate,undefined);assert.equal(session.solution,undefined);
  assert.equal(session.checks.at(-1).status,'FAIL');
  assert.ok(session.availableTools.some(t=>t.name==='math_calculate'));
  const recovered=await tool.execute('right',{...request,approximations:[{expression:'64*(28+19*sqrt(19))/27',value:262.68,decimalPlaces:2}]});
  assert.equal(recovered.terminate,true);
  const inconclusive=createTutorTools({question:'求极限'},()=>{},undefined,{symbolicRunner:async()=>({status:'INCONCLUSIVE',completed:false,result:'Limit(...)'})});
  await inconclusive.availableTools.find(t=>t.name==='present_verified_solution').execute('unknown',request);
  assert.equal(inconclusive.solution,undefined);
});
test('图片和提示保留原有流程，合并提交不允许绕过验算',async()=>{
  for(const input of [{question:'求 x',image:{}},{question:'求 x',mode:'hint'}]){
    assert.ok(!createTutorTools(input).availableTools.some(t=>t.name==='present_verified_solution'));
  }
  const session=createTutorTools({question:'求2+3'}),tool=session.availableTools.find(t=>t.name==='present_verified_solution');assert.ok(tool);
  const invalid=await tool.execute('empty',{...request,calculations:[]});
  assert.equal(invalid.terminate,undefined);assert.equal(session.solution,undefined);
});
