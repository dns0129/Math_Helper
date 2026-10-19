import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {solve} from '../lib/tutor.mjs';

if(!process.argv.includes('--live')){console.log('加 --live 使用现有订阅验证生成中的解答文字。');process.exit(0);}
const started=Date.now(),updates=[];
const result=await solve({question:'解方程 2x+5=17。请用约 200 字解释移项、除以系数的依据，说明公式条件并核对答案，不画图。',mode:'detailed',reasoning:'medium',level:'初中'},event=>{
  if(event.type==='answer_delta'){
    const update={atMs:Date.now()-started,characters:event.blocks.reduce((n,b)=>n+b.text.length,0),fields:event.blocks.map(b=>b.id)};updates.push(update);console.log(JSON.stringify(update));
  }else if(event.type==='progress')console.log(event.message);
});
const completedMs=Date.now()-started;
const evidence={createdAt:new Date().toISOString(),completedMs,updates,result};
await writeFile(new URL('../evidence/text-stream-live.json',import.meta.url),JSON.stringify(evidence,null,2));
assert.ok(updates.length>1,'必须接收到多次真实模型解答增量');
assert.ok(updates[0].atMs<completedMs,'讲解必须先于最终解答到达');
assert.ok(updates[0].characters<updates.at(-1).characters,'首次增量须为部分文字');
assert.ok(result.checks.length>0,'解题应保留实际数学复核');
console.log(JSON.stringify({passed:true,updates:updates.length,firstDeltaMs:updates[0].atMs,completedMs}));
