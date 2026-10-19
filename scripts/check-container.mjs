import assert from 'node:assert/strict';
import {request} from 'node:http';
import {symbolic} from '../lib/sympy.mjs';
import {skillManifest} from '../lib/skills.mjs';

const origin=new URL(process.env.MATH_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL);
assert.equal(origin.protocol,'https:');
assert.ok(process.env.MATH_ACCESS_PASSWORD?.length>=24);
const authorization='Basic '+Buffer.from('owner:'+process.env.MATH_ACCESS_PASSWORD).toString('base64');
function get(path,authorized=false,{method='GET',headers={},body}={}){
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:process.env.PORT || 8791,path,method,headers:{Host:origin.host,...(authorized?{Authorization:authorization}:{}),...headers}},res=>{
      const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(parts).toString('utf8')}));
    });req.on('error',reject);req.end(body);
  });
}
let health;
for(let attempt=0;attempt<20;attempt++){
  try{health=await get('/healthz');if(health.status===200)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
}
assert.equal(health?.status,200);
assert.equal((await get('/')).status,401);
const page=await get('/',true);assert.equal(page.status,200);assert.match(page.text,/推演/);
for(const path of [...page.text.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(match=>match[1]))assert.equal((await get(path,true)).status,200);
const bootstrap=await get('/api/bootstrap',true);assert.equal(bootstrap.status,200);
const status=JSON.parse(bootstrap.text);assert.equal(status.deployment.mode,'cloud');assert.ok(status.csrf);
assert.match(bootstrap.headers['set-cookie'].join(';'),/Secure/);
const loginPage=await get('/access');assert.equal(loginPage.status,200);
const nonce=loginPage.text.match(/name="nonce" value="([a-f0-9]+)"/)[1];
const login=await get('/access',false,{method:'POST',headers:{Cookie:loginPage.headers['set-cookie'][0].split(';')[0],Origin:origin.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce,username:'owner',password:process.env.MATH_ACCESS_PASSWORD}).toString()});
assert.equal(login.status,303);
const ownerCookie=login.headers['set-cookie'].find(value=>value.startsWith('math_session=')).split(';')[0];
assert.equal((await get('/api/bootstrap',false,{headers:{Cookie:ownerCookie}})).status,200);
for(const path of ['/.local/auth.json','/.local/deepseek.json','/.env','/package.json'])assert.equal((await get(path,true)).status,404);
assert.deepEqual(skillManifest.map(skill=>skill.name),['math-skill','sympy']);
const check=await symbolic({operation:'solve',expression:'sqrt(x+2)',rhs:'x'});
assert.equal(check.result,'{2}');
assert.equal(status.provider,'deepseek');
console.log(JSON.stringify({ok:true,httpsOrigin:origin.origin,accessProtection:true,browserLogin:true,assets:true,secureSession:true,privatePathsClosed:true,provider:status.provider,skills:skillManifest.map(skill=>skill.name),sympy:check.result,deepseekConfigured:status.connected,authStorage:status.deployment.authStorage}));
