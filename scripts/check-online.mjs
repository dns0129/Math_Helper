import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';

const status=JSON.parse(await readFile(new URL('../.local/online/status.json',import.meta.url),'utf8'));
const access=JSON.parse(await readFile(new URL('../.local/online/access.json',import.meta.url),'utf8'));
assert.equal(status.state,'running','临时发布尚未启动。');
const base=status.url;
const authorization='Basic '+Buffer.from(`${access.username}:${access.password}`).toString('base64');
const report={at:new Date().toISOString(),url:base,checks:[],cases:[]};
const save=()=>writeFile(new URL('../evidence/temporary-online-checks.json',import.meta.url),JSON.stringify(report,null,2));
const check=(name,actual,expected)=>{assert.equal(actual,expected,name);report.checks.push({name,actual,pass:true});console.log(`${name}: ${actual}`);};
const get=(path,auth=false)=>fetch(base+path,{headers:auth?{Authorization:authorization}:{},signal:AbortSignal.timeout(20000)});
try{
  check('公网 HTTPS 健康检查',(await get('/healthz')).status,200);
  check('未登录网页拒绝访问',(await get('/')).status,401);
  check('未登录 API 拒绝访问',(await get('/api/bootstrap')).status,401);
  const page=await get('/',true);check('登录后网页可访问',page.status,200);
  const html=await page.text();assert.match(html,/推演/);
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map(match=>match[1]);
  assert.ok(assets.length>=2);for(const asset of assets)check('网页静态资源 '+asset,(await get(asset,true)).status,200);
  const bootstrap=await get('/api/bootstrap',true);check('DeepSeek 状态接口',bootstrap.status,200);
  const cookie=bootstrap.headers.get('set-cookie');assert.match(cookie,/Secure/);assert.match(cookie,/HttpOnly/);
  const body=await bootstrap.json();assert.equal(body.connected,true,'DeepSeek 尚未配置。');
  report.subscription={connected:body.connected,source:body.source,model:body.defaultModel};
  const headers={Authorization:authorization,Cookie:cookie.split(';')[0],Origin:base,'X-Math-CSRF':body.csrf,'Content-Type':'application/json'};
  for(const path of ['/.local/auth.json','/.local/deepseek.json','/.local/online/access.json','/server.mjs'])check('凭据与源码路径关闭 '+path,(await get(path,true)).status,404);
  check('跨站请求拒绝',(await fetch(base+'/api/solve',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:JSON.stringify({question:'1+1'}),signal:AbortSignal.timeout(20000)})).status,403);
  const noCsrf={...headers};delete noCsrf['X-Math-CSRF'];
  check('缺失 CSRF 拒绝',(await fetch(base+'/api/solve',{method:'POST',headers:noCsrf,body:JSON.stringify({question:'1+1'}),signal:AbortSignal.timeout(20000)})).status,403);
  if(process.argv.includes('--live')){
    const cases=[
      {id:'radical',question:'在实数域解 sqrt(x+2)=x。用符号工具直接检查原方程的定义域和增根，解释公式、条件和推导逻辑。讲解保持简洁，不画图。',operation:'solve',result:'{2}'},
      {id:'integral',question:'计算反常积分 ∫_0^∞ x*exp(-x^2) dx。说明换元公式与收敛性，使用符号工具核对精确结果。简洁讲解，不画图。',operation:'definite_integral',result:'1/2'}
    ];
    for(const item of cases){
      console.log('开始公网真实解题：'+item.id);
      const start=performance.now();const record={id:item.id,question:item.question,draftUpdates:0};report.cases.push(record);
      const response=await fetch(base+'/api/solve',{method:'POST',headers,body:JSON.stringify({question:item.question,mode:'detailed',level:'大学',reasoning:'medium',model:body.defaultModel}),signal:AbortSignal.timeout(240000)});
      assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);
      const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',result;
      for(;;){
        const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});
        let end;while((end=pending.indexOf('\n\n'))>=0){
          const frame=pending.slice(0,end);pending=pending.slice(end+2);
          const data=frame.split('\n').filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)).join('\n');if(!data)continue;
          const event=JSON.parse(data),elapsed=Math.round(performance.now()-start);
          if(event.type==='error')throw new Error(event.message);
          if(event.type==='answer_delta'){record.firstDraftMs??=elapsed;record.lastDraftMs=elapsed;record.draftUpdates++;}
          if(event.type==='result'){result=event;record.resultMs=elapsed;}
        }
      }
      assert.ok(result,'公网流中没有完整解答。');assert.ok(record.draftUpdates>1,'公网未观察到连续文字更新。');
      assert.ok(record.firstDraftMs<record.resultMs,'解答完成前没有收到文字更新。');
      assert.deepEqual(result.skills.map(skill=>skill.name),['math-skill','sympy']);
      assert.ok(result.checks.some(c=>c.engine==='sympy' && c.operation===item.operation && c.completed && c.result===item.result),'SymPy 精确结果不匹配。');
      record.answer=result.solution.answer;record.symbolicChecks=result.checks;record.skills=result.skills;record.pass=true;
      console.log(JSON.stringify({id:item.id,pass:true,draftUpdates:record.draftUpdates,firstDraftMs:record.firstDraftMs,resultMs:record.resultMs,sympyResult:item.result}));await save();
    }
  }
  report.pass=true;await save();console.log('公网验收通过，证据已保存（不含密码、令牌和会话 Cookie）。');
}catch(error){report.pass=false;report.error=error.message;await save();throw error;}
