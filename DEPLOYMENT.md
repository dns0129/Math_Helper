# 完整在线解题部署

此版本需要同时运行 Node 与 Python / SymPy。GitHub Pages 仅能发布静态页面，不能运行这份后端。源码与部署配置不包含订阅令牌、访问密码或本机凭据。

## GitHub Pages 在线演示

仓库为 [dns0129/Math_Helper](https://github.com/dns0129/Math_Helper)，站点地址为 <https://dns0129.github.io/Math_Helper/>。仓库 Pages 设置使用 GitHub Actions，`.github/workflows/pages.yml` 在推送到 `main` 或手动运行时，完成测试、静态构建与发布。

演示构建使用 `pages` 模式，资源前缀为 `/Math_Helper/`。仅上传 `.release/pages-dist/` 中的前端构建产物，完整源码、测试和部署配置保留在 GitHub 仓库。页面标明在线演示，不读取登录状态、不发送解题请求，也不提供 OAuth 登录。可直接打开内置二次函数讲解，查看公式与交互图形，复制或导出解答，切换主题。

本机完整应用仍使用 `npm run build` 和 `npm start`。两种构建输出目录独立；本机凭据、`.local/`、`.env` 和依赖目录不进入源码提交或 Pages 产物。

## 使用 Mac 临时上线（无需注册）

双击 **临时上线数学助手.command**。启动器通过系统 SSH 连接 localhost.run，分配临时 HTTPS 地址，把请求转到本机独立的 `127.0.0.1:8793` 后端；本机 `8791` 服务仍可使用。首次启动会生成随机访问密码，用户名为 `owner`，密码保存在 `.local/online/访问密码.txt`，当前地址和进程状态见 `.local/online/status.json`。这些文件全部被 Git 忽略，不会上传仓库。

网页和 API 均要求访问密码。本机订阅凭据仍由本机后端读取，浏览器不会收到令牌。题目和 HTTPS 请求经过隧道服务，TLS 在该服务终止，再通过 SSH 转到 Mac。SSH 不读取个人密钥或代理，只使用单独的 `known_hosts` 文件，首次信任后拒绝发生变化的主机密钥。

保留启动进程、保持电脑开机和联网。运行期间 `caffeinate -i` 防止空闲睡眠；合盖、关机、网络中断仍会令网站不可用。按 `Ctrl+C` 或运行 `npm run publish:stop` 停止临时发布。隧道断开后重新启动会分配新地址，访问密码沿用；免费地址也可能在几小时后变化。启动器只接受该隧道返回的 HTTPS 域名，绑定确切域名并设置 Secure Cookie，文字流保持 SSE 输出。

官方说明：[免费隧道](https://localhost.run/docs/forever-free/)、[SSH 与临时域名](https://localhost.run/docs/faq/)、[HTTPS 安全边界](https://localhost.run/docs/security/)。

上线后运行 `node scripts/check-online.mjs` 检查真实公网 HTTPS、密码保护、资源、订阅状态、凭据路径与 CSRF；加 `--live` 会消耗当前订阅额度，解根式方程和反常积分，核对两份技能、SymPy 精确结果及完成前的连续文字增量。证据写入 `evidence/temporary-online-checks.json`，不包含密码、令牌或会话 Cookie。

## Render 免费试用部署

注册或登录 [Render](https://dashboard.render.com/)，连接 GitHub 并只授权此仓库。选择 **New → Blueprint**，选择 `math-assistant` 仓库，使用根目录 `render.yaml`。配置明确选择 `free`，不创建收费数据库、磁盘或其他服务。

Render 会构建 Docker 镜像，启动 Node 和 SymPy，使用 `/healthz` 检查进程状态。公网地址从 `RENDER_EXTERNAL_URL` 自动注入，访问密码由 Render 随机生成。在服务 Environment 页查看 `MATH_ACCESS_PASSWORD`；首次打开网页，用用户名 `owner` 和该密码登录。然后在 app 中「连接订阅」建立线上专用 Pi OAuth 连接。

订阅登录应由用户在网页授权完成，不把本机 `.codex/auth.json` 或 `.local/auth.json` 上传 GitHub、复制进镜像或写入 Blueprint。如果 OAuth 的 localhost 回调不能直接回到线上 app，按网页提示粘贴完整回调地址完成专用授权。

**免费服务的限制**：Render 免费实例的文件系统不持久化，重启、重新部署或休眠后的重建可能丢失线上专用登录，需要重新授权。浏览器中的题目历史仍在原浏览器。免费实例不能挂持久化磁盘，因此此 Blueprint 适合先验证完整在线解题，不代表长期免维护运行。

官方说明：[免费服务](https://render.com/docs/free)、[环境变量](https://render.com/docs/configure-environment-variables)、[持久化磁盘](https://render.com/docs/disks)、[Blueprint](https://render.com/docs/blueprint-spec)。

## 有云服务器时的持久部署

阿里云 ECS / 轻量服务器可使用下面的 Compose 部署。若同机已有其他应用，为数学助手使用独立目录和 Compose 项目名 `math-helper`；设置 `.env` 中 `MATH_HTTP_BIND_PORT=18791`，反向代理指向 `127.0.0.1:18791`。只添加数学助手的域名路由，保留已有应用配置与数据卷。

若已有 Caddy 在 Docker 容器中运行，设置 `.env` 的 `MATH_PROXY_NETWORK` 为其现有网络名，并使用 `docker compose -p math-helper -f compose.yaml -f compose.ecs.yaml up -d --build`。Caddy 的新子域名配置使用 `reverse_proxy math-helper-backend:8791`。此覆盖配置只给数学助手加入既有代理网络，并限制数学助手为 768 MB / 1 CPU；不更改既有服务。

镜像构建后可运行 `docker compose -p math-helper -f compose.yaml -f compose.ecs.yaml exec -T math-assistant node scripts/check-container.mjs`，检查访问保护、前端资源、安全 Cookie、私密路径关闭和真实 SymPy 运算。该检查不调用订阅模型，也不输出访问密码或令牌。

服务器安装 Docker / Compose，并给域名配置 DNS 和 HTTPS。将源码放在服务器，复制 `.env.example` 为 `.env`，填写域名和至少 24 字符的随机访问密码。不要提交 `.env`。然后运行：

```bash
docker compose up -d --build
```

复制 `Caddyfile.example` 中的反向代理配置并替换域名。容器端口只映射到服务器回环地址，由 HTTPS 代理访问。Docker 的 `math-auth` 卷保存线上专用登录，保留该卷可在更新后继续使用。常规更新用 `docker compose up -d --build`，不要删除数据卷。

Docker 监听 `0.0.0.0` 时要求访问保护；生产域名要求 HTTPS；HTTP 请求只接受所配置的域名和同源请求。浏览器会话在 HTTPS 模式设置 Secure Cookie，既有 CSRF 和路径检查继续执行。

云端首次连接订阅时，app 会选择设备码授权，不启动浏览器所在电脑的 localhost 回调。打开页面给出的 OpenAI 授权链接、输入本次设备码并完成授权，保留 app 的连接窗口直到确认成功。设备码不写入源码、日志或发布记录。若账户未开启设备码登录，先在 ChatGPT 的安全设置中开启。通过设备码完成连接不等于已验证模型权限；仍须真实解一道题。

确认云端完整应用可用后，设置 GitHub `Math_Helper` 的 Actions 变量 `MATH_CLOUD_URL=https://你的数学助手域名/`，重新运行 Pages 流程。Pages 将跳转到完整应用，网页、订阅和解题 API 都在同一域名下运行。

## 发布验收

构建成功、源码上传和 `/healthz` 成功均不单独证明真实解题可用。还需打开实际部署地址，使用线上专用登录解一道题，观察逐字文字与 SymPy 复核结果，验证停止解答，并记录最终 URL 和版本。未完成平台登录或尚未获得部署成功结果时，应标明“尚未上线”。
