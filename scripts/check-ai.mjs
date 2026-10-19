import {authStatus} from '../lib/auth.mjs';
import {solve} from '../lib/tutor.mjs';
const status=await authStatus();
console.log(JSON.stringify(status,null,2));
if(!status.connected)process.exitCode=1;
else if(process.argv.includes('--live')){
  try{
    const result=await solve({question:'求函数 y=x^2-4x+3 的两个零点、顶点和最小值。请画出图像，并用计算工具检验零点。',model:process.env.MATH_MODEL || status.defaultModel,reasoning:'medium',mode:'detailed',level:'高中'},e=>{if(e.type==='progress')console.log(e.message);});
    console.log(JSON.stringify(result,null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
