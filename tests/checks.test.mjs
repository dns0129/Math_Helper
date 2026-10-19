import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPresentation,checkSummary,checkText} from '../src/checks.js';
test('复核界面明确区分计算、通过、失败、未确认，兼容旧记录',()=>{
  const checks=[{engine:'sympy',status:'COMPUTED',operation:'solve',expression:'x^2+1',result:'EmptySet'},
    {engine:'sympy',status:'FAIL',expression:'sqrt(x^2)',candidate:'x',operation:'equivalent',witness:{x:'-2'},result:'Abs(x)-x'},
    {engine:'sympy',status:'INCONCLUSIVE',result:'ConditionSet'},
    {engine:'sympy',status:'ERROR',note:'尚未完成计算'},
    {expression:'2+3',result:5,operation:'evaluate'}];
  const summary=checkSummary(checks);
  assert.match(summary,/精确计算 1/);assert.match(summary,/验证未通过 1/);assert.match(summary,/尚未确认 1/);assert.match(summary,/数值复核 1/);
  assert.doesNotMatch(summary,/已通过/);
  assert.match(checkText(checks[1]),/反例：x=-2/);
  assert.equal(checkPresentation(checks[4]).label,'数值复核');
  assert.match(checkText({status:'PASS',domain:'x != 1',result:'0'}),/定义域：x != 1/);
});
