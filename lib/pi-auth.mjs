import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createModels} from '@earendil-works/pi-ai';
import {openaiCodexProvider} from '@earendil-works/pi-ai/providers/openai-codex';

export const provider='openai-codex';
const ownPath=resolve(process.env.MATH_AUTH_FILE || '.local/auth.json');
let writeQueue=Promise.resolve();
async function readOwn(){try{return JSON.parse(await readFile(ownPath,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw new Error('数学助手登录文件无法读取，请重新登录。');}}
function jwtExpiry(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).exp*1000;}catch{return 0;}}
async function sharedCredential(){
  const paths=[{path:resolve(homedir(),'.pi/agent/auth.json'),source:'本机 Pi 登录'},{path:resolve(process.env.CODEX_HOME || resolve(homedir(),'.codex'),'auth.json'),source:'本机 Codex 登录'}];
  for(const entry of paths){
    try{
      const data=JSON.parse(await readFile(entry.path,'utf8'));
      const stored=entry.source.includes('Pi')?data[provider]:null;
      const access=stored?.type==='oauth'?stored.access:data.auth_mode!=='apikey'?data.tokens?.access_token:null;
      const expires=access?jwtExpiry(access):0;
      if(access && expires>Date.now()+60000)return {source:entry.source,credential:{type:'oauth',access,refresh:'',expires}};
    }catch{}
  }
  throw new Error('未找到有效的 ChatGPT 订阅登录。点击「连接订阅」完成 Pi 登录，或先在 Codex 登录 ChatGPT。');
}
export const credentials={
  async read(id){const own=(await readOwn())[id];if(own){if(own.type!=='oauth')throw new Error('需要订阅 OAuth 登录。');return own;}if(id===provider)return (await sharedCredential()).credential;},
  async list(){return Object.entries(await readOwn()).map(([providerId,c])=>({providerId,type:c.type}));},
  modify(id,fn){
    const action=writeQueue.then(async()=>{
      const all=await readOwn();const updated=await fn(all[id]);
      if(updated===undefined)return all[id];
      all[id]=updated;
      await mkdir(dirname(ownPath),{recursive:true,mode:0o700});
      await writeFile(ownPath+'.tmp',JSON.stringify(all),{mode:0o600});
      await rename(ownPath+'.tmp',ownPath);return updated;
    });writeQueue=action.catch(()=>{});return action;
  },
  async delete(){throw new Error('请直接删除数学助手 .local/auth.json 以退出专用连接。');}
};
export const models=createModels({credentials});
models.setProvider(openaiCodexProvider());
const catalog=models.getModels(provider);
export const defaultModel='gpt-6.1-sol';
export async function authSource(){
  if((await readOwn())[provider]){await models.getAuth(provider,{signal:AbortSignal.timeout(15000)});return '数学助手专用 Pi OAuth';}
  return (await sharedCredential()).source;
}
let lastVerification=null;
export function markVerified(model){lastVerification={model,at:new Date().toISOString()};}
export async function authStatus(){
  const base={provider,defaultModel,models:catalog.map(m=>({id:m.id,name:m.name,image:m.input?.includes('image')})),billing:'ChatGPT / Codex 订阅额度',lastVerification};
  try{return {...base,connected:true,source:await authSource()};}catch(e){return {...base,connected:false,message:publicError(e)};}
}
export function publicError(error){
  const s=String(error?.message || error);
  if(/overload|servers.*busy|\b503\b|\b502\b/i.test(s))return '模型服务繁忙，请稍后重试，或在设置中选择另一个订阅模型。';
  if(/429|quota|rate.limit|usage.limit/i.test(s))return '订阅额度或调用速率达到限制，请稍后重试，或在 ChatGPT 查看用量。';
  if(/401|403|unauthorized|token.*expired/i.test(s))return '订阅登录已失效，或账户无所选模型权限。请重新连接订阅或换一个模型。';
  if(/abort|timeout|timed.out/i.test(s))return '解答已停止或超时，题目仍保留，可以重试。';
  if(/fetch|ENOTFOUND|ECONN|network/i.test(s))return '连接模型服务失败，请检查网络后重试。';
  return s.replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_.-]+|sk-[A-Za-z0-9_-]+/g,'[凭据已隐藏]').slice(0,400);
}
