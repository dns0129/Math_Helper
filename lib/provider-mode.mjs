export function selectProvider(env=process.env){
  const selected=env.MATH_AI_PROVIDER || 'pi';
  if(!['pi','deepseek'].includes(selected))throw new Error('MATH_AI_PROVIDER 只能是 pi 或 deepseek。');
  return selected;
}
