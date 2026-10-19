import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createAppServer} from '../server.mjs';
import {runtimeConfig} from '../lib/runtime.mjs';

const password='a-long-owner-test-password-for-form';
async function fixture(t){
  const runtime=runtimeConfig({publicUrl:'https://math.example.com',accessPassword:password});
  const server=createAppServer({runtime,status:async()=>({connected:false}),solver:async()=>({solution:{title:'test'}})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const call=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{Host:'math.example.com',...headers}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()}));
    });req.on('error',reject);req.end(body);
  });
  const form=async()=>{
    const response=await call('/access');
    return {response,cookie:response.headers['set-cookie'][0].split(';')[0],nonce:response.text.match(/name="nonce" value="([a-f0-9]+)"/)[1]};
  };
  const submit=({cookie,nonce},overrides={})=>call('/access',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded',Origin:'https://math.example.com'},body:new URLSearchParams({nonce,username:'owner',password,...overrides}).toString()});
  return {call,form,submit};
}
test('云端浏览器进入普通登录页，跨站导航可到达入口而 API 仍被拒绝',async t=>{
  const {call,form}=await fixture(t);
  const root=await call('/',{headers:{Accept:'text/html','Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'}});
  assert.equal(root.code,303);assert.equal(root.headers.location,'/access');assert.equal(root.headers['www-authenticate'],undefined);
  const {response}=await form();assert.equal(response.code,200);assert.match(response.text,/type="password"/);assert.doesNotMatch(response.text,new RegExp(password));
  assert.match(response.headers['set-cookie'][0],/HttpOnly; SameSite=Strict; Path=\/access; Max-Age=600; Secure/);
  assert.equal((await call('/api/bootstrap')).code,401);
  assert.equal((await call('/api/bootstrap',{headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'}})).code,403);
});
test('表单登录建立安全会话，Cookie 可访问 API 但 POST 仍须 CSRF',async t=>{
  const {call,form,submit}=await fixture(t);
  const result=await submit(await form());assert.equal(result.code,303);assert.equal(result.headers.location,'/');
  const cookie=result.headers['set-cookie'].find(value=>value.startsWith('math_session=')).split(';')[0];
  assert.match(result.headers['set-cookie'].join(' '),/HttpOnly; SameSite=Strict; Path=\/; Max-Age=86400; Secure/);
  const bootstrap=await call('/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(bootstrap.code,200);
  const csrf=JSON.parse(bootstrap.text).csrf;assert.ok(csrf);
  const post=headers=>call('/api/solve',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',...headers},body:JSON.stringify({question:'1+1'})});
  assert.equal((await post({})).code,403);assert.equal((await post({'X-Math-CSRF':csrf})).code,200);
  assert.equal((await call('/.local/auth.json',{headers:{Cookie:cookie}})).code,404);
});
test('错误密码、伪造或重复 nonce 和跨站登录无法取得会话',async t=>{
  const {call,form,submit}=await fixture(t);
  const challenge=await form();
  assert.equal((await submit(challenge,{nonce:'0'.repeat(48)})).code,403);
  assert.equal((await submit(challenge)).code,403);
  assert.equal((await submit(await form(),{password:'incorrect-password'})).code,401);
  assert.equal((await submit(await form(),{username:'other'})).code,401);
  const cross=await form();
  const result=await call('/access',{method:'POST',headers:{Cookie:cross.cookie,Origin:'https://evil.example','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce:cross.nonce,username:'owner',password}).toString()});
  assert.equal(result.code,403);assert.equal(result.headers['set-cookie'],undefined);
});
test('连续错误登录会限流，不能通过无限尝试猜测个人密码',async t=>{
  const {form,submit}=await fixture(t);
  for(let attempt=0;attempt<10;attempt++)assert.equal((await submit(await form(),{password:'wrong'})).code,401);
  const limited=await submit(await form());assert.equal(limited.code,429);assert.equal(limited.headers['retry-after'],'60');
  assert.doesNotMatch(limited.headers['set-cookie'].join(' '),/math_session=/);
});
