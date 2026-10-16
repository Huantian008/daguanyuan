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

## 开发

```bash
.venv\Scripts\python -m pytest            # 全部测试
.venv\Scripts\python -m pytest -m "not pdf"  # 跳过需要读 PDF 的慢测试
.venv\Scripts\python -m uvicorn dgy.main:app --reload
```

目录：`pipeline\` 内容提取，`dgy\` 网站，`tests\` 测试，`docs\` 设计与计划。
