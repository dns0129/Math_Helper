import {createInterface} from 'node:readline/promises';
import {spawn} from 'node:child_process';
import {models,provider,publicError} from '../lib/pi-auth.mjs';
const rl=createInterface({input:process.stdin,output:process.stdout});
try{
  await models.login(provider,'oauth',{
    signal:AbortSignal.timeout(300000),
    prompt:p=>p.type==='select'?Promise.resolve(p.options[0].id):rl.question(p.message+' ',{signal:p.signal}),
    notify:e=>{if(e.type==='auth_url'){console.log('请在浏览器连接 ChatGPT：'+e.url);if(process.platform==='darwin'){const child=spawn('open',[e.url],{stdio:'ignore'});child.on('error',()=>{});}}else if(e.message)console.log(e.message);}
  });
  console.log('已连接。数学助手专用登录保存在 .local/auth.json，仅本机后端读取。');
}catch(e){console.error(publicError(e));process.exitCode=1;}finally{rl.close();}
