import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const worker=fileURLToPath(new URL('../scripts/sympy_worker.py',import.meta.url));
const operations=new Set(['solve','differentiate','integrate','definite_integral','limit','equivalent','antiderivative','matrix']);

// Fixed worker, JSON over stdin, no shell, eval, arbitrary script or file argument.
export async function symbolic(input,{signal,timeoutMs=12000,python=process.env.MATH_PYTHON || 'python3'}={}){
  if(!input || !operations.has(input.operation))throw new Error('不支持的符号运算。');
  const payload=JSON.stringify(input);
  if(Buffer.byteLength(payload)>16000)throw new Error('符号运算输入过大。');
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child=spawn(python,['-I','-B',worker],{stdio:['pipe','pipe','pipe'],shell:false});
    let output='',size=0,settled=false;
    const finish=(error,result)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(error){child.kill('SIGKILL');reject(error);}else resolve(result);
    };
    const abort=()=>finish(signal.reason || new DOMException('已停止符号计算。','AbortError'));
    const timer=setTimeout(()=>finish(new Error('符号计算超过 12 秒，尚未得到结果。请缩小问题或改用推导。')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    child.on('error',()=>finish(new Error('无法启动本地 Python，请设置 MATH_PYTHON 为已安装 SymPy 的 Python 3 解释器。')));
    child.stdout.on('data',chunk=>{
      size+=chunk.length;if(size>64000)return finish(new Error('符号计算输出超出限制，尚未完成验证。'));
      output+=chunk.toString('utf8');
    });
    // Do not expose Python tracebacks or host paths to the model/browser.
    child.stderr.resume();
    child.stdin.on('error',()=>{});
    child.on('close',code=>{
      if(settled)return;
      if(code!==0)return finish(new Error('本地 SymPy 未完成计算。请检查 Python 中是否已安装 SymPy，或缩小表达式。'));
      try{
        const result=JSON.parse(output);
        if(!result.ok)return finish(new Error(result.error || '符号表达式无效。'));
        finish(null,result.check);
      }catch(error){finish(new Error('本地 SymPy 未返回有效计算结果。'));}
    });
    child.stdin.end(payload);
  });
}
