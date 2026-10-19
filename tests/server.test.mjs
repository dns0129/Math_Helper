import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createAppServer,validateInput} from '../server.mjs';
async function fixture(t,solver=async input=>({solution:{title:input.question},model:'test'})){
  const server=createAppServer({solver,status:async()=>({connected:true,source:'test',models:[]})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const bootstrap=await fetch(base+'/api/bootstrap');const data=await bootstrap.json();const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
  return {server,base,cookie,csrf:data.csrf};
}
test('题目、模式、图片签名和上下文长度受服务端限制',()=>{
  assert.equal(validateInput({question:'求 1+1'}).mode,'detailed');
  assert.throws(()=>validateInput({question:''}));
  assert.throws(()=>validateInput({question:'x'.repeat(8001)}));
  assert.throws(()=>validateInput({question:'1',mode:'unrestricted'}));
  assert.throws(()=>validateInput({image:{mimeType:'image/png',data:Buffer.from('fake-image-data').toString('base64')}}));
  assert.throws(()=>validateInput({question:'1',context:{question:'x'.repeat(65000),solution:{}}}));
});
test('本机 API 必须持有会话及正确 CSRF，拒绝跨站和伪造 Host',async t=>{
  const {base,cookie,csrf}=await fixture(t);
  const post=headers=>fetch(base+'/api/solve',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({question:'1+1'})});
  assert.equal((await post({})).status,401);
  assert.equal((await post({Cookie:cookie})).status,403);
  assert.equal((await post({Cookie:cookie,'X-Math-CSRF':csrf,Origin:'https://evil.example'})).status,403);
  const forged=await new Promise((resolve,reject)=>{const req=request(base+'/api/bootstrap',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(forged,403);
  const response=await post({Cookie:cookie,'X-Math-CSRF':csrf});assert.equal(response.status,200);assert.match(await response.text(),/"type":"result"/);
});
test('源代码、认证文件与路径穿越不能经静态服务读取',async t=>{
  const {base}=await fixture(t);
  for(const path of ['/.local/auth.json','/package.json','/lib/auth.mjs','/node_modules/','/assets/%2e%2e%2f%2e%2e%2fpackage.json'])assert.equal((await fetch(base+path)).status,404);
});
test('断开浏览器请求会取消后端解题',async t=>{
  let cancelled;const aborted=new Promise(resolve=>cancelled=resolve);
  const {base,cookie,csrf}=await fixture(t,async(input,send,signal)=>{send({type:'progress',message:'正在计算'});await new Promise(resolve=>signal.addEventListener('abort',()=>{cancelled();resolve();},{once:true}));signal.throwIfAborted();});
  const controller=new AbortController();const response=await fetch(base+'/api/solve',{method:'POST',headers:{Cookie:cookie,'X-Math-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({question:'x'}),signal:controller.signal});
  const reader=response.body.getReader();await reader.read();controller.abort();await Promise.race([aborted,new Promise((_,reject)=>setTimeout(()=>reject(new Error('服务未取消')),1500))]);
});
test('服务端失败通过 SSE 反馈并隐藏敏感令牌',async t=>{
  const {base,cookie,csrf}=await fixture(t,async()=>{throw new Error('failure Bearer secret-token-value');});
  const response=await fetch(base+'/api/solve',{method:'POST',headers:{Cookie:cookie,'X-Math-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({question:'x'})});
  const output=await response.text();assert.match(output,/"type":"error"/);assert.doesNotMatch(output,/secret-token-value/);
});
test('讲解增量先经 SSE 到达，完整解答随后返回',async t=>{
  let completed=false;
  const {base,cookie,csrf}=await fixture(t,async(input,send)=>{
    send({type:'answer_delta',id:'draft',blocks:[{id:'overview',text:'先确认条件'}]});
    await new Promise(resolve=>setTimeout(resolve,150));completed=true;
    return {solution:{title:'完成'}};
  });
  const response=await fetch(base+'/api/solve',{method:'POST',headers:{Cookie:cookie,'X-Math-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({question:'解题'})});
  const reader=response.body.getReader(),decoder=new TextDecoder();
  const first=decoder.decode((await reader.read()).value);
  assert.match(first,/answer_delta/);assert.doesNotMatch(first,/"type":"result"/);assert.equal(completed,false);
  let rest='';while(true){const {value,done}=await reader.read();if(done)break;rest+=decoder.decode(value);}
  assert.match(rest,/"type":"result"/);assert.equal(completed,true);
});
