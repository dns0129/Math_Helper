import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {authStatus,models,provider,publicError} from './lib/auth.mjs';
import {solve} from './lib/tutor.mjs';
import {runtimeConfig} from './lib/runtime.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.png':'image/png','.ico':'image/x-icon'};
const random=()=>randomBytes(24).toString('hex');
export function validateInput(body){
  if(!body || typeof body!=='object')throw new Error('题目格式无效。');
  const question=String(body.question || '').trim();
  if(question.length>8000 || (!question && !body.image))throw new Error('请输入题目（最多 8000 字）或上传图片。');
  const mode=body.mode || 'detailed';const reasoning=body.reasoning || 'medium';
  if(!['detailed','hint','check'].includes(mode) || !['medium','high'].includes(reasoning))throw new Error('解答设置无效。');
  const level=body.level || '自动判断';
  if(!['自动判断','初中','高中','大学'].includes(level))throw new Error('学习程度无效。');
  let image;
  if(body.image){
    const {data,mimeType}=body.image;
    if(!['image/png','image/jpeg','image/webp'].includes(mimeType) || typeof data!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error('只支持 PNG、JPG、WebP 图片。');
    const bytes=Buffer.from(data,'base64');
    if(bytes.length>6*1024*1024 || bytes.length<12)throw new Error('图片应小于 6 MB。');
    const actual=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255 && bytes[1]===216 && bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
    if(actual!==mimeType)throw new Error('图片内容与格式不一致。');
    image={data,mimeType};
  }
  let context;
  if(body.context){
    if(typeof body.context.question!=='string' || typeof body.context.solution!=='object' || !body.context.solution || JSON.stringify(body.context).length>64000)throw new Error('追问上下文过长或无效，请开启新题。');
    context={question:body.context.question,solution:body.context.solution};
  }
  return {question,mode,reasoning,level,image,context,model:typeof body.model==='string'?body.model:undefined};
}
async function bodyJson(req){
  const parts=[];let length=0;
  for await (const chunk of req){length+=chunk.length;if(length>9*1024*1024)throw new Error('请求内容过大。');parts.push(chunk);}
  try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw new Error('请求 JSON 无效。');}
}
export function createAppServer({solver=solve,status=authStatus,runtime=runtimeConfig()}={}){
  const sessions=new Map();const logins=new Map();let activeRequests=0;
  const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(runtime.secure)res.setHeader('Strict-Transport-Security','max-age=15552000');
    const port=req.socket.localPort;
    const allowedHosts=runtime.host?[runtime.host]:[`127.0.0.1:${port}`,`localhost:${port}`];
    if(!allowedHosts.includes(req.headers.host))return json(res,403,{error:'只允许本机访问。'});
    const origin=runtime.origin || `http://${req.headers.host}`;
    if((req.headers.origin && req.headers.origin!==origin) || req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'已拒绝跨站请求。'});
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,origin).pathname);}catch{return json(res,400,{error:'路径无效。'});}
    if(pathname==='/healthz' && req.method==='GET')return json(res,200,{ok:true,service:'tuiyan-math-assistant'});
    if(!runtime.authorized(req.headers.authorization)){
      res.setHeader('WWW-Authenticate','Basic realm="Math Assistant", charset="UTF-8"');
      return json(res,401,{error:'请用 owner 和部署时设置的访问密码登录数学助手。'});
    }
    const cookie=req.headers.cookie?.match(/(?:^|;\s*)math_session=([a-f0-9]{48})(?:;|$)/)?.[1];
    let session=sessions.get(cookie);
    if(session && session.expires<Date.now()){sessions.delete(cookie);session=null;}
    try{
      if(pathname==='/api/bootstrap' && req.method==='GET'){
        if(!session){
          for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);
          if(sessions.size>=100)return json(res,429,{error:'本机会话过多，请稍后重试。'});
          const id=random();session={id,csrf:random(),expires:Date.now()+86400000};sessions.set(id,session);
          res.setHeader('Set-Cookie',`math_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${runtime.secure?'; Secure':''}`);
        }
        return json(res,200,{csrf:session.csrf,...await status()});
      }
      if(pathname.startsWith('/api/')){
        if(!session)return json(res,401,{error:'页面会话已过期，请刷新页面。'});
        if(req.method==='POST' && req.headers['x-math-csrf']!==session.csrf)return json(res,403,{error:'请求验证失败，请刷新页面。'});
        if(pathname==='/api/status' && req.method==='GET')return json(res,200,await status());
        if(pathname==='/api/solve' && req.method==='POST'){
          const input=validateInput(await bodyJson(req));
          if(activeRequests>=2)return json(res,429,{error:'已有两道题正在解答，请稍后再试。'});
          activeRequests++;
          const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),240000);
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
          res.flushHeaders();
          const send=event=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(event)}\n\n`);};
          const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},12000);
          res.on('close',()=>{if(!res.writableEnded)controller.abort();});
          try{const result=await solver(input,send,controller.signal);send({type:'result',...result});}
          catch(error){send({type:'error',message:publicError(error)});}
          finally{activeRequests--;clearTimeout(timeout);clearInterval(heartbeat);res.end();}
          return;
        }
        if(pathname==='/api/login' && req.method==='POST'){
          if(logins.size)return json(res,409,{error:'已有订阅登录正在进行，请完成或取消它。'});
          const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),300000);
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
          res.flushHeaders();
          const send=e=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(e)}\n\n`);};
          const entry={controller,resolve:null};logins.set(session.id,entry);
          res.on('close',()=>{if(!res.writableEnded)controller.abort();});
          const keepalive=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},12000);
          try{
            await models.login(provider,'oauth',{
              signal:controller.signal,
              notify:e=>send(e.type==='auth_url'?{type:'auth_url',url:e.url}:{type:'progress',message:e.message || '请在浏览器完成登录…'}),
              prompt:p=>{
                if(p.type==='select')return Promise.resolve(p.options[0].id);
                send({type:'prompt',message:p.message});
                return new Promise((resolve,reject)=>{
                  const abort=()=>{entry.resolve=null;reject(new Error('登录已取消。'));};
                  p.signal?.addEventListener('abort',abort,{once:true});
                  entry.resolve=value=>{p.signal?.removeEventListener('abort',abort);entry.resolve=null;resolve(value);};
                });
              }
            });
            send({type:'connected',status:await status()});
          }catch(error){send({type:'error',message:publicError(error)});}
          finally{clearTimeout(timeout);clearInterval(keepalive);entry.resolve=null;logins.delete(session.id);res.end();}
          return;
        }
        if(pathname==='/api/login/code' && req.method==='POST'){
          const entry=logins.get(session.id);const body=await bodyJson(req);
          if(!entry?.resolve)return json(res,409,{error:'当前没有等待输入的登录流程。'});
          if(typeof body.code!=='string' || !body.code.trim() || body.code.length>4096)return json(res,400,{error:'请输入有效的回调地址或授权码。'});
          entry.resolve(body.code.trim());return json(res,200,{ok:true});
        }
        return json(res,404,{error:'接口不存在。'});
      }
      if(req.method!=='GET' && req.method!=='HEAD')return json(res,405,{error:'方法不支持。'});
      if(pathname!=='/' && !pathname.startsWith('/assets/'))return json(res,404,{error:'文件不存在。'});
      const file=resolve(root,'dist',pathname==='/'?'index.html':'.'+pathname);
      if(!file.startsWith(resolve(root,'dist')+'/') || pathname.includes('..') || !mime[extname(file)])return json(res,404,{error:'文件不存在。'});
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':pathname==='/'?'no-cache':'public, max-age=31536000, immutable'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch(error){
      if(error.code==='ENOENT')return json(res,404,{error:'请先运行 npm run build 构建数学助手。'});
      if(!res.headersSent)json(res,400,{error:publicError(error)});else res.end();
    }
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT || 8791);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT 应为 1024–65535 的整数。');
  await stat(resolve(root,'dist/index.html')).catch(()=>{throw new Error('请先运行 npm run build。');});
  const server=createAppServer();
  const runtime=runtimeConfig();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请关闭已有窗口或使用其他 PORT。`:publicError(e));process.exitCode=1;});
  server.listen(port,runtime.bindHost,()=>console.log(`推演数学助手已启动：${runtime.origin || `http://127.0.0.1:${port}`}\n按 Ctrl+C 停止。`));
  for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
}
