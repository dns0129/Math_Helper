import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,differentiate,prepareDiagram} from '../lib/math.mjs';
test('核对二次函数零点、顶点与实际数值',()=>{
  assert.equal(calculate('x^2-4*x+3',{x:1}),0);
  assert.equal(calculate('x^2-4*x+3',{x:3}),0);
  assert.equal(calculate('x^2-4*x+3',{x:2}),-1);
  assert.equal(calculate('sqrt(3^2+4^2)'),5);
  assert.equal(calculate('sin(pi/2)'),1);
});
test('安全计算器拒绝代码、赋值、属性、矩阵和未声明变量',()=>{
  for(const expr of ['import("node:fs")','a=1','x.constructor','[1,2]','evaluate("2+2")','1;2','foo+1','random()'])assert.throws(()=>calculate(expr));
  assert.throws(()=>calculate('1/0'));
  assert.throws(()=>calculate('sqrt(-1)'));
  assert.throws(()=>calculate('x',{x:Infinity}));
});
test('工具求导后可以进行数值复核',()=>{
  assert.equal(calculate(differentiate('x^3+2*x'),{x:2}),14);
});
test('函数图样本与代数结果相符，保留几何标注',()=>{
  const d=prepareDiagram({kind:'function',range:{xMin:-1,xMax:5,yMin:-2,yMax:10},curves:[{expression:'x^2-4*x+3',label:'抛物线'}],points:[{x:2,y:-1,label:'顶点'}]});
  assert.equal(d.curves[0].samples.length,401);
  assert.deepEqual(d.curves[0].samples[200],[2,-1]);
  assert.equal(d.points[0].label,'顶点');
});
test('图形排除非法范围、负半径及可执行表达式',()=>{
  assert.throws(()=>prepareDiagram({range:{xMin:2,xMax:1,yMin:0,yMax:1}}));
  assert.throws(()=>prepareDiagram({circles:[{center:{x:0,y:0},radius:-1}]}));
  assert.throws(()=>prepareDiagram({curves:[{expression:'x=3'}]}));
});
