import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
base=root/'evidence/model-benchmark-2026-10-13'
out=root/'evidence/model-benchmark-optimized-final-2026-10-13'
before=json.loads((base/'summary.json').read_text())
after=json.loads((out/'summary.json').read_text())
old=json.loads((base/'results.json').read_text())
new=json.loads((out/'results.json').read_text())
assert [(q['id'],q['question']) for q in old['questions']]==[(q['id'],q['question']) for q in new['questions']]
assert all(old['method'][k]==new['method'][k] for k in ['models','reasoning','mode','level','suffix','timeoutMs'])
lines=['# 数学助手优化与同题复测','',
 '已修改真实源码并重新构建。保留简体中文教学解答、公式适用条件、定义域、关键推导与独立检查；精简重复说明和计算开销。', '',
 '## 已完成的改动','',
 '- 合并重复的系统提示与技能说明；公式卡、步骤、结论各写各自需要的内容，已解释的步骤原因可以为空，界面与导出不再显示空原因。',
 '- 明确的代数/微积分/矩阵题只开放符号工具，纯概率/数值几何题只开放计算器；最优化、混合、图像与不明题型保留两种工具。用户明确无需图形时，去掉图形schema的大量无关字段。',
 '- 保留完整计算证据给界面，向模型回传较短的结果摘要；相同工具参数复用已完成结果。提示最优化直接求导数零点，避免用体积零点代替边界检查。',
 '- 工具ERROR、INCONCLUSIVE及待求解的FAIL会阻止提交，即使题目问法不匹配旧关键词；检查用户解法时，真实反例FAIL仍是有效证据。',
 '- 分阶段提供工具：已知计算题在复核前不开放完整解答提交入口，只保留计算与条件澄清。完成复核才开放提交，避免Luna先生成整份答案、被拦截后又生成一次。提示及纯证明题保留直接讲解。',
 '- 双参数log错误自动按换底公式修正并重试一次；其他失败返回具体纠错建议。连续三次计算未确认会结束本题，避免无限恢复。所有失败与恢复记录均保留，不伪装成通过。',
 '- 补齐产品usage中的缓存读取、缓存写入和reasoning字段；reasoning是output子集，不重复计入。', '',
 '## 复测方法与范围','',
 '复用优化前10道题的原文、相同的500字/无需图形后缀、大学详细模式、medium推理档位。仍先Sol后Luna，逐题串行，首轮不自动重试；失败题后续补测单独留痕。用户提示和档位相同，系统提示、工具选择及结果回传结构是本轮被优化的变量。', '',
 '用时从solve开始到完整解答返回，包括鉴权、网络、全部模型回合与本地工具。每题选首次成功的完整回答评分，另外报告首轮成功率、失败和补测耗时。token来自服务返回usage，含缓存；没有把数量换算成订阅扣费。', '',
 '两轮运行时段不同、只有每题一次成功采样，网络与服务负载会影响用时。此前调试轮发现Luna提前生成答案后触发复核拦截，已修复并重新启动本轮；调试轮及独立页面验证的用量另计，不计入下表。没有随机交错、多次重复或强制清空缓存，因此性能变化是本轮观测，不是稳定服务时延保证。', '',
 '|指标|Sol 优化前|Sol 优化后|Luna 优化前|Luna 优化后|','|---|---:|---:|---:|---:|']
models=new['method']['models'];a,b=models
rows=[]
for label,fn in [
 ('数学准确率',lambda s:f"{s['fullyCorrect']}/{s['accuracyDenominator']}"),
 ('首轮成功',lambda s:f"{s['firstSuccessful']}/10"),
 ('成功10题总token',lambda s:f"{s['successfulAnswerTokens']['totalTokens']:,}"),
 ('总输入token，含缓存',lambda s:f"{s['successfulAnswerTokens']['inputIncludingCache']:,}"),
 ('输出token',lambda s:f"{s['successfulAnswerTokens']['output']:,}"),
 ('成功回答平均用时',lambda s:f"{s['meanSuccessfulSeconds']:.2f}秒"),
 ('成功回答中位用时',lambda s:f"{s['medianSuccessfulSeconds']:.2f}秒"),
 ('计入失败及补测的每题总耗时',lambda s:f"{s['meanTotalAttemptSecondsPerQuestion']:.2f}秒"),
 ('完成相关工具复核',lambda s:f"{s['toolValidatedAnswers']}/10"),
 ('全部尝试已知token（失败可能缺usage）',lambda s:f"{s['allAttemptsKnownTokens']:,}"),
 ('总解题尝试',lambda s:str(s['totalAttempts'])),
 ('底层模型请求',lambda s:str(s['modelRequests'])),
]:
 lines.append('|'+label+'|'+'|'.join(fn(s) for s in [before[a],after[a],before[b],after[b]])+'|')
changes={}
lines+=['','## 实测变化','']
for m in models:
 x,y=before[m],after[m]
 delta={
  'tokenReductionPercent':(1-y['successfulAnswerTokens']['totalTokens']/x['successfulAnswerTokens']['totalTokens'])*100,
  'meanSuccessfulTimeReductionPercent':(1-y['meanSuccessfulSeconds']/x['meanSuccessfulSeconds'])*100,
 }
 changes[m]=delta
 token_word='减少' if delta['tokenReductionPercent']>=0 else '增加'
 time_word='缩短' if delta['meanSuccessfulTimeReductionPercent']>=0 else '增加'
 lines += [f"- {m}：成功10题token{token_word}{abs(delta['tokenReductionPercent']):.1f}%；成功回答平均用时{time_word}{abs(delta['meanSuccessfulTimeReductionPercent']):.1f}%。"]
