// Routing only narrows clear text tasks; mixed, image and unknown tasks keep both engines.
export function calculationTools(input){
  if(input.mode==='hint')return [];
  const q=input.question || '';
  if(input.image || /最大|最小|最优化|剪去|检查.*解法/.test(q))return ['math_symbolic','math_calculate'];
  const symbolic=/方程|不等式|求导|导数|积分|极限|\blim\b|矩阵|行列式|恒等|sqrt|log|\bln\b|sin|cos|exp|x\s*(?:\^|\*)/i.test(q);
  const numerical=/概率|患病|灵敏度|三角形.*(?:三边|面积)|三边长|半径|多少|\d\s*[+*/-]\s*\d/.test(q);
  if(symbolic && !numerical)return ['math_symbolic'];
  if(numerical && !symbolic)return ['math_calculate'];
  return ['math_symbolic','math_calculate'];
}

// Syntax-only conversion. The rewritten expression still goes through the worker's whitelist.
export function normalizeLogCalls(expression){
  if(typeof expression!=='string')return expression;
  return rewrite(expression);
}
function rewrite(source){
  let result='',cursor=0;
  const re=/\blog\s*\(/g;
  for(let match;(match=re.exec(source));){
    const start=re.lastIndex;let depth=1,end=start,comma=-1,commas=0;
    for(;end<source.length;end++){
      if(source[end]==='(')depth++;
      else if(source[end]===')'){if(--depth===0)break;}
      else if(source[end]===',' && depth===1){comma=end;commas++;}
    }
    if(depth!==0)break;
    result+=source.slice(cursor,match.index);
    const inner=source.slice(start,end);
    result+=commas===1?`(log(${rewrite(source.slice(start,comma))})/log(${rewrite(source.slice(comma+1,end))}))`:`log(${rewrite(inner)})`;
    cursor=end+1;re.lastIndex=cursor;
  }
  return result+source.slice(cursor);
}

export function recoveryAdvice(check){
  if(check.status==='INCONCLUSIVE')return '尚未确认。保留原定义域，改用等价代数式或验证候选；ConditionSet不是无解。';
  if(check.status==='FAIL')return '候选未通过，请按反例或残差修正推导，再检查修正后的结果。';
  if(check.status==='ERROR')return '计算未完成。只用白名单数学表达式，乘法写*，log(a,b)改为log(a)/log(b)，其他变量须声明；修正后重新调用，不能直接提交。';
}
