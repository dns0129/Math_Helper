import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// The app ships pinned copies: it does not depend on a particular Codex home folder.
function load(name){
  const root=new URL(`../codex-skills/${name}/`,import.meta.url);
  const text=readFileSync(new URL('SKILL.md',root),'utf8');
  const origin=JSON.parse(readFileSync(new URL('ORIGIN.json',root),'utf8'));
  return {text,metadata:{name,repository:origin.source_repository,commit:origin.source_commit,sha256:createHash('sha256').update(text).digest('hex')}};
}
const math=load('math-skill'),sympy=load('sympy');
export const skillManifest=[math.metadata,sympy.metadata];
export const skillInstructions=`已接入的数学技能规则：
先明确条件与定义域，再选适用公式，解释关键变形并代回原题。求全部解时说明解集完整性；保留约分排除值、平方增根限制和单位。优化检查驻点、边界；积分说明收敛和积分常数。精确值与近似值分开。
SymPy 用精确分数和已声明的变量假设；只支持工具列出的运算。数值抽样不证明恒等式，ConditionSet不代表无解。工具不支持的证明给出教学论证，不声称程序验证。`;
