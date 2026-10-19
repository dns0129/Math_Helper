# 完整云端部署

数学助手使用 Node 直接调用 DeepSeek，Python / SymPy 在同一容器中验算。不需要本机 ChatGPT 登录或 Pi Agent。源码和镜像不包含网站访问密码、DeepSeek API Key 或本机凭据。

## 已有阿里云服务器

使用独立目录和 Compose 项目名 `math-helper`，保留原有应用、数据卷与域名路由。准备指向服务器的子域名，例如 `math.example.com`；由已有 HTTPS 代理管理证书。

复制 `.env.example` 为 `.env`，填写：

- `MATH_PUBLIC_URL`：完整 HTTPS 根地址，不含路径。
- `MATH_ACCESS_PASSWORD`：至少 24 字符的个人网站访问密码，用户名固定为 `owner`。
- `MATH_HTTP_BIND_PORT=18791`：独立回环端口，避免占用其他应用端口。
- `MATH_AUTH_STORAGE=persistent`：只有已挂载持久卷时使用此值。

不把 `.env` 提交 Git。可由用户在服务器隐藏输入中设置密码，或使用自己的密钥管理工具；不要把密码写进命令历史。

已有 Caddy 在 Docker 中运行时，将 `MATH_PROXY_NETWORK` 设置为现有代理网络名，然后启动：

```bash
docker compose -p math-helper -f compose.yaml -f compose.ecs.yaml up -d --build
```

ECS 覆盖配置限制数学助手为 768 MB / 1 CPU，仅给数学助手接入代理网络。新增子域名配置：

```caddy
math.example.com {
    reverse_proxy math-helper-backend:8791
}
```

先备份 Caddyfile，验证新增配置后热加载，保留已有域名的全部配置。若 HTTPS 代理直接运行在宿主机，使用 `compose.yaml` 并将代理上游设为 `127.0.0.1:18791`。

`math-auth` 数据卷保存 `.local/deepseek.json`，权限为 `600`。常规更新使用 `up -d --build`，保留同一项目名与卷，不删除卷。网站会话在容器重启后需重新登录，DeepSeek 配置保留。

## 首次配置 DeepSeek

打开完整云站，使用 `owner` 和网站访问密码登录，点击「连接 DeepSeek」。由用户在 [官方开放平台](https://platform.deepseek.com/api_keys)自行创建 API Key，填写到网站密码字段后点击「保存并验证」。不要将密钥发到聊天、GitHub、日志或发布记录。

后端固定调用官方 `https://api.deepseek.com/models` 验证密钥与模型列表，成功后原子保存。配置接口要求网站访问授权、同源会话和 CSRF，不返回密钥。密钥更新失败不会覆盖原配置。也可通过服务器环境变量 `DEEPSEEK_API_KEY` 配置，网页保存的配置优先。

默认模型 `deepseek-flash` 支持题目图片，`deepseek-v4-pro` 用于文字题。DeepSeek API 使用独立 API 余额，按 [官方价格](https://api-docs.deepseek.com/quick_start/pricing/)计费。连接验证不调用推理模型，首次真实解题成功才确认实际推理可用。

## 发布检查

```bash
docker compose -p math-helper -f compose.yaml -f compose.ecs.yaml exec -T math-assistant node scripts/check-container.mjs
```

检查访问保护、网页登录、静态资源、安全 Cookie、私有路径、两份数学技能和真实 SymPy 运算；此检查不输出密码或密钥，不消耗 DeepSeek 推理额度。

另外检查容器健康状态，以及原有主域名仍正常。构建、Git 推送、模型列表和 `/healthz` 均不单独代表真实解题可用。配置 API Key 后，再真实解一道题，确认文字输出、验算结果和停止功能。

## GitHub Pages 入口

仓库：[dns0129/Math_Helper](https://github.com/dns0129/Math_Helper)。Pages：[dns0129.github.io/Math_Helper](https://dns0129.github.io/Math_Helper/)。

Actions 变量 `MATH_CLOUD_URL` 填写完整云端 HTTPS 根地址，再运行 Pages 流程；入口会进入云站。未设置变量时保留静态内置演示，不能解真实题，也不保存 API Key。

## 其他运行方式

- 本机：`npm run build && npm start`，只监听 `127.0.0.1:8791`。本机与云端配置分开。
- 临时隧道：**临时上线数学助手.command** 把独立本机服务发布到临时 HTTPS 地址，需持续保持 Mac 开机；访问密码位于忽略提交的 `.local/online/`。
- Render Blueprint：使用 `render.yaml` 部署完整容器，URL 从平台环境变量读取。免费实例不持久保存本地文件，重新部署后可能需要重新填写 API Key；需要长期保存时使用持久存储。参见 [Render 官方说明](https://render.com/docs/free)。
