import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,chmod,stat,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,request} from 'node:http';
import {once} from 'node:events';

const root=fileURLToPath(new URL('../',import.meta.url));
const folder=resolve(root,'.local/online');
const statusPath=resolve(folder,'status.json');
const accessPath=resolve(folder,'access.json');
const passwordPath=resolve(folder,'访问密码.txt');
const lockPath=resolve(folder,'run.lock');
const port=Number(process.env.MATH_TUNNEL_PORT || 8793);
const script=fileURLToPath(import.meta.url);
function isPublisher(pid){
  if(!Number.isInteger(pid) || pid<2)return false;
  try{return execFileSync('/bin/ps',['-ww','-p',String(pid),'-o','command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8'}}).includes(script);}catch{return false;}
}
async function previousStatus(){try{return JSON.parse(await readFile(statusPath,'utf8'));}catch{return {};}}
await mkdir(folder,{recursive:true,mode:0o700});
await chmod(folder,0o700);
await writeFile(resolve(folder,'known_hosts'),'',{flag:'a',mode:0o600});
await chmod(resolve(folder,'known_hosts'),0o600);
const previous=await previousStatus();
if(process.argv.includes('--stop')){
  if(isPublisher(previous.publisherPid)){process.kill(previous.publisherPid,'SIGTERM');console.log('已停止临时发布；本机 8791 服务继续运行。');}
  else console.log('没有正在运行的临时发布。');
  process.exit(0);
}
if(isPublisher(previous.publisherPid)){
  console.log(`临时发布已在运行：${previous.url || '正在连接隧道'}\n访问密码：${passwordPath}`);
  process.exit(0);
}
if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('MATH_TUNNEL_PORT 应为 1024–65535 的整数。');
await stat(resolve(root,'dist/index.html')).catch(()=>{throw new Error('请先运行 npm run build，或双击「临时上线数学助手.command」。');});
await rm(lockPath,{recursive:true,force:true});
await mkdir(lockPath,{mode:0o700});
// 先确认独立端口空闲，避免把隧道接到已有的其他服务。
const probe=createServer();
probe.listen(port,'127.0.0.1');
try{await once(probe,'listening');}catch{await rm(lockPath,{recursive:true,force:true});throw new Error(`端口 ${port} 已被占用，临时上线未启动。`);}
await new Promise(resolve=>probe.close(resolve));
let access;
try{access=JSON.parse(await readFile(accessPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('访问密码文件损坏，请检查 .local/online/access.json。');}
if(!access){access={username:'owner',password:randomBytes(32).toString('base64url')};await writeFile(accessPath,JSON.stringify(access,null,2),{mode:0o600,flag:'wx'});}
if(access.username!=='owner' || typeof access.password!=='string' || access.password.length<24)throw new Error('访问密码配置无效。');
await chmod(accessPath,0o600);
await writeFile(passwordPath,`用户名：owner\n密码：${access.password}\n\n当前网址请查看同目录 status.json。请勿分享密码或上传此目录。\n`,{mode:0o600});
await chmod(passwordPath,0o600);
let tunnel,backend,awake,stopping=false,activeUrl,queue=Promise.resolve();
async function saveStatus(state){
  await writeFile(statusPath,JSON.stringify({temporary:true,provider:'localhost.run',port,publisherPid:process.pid,tunnelPid:tunnel?.pid,backendPid:backend?.pid,url:activeUrl,updatedAt:new Date().toISOString(),...state},null,2),{mode:0o600});
}
async function stopChild(child){
  if(!child || child.exitCode!==null || child.signalCode!==null)return;
  const closed=once(child,'close').catch(()=>{});
  child.kill('SIGTERM');
  const timer=setTimeout(()=>child.kill('SIGKILL'),4000);
  await closed;clearTimeout(timer);
}
async function shutdown(code=0){
  if(stopping)return;stopping=true;
  await Promise.all([stopChild(tunnel),stopChild(backend),stopChild(awake)]);
  await saveStatus({state:'stopped'});
  await rm(lockPath,{recursive:true,force:true});
  console.log('临时公网访问已停止。');process.exit(code);
}
for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>shutdown());
async function localHealth(){
  for(let i=0;i<40;i++){
    if(stopping)throw new Error('临时上线已取消。');
    try{
      const ok=await new Promise((resolve,reject)=>{
        const req=request({hostname:'127.0.0.1',port,path:'/healthz',headers:{Host:new URL(activeUrl).host},timeout:1000},res=>{res.resume();resolve(res.statusCode===200);});
        req.on('timeout',()=>req.destroy());req.on('error',reject);req.end();
      });
      if(ok)return;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('后端未能启动，请查看错误信息。');
}
async function activate(url){
  if(stopping || activeUrl===url && backend?.exitCode===null)return;
  const oldBackend=backend;backend=undefined;
  await stopChild(oldBackend);
  if(stopping)return;
  activeUrl=url;
  backend=spawn(process.execPath,[resolve(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),MATH_BIND_HOST:'127.0.0.1',MATH_PUBLIC_URL:url,MATH_ACCESS_PASSWORD:access.password},stdio:['ignore','pipe','pipe']});
  const current=backend;
  backend.stdout.on('data',data=>process.stdout.write(data));backend.stderr.on('data',data=>process.stderr.write(data));
  backend.on('error',e=>{console.error(`后端启动失败：${e.message}`);shutdown(1);});
  backend.on('close',()=>{if(!stopping && backend===current){console.error('临时发布后端已退出。');shutdown(1);}});
  await localHealth();
  await saveStatus({state:'running'});
  await writeFile(passwordPath,`临时网页：${url}\n用户名：owner\n密码：${access.password}\n\n保持 Mac 开机和联网。请勿分享密码或上传此目录。\n`,{mode:0o600});
  console.log(`\n临时网页：${url}\n用户名：owner\n访问密码保存在：${passwordPath}\nMac 必须开机、联网；按 Ctrl+C 停止。免费地址可能变化。\n`);
}
function readTunnelEvent(line){
  let event;try{event=JSON.parse(line);}catch{return;}
  if(event.type!=='v1.tcpip_forward.register.accepted' || typeof event.data!=='string')return;
  const match=event.data.match(/https:\/\/([a-z0-9-]+\.(?:lhr\.life|localhost\.run))(?:[\s\r\n]|$)/i);
  if(match){const url=`https://${match[1].toLowerCase()}`;queue=queue.then(()=>activate(url)).catch(error=>{console.error(error.message);return shutdown(1);});}
}
function connect(){
  console.log('正在连接免费 HTTPS 隧道…');
  tunnel=spawn('/usr/bin/ssh',['-F','/dev/null','-o','IdentityAgent=none','-o','IdentityFile=none','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${resolve(folder,'known_hosts')}`,'-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-o','ConnectTimeout=20','-T','-R',`80:127.0.0.1:${port}`,'nokey@localhost.run','--','--output','json'],{cwd:root,stdio:['ignore','pipe','pipe']});
  let pending='';const current=tunnel;
  const readyTimeout=setTimeout(()=>{if(!activeUrl){console.error('隧道未返回有效公网地址，请重试。');shutdown(1);}},45000);
  tunnel.stdout.on('data',chunk=>{
    pending+=chunk.toString();if(pending.length>128000){console.error('隧道响应过大，已停止。');shutdown(1);return;}
    let newline;while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline).trim();pending=pending.slice(newline+1);readTunnelEvent(line);}
  });
  tunnel.stderr.on('data',data=>process.stderr.write(data));
  tunnel.on('error',e=>{console.error(`隧道启动失败：${e.message}`);shutdown(1);});
  tunnel.on('close',()=>{
    clearTimeout(readyTimeout);
    if(!stopping && tunnel===current){console.error('公网隧道已断开。重新运行启动器可获得新地址。');shutdown(1);}
  });
}
await saveStatus({state:'connecting'});
if(process.platform==='darwin'){awake=spawn('/usr/bin/caffeinate',['-i'],{stdio:'ignore'});awake.on('error',()=>{});}
connect();
