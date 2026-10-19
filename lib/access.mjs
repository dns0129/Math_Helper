import {randomBytes} from 'node:crypto';

export function ownerAccess(runtime,{now=Date.now}={}){
  const challenges=new Map();let failures=0;let retryAfter=0;
  const cookie=(name,value,path,maxAge)=>`${name}=${value}; HttpOnly; SameSite=Strict; Path=${path}; Max-Age=${maxAge}${runtime.secure?'; Secure':''}`;
  const loginCookie=req=>req.headers.cookie?.match(/(?:^|;\s*)math_login=([a-f0-9]{48})(?:;|$)/)?.[1];
  return {
    page(res,message='',code=200){
      if(code===429)res.setHeader('Retry-After','60');
      for(const [id,expires] of challenges)if(expires<now())challenges.delete(id);
      if(challenges.size>=200){res.writeHead(429,{'Content-Type':'text/plain; charset=utf-8','Retry-After':'60'});res.end('登录请求过多，请稍后重试。');return;}
      const nonce=randomBytes(24).toString('hex');challenges.set(nonce,now()+600000);
      res.writeHead(code,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':cookie('math_login',nonce,'/access',600)});
      res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · 推演数学助手</title><style>body{margin:0;background:#f5f3ef;color:#242b29;font:16px/1.6 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}main{width:min(360px,calc(100% - 80px));padding:32px;background:white;border:1px solid #deded7;border-radius:18px}h1{font-size:25px;margin:4px 0 12px}p{color:#636b66}label{display:block;margin-top:18px}input,button{box-sizing:border-box;width:100%;font:inherit;border-radius:8px;padding:11px 12px}input{border:1px solid #bfc7c0;margin-top:6px}button{margin-top:24px;border:0;background:#28614b;color:white;cursor:pointer}.error{color:#a82929}</style><main><h1>推演 · 数学助手</h1><p>登录你的云端数学助手</p>${message?`<p class="error" role="alert">${message}</p>`:''}<form action="/access" method="post"><input type="hidden" name="nonce" value="${nonce}"><label>用户名<input name="username" value="owner" autocomplete="username" required readonly></label><label>访问密码<input name="password" type="password" autocomplete="current-password" required minlength="24" maxlength="1024" autofocus></label><button type="submit">登录数学助手</button></form></main></html>`);
    },
    async verify(req){
      if(retryAfter>now())return {code:429,message:'密码尝试过于频繁，请一分钟后重试。'};
      if(req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return {code:400,message:'登录格式无效，请重试。'};
      const chunks=[];let length=0;
      for await(const chunk of req){length+=chunk.length;if(length>4096)return {code:400,message:'登录内容过长。'};chunks.push(chunk);}
      const body=new URLSearchParams(Buffer.concat(chunks).toString());const nonce=loginCookie(req);
      const expires=challenges.get(nonce);challenges.delete(nonce);
      if(!nonce || body.get('nonce')!==nonce || !expires || expires<now())return {code:403,message:'登录页面已过期，请重新输入密码。'};
      const header='Basic '+Buffer.from(`${body.get('username')}:${body.get('password')}`).toString('base64');
      if(!runtime.authorized(header)){
        if(++failures>=10){failures=0;retryAfter=now()+60000;}
        return {code:401,message:'用户名或访问密码不正确。'};
      }
      failures=0;return {ok:true};
    },
    clearCookie:()=>cookie('math_login','','/access',0)
  };
}
