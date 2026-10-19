// Shared by the result card, streaming progress and Markdown export.
export function checkPresentation(check){
  const status=check.status || (check.operation==='derivative'?'COMPUTED':'NUMERICAL');
  const labels={PASS:'符号验证通过',FAIL:'验证未通过',INCONCLUSIVE:'尚未确认',ERROR:'计算未完成',NUMERICAL:'数值复核',COMPUTED:check.engine==='sympy'?'精确计算':'求导结果'};
  let expression=check.expression || '';
  if(check.operation==='solve')expression+=` = ${check.rhs || '0'}`;
  if(check.operation==='equivalent')expression+=` ≟ ${check.candidate}`;
  if(check.operation==='antiderivative')expression=`d/d${check.variable || 'x'} (${check.candidate}) ≟ ${expression}`;
  if(check.operation==='differentiate' || check.operation==='derivative')expression=`d/d${check.variable || 'x'} (${expression})`;
  if(check.operation==='integrate')expression=`∫ (${expression}) d${check.variable || 'x'}`;
  if(check.operation==='definite_integral')expression=`∫ [${check.lower}, ${check.upper}] (${expression}) d${check.variable || 'x'}`;
  if(check.operation==='limit')expression=`lim (${expression}), ${check.variable || 'x'} → ${check.point} (${check.direction || 'both'})`;
  if(check.operation==='matrix')expression=`${({determinant:'行列式',inverse:'逆矩阵',rank:'秩'})[check.matrixOperation || 'determinant']} ${JSON.stringify(check.matrix)}`;
  const notes=[];
  if(Object.keys(check.variables || {}).length)notes.push(`代入 ${Object.entries(check.variables).map(([k,v])=>`${k}=${v}`).join('，')}`);
  if(check.domain)notes.push(`${check.domainResolved===false?'定义域仍需人工确认，自动结果':'定义域'}：${check.domain}`);
  if(check.symbols?.length)notes.push(`假设：${check.symbols.map(s=>`${s.name}: ${s.assumption}`).join('，')}`);
  if(check.constraints?.length)notes.push(`原式条件：${check.constraints.join('；')}`);
  if(check.witness)notes.push(`反例：${Object.entries(check.witness).map(([k,v])=>`${k}=${v}`).join('，')}`);
  if(check.left!==undefined)notes.push(`左极限：${check.left}；右极限：${check.right}`);
  if(check.note)notes.push(check.note);
  return {status,label:labels[status] || '计算记录',expression,result:String(check.result ?? ''),notes};
}
export function checkSummary(checks){
  const counts=new Map();
  for(const check of checks){const {label}=checkPresentation(check);counts.set(label,(counts.get(label) || 0)+1);}
  return `计算记录 ${checks.length} 项 · ${[...counts].map(([label,n])=>`${label} ${n}`).join(' · ')}`;
}
export function checkText(check){
  const p=checkPresentation(check);
  return `${p.label}：${p.expression} → ${p.result}${p.notes.length?'\n'+p.notes.join('\n'):''}`;
}
