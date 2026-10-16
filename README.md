# 大观园 · 数二本地刷题站

用你电脑上的《大观严选》PDF 搭的刷题网站：题面、答案、解析都从 PDF 里提取，学习进度存在本机的一个 SQLite 文件里，不依赖外网。

## 日常使用

双击 `start.bat`，浏览器会打开 <http://127.0.0.1:8000/>。关掉黑色窗口就停止。

## 第一次使用

```bash
python -m venv --system-site-packages .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pipeline.build
```

- `pipeline.build` 从上一级文件夹 `E:\大观园\` 里的 PDF 提取内容，写到 `content\`，并打印校验报告（题面、答案、解析应各 613 份）。
- 虚拟环境用 `--system-site-packages`，可以直接用全局已经装好的 PyMuPDF 和 Pillow；新装的包只进 `.venv`，不影响全局环境。

## 文件放在哪

| 位置 | 内容 | 能不能删 |
|---|---|---|
| `content\` | 从 PDF 生成的题面、答案、解析、知识点页面 | 能，重新运行 `pipeline.build` 即可生成 |
| `data\app.db` | 你的做题记录、复习状态、“不做”标记和设置 | **不要删** |
| `data\backups\` | 每天自动备份的 app.db，保留 14 份 | 可以删旧的 |
| `knowledge-md\` | 知识点 Markdown（已修正转写错误的副本） | 不要删 |

要恢复进度：停掉网站，把 `data\backups\` 里某一天的文件复制成 `data\app.db`。

## 密码

本机使用默认不需要密码。放到服务器上之前，必须设置环境变量 `APP_PASSWORD`（和 `SECRET_KEY`），设置后所有页面和图片都需要登录。

## 线上版（Cloudflare）

**地址**：<https://math.leadertestofcn.site>。登录密码是你用 `npx wrangler secret put APP_PASSWORD` 设的那个。

**组成**

- `edge\` 是 Cloudflare Worker：网页由 TypeScript 生成，题库图片作为静态资源，登录后才能看。
- 学习进度存在 D1 数据库 `dgy` 里，位置在亚太区域。
- 本机的 Python 版保留作断网时的备用，两边进度**不会自动同步**，平时以线上版为主。

**改了题库、知识点或代码之后，重新部署**

```bash
.venv\Scripts\python -m pipeline.export_edge
cd edge
npx wrangler deploy
```

**常用操作**

| 想做什么 | 命令 |
|---|---|
| 退回上一个版本 | `npx wrangler rollback` |
| 改登录密码 | `npx wrangler secret put APP_PASSWORD`（已登录的设备 30 天内保持登录；想让它们马上退出，就再换一个 `SECRET_KEY`） |
| 备份 | 在网站“设置”页下载全部学习数据（JSON）。D1 自己还保留 7 天历史，可以用 `npx wrangler d1 time-travel` 回溯 |
| 跑测试 | `cd edge`，然后 `npm test` |
| 本地调试线上版 | `cd edge`，然后 `npm run dev`。需要先照 `.dev.vars.example` 建好 `.dev.vars`，并运行一次 `npx wrangler d1 migrations apply dgy --local` |

**把本机进度搬到线上**（只在开始用线上版之前做一次）

```bash
.venv\Scripts\python -m pipeline.export_progress
cd edge
npx wrangler d1 execute dgy --remote --file=..\data\progress.sql
```

**连不上 Cloudflare 时**：如果 wrangler 报 `ECONNRESET`，可以先在当前终端里临时清空代理变量再试：

```
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''
```

## 以后放到服务器上

1. 在本机运行 `pipeline.build`，确认 `content\` 已经生成。
2. 把整个 `daguanyuan` 文件夹传到服务器。要带上 `content\`，不要带 `.venv\`。
3. 在服务器的项目目录里新建 `.env` 文件，写入下面两行：

   ```
   APP_PASSWORD=你的登录密码
   SECRET_KEY=一长串随机字符
   ```

4. 运行 `docker compose up -d`。网站只监听服务器本机的 8000 端口。
5. 从外面访问有两种方式，选一种：
   - 用 Tailscale 组私网，用 `tailscale serve` 转发本机 8000 端口。不需要域名，也不需要备案。
   - 用域名加 HTTPS 反向代理，并在 `.env` 里加一行 `HTTPS_ONLY=1`。大陆机房的域名要先做 ICP 备案。
6. 想把本机进度带过去：先停掉本机网站，再把 `data\app.db` 复制到服务器项目的 `data/` 目录里。

题目、答案、解析都是第三方资料，服务器上一定要开密码，不要公开分享网址。

## 开发

```bash
.venv\Scripts\python -m pytest            # 全部测试
.venv\Scripts\python -m pytest -m "not pdf"  # 跳过需要读 PDF 的慢测试
.venv\Scripts\python -m dgy --reload     # 开发时：改代码后自动重启
.venv\Scripts\python -m dgy --data-dir D:\临时数据  # 用另一份学习数据试用，不碰 data\
```

目录：`pipeline\` 内容提取，`dgy\` 网站，`tests\` 测试，`docs\` 设计与计划。
