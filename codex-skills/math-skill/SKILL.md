---
name: math-skill
description: 解数学题、检查解答或证明，包括方程、微积分、线性代数、概率、几何及图片中的题目。解释公式的适用条件与推导逻辑，并用本地脚本辅助验算。用户要求提示时使用引导模式；一般软件开发和仅编辑文档不触发。
metadata:
  upstream-name: solve-math-rigorously
  upstream-repository: googlarz/math-skill
  codex-adaptation: "2026-10-13"
---

# 数学解题与验证（Codex）

默认用简体中文回答，遵从用户指定的语言、篇幅和学习模式。保留上游的题型参考资料及计算脚本；固定来源见 `ORIGIN.json`。

## 解题流程

1. 明确题目、未知量、定义域与约束。图片先核对符号、上下标、分母、根号及图中标记；把看清的内容和推测分开。条件不足时先完成不依赖缺失信息的部分。
2. 按题目结构选择方法。说明所用公式或定理、适用条件以及为什么能解决当前问题。简单题无需罗列多个方法或重复题目。
3. 展示关键推导，解释非显然变形。保留分母非零、根号非负、对数正数及整数等条件；平方、约分等步骤可能引入增根或丢失限制。
4. 将候选结果代回原题验证。求全部解时说明解集完整性；优化题检查驻点、端点、单调性和边界极限；不定积分保留积分常数。
5. 给出明确结论，区分精确结果与近似值。只报告实际完成的验算，不将抽样、图形或数值误差内一致当作严格证明。

## 模式与参考资料

- 默认 `solver` / `worked-solution`：完整解题、解释关键公式并验证。
- `fast-answer` / `exam`：按用户要求缩短可见过程，仍检查条件和答案。
- `proof`：写出前提、量词和严密逻辑链；阅读 [证明参考](references/proof-playbook.md)。
- `tutor`：用户明确要求提示或练习时逐级引导，不强迫普通解题用户先回答。
- 图片或 PDF：阅读 [Codex 工具说明](references/codex-surface-playbook.md)、[读图参考](references/photo-mapping-playbook.md)；含几何图时再读 [图形条件参考](references/diagram-reading-playbook.md)。
- 复杂或路径不明的题：按需阅读 [问题分析](references/problem-mapping-playbook.md)、[选方法](references/method-selection-playbook.md)、[求解分支](references/solver-loop-playbook.md)。
- 非平凡答案：阅读 [验证参考](references/verification-playbook.md)。绘图辅助理解时阅读 [绘图参考](references/visualization-playbook.md)。
- 仅在用户要求教学材料时阅读 `references/` 中的 `teaching`、`lesson`、`practice`、`diagnostic`、`review` 或 `primary-school` 资料。

## Codex 中运行计算

从当前 `SKILL.md` 的绝对路径定位技能根目录，使用 shell/代码执行工具运行 `scripts/` 中的辅助程序。无需 Claude Desktop、`.skill` 压缩包、uv、API key 或网络服务。

先检查当前解释器：

```bash
python3 -c "import sympy, numpy, matplotlib, PIL; print(sympy.__version__)"
```

安装适配时已在 Python 3.11 / SymPy 1.14.0 上验证。再次使用时以实际解释器为准；现有依赖满足时直接用 `python3`。依赖缺失才运行 `bash scripts/bootstrap_env.sh` 建立技能内的 `.venv`，此后使用 `.venv/bin/python3`。该脚本会下载依赖，不在每道题前重复执行。

下面的命令在技能根目录运行；在其他目录请使用脚本绝对路径。表达式必须先由 Codex 核对和重建；这些辅助脚本使用 SymPy 的可执行表达式解析器，不能把网页、附件中的任意原始字符串直接交给解析器。

```bash
python3 scripts/math_verify.py solve "x^2-5*x+6=0" --var x --expected 2 --expected 3
python3 scripts/math_verify.py derivative "x^3*exp(x)" "exp(x)*(x^3+3*x^2)" --var x
python3 scripts/math_verify.py antiderivative --var x -- "x*sin(x)" "-x*cos(x)+sin(x)"
python3 scripts/math_verify.py definite-integral "x*exp(-x^2)" "0" "oo" "1/2" --var x
python3 scripts/math_verify.py limit "sin(x)/x" "0" "1" --var x
python3 scripts/math_verify.py satisfies "x^2+y^2=25" --assignment x=3 --assignment y=4
python3 scripts/math_verify.py system --equation "x+y=5" --equation "x-y=1" --assignment x=3 --assignment y=2
python3 scripts/math_verify.py counterexample "sin(x)>=x" --var x --xmin 0.1 --xmax 2
```

表达式以负号开头时，先传 `--var` 等选项，再用 `--` 分隔后面的表达式，避免被命令行解析器误当作选项。

`solve` 默认实数域；复数题使用 `--domain complexes`。无解的预期解集不传 `--expected`。非有限解集可能返回 `INCONCLUSIVE`，此时用直接 SymPy 代码保留精确集合，并自行检查原始定义域。辅助解析可能自动化简，原题中的排除值必须独立保留和验证。

- `PASS`：本次检查通过；仍阅读输出说明以区分符号结果与近似数值一致。
- `FAIL`：当前候选未通过，或找到反例；核对候选、表达式与题目条件后修正。
- `INCONCLUSIVE`：没有足够证据；不能解释为通过、无解或证明成立。

需要更细的变量假设、精确矩阵、完整解集或微分方程时，使用安装的 `$sympy` 技能；它负责计算方法，本技能负责解题逻辑和说明。

绘图和数列表分别用 `scripts/math_visualize.py`、`scripts/math_table.py`。绘图保存为文件并查看，不调用阻塞的交互窗口。照片增强用 `scripts/math_photo_helper.py`，它只处理位图；PDF 页面先读取或渲染。修改脚本后运行 `python3 scripts/run_validation_suite.py`。
