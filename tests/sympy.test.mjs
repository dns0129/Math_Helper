import test from 'node:test';
import assert from 'node:assert/strict';
import {symbolic} from '../lib/sympy.mjs';

test('完整实数解集保留分母排除值、检查增根与空集',async()=>{
  const polynomial=await symbolic({operation:'solve',expression:'x^2-5*x+6'});
  assert.equal(polynomial.result,'{2, 3}');
  assert.ok(polynomial.substitutions.every(s=>s.status==='PASS' && s.residual==='0'));
  const hole=await symbolic({operation:'solve',expression:'(x^2-1)/(x-1)',rhs:'2'});
  assert.equal(hole.result,'EmptySet');assert.equal(hole.completed,true);assert.match(hole.domain,/Interval.open/);
  assert.equal((await symbolic({operation:'solve',expression:'sqrt(x+2)',rhs:'x'})).result,'{2}');
  const empty=await symbolic({operation:'solve',expression:'x^2+1'});
  assert.equal(empty.result,'EmptySet');assert.equal(empty.status,'COMPUTED');
  assert.equal((await symbolic({operation:'solve',expression:'x^2+1',domain:'complex'})).result,'{-I, I}');
  assert.equal((await symbolic({operation:'solve',expression:'x^2-4',symbols:[{name:'x',assumption:'positive'}]})).result,'{2}');
});
test('精确算术、积分与反求导验证不依赖浮点抽样',async()=>{
  const exact=await symbolic({operation:'integrate',expression:'0.1+0.2'});
  assert.doesNotMatch(exact.result,/0\.300/);
  assert.equal((await symbolic({operation:'equivalent',expression:exact.result,candidate:'3*x/10'})).status,'PASS');
  assert.equal((await symbolic({operation:'definite_integral',expression:'x*exp(-x^2)',lower:'0',upper:'oo'})).result,'1/2');
  const primitive=await symbolic({operation:'antiderivative',expression:'x*sin(x)',candidate:'-x*cos(x)+sin(x)'});
  assert.equal(primitive.status,'PASS');assert.equal(primitive.result,'0');
  const derivative=await symbolic({operation:'differentiate',expression:'(x^2-1)/(x-1)'});
  assert.match(derivative.domain,/Interval.open/);
});
test('未知条件与振荡极限不能标成已完成，双侧极限检查方向',async()=>{
  const unknown=await symbolic({operation:'solve',expression:'cos(x)',rhs:'x'});
  assert.equal(unknown.status,'INCONCLUSIVE');assert.equal(unknown.completed,false);assert.match(unknown.result,/ConditionSet/);
  const oscillating=await symbolic({operation:'limit',expression:'sin(1/x)',point:'0'});
  assert.equal(oscillating.status,'INCONCLUSIVE');assert.equal(oscillating.completed,false);
  assert.equal((await symbolic({operation:'limit',expression:'sin(x)/x',point:'0'})).result,'1');
  const nonexistent=await symbolic({operation:'limit',expression:'1/x',point:'0'});
  assert.equal(nonexistent.result,'双侧极限不存在');assert.equal(nonexistent.left,'-oo');assert.equal(nonexistent.right,'oo');
});
test('符号等价检查尊重假设与原式定义域，并给出精确反例',async()=>{
  assert.equal((await symbolic({operation:'equivalent',expression:'sin(x)^2+cos(x)^2',candidate:'1'})).status,'PASS');
  const falseIdentity=await symbolic({operation:'equivalent',expression:'sqrt(x^2)',candidate:'x'});
  assert.equal(falseIdentity.status,'FAIL');assert.equal(falseIdentity.witness.x,'-2');
  assert.equal((await symbolic({operation:'equivalent',expression:'sqrt(x^2)',candidate:'x',symbols:[{name:'x',assumption:'positive'}]})).status,'PASS');
  const cancellation=await symbolic({operation:'equivalent',expression:'(x^2-1)/(x-1)',candidate:'x+1'});
  assert.equal(cancellation.status,'PASS');assert.match(cancellation.domain,/Interval.open/);
  const parameter=await symbolic({operation:'equivalent',expression:'1/y',candidate:'1/y',symbols:[{name:'y',assumption:'real'}]});
  assert.equal(parameter.status,'PASS');assert.ok(parameter.constraints.includes('Ne(y, 0)'));
  const conditional=await symbolic({operation:'solve',expression:'a*x',rhs:'1',symbols:[{name:'a',assumption:'real'}]});
  assert.equal(conditional.status,'INCONCLUSIVE');assert.equal(conditional.completed,false);
});
test('矩阵使用精确条目，拒绝奇异矩阵求逆及不规则矩阵',async()=>{
  const matrix=[['1','2'],['3','4']];
  assert.equal((await symbolic({operation:'matrix',matrix,matrixOperation:'determinant'})).result,'-2');
  assert.equal((await symbolic({operation:'matrix',matrix,matrixOperation:'inverse'})).result,'Matrix([[-2, 1], [3/2, -1/2]])');
  await assert.rejects(symbolic({operation:'matrix',matrix:[['1','2'],['2','4']],matrixOperation:'inverse'}));
  await assert.rejects(symbolic({operation:'matrix',matrix:[['1'],['2','3']]}));
});
test('数学接口拒绝代码、属性、未声明符号、超大幂和无效选项',async()=>{
  for(const expression of ['__import__("os").system("id")','x.__class__','[x for x in [1]]','(lambda: 1)()','open("/tmp/codex-math-test")','x=1','foo+1','2^1000','1e999','sin(x, 2)']){
    await assert.rejects(symbolic({operation:'differentiate',expression}),undefined,expression);
  }
  await assert.rejects(symbolic({operation:'solve',expression:'x',domain:'anything'}));
  await assert.rejects(symbolic({operation:'limit',expression:'x',point:'0',direction:'any'}));
  await assert.rejects(symbolic({operation:'exec',expression:'x'}));
});
test('Python 缺失、超时和取消会明确失败，不返回伪造成功',async()=>{
  await assert.rejects(symbolic({operation:'solve',expression:'x'}, {python:'/private/tmp/no-such-math-python'}),/无法启动/);
  await assert.rejects(symbolic({operation:'integrate',expression:'x'}, {timeoutMs:1}),/超过/);
  const controller=new AbortController();
  const pending=symbolic({operation:'integrate',expression:'x'},{signal:controller.signal});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
  await assert.rejects(symbolic({operation:'solve',expression:'x'},{signal:controller.signal}),{name:'AbortError'});
});
