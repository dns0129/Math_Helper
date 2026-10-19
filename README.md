# 推演 · 数学助手

数学与物理学习助手：本机保留 Pi Agent / ChatGPT 订阅调用，云端直接使用 DeepSeek 官方 API；两种方式共用数学技能、界面与 Python / SymPy 验算。云端不读取本机 Pi 或 Codex 登录。

源码：[Math_Helper](https://github.com/dns0129/Math_Helper)。云端站点：[math.hjexpoevents.com](https://math.hjexpoevents.com/)。原 [GitHub Pages 入口](https://dns0129.github.io/Math_Helper/)通过构建变量进入完整云端应用。

## 使用

首次进入云站，用 `owner` 和部署时设置的网站访问密码登录。点击「连接 DeepSeek」，自行填写 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)创建的 API Key，再点击「保存并验证」。密钥会先通过官方 `/models` 接口验证，成功后以 `600` 权限保存到后端私有配置文件；网页状态接口不返回密钥，浏览器存储不保存密钥。

DeepSeek API 使用官方 API 余额并按量计费。默认模型为 `deepseek-flash`，可在设置中选择 `deepseek-v4-pro`；图片题使用 Flash。标准推理对应官方 `high`，深入推理对应 `max`。模型列表不等于实际解题验证，首次真实解答成功后才显示本次运行已完成验证。

- 输入文字，或上传、拖放、粘贴 PNG / JPG / WebP 题目图片，最大 6 MB。
- 选择详细解析、只给提示或检查我的解法，按 `⌘ / Ctrl + Enter` 提交。
- 公式说明适用条件和使用理由，步骤展示推导；讲解文字流式出现，公式完整呈现。
- 后端加载固定来源的 `math-skill` 和 `sympy` 规则，明确条件、定义域、单位、增根、边界和检验。
- 工具可进行安全数值计算，以及方程解集、求导、积分、极限、等价验证和最大 5×5 矩阵运算。数值抽样不等于证明，尚未确认和失败检查不会标成通过。
- 详细文字计算题可一次提交讲解与验算参数；本地验算通过后才接收最终解答，失败会要求模型纠正。提示模式不开放计算工具，不展示最终答案。
- 函数和几何图支持缩放、坐标查看和 SVG 下载；复杂三维、隐式曲线暂不支持。
- 可继续追问、复制解答、导出 Markdown、打印或保存 PDF。最近 20 份解答与公式笔记保存在当前浏览器，不跨设备同步，不保留原始图片。

## 本机启动

需要 Node.js 22.19+ 与安装了 SymPy 的 Python 3。双击 **启动数学助手.command**，或执行：

```bash
npm install --ignore-scripts --registry=https://registry.npmjs.org
npm run build
npm start
```

默认监听 `127.0.0.1:8791`，默认继续使用 Pi Agent；可复用本机有效的 Pi / Codex 订阅登录，或在「连接订阅」中建立数学助手专用连接，专用文件仍为 `.local/auth.json`。不会改写已有 Pi / Codex 登录文件。默认订阅模型为 `gpt-6.1-sol`。本机运行需保留启动终端，按 `Ctrl+C` 停止。云端部署不依赖本机开机。

需要本机改用 DeepSeek 时，显式设置 `MATH_AI_PROVIDER=deepseek`。Docker 云端镜像固定默认 DeepSeek，并排除 Pi 可选依赖；本机 `npm install` 保留 Pi Agent 与 Pi AI 1.1.0 可选依赖。

Python 可使用独立环境：

```bash
python3 -m venv .local/sympy-env
.local/sympy-env/bin/python -m pip install -r requirements-math.txt
MATH_PYTHON="$PWD/.local/sympy-env/bin/python" npm start
```

## 云端部署

提供 Docker、Compose、已有 Caddy 代理的 ECS 覆盖配置及 Render Blueprint。完整步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。

使用独立 Compose 项目和 `math-auth` 持久数据卷。域名、访问密码和数据卷均与其他应用隔离；已有主域名只追加数学助手子域名路由。`MATH_AUTH_STORAGE=persistent` 仅说明已配置持久存储，本身不会创建数据卷。

每次推送 `main`，GitHub Actions 运行测试、构建前端并发布 Pages，同时构建和验证完整后端容器。Pages 的 Actions 变量 `MATH_CLOUD_URL` 设置为云端 HTTPS 根地址时会跳转到完整应用；未设置时提供明确标注的静态内置演示。静态 Pages 不能运行 Node / Python 后端。

## 配置与安全边界

- 云端 DeepSeek API 固定调用 `https://api.deepseek.com`，不接受网页提供的第三方接口地址。保存配置只验证官方模型列表，不自动调用付费推理。
- DeepSeek 密钥默认保存在 `.local/deepseek.json`；`DEEPSEEK_CONFIG_FILE` 可指定后端路径。也支持 `DEEPSEEK_API_KEY` 环境变量，网页保存的配置优先。
- 线上必须使用 HTTPS 和至少 24 字符的网站访问密码。网页登录会话使用 HttpOnly、Secure、SameSite Cookie，变更请求要求 CSRF；登录有一次性验证与错误尝试限流。
- 云端题目、图片和必要的追问上下文发往 DeepSeek；本机 Pi 模式发往 OpenAI；模型思考内容只在后端按官方工具协议传递，不回传网页或写入解题记录。
- 静态服务仅开放构建产物，私有配置、源码与依赖不能经网站下载。`.local/`、`.env`、发布缓存和历史测试证据不进入公开仓库。
- 计算器使用表达式白名单，禁止任意代码和文件访问。SymPy worker 不使用字符串 `eval`、`sympify` 或 `parse_expr`，单次计算限时 12 秒、CPU 10 秒、输入 16 KB、输出 64 KB；取消解答会停止计算。
- 服务最多并发解答两题，每题最多八轮模型请求、二十四次计算调用，API 错误会明确提示，不自动切换其他供应商。

此应用面向个人使用，不包含多人账户体系。模型解答可能出错，工具返回 `COMPUTED` 不代表已证明最终推导正确。

## 验证

```bash
npm test
npm run ai:check
npm run ai:check -- --live
npm run ai:math-check -- --live
```

`ai:check` 只读取无密钥状态与模型目录；加 `--live` 才真实解题。本机 Pi 模式使用订阅额度，DeepSeek 模式使用 API 额度。数学集成检查包含根式方程、反常积分、错误等式与提示模式，可用 `--case` 单独运行。

设置 `MATH_AI_PROVIDER=deepseek` 后，`scripts/benchmark-models.mjs` 可对 Flash 与 Pro 运行独立题集，默认不运行。历史 Pi / GPT 模型测试记录仅保留在本地 `evidence/`，不作为 DeepSeek 准确率证明，也不公开上传。

官方接口参考：[首次调用](https://api-docs.deepseek.com/)、[工具调用](https://api-docs.deepseek.com/guides/tool_calls/)、[思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)、[图片输入](https://api-docs.deepseek.com/guides/vision/)、[模型与价格](https://api-docs.deepseek.com/quick_start/pricing/)。
