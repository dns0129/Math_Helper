import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createAppServer} from '../server.mjs';
import {runtimeConfig} from '../lib/runtime.mjs';

const password='a-long-owner-test-password-for-runtime';
const authorization='Basic '+Buffer.from('owner:'+password).toString('base64');
async function get(base,path,headers){
  return new Promise((resolve,reject)=>{
    const req=request(base+path,{headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });req.on('error',reject);req.end();
  });
}
test('线上监听必须有访问保护，真实公网域名必须使用 HTTPS',()=>{
  assert.throws(()=>runtimeConfig({bindHost:'0.0.0.0',publicUrl:'',accessPassword:''}),/访问密码|MATH_ACCESS_PASSWORD/);
  assert.throws(()=>runtimeConfig({publicUrl:'https://math.example.com',accessPassword:'short'}),/24/);
  assert.throws(()=>runtimeConfig({publicUrl:'http://math.example.com',accessPassword:password}),/HTTPS/);
  assert.throws(()=>runtimeConfig({publicUrl:'https://owner:password@math.example.com',accessPassword:password}),/协议和域名/);
  const local=runtimeConfig({bindHost:'127.0.0.1',publicUrl:'',accessPassword:''});
  assert.equal(local.protected,false);assert.equal(local.authorized(),true);
});
test('访问认证精确匹配，错误密码和用户名不会通过',()=>{
  const runtime=runtimeConfig({publicUrl:'https://math.example.com',accessPassword:password});
  assert.equal(runtime.authorized(authorization),true);
  for(const value of [undefined,'Bearer test','Basic invalid',authorization+'junk','Basic '+Buffer.from('other:'+password).toString('base64')])assert.equal(runtime.authorized(value),false);
});
test('云端网页和 API 受保护，安全 Cookie、固定域名和跨站限制生效',async t=>{
  const runtime=runtimeConfig({publicUrl:'https://math.example.com',accessPassword:password});
  const server=createAppServer({runtime,status:async()=>({connected:false}),solver:async()=>({solution:{title:'test'}})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Host:'math.example.com'};
  const health=await get(base,'/healthz',headers);assert.equal(health.status,200);assert.deepEqual(await health.json(),{ok:true,service:'tuiyan-math-assistant'});
  for(const path of ['/', '/api/bootstrap','/api/status'])assert.equal((await get(base,path,headers)).status,401);
  const bootstrap=await get(base,'/api/bootstrap',{...headers,Authorization:authorization});
  assert.equal(bootstrap.status,200);assert.match(bootstrap.headers.get('set-cookie'),/Secure/);assert.match(bootstrap.headers.get('strict-transport-security'),/max-age/);
  assert.equal((await get(base,'/api/bootstrap',{...headers,Authorization:authorization,Origin:'https://evil.example'})).status,403);
  assert.equal((await get(base,'/api/bootstrap',{Host:'evil.example',Authorization:authorization})).status,403);
});
