import json, statistics, os
from datetime import datetime, timezone, timedelta
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / 'evidence' / os.environ.get('MATH_BENCHMARK_DIR','model-benchmark-2026-10-13')
report = json.loads((out / 'results.json').read_text())
grades = json.loads((out / 'grades.json').read_text())
refs = json.loads((out / 'reference-checks.json').read_text())
# The independent exact reference is authoritative; expected strings were never sent to models.
for q in report['questions']:
    if q['id'] == 'optimization':
        q['expected'] = '0<x<6；x=(16-2sqrt(19))/3≈2.4274007cm；Vmax=(1792+1216sqrt(19))/27≈262.6822635cm³；边界体积0。'
seen = {}
for r in report['records']:
    key = (r['model'], r['id'])
    seen[key] = seen.get(key, 0) + 1
    r['attempt'] = seen[key]
    r['missingUsageTurns'] = [t['index'] for t in r['turns'] if not t.get('providerUsage')]
report['method']['tokens'] = '服务返回的已知token；input不含缓存；总输入=input+cacheRead+cacheWrite；总token=总输入+output；reasoning是output子集。失败回合未返回usage，默认0不代表实际无消耗。'
report['method']['order'] = '先Sol10题，再Luna相同10题；首轮逐题串行、不重试；失败题首轮结束后单独补测并保留记录。'
(out / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
summary = {}
for model in report['method']['models']:
    all_records = [r for r in report['records'] if r['model'] == model]
    first = [r for r in all_records if r['attempt'] == 1]
    chosen = [next((r for r in all_records if r['id'] == q['id'] and r['success']), None) for q in report['questions']]
    chosen = [r for r in chosen if r]
    reviewed = [grades[model][r['id']] for r in chosen]
    successful_tokens = {k: sum(r['usage'][k] for r in chosen) for k in ['input','cacheRead','cacheWrite','inputIncludingCache','output','reasoning','totalTokens']}
    summary[model] = {
        'firstAttempts': len(first), 'firstSuccessful': sum(r['success'] for r in first),
        'totalAttempts': len(all_records), 'completeAnswers': len(chosen),
        'answerCorrect': sum(g['answerCorrect'] for g in reviewed),
        'fullyCorrect': sum(g['fullyCorrect'] for g in reviewed),
        'toolValidatedAnswers': sum(g['toolValidated'] for g in reviewed),
        'accuracyDenominator': len(chosen),
        'successfulAnswerTokens': successful_tokens,
        'meanSuccessfulSeconds': statistics.mean(r['durationMs']/1000 for r in chosen),
        'medianSuccessfulSeconds': statistics.median(r['durationMs']/1000 for r in chosen),
        'meanFirstAttemptSeconds': statistics.mean(r['durationMs']/1000 for r in first),
        'meanTotalAttemptSecondsPerQuestion': sum(r['durationMs']/1000 for r in all_records)/len(report['questions']),
        'allAttemptsKnownTokens': sum(r['usage']['totalTokens'] for r in all_records),
        'modelRequests': sum(len(r['turns']) for r in all_records),
        'unreportedUsageTurns': sum(len(r['missingUsageTurns']) for r in all_records),
    }
(out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
dates=sorted({datetime.fromisoformat(r['startedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).date().isoformat() for r in report['records']})
date_label=dates[0] if len(dates)==1 else dates[0]+'至'+dates[-1]
lines = ['# GPT-6.1 Sol 与 GPT-6 Luna 数学助手实测','',
    f'测试日期：{date_label}（北京时间）。通过本机 Codex OAuth 使用订阅，未使用 API key。两组共用10道题、相同提示词、medium推理档位、大学/详细模式和现有数学助手工具；每题独立上下文。先Sol后Luna，单次采样，未随机交错，因此时段、网络和缓存可能影响性能比较。', '',
    '这是数学助手Agent与本地计算工具的端到端测试。一次完整回答可能包含多个模型请求；20个完整回答不等于20次底层请求。用时包含鉴权、网络、工具执行、全部模型回合及结构化解答生成，不包含本次人工评分。', '',
    '准确率由逐题审阅最终结论、关键推导和必要条件得到，依据独立SymPy参考与人工推导；不把程序成功或工具PASS当成答案自动正确。每模型仅10题，不足以证明通用准确率或复杂证明能力。','',
    '## 汇总','',
    '|指标|GPT-6.1 Sol|GPT-6 Luna|','|---|---:|---:|']
a,b=[summary[m] for m in report['method']['models']]
fastest=min(summary,key=lambda m:summary[m]['meanSuccessfulSeconds'])
fewest=min(summary,key=lambda m:summary[m]['successfulAnswerTokens']['totalTokens'])
rows=[('首轮成功回答',f"{a['firstSuccessful']}/10",f"{b['firstSuccessful']}/10"),('总解题尝试（含补测）',a['totalAttempts'],b['totalAttempts']),('最终结论正确',f"{a['answerCorrect']}/{a['accuracyDenominator']}",f"{b['answerCorrect']}/{b['accuracyDenominator']}"),('答案、推导、条件均正确',f"{a['fullyCorrect']}/{a['accuracyDenominator']}",f"{b['fullyCorrect']}/{b['accuracyDenominator']}"),('成功回答平均用时（秒）',round(a['meanSuccessfulSeconds'],2),round(b['meanSuccessfulSeconds'],2)),('成功回答中位用时（秒）',round(a['medianSuccessfulSeconds'],2),round(b['medianSuccessfulSeconds'],2)),('首轮10次平均用时，含失败（秒）',round(a['meanFirstAttemptSeconds'],2),round(b['meanFirstAttemptSeconds'],2)),('计入失败、补测的每题平均耗时（秒）',round(a['meanTotalAttemptSecondsPerQuestion'],2),round(b['meanTotalAttemptSecondsPerQuestion'],2))]
for name,key in [('成功10题总输入token，含缓存','inputIncludingCache'),('其中非缓存输入token','input'),('其中缓存读取token','cacheRead'),('成功10题输出token','output'),('成功10题总token','totalTokens')]: rows.append((name,a['successfulAnswerTokens'][key],b['successfulAnswerTokens'][key]))
rows += [('全部尝试已知token，含失败已返回部分',a['allAttemptsKnownTokens'],b['allAttemptsKnownTokens']),('底层模型请求数',a['modelRequests'],b['modelRequests']),('未返回usage的请求数',a['unreportedUsageTurns'],b['unreportedUsageTurns'])]
rows.append(('成功完成相关工具复核',f"{a['toolValidatedAnswers']}/{a['accuracyDenominator']}",f"{b['toolValidatedAnswers']}/{b['accuracyDenominator']}"))
lines += [f'|{name}|{av:,}|' + f'{bv:,}|' if isinstance(av,(int,float)) else f'|{name}|{av}|{bv}|' for name,av,bv in rows]
lines += ['', '总token=非缓存输入+缓存读取+缓存写入+输出；reasoning若有报告，是输出子集，不重复加计。缓存token计入数量，不推算API费用或订阅额度扣减。失败请求缺少usage时，总量只表示已知下限。', '', '## 逐题对照','', '|题目|Sol用时/总token|Luna用时/总token|标准答案|审阅|','|---|---:|---:|---|---|']
for q in report['questions']:
    cells=[]; notes=[]
    for model in report['method']['models']:
        r=next((r for r in report['records'] if r['model']==model and r['id']==q['id'] and r['success']),None)
        cells.append(f"{r['durationMs']/1000:.2f}s / {r['usage']['totalTokens']:,}" if r else '未完成')
        notes.append(grades[model][q['id']]['note'] if r else '无可评分答案')
    expected=q['expected'].replace('|',r'\|')
    note=('Sol：'+notes[0]+'；Luna：'+notes[1]).replace('|',r'\|')
    lines.append(f"|{q['topic']}|{cells[0]}|{cells[1]}|{expected}|{note}|")
lines += ['', '## 失败与补测记录', '']
for r in report['records']:
    if not r['success'] or r['attempt']>1:
        lines.append(f"- {r['model']} / {r['id']} / 第{r['attempt']}次：{'成功' if r['success'] else r['error']}，{r['durationMs']/1000:.2f}秒，已知{r['usage']['totalTokens']:,}token；{len(r['missingUsageTurns'])}个回合未返回usage。")
lines += ['', '## 优化建议','',
    f"1. 本轮速度优先可选{fastest}，token优先可选{fewest}。依据上表成功回答的实际用时及服务返回token，不能外推为所有题型的固定优劣。遇到工具未确认、定义域冲突或推导不一致时，重新审查推导和条件。",
    '2. 固定系统提示、技能说明和工具schema作为公共前缀，复用支持的缓存会话；每次只发送当前题目和必要上下文。缓存不能减少逻辑token数量，其性能收益需再次实测。',
    '3. 按题型只开放必要计算工具，降低每个模型回合重复输入的schema开销；对数题可先保持定义域，再化为代数方程，减少未确认的直接符号求解。保留独立检查，避免为了节省token取消验算。',
    '   对数工具使用换底式log(x-1)/log(2)，并在ERROR或INCONCLUSIVE后修正输入、重新复核；不能只根据工具已被调用就接受答案。',
    '4. 控制解答长度，按需返回图形、追问与易错点，避免结构化字段重复解释相同内容。low档位及更精简提示尚未测试，应使用同一题集复测后再改默认值。',
    '5. 对连接失败及超时记录阶段耗时，允许有限重试并展示状态；失败或工具INCONCLUSIVE不应被显示为数学错误或验证通过。', '',
    ('本轮已优化提示词、工具选择、重复计算复用及工具错误恢复；模型默认值和medium档位不变。' if out.name!='model-benchmark-2026-10-13' else '以上为建议，本轮未修改数学助手产品默认模型、提示词或重试策略。'), '', '## 证据','',
    f'- [全部原始解答、模型回合、usage及耗时]({out / "results.json"})',
    f'- [独立符号参考]({out / "reference-checks.json"})',
    f'- [逐题评分]({out / "grades.json"})',
    f'- [评分标准]({out / "grading-rubric.json"})',
    f'- [可复算汇总]({out / "summary.json"})']
(out / '数学模型对比报告.md').write_text('\n'.join(lines)+'\n')
answers=['# 原始完整解答（含所有成功补测）','']
for r in report['records']:
    if not r['success']: continue
    s=r['result']['solution'];q=next(q for q in report['questions'] if q['id']==r['id'])
    answers += [f"## {r['model']} · {q['topic']} · 第{r['attempt']}次",'',q['question'],'',s['overview'],'']
    answers += ['### 已知条件','']+[f"- {item}" for item in s['givens']]+['','### 公式及适用条件','']
    answers += [f"- {f['name']}：${f['latex']}$。{f['why']} 条件：{f['conditions']}" for f in s['formulas']]
    for step in s['steps']:
        answers += ['',f"### {step['title']}",'',step['explanation']]
        if step.get('latex'): answers += ['',f"$$ {step['latex']} $$"]
        answers += ['',step['why']]
    answers += ['', '**答案：** '+s['answer'],'','**检验：** '+s['verification'],'']
    if s['pitfalls']: answers += ['**易错点：**','']+[f"- {item}" for item in s['pitfalls']]+['']
    if s['followups']: answers += ['**可继续追问：**','']+[f"- {item}" for item in s['followups']]+['']
(out / '20次数学完整回答.md').write_text('\n'.join(answers)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
