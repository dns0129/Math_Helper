import {createHash,timingSafeEqual} from 'node:crypto';

export function runtimeConfig({publicUrl=process.env.MATH_PUBLIC_URL,accessPassword=process.env.MATH_ACCESS_PASSWORD,bindHost=process.env.MATH_BIND_HOST || '127.0.0.1'}={}){
  let url;
  if(publicUrl){
    try{url=new URL(publicUrl);}catch{throw new Error('MATH_PUBLIC_URL 须为网页的完整 HTTPS 地址。');}
    if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw new Error('MATH_PUBLIC_URL 只能包含协议和域名。');
    if(url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname))throw new Error('线上地址必须使用 HTTPS。');
  }
  const exposed=url || !['127.0.0.1','localhost','::1'].includes(bindHost);
  if(exposed && (!accessPassword || accessPassword.length<24))throw new Error('线上部署须配置至少 24 字符的 MATH_ACCESS_PASSWORD，保护个人订阅与解题服务。');
  const expected=accessPassword?createHash('sha256').update(`owner:${accessPassword}`).digest():null;
  return {
    bindHost,origin:url?.origin,host:url?.host,secure:url?.protocol==='https:',protected:Boolean(expected),
    authorized(header){
      if(!expected)return true;
      const match=typeof header==='string' && header.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i);
      if(!match)return false;
      const provided=createHash('sha256').update(Buffer.from(match[1],'base64')).digest();
      return timingSafeEqual(expected,provided);
    }
  };
}
