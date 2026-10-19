import {createDeepSeekClient} from './deepseek.mjs';
import {selectProvider} from './provider-mode.mjs';
export const activeProvider=selectProvider();
export const provider=activeProvider==='pi'?'openai-codex':'deepseek';
export const defaultModel=activeProvider==='pi'?'gpt-6.1-sol':'deepseek-flash';
export const deepseek=createDeepSeekClient();
const pi=()=>import('./pi-auth.mjs');
export const authStatus=async()=>activeProvider==='pi'?(await pi()).authStatus():deepseek.status();
export const authSource=async()=>activeProvider==='pi'?(await pi()).authSource():deepseek.source();
export const markVerified=async model=>activeProvider==='pi'?(await pi()).markVerified(model):deepseek.markVerified(model);
export const loginPi=async(...args)=>(await pi()).models.login(...args);
export const configureDeepSeek=(key,signal)=>deepseek.configure(key,signal);
export function publicError(error){
  const text=String(error?.message || error);
  if(error?.name==='DeepSeekError')return text;
  if(/overload|servers.*busy|\b503\b|\b502\b/i.test(text))return '模型服务繁忙，请稍后重试。';
  if(/429|quota|rate.limit|usage.limit/i.test(text))return '模型额度或调用速率达到限制，请稍后重试。';
  if(/401|403|unauthorized|token.*expired/i.test(text))return activeProvider==='pi'?'订阅登录已失效或模型权限不足，请重新连接 Pi / ChatGPT。':'DeepSeek API Key 无效或无权限，请检查配置。';
  if(/abort|timeout|timed.out/i.test(text))return '请求已停止或超时，题目仍保留，可以重试。';
  if(/fetch|ENOTFOUND|ECONN|network/i.test(text))return '连接模型服务失败，请检查网络后重试。';
  return text.replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_.-]+|sk-[A-Za-z0-9_-]+/g,'[凭据已隐藏]').slice(0,400);
}