lines += ['', 'Luna最优化题的精确最大体积正确，但把近似值写成272.3 cm³，正确值为262.6822635 cm³；并将退化边界6写入盒子的可行域。因此该题判为不完整正确，保留首次完整回答，未为提高分数另行重答。该题还调用了与求最大值无关的定积分，说明精简提示不能完全消除不必要的调用。', '',
 '依据本题集，建议保持Sol用于完整解答；Luna可用于常规题的快速草稿，但对含精确式与小数近似的复杂题，应在提交前用现有计算器检查最终近似值的一致性。后续计时采用模型交错、每题多次采样，并单列网络与生成耗时；本轮不能声称提速。']
lines+=['','准确率仍逐题检查最终结论、关键推导和必要条件，依据独立SymPy参考和人工审阅；工具调用成功不能替代数学评分。10/10只代表本题集，不能证明所有题目100%正确。','',
 '## 逐题优化前后','',
 '|题型|Sol token：前→后|Sol秒：前→后|Luna token：前→后|Luna秒：前→后|','|---|---:|---:|---:|---:|']
for q in new['questions']:
 cells=[]
 for m in models:
  prev=next(r for r in old['records'] if r['model']==m and r['id']==q['id'] and r['success'])
  curr=next(r for r in new['records'] if r['model']==m and r['id']==q['id'] and r['success'])
  cells += [f"{prev['usage']['totalTokens']:,}→{curr['usage']['totalTokens']:,}",f"{prev['durationMs']/1000:.2f}→{curr['durationMs']/1000:.2f}"]
 lines.append('|'+q['topic']+'|'+'|'.join(cells)+'|')
lines+=['','## 验证与证据','',
 '39项全套测试通过；后续细化图片证明入口后，11项tutor测试再次通过。覆盖旧漏洞复现后的回归、真实双参数对数恢复、嵌套换底、安全计算接口、失败提交拦截、反例检查模式、重复计算复用、恢复上限、图形schema、阶段开放工具、澄清和流式解答。生产构建通过。', '',
 f'- [优化后逐题评分与失败记录]({out/"数学模型对比报告.md"})',
 f'- [优化后20个完整回答]({out/"20次数学完整回答.md"})',
 f'- [全部原始usage、耗时、工具调用与源码摘要]({out/"results.json"})',
 f'- [优化前报告]({base/"数学模型对比报告.md"})',
 f'- [页面验证截图]({out/"luna-log-recovery-ui.png"})', '',
 '页面验证于阶段控制修正前完成，前端构建文件保持相同；最终阶段控制由正式请求中的工具声明和调用记录验证。对数复测保留INCONCLUSIVE后的纠正及COMPUTED记录，回归测试另验证真实双参数log报错后的自动换底恢复。', '',
 '本轮完成本地源码和生产构建，并重启已确认属于本项目的8791服务，使下一次解题加载优化逻辑；健康检查及新前端构建读取通过。本机页面若仍保留旧会话，请刷新。没有同步或部署到公网。']
pilot=json.loads((root/'evidence/model-benchmark-optimized-2026-10-13/results.json').read_text())
pilot_tokens={m:sum(r['usage']['totalTokens'] for r in pilot['records'] if r['model']==m) for m in models}
validation=json.loads((out/'local-validation.json').read_text())
costs={'formalAllAttemptsKnownTokens':sum(after[m]['allAttemptsKnownTokens'] for m in models),
 'pilotKnownTokensByModel':pilot_tokens,'pilotKnownTokens':sum(pilot_tokens.values()),
 'separateUiKnownTokens':validation['uiValidation']['tokens'],
 'unknownUsage':'部分失败及中断的调试请求未返回usage，不能视为0；不含本聊天的开发用量。'}
costs['thisOptimizationRunKnownTokens']=costs['formalAllAttemptsKnownTokens']+costs['pilotKnownTokens']+costs['separateUiKnownTokens']
lines+=['','## 调试和补测额外用量','',
 f"正式轮全部尝试已知{costs['formalAllAttemptsKnownTokens']:,} token；调试轮已知{costs['pilotKnownTokens']:,} token（Sol {pilot_tokens[a]:,}，Luna {pilot_tokens[b]:,}）；独立页面验证另用{costs['separateUiKnownTokens']:,} token。此次优化实测合计至少{costs['thisOptimizationRunKnownTokens']:,} token。调试与页面验证未计入性能对比表。部分失败及中断请求用量未知；此数不含本聊天开发用量，也不等同于订阅额度扣减。"]
(out/'cost-summary.json').write_text(json.dumps(costs,ensure_ascii=False,indent=2))
(out/'comparison.json').write_text(json.dumps({'before':before,'after':after,'changes':changes,'sameQuestionsAndSettings':True,'costs':costs},ensure_ascii=False,indent=2))
(out/'优化前后对比报告.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(changes,ensure_ascii=False,indent=2))
