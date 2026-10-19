import {createDeepSeekClient} from './deepseek.mjs';
export {defaultModel} from './deepseek.mjs';
export const provider='deepseek';
export const deepseek=createDeepSeekClient();
export const authStatus=()=>deepseek.status();
export const authSource=()=>deepseek.source();
export const markVerified=model=>deepseek.markVerified(model);
export const configureDeepSeek=(key,signal)=>deepseek.configure(key,signal);
export function publicError(error){
  const text=String(error?.message || error);
  if(error?.name==='DeepSeekError')return text;
  if(/abort|timeout|timed.out/i.test(text))return '请求已停止或超时，题目仍保留，可以重试。';
  if(/fetch|ENOTFOUND|ECONN|network/i.test(text))return '连接 DeepSeek 失败，请检查云服务器网络后重试。';
  return text.replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_.-]+|sk-[A-Za-z0-9_-]+/g,'[凭据已隐藏]').slice(0,400);
}
