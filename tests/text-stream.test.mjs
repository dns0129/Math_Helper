import test from 'node:test';
import assert from 'node:assert/strict';
import {solutionDraftBlocks,createDraftEmitter} from '../lib/solution-draft.mjs';
import {TextQueue,textUnits} from '../src/text-stream.js';

test('中文与组合 emoji 逐字推进，公式完整出现，未闭合公式暂不显示',()=>{
  assert.deepEqual(textUnits('先👨‍👩‍👦看$x^2+1$再算'),['先','👨‍👩‍👦','看','$x^2+1$','再','算']);
  assert.deepEqual(textUnits('先算 $\\frac{x'),['先','算',' ']);
  const queue=new TextQueue();queue.update([{id:'a',text:'先逐字理解公式，再一步步代入数值，确认结果。'}]);
  assert.equal(queue.visible()[0].text,'');queue.advance(32);
  assert.ok(queue.visible()[0].text.length>0);assert.ok(queue.visible()[0].text.length<20);
  queue.finish();assert.equal(queue.pending,0);
});
test('流入的后续文字接着显示，修订文字只回到共同前缀',()=>{
  const queue=new TextQueue();queue.update([{id:'a',text:'先读题'}]);queue.finish();
  queue.update([{id:'a',text:'先读题，再说明条件。'}]);assert.equal(queue.visible()[0].text,'先读题');assert.ok(queue.pending>0);
  queue.finish();queue.update([{id:'a',text:'先读条件，再计算。'}]);assert.equal(queue.visible()[0].text,'先读');
  queue.finish();assert.equal(queue.visible()[0].text,'先读条件，再计算。');
});
test('新字段按语义顺序显示，最终文本可完整取回且不分割公式',()=>{
  const queue=new TextQueue();queue.update([{id:'a',text:'先读题。'},{id:'b',kind:'math',text:'x=\\frac{1}{2}'}]);
  for(let i=0;i<30 && queue.pending;i++)queue.advance(16);
  assert.equal(queue.visible().map(b=>b.text).join(''),'先读题。x=\\frac{1}{2}');
  assert.equal(queue.pending,0);
});
test('提示模式草稿不包含最终答案或隐藏字段，半截独立公式延后',()=>{
  const value={title:'题目',overview:'先比较系数',answer:'两个根',thinking:'private',steps:[{title:'第一步',explanation:'找和与积',latex:'\\frac{'}]};
  const blocks=solutionDraftBlocks(value,'hint');
  assert.ok(blocks.some(b=>b.id==='overview'));assert.ok(!blocks.some(b=>b.id==='answer' || b.id.endsWith('-latex')));
  assert.doesNotMatch(JSON.stringify(blocks),/private|两个根/);
  value.steps[0].latex='a+b=5';value.steps[0].why='展开比较系数';
  assert.ok(solutionDraftBlocks(value,'hint').some(b=>b.kind==='math' && b.text==='a+b=5'));
});
const update=(type,args,id='call-a',name='present_solution')=>({type:'message_update',assistantMessageEvent:{type,contentIndex:1,partial:{content:[{type:'thinking',thinking:'private'},{type:'toolCall',id,name,arguments:args}]}}});
test('Agent 流事件在解答提交前送出公开讲解，不发送思考、计算参数或原始 JSON',()=>{
  const sent=[],emitter=createDraftEmitter(e=>sent.push(e));
  emitter.accept(update('thinking_delta',{overview:'不应出现'}));
  emitter.accept(update('toolcall_delta',{expression:'private-expression'},'math','math_symbolic'));
  assert.equal(sent.length,0);
  emitter.accept(update('toolcall_delta',{overview:'开始讲解'}));
  assert.equal(sent[0].type,'answer_delta');assert.equal(sent[0].blocks[0].text,'开始讲解');
  emitter.accept(update('toolcall_end',{overview:'开始讲解，已说明公式。'}));
  assert.equal(sent.at(-1).blocks[0].text,'开始讲解，已说明公式。');
  assert.doesNotMatch(JSON.stringify(sent),/private/);emitter.close();
});
test('合并验算请求流出教学字段，内部计算与近似验证参数保持隐藏',()=>{
  const sent=[],emitter=createDraftEmitter(e=>sent.push(e));
  emitter.accept(update('toolcall_end',{overview:'先确定定义域',answer:'x=2',calculations:[{expression:'private-calculation'}],approximations:[{expression:'private-approximation'}]},'verified','present_verified_solution'));
  emitter.close();assert.ok(sent.length);assert.match(JSON.stringify(sent),/先确定定义域/);
  assert.doesNotMatch(JSON.stringify(sent),/private-|calculations|approximations/);
});
test('限频草稿在关闭时刷新一次，关闭后不再推送，重试使用新调用标识',async()=>{
  const sent=[],emitter=createDraftEmitter(e=>sent.push(e),{intervalMs:10});
  emitter.accept(update('toolcall_delta',{overview:'第一段'}));
  emitter.accept(update('toolcall_delta',{overview:'第二段'}));emitter.close();
  emitter.accept(update('toolcall_end',{overview:'不再出现'},'call-b'));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(sent.length,2);assert.equal(sent.at(-1).blocks[0].text,'第二段');
  const retried=[],newEmitter=createDraftEmitter(e=>retried.push(e));
  newEmitter.accept(update('toolcall_delta',{overview:'修正后的讲解'},'call-b'));newEmitter.close();
  assert.equal(retried[0].id,'call-b');
});
