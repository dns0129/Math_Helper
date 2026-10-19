import {spawn} from 'node:child_process';
const port=Number(process.env.PORT || 8791);
const url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{stdio:'inherit'});
let exited=false;
server.on('exit',code=>{exited=true;process.exitCode=code || 0;});
for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>server.kill(name));
for(let i=0;i<40&&!exited;i++){
  await new Promise(resolve=>setTimeout(resolve,250));
  if(exited)break;
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(1000)});
    if(response.ok){
      if(process.platform==='darwin' && process.env.MATH_NO_BROWSER!=='1'){const browser=spawn('open',[url],{stdio:'ignore'});browser.on('error',()=>{});}
      else console.log(`请打开 ${url}`);
      break;
    }
  }catch{}
}
