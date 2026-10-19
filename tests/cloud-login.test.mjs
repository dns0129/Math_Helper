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

for(const cloud of [true,false])test(cloud?'云端登录选设备码，只传递用户所需授权信息，保留访问与 CSRF 检查':'本机保留浏览器授权，连接结果说明本机部署',async t=>{
  const password='test-cloud-owner-password-long-enough';
  const runtime=runtimeConfig({publicUrl:cloud?'https://math.example.com':'',accessPassword:cloud?password:'',bindHost:'127.0.0.1',authStorage:'persistent'});
  let selected,connected=false;
  const login=async(provider,type,interaction)=>{
    assert.equal(provider,'openai-codex');assert.equal(type,'oauth');
    selected=await interaction.prompt({type:'select',options:[{id:'browser'},{id:'device_code'}]});
    interaction.notify(cloud?{type:'device_code',userCode:'TEST-ONLY-CODE',verificationUri:'https://auth.openai.com/codex/device',expiresInSeconds:900,deviceAuthId:'must-never-be-sent'}:{type:'auth_url',url:'https://auth.openai.com/oauth/authorize'});
    connected=true;
  };
  const server=createAppServer({runtime,login,status:async()=>({connected})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const owner=cloud?{Host:'math.example.com',Authorization:'Basic '+Buffer.from('owner:'+password).toString('base64')}:{};
  const bootstrap=await send(base,'/api/bootstrap',{headers:owner});
  const data=await bootstrap.json();assert.deepEqual(data.deployment,{mode:cloud?'cloud':'local',authStorage:'persistent'});
  const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
  if(cloud)assert.equal((await send(base,'/api/login',{method:'POST',headers:{Host:'math.example.com'}})).status,401);
  assert.equal((await send(base,'/api/login',{method:'POST',headers:{...owner,Cookie:cookie}})).status,403);
  const response=await send(base,'/api/login',{method:'POST',headers:{...owner,Cookie:cookie,'X-Math-CSRF':data.csrf}});
  assert.equal(response.status,200);const text=await response.text();
  const events=text.trim().split('\n\n').map(line=>JSON.parse(line.slice(6)));
  assert.equal(selected,cloud?'device_code':'browser');
  assert.equal(events[0].type,cloud?'device_code':'auth_url');assert.doesNotMatch(text,/must-never-be-sent/);
  if(cloud)assert.deepEqual(events[0],{type:'device_code',userCode:'TEST-ONLY-CODE',verificationUri:'https://auth.openai.com/codex/device',expiresInSeconds:900});
  const result=events.find(event=>event.type==='connected');assert.equal(result.status.connected,true);assert.deepEqual(result.status.deployment,data.deployment);
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
