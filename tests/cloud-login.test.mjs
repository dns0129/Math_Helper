import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createAppServer} from '../server.mjs';
import {runtimeConfig} from '../lib/runtime.mjs';
import {cloudAppUrl} from '../src/hosting.js';

function send(base,path,{method='GET',headers={},body}={}){
  return new Promise((resolve,reject)=>{
    const req=request(base+path,{method,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });req.on('error',reject);req.end(body);
  });
}

for(const cloud of [true,false])test(cloud?'云端 DeepSeek 配置受访问和 CSRF 保护，不回传密钥':'本机 DeepSeek 配置保存后可读取无密钥状态',async t=>{
  const password='test-cloud-owner-password-long-enough';
  const key='sk-test-only-1234567890abcdefghijkl';
  const runtime=runtimeConfig({publicUrl:cloud?'https://math.example.com':'',accessPassword:cloud?password:'',bindHost:'127.0.0.1',authStorage:'persistent'});
  let connected=false,received;
  const server=createAppServer({runtime,configure:async value=>{received=value;connected=true;},status:async()=>({provider:'deepseek',connected,source:'test'})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const owner=cloud?{Host:'math.example.com',Authorization:'Basic '+Buffer.from('owner:'+password).toString('base64')}:{};
  const bootstrap=await send(base,'/api/bootstrap',{headers:owner});
  const data=await bootstrap.json();assert.deepEqual(data.deployment,{mode:cloud?'cloud':'local',authStorage:'persistent'});
  const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
  const post=headers=>send(base,'/api/config/deepseek',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({apiKey:key})});
  if(cloud)assert.equal((await post({Host:'math.example.com'})).status,401);
  assert.equal((await post({...owner,Cookie:cookie})).status,403);
  assert.equal((await post({...owner,Cookie:cookie,'X-Math-CSRF':data.csrf,Origin:'https://evil.example'})).status,403);
  const response=await post({...owner,Cookie:cookie,'X-Math-CSRF':data.csrf});
  assert.equal(response.status,200);const output=await response.text();assert.equal(received,key);assert.doesNotMatch(output,new RegExp(key));assert.equal(JSON.parse(output).connected,true);
  assert.equal((await send(base,'/api/login',{method:'POST',headers:{...owner,Cookie:cookie,'X-Math-CSRF':data.csrf}})).status,404);
});

test('Pages 云端入口只接受不携带凭据的 HTTPS 站点根地址',()=>{
  assert.equal(cloudAppUrl(undefined),'');assert.equal(cloudAppUrl('  '),'');
  assert.equal(cloudAppUrl('https://math.example.com'),'https://math.example.com/');
  for(const value of ['http://math.example.com','javascript:alert(1)','https://owner:password@math.example.com','https://math.example.com/path','https://math.example.com/?token=secret','https://math.example.com/#secret'])assert.throws(()=>cloudAppUrl(value));
});

test('Render 公网地址直接采用平台默认环境变量，不依赖 Blueprint 自引用',t=>{
  const saved={MATH_PUBLIC_URL:process.env.MATH_PUBLIC_URL,RENDER_EXTERNAL_URL:process.env.RENDER_EXTERNAL_URL};
  t.after(()=>{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  delete process.env.MATH_PUBLIC_URL;process.env.RENDER_EXTERNAL_URL='https://math-example.onrender.com';
  const runtime=runtimeConfig({accessPassword:'test-cloud-owner-password-long-enough',authStorage:'ephemeral'});
  assert.equal(runtime.origin,'https://math-example.onrender.com');assert.deepEqual(runtime.deployment,{mode:'cloud',authStorage:'ephemeral'});
});
