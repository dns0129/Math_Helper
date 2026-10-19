# 推演 · 数学助手

公开仓库仅发布应用源码、技能、测试代码和部署配置；本机登录、环境配置、历史题目、模型测评结果与截图保留本地。文中 `evidence/` 路径指本地历史验证资料，不随公开源码发布。


通过 Pi Agent 调用本机 ChatGPT / Codex 订阅登录的个人数学与物理学习助手。界面为本机网页版，服务只监听 `127.0.0.1:8791`。

## 启动

双击 **启动数学助手.command**，浏览器会自动打开。保留启动终端，按 `Ctrl+C` 停止服务。启动器优先寻找 Node.js 22.19+，也支持此电脑已经安装的 Codex 内置 Node 24。

也可以在 Node.js 22.19+ 环境执行：

```bash
npm install --ignore-scripts --registry=https://registry.npmjs.org
npm run build
npm start
```

如端口已占用，可执行 `PORT=8792 npm start` 并打开相应地址。`npm run dev` 会先构建再启动；修改前端文件后需重新构建和启动。

## 在线部署

公开源码仓库：[Math_Helper](https://github.com/dns0129/Math_Helper)。GitHub Pages 地址：[推演数学助手演示版](https://dns0129.github.io/Math_Helper/)。演示版可查看内置讲解、公式、交互图形和导出；真实模型解题、图片识别与订阅登录需要运行完整 Node / Python 应用。演示页不调用解题或登录 API。

每次推送到 `main`，GitHub Actions 会安装依赖、运行测试并构建发布 Pages。`npm run build:pages` 使用 `/Math_Helper/` 资源路径，产物输出到 `.release/pages-dist/`；`npm run build` 继续生成本机完整版的 `dist/`。

无需注册的临时方案：双击 **临时上线数学助手.command**，由这台 Mac 运行完整后端，生成受密码保护的 HTTPS 地址。访问密码保存在本机 `.local/online/访问密码.txt`；电脑必须开机、联网，临时地址可能变化。关闭发布进程后公网访问停止。

提供 Docker / Compose 和 Render Blueprint，可同时运行 Node 与 Python / SymPy。源码上传并不等于网站上线；部署后还需建立线上专用订阅登录并验证真实解题。平台配置和免费服务限制见 [部署说明](DEPLOYMENT.md)。

完整云端应用采用设备码连接 ChatGPT 订阅：在 app 中点击「连接订阅」，前往 OpenAI 页面输入本次设备码并自行授权；云端自动确认并保存专用登录，不依赖电脑上的回调服务。使用持久数据卷保存云端登录；`MATH_AUTH_STORAGE=persistent` 用于标明已配置持久存储，设置此值本身不会创建存储。

云端部署并验证成功后，将 GitHub 仓库的 Actions 变量 `MATH_CLOUD_URL` 设置为完整应用的 HTTPS 根地址，再运行 Pages 发布流程；原 Pages 地址就会自动进入云端完整版。未设置时继续保留静态演示，不能宣称后端已经上线。

## 订阅接入

使用 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai` 1.1.0 的 `openai-codex` OAuth provider（Pi 将此接口标记为 legacy）。凭据按以下顺序读取：

1. 本项目 `.local/auth.json`：通过界面「连接订阅」或 `npm run ai:login` 创建的专用 Pi 登录，支持刷新。
2. 本机 `~/.pi/agent/auth.json`：仅复用尚未过期的 OAuth 访问令牌，不修改 Pi 登录文件。
3. 本机 `~/.codex/auth.json`（遵循 `CODEX_HOME`）：仅复用尚未过期的 ChatGPT 访问令牌，不修改 Codex 登录文件。

此版本不使用 API Key，不自动切换付费 API。账户必须具有相应订阅和模型权限；目录中列出某个模型不代表调用一定可用。界面明确区分“找到登录凭据”与“本次运行已完成真实调用”。默认模型为 GPT-6.1 Sol（`gpt-6.1-sol`），思考强度为 medium（标准），可在设置中更换。此次升级首次打开时会重置模型和思考强度为新默认值，保留其他设置与解题记录；之后手动保存的选择继续有效。所选模型不可用时会明确提示，不会自动改用其他模型。

共享凭据过期时，打开 Pi / Codex 更新登录，或为数学助手建立专用连接。专用登录凭据只保存在本机 `.local/auth.json`，该目录已加入 Git 忽略；删除此文件可移除专用连接。默认用于个人本机；完整在线部署使用独立访问保护和线上专用登录，见 [部署说明](DEPLOYMENT.md)。此版本不含多人账户体系。

## 使用

- 输入题目，或上传、拖放、粘贴 PNG / JPG / WebP 图片，最大 6 MB。
- 选择详细解析、只给提示、检查我的解法；选择初中、高中、大学或自动判断。
- 按 `⌘ / Ctrl + Enter` 解答。题意、公式、原因、条件、步骤、结论、检验和易错点分别呈现。
- 已接入 `math-skill` 的解题流程，以及 `sympy` 的精确算术、变量假设和定义域规则。app 读取项目中固定来源的技能副本，无需依赖 Codex 技能目录；每份解答记录技能版本与内容摘要。
- Agent 可使用 `math_calculate` 核对实数运算，并使用本地 `math_symbolic` 求实数或复数方程解集、求导、积分、极限、验证恒等式或原函数，以及计算最大 5×5 矩阵的行列式、逆矩阵和秩。检验区分别显示精确计算、数值复核、符号验证通过、未通过、尚未确认或计算错误。提示模式仅开放提交提示的工具。
- 图形支持函数曲线、点、线段和圆，提供缩放、重置、函数坐标查看及 SVG 下载。几何图保持等比例；函数只采样模型指定区间，放大不是重新求解。复杂三维、隐式曲线和任意图形暂不支持。
- 解答文字在模型生成时实时逐字出现；完整公式作为整体呈现。解答完成后整理为原有的公式、步骤、检验卡片；历史记录与导出直接显示完整内容。图形保持静态，支持原有缩放、坐标查看和下载，不再提供播放、进度或速度面板。
- 在解答下方继续追问，或点击「作为新题」取消上下文。追问携带上一份解答和题目，不携带完整无限对话。
- 浏览器自动保存最近 20 份解答；公式笔记来自这些解答。单份记录可删除，也可清空全部记录。
- 可复制、导出 Markdown，或使用打印按钮在浏览器中保存 PDF；图形可单独下载 SVG。

内置示例明确标注，不调用模型。模型解答可能有误，数值工具检查不等于形式化证明；提示模式通过指令要求不泄露答案，但模型可能不完全遵循。

## 数据与边界

题目、上传图片及追问所需的上一题内容会通过 Pi 发给 OpenAI。浏览器不接触 OAuth 令牌；本机 HTTP 接口有 Host、Origin、会话及 CSRF 检查，静态服务只开放构建产物。解题记录仅在本浏览器 `localStorage` 中保存，不会同步其他设备；历史不保存原始题目图片。清空记录只删除本浏览器记录，不会删除 OpenAI 侧数据或其他设备数据。

## 验证

```bash
npm test
npm run ai:check
npm run ai:check -- --live
npm run ai:math-check -- --live
```

`ai:check` 只检查登录状态和模型目录；加 `--live` 才真正解答一题并消耗订阅额度。默认测试 GPT-6.1 Sol / medium，可用 `MATH_MODEL=gpt-6-luna npm run ai:check -- --live` 指定其他测试模型。

`ai:math-check -- --live` 验证根式方程、反常积分、错误等式检查和提示模式四道题，保存实际工具记录；可加 `--case check-false-identity` 单独重跑一题，并保留此前失败记录。完整 skill 接入验证见 [接入验证记录](evidence/math-app-integration.md)。

数学工具使用表达式节点白名单，拒绝赋值、属性访问、数组、程序导入和任意函数；计算输出只接受有限实数。服务支持取消、超时和最多两道题并发。

SymPy 工具由固定 Python worker 接收 JSON，只允许数学 AST 节点并构造 SymPy 对象，不使用字符串 `sympify`、`parse_expr`、`eval` 或任意 Python 执行。保留约分前的分母排除值，并区分 `EmptySet` 与尚未求出的 `ConditionSet`。每次计算限时 12 秒、CPU 10 秒、输入 16 KB、输出 64 KB，取消解答会停止 worker。上游 Codex 验算脚本的可执行表达式解析器不对 app 开放。

当前电脑的 Python 3.11 / SymPy 1.14.0 可直接使用。如换机器，可安装独立环境：

```bash
python3 -m venv .local/sympy-env
.local/sympy-env/bin/python -m pip install -r requirements-math.txt
MATH_PYTHON="$PWD/.local/sympy-env/bin/python" npm start
```

`MATH_PYTHON` 也可指向其他已安装 SymPy 的 Python 3。缺失依赖或超时会显示计算未完成，不能算作验证通过。符号工具覆盖上述运算；复杂证明、微分方程和其他高级题型仍需模型推导，不能据此宣称全题型已有程序证明。

本次验证结果与边界见 `evidence/验证记录.md`，截图见 `evidence/home.jpg` 和 `evidence/geometry-result.jpg`。

接入参考：[Pi Agent 文档](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)、[Pi 模型与认证文档](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md)、[OpenAI 认证说明](https://learn.chatgpt.com/docs/auth)。

## 精简解答与工具恢复

公式卡说明适用理由，步骤写关键推导，结论集中呈现；已说明的步骤原因可以为空，界面与 Markdown 导出隐藏空原因。明确题型只提供所需计算引擎，图像、混合及未知题型保留两种引擎；明确“无需图形”时使用更小的提交结构。相同参数的已完成计算在本题内复用。

详细模式的明确文字计算题，一次模型请求同时给出教学解答和安全验算参数，本地通过后才接收解答；其中的小数近似按指定精度复核。不再为拿到计算结果后重新整理同一份解答而固定增加一轮。图片、追问、提示、检查解法和纯证明保留原有流程。工具错误或未确认后必须修正并重新复核，不能直接提交答案。双参数 `log(u,b)` 出错时自动换为 `log(u)/log(b)` 重试一次；仍未确认则给模型纠错提示。错误记录和修正结果都保留。检查用户解法时，真实反例的 `FAIL` 是有效检查结果，不会误当作工具故障。

同题模型复测使用当前订阅额度，分别运行 Sol 和 Luna 各10题，统一 `medium`、大学详细模式、每题独立上下文。新目录防止覆盖旧证据：

```bash
MATH_BENCHMARK_DIR=my-new-benchmark node scripts/benchmark-models.mjs
MATH_BENCHMARK_DIR=my-new-benchmark node scripts/benchmark-models.mjs --retry-failures
```

`results.json` 保存完整解答、工具记录、模型回合、服务返回的 token 与耗时；失败补测另记。准确率须依据 `grading-rubric.json` 和独立标准答案逐题审阅，不能把请求成功或工具通过当成数学答案自动正确。对比报告见 `evidence/model-benchmark-optimized-final-2026-10-13/优化前后对比报告.md`。

合并请求后的同题复测见 `evidence/model-benchmark-single-turn-2026-10-14/提速且不增加token对比报告.md`。本题集内两模型每题token均下降，完整回答从2轮以上缩为1轮；复杂题仍可能出现推导与计算结果不一致，不能把 `COMPUTED` 当成最终答案正确的证明。
