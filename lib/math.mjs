import {create, all} from 'mathjs';

const math = create(all, {number: 'number'});
const functions = new Set(['sin','cos','tan','asin','acos','atan','sqrt','abs','exp','log','log10','floor','ceil','round','min','max']);
const operators = new Set(['+','-','*','/','^','%']);
export function expressionNode(expression, variables = ['x']) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 300) throw new Error('表达式应为 1–300 个字符。');
  const node = math.parse(expression);
  let count = 0;
  node.traverse(n => {
    if (++count > 100) throw new Error('表达式过于复杂。');
    if (n.isConstantNode && typeof n.value === 'number' && Number.isFinite(n.value)) return;
    if (n.isSymbolNode && (variables.includes(n.name) || ['pi','e',...functions].includes(n.name))) return;
    if (n.isParenthesisNode) return;
    if (n.isOperatorNode && operators.has(n.op)) return;
    if (n.isFunctionNode && n.fn.isSymbolNode && functions.has(n.fn.name) && n.args.length <= 8) return;
    throw new Error('只支持数值、变量和常用数学函数。');
  });
  return node;
}
export function calculate(expression, variables = {}) {
  if (!variables || Array.isArray(variables) || typeof variables !== 'object' || Object.keys(variables).length > 12) throw new Error('变量格式不正确。');
  for (const [key,value] of Object.entries(variables)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(key) || ['pi','e',...functions].includes(key) || !Number.isFinite(value)) throw new Error('变量必须是有限数值。');
  }
  const result = expressionNode(expression, Object.keys(variables)).compile().evaluate(variables);
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('计算结果不在有限实数范围内。');
  return Number(result.toPrecision(14));
}
export function differentiate(expression) {
  expressionNode(expression);
  return math.derivative(expression, 'x').toString();
}
export function prepareDiagram(diagram) {
  const d = structuredClone(diagram);
  const range = d.range || {xMin:-5,xMax:5,yMin:-5,yMax:5};
  for (const name of ['xMin','xMax','yMin','yMax']) if (!Number.isFinite(range[name]) || Math.abs(range[name]) > 1e6) throw new Error('图表坐标范围无效。');
  if (range.xMax <= range.xMin || range.yMax <= range.yMin) throw new Error('图表范围上限应大于下限。');
  d.range = range;
  if ((d.curves?.length || 0) > 6 || (d.points?.length || 0) > 30 || (d.segments?.length || 0) > 40 || (d.circles?.length || 0) > 8) throw new Error('图形元素过多。');
  d.curves = (d.curves || []).map(c => {
    const compiled = expressionNode(c.expression).compile();
    const samples = Array.from({length:401},(_,i) => {
      const x = range.xMin + (range.xMax-range.xMin)*i/400;
      try { const y=compiled.evaluate({x}); return typeof y==='number' && Number.isFinite(y) && Math.abs(y)<1e9 ? [x,y] : null; } catch { return null; }
    });
    if (!samples.some(Boolean)) throw new Error('曲线在指定区间没有实数值。');
    return {...c,latex:expressionNode(c.expression).toTex(),samples};
  });
  const finitePoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Math.abs(p.x)<=1e6 && Math.abs(p.y)<=1e6;
  if ((d.points || []).some(p=>!finitePoint(p)) || (d.segments || []).some(s=>!finitePoint(s.from)||!finitePoint(s.to)) || (d.circles || []).some(c=>!finitePoint(c.center)||!Number.isFinite(c.radius)||c.radius<=0||c.radius>1e6)) throw new Error('图形坐标无效。');
  return d;
}
