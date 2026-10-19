import json, statistics, hashlib
from pathlib import Path

root=Path(__file__).resolve().parents[1]
baseline=root/'evidence/model-benchmark-optimized-final-2026-10-13'
out=root/'evidence/model-benchmark-single-turn-2026-10-14'
old=json.loads((baseline/'results.json').read_text())
new=json.loads((out/'results.json').read_text())
before=json.loads((baseline/'summary.json').read_text())
after=json.loads((out/'summary.json').read_text())
assert [(q['id'],q['question']) for q in old['questions']]==[(q['id'],q['question']) for q in new['questions']]
assert all(old['method'][k]==new['method'][k] for k in ['models','reasoning','mode','level','suffix','timeoutMs'])
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==v for p,v in new['sourceHashes'].items())
models=new['method']['models']
complete=lambda data,m:[next(r for r in data['records'] if r['model']==m and r['id']==q['id'] and r['success']) for q in data['questions']]
calls=lambda data,m:sum(len(r['turns']) for r in complete(data,m))
changes={}
lines=['# 同题提速与token复测','',
 '在上一轮精简版本上，将明确文字计算题的验算参数和教学解答合并到一次模型请求；安全计算仍在本机执行，通过后才接收最终解答。小数近似按声明精度核对，失败继续纠正。图片、追问、提示、检查解法和纯证明保留原流程。', '',
 'OpenAI官方延迟指南建议合并可顺序完成的步骤以减少请求往返；此实现保留本地验证门槛。[官方说明](https://developers.openai.com/api/docs/guides/latency-optimization)', '',
 '复用同样10道题、原始提示后缀、大学详细模式、medium档位、相同模型和240秒超时。token含缓存，reasoning属于输出子集；均选每题首次完整返回的回答，数学评分另行人工审阅。未重答数学错误以提高分数。', '',
 '|指标|Sol 上一版|Sol 本版|Luna 上一版|Luna 本版|','|---|---:|---:|---:|---:|']
a,b=models
rows=[('完整回答token',lambda s:f"{s['successfulAnswerTokens']['totalTokens']:,}"),
 ('输入token，含缓存',lambda s:f"{s['successfulAnswerTokens']['inputIncludingCache']:,}"),
 ('输出token',lambda s:f"{s['successfulAnswerTokens']['output']:,}"),
 ('完整答案准确率',lambda s:f"{s['fullyCorrect']}/{s['accuracyDenominator']}"),
 ('平均用时',lambda s:f"{s['meanSuccessfulSeconds']:.2f}秒"),
 ('中位用时',lambda s:f"{s['medianSuccessfulSeconds']:.2f}秒"),
 ('首轮完整返回',lambda s:f"{s['firstSuccessful']}/10"),
 ('含失败、补测的每题总耗时',lambda s:f"{s['meanTotalAttemptSecondsPerQuestion']:.2f}秒"),
 ('全部尝试已知token',lambda s:f"{s['allAttemptsKnownTokens']:,}"),
 ('全部尝试模型请求',lambda s:str(s['modelRequests'])),
 ('未返回usage的请求',lambda s:str(s['unreportedUsageTurns']))]
for name,fn in rows:lines.append('|'+name+'|'+'|'.join(fn(s) for s in [before[a],after[a],before[b],after[b]])+'|')
lines+=['|完整10题中的请求数|'+'|'.join(str(calls(d,m)) for d,m in [(old,a),(new,a),(old,b),(new,b)])+'|','','## 实测判断','']
for m in models:
 x,y=before[m],after[m]
 changes[m]={'tokenReductionPercent':(1-y['successfulAnswerTokens']['totalTokens']/x['successfulAnswerTokens']['totalTokens'])*100,
  'meanTimeReductionPercent':(1-y['meanSuccessfulSeconds']/x['meanSuccessfulSeconds'])*100,
  'noTokenIncrease':y['successfulAnswerTokens']['totalTokens']<=x['successfulAnswerTokens']['totalTokens'],
  'faster':y['meanSuccessfulSeconds']<x['meanSuccessfulSeconds'],
  'noAccuracyDrop':y['fullyCorrect']>=x['fullyCorrect'],
  'successfulModelRequestsBefore':calls(old,m),'successfulModelRequestsAfter':calls(new,m)}
 c=changes[m]
 yesno=lambda value:'是' if value else '否'
 lines.append(f"- {m}：token{'减少' if c['tokenReductionPercent']>=0 else '增加'}{abs(c['tokenReductionPercent']):.1f}%，平均用时{'缩短' if c['meanTimeReductionPercent']>=0 else '增加'}{abs(c['meanTimeReductionPercent']):.1f}%。本题集不增加token：{yesno(c['noTokenIncrease'])}；提速：{yesno(c['faster'])}；准确率未下降：{yesno(c['noAccuracyDrop'])}。")
lines+=['','## 逐题对比','', '|题型|Sol token：前→后|Sol 秒：前→后|Luna token：前→后|Luna 秒：前→后|','|---|---:|---:|---:|---:|']
for q in new['questions']:
 cells=[]
 for m in models:
  x=next(r for r in complete(old,m) if r['id']==q['id']);y=next(r for r in complete(new,m) if r['id']==q['id'])
  cells.extend([f"{x['usage']['totalTokens']:,}→{y['usage']['totalTokens']:,}",f"{x['durationMs']/1000:.2f}→{y['durationMs']/1000:.2f}"])
 lines.append('|'+q['topic']+'|'+'|'.join(cells)+'|')
lines+=['','## 边界与验证','',
 'Luna最优化题把导数方程的根误写为2和10/3，最终给出x=2及体积256；工具实际返回(16±2sqrt(19))/3。该题仍判错，未重答提高分数。虽然完整准确率与上一版同为9/10，本轮该题的精确结论也错误；复杂最优化应继续使用本题集表现正确的Sol。COMPUTED只说明相关计算已执行，无法自动保证模型采用了正确结果；近似验证也只覆盖模型声明的近似量。', '',
 '两轮在不同时间运行，每模型每题只采样一次完整回答。减少模型请求可从调用记录确认；平均用时改善也包含网络及模型服务状态变化，不能全部归因于代码，也不能保证任意题型每次token都更少。工具成功不等于数学答案自动正确。', '',
 '43项全套测试通过，生产构建通过。回归覆盖真实根式验算、错误近似值拦截及纠正、未确认结果拦截、禁止空验算、图片/提示保留原流程，以及合并请求的公开字段流式输出。', '',
 f"本轮全部尝试已知{sum(after[m]['allAttemptsKnownTokens'] for m in models):,} token；缺少usage的失败请求实际消耗未知。这是本轮实测额外用量，不等同于订阅额度扣减，也不包含本聊天开发用量。", '',
 f'- [逐题审阅及失败记录]({out/"数学模型对比报告.md"})',
 f'- [20个原始完整回答]({out/"20次数学完整回答.md"})',
 f'- [原始模型usage和调用记录]({out/"results.json"})',
 f'- [评分标准]({out/"grading-rubric.json"})',
 f'- [前一版对比报告]({baseline/"优化前后对比报告.md"})',
 f'- [本机服务更新记录]({out/"local-service-update.json"})','',
 '本地8791服务已重启加载新实现，页面刷新后使用新流程；未部署到公网。']
(out/'speed-comparison.json').write_text(json.dumps({'before':before,'after':after,'changes':changes,'sameQuestionsAndSettings':True},ensure_ascii=False,indent=2))
(out/'提速且不增加token对比报告.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(changes,ensure_ascii=False,indent=2))
