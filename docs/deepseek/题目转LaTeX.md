# 交接任务：把 613 道题目和答案速查从图片转成 Markdown + LaTeX

本文档是交给 opencode 里的 DeepSeek（或其他能看图的模型）的完整任务说明。照本文做完、校验通过后交回，由 Claude 审核后写入题库，再接到网站上。

## 1. 背景

这是一个考研数学二刷题站，题库 613 道题（`#001`–`#613`）。现在网站上每道题的题干和答案速查都是从 PDF 截出来的图片。

**任务**：逐张看图，把题干（含选择题选项）和答案速查原样转写成 Markdown + LaTeX。网站会用 KaTeX 渲染这些公式。

解析不在本次范围内，继续用图片。

## 2. 环境、模型与边界

- 仓库根目录：`~/Documents/大观园/daguanyuan`，下文命令都在这里执行。Python 解释器：`.venv/bin/python`；机器上有 Node，校验会用到。
- **模型必须能看图。** PDF 抽出来的文字丢了分式线、根号、绝对值和上下标，只靠文字转不对。
  - 首选 opencode 里的 `deepseek-v4-flash-vision-exp`，免费、实验版。普通的 `deepseek-v4-flash` / `deepseek-v4-pro` 不接收图片。
  - 也可以用 opencode 里其他能看图的模型，例如 Qwen-VL、Gemini。
  - 实际以 opencode 的模型列表为准。
- **只能新建或修改** `content/transcribe/out/` 下的文件。
- **不要**改仓库里任何其他文件，**不要** `git commit`、`git push`，**不要**运行 `check --write`，由 Claude 审核后执行。
- **必须逐张看图转写。** `pdf_text` 只能用来核对汉字和数字，不能拿它代替看图。可以写小脚本辅助读写文件、合并结果。

## 3. 输入（已经生成好）

都在 `content/transcribe/` 下。如果缺失，运行 `.venv/bin/python -m pipeline.transcribe_questions prepare` 重新生成；`out/` 里已有的结果不受影响。

| 文件 | 内容 |
|---|---|
| `img/qNNN.png` | 第 NNN 题的题图，已裁掉白边。有 7 张较高的题图切成了上下几段：`q205-1.png`、`q205-2.png`……，要按顺序合起来看。 |
| `img/aNNN.png` | 第 NNN 题的答案速查图。 |
| `questions.jsonl` | 每行一道题：`num`、`chapter_name`、`path`（书上的目录路径）、`kp`（考点）、`source`（出处）、`type_hint`（按 PDF 文字猜的题型，只作参考）、`pdf_text`（PDF 抽取的文字，公式是乱的）、`question_images`、`answer_images`（要看的图片路径）。 |

## 4. 第 0 步：看图测验（必须先做）

正式开始前，先转写 **#012、#205、#300** 三道题，写进 `content/transcribe/out/probe.json`，格式见第 5 节。然后运行：

```bash
.venv/bin/python -m pipeline.transcribe_questions check --probe
```

这三道题的 PDF 文字都丢了关键结构，只有真看了图才能转对。

- 显示“校验通过”，才进入正式转写。
- 不通过，就**停下**，回报完整输出：多半是当前模型看不到图或看不清，需要换模型。

## 5. 输出格式

按章分文件：`out/A.json` … `out/F.json`，章节就是 `questions.jsonl` 里的 `chapter`。顶层格式是 `{"questions": [ ... ]}`，每题一个对象：

| 字段 | 内容 |
|---|---|
| `num` | 题号（整数）。 |
| `type` | `choice`（选择题）、`fill`（填空题）或 `solve`（解答、计算、证明题）。 |
| `stem` | 题干，Markdown + LaTeX。选择题不含选项。 |
| `options` | 选择题写 `{"A": "…", "B": "…", "C": "…", "D": "…"}`。其他题型写 `null`。选项本身是图形、没法转写时写 `null`，同时 `figure` 设为 `true`。 |
| `figure` | 题目里有函数图像、区域图等图形时写 `true`，否则写 `false`。 |
| `answer` | 答案速查图的转写，Markdown + LaTeX。选择题只写字母，例如 `"B"`。 |
| `confidence` | `high` 或 `low`。 |
| `note` | 30 字以内。`confidence` 为 `low` 时**必填**：写清哪里看不清、哪里拿不准。改正过排版错误时也写在这里。 |

**每做 10–20 题就保存一次**，中断后可以接着做，已经写好的题不要重做。

## 6. 转写规则

**照抄，不解题。** 不简化、不改写，不补书上没有的步骤。

1. **记号**：
   - 行内公式写 `$…$`；原图里单独成行的公式写 `$$…$$`。
   - 自然常数写 `\mathrm{e}`，微分写 `\mathrm{d}x`。
   - 函数名用命令：`\sin`、`\ln`、`\arctan`、`\lim` 等。
   - 不等号照原图：书上多用斜的 `\leqslant`、`\geqslant`。
2. **大小**：行内公式里有分式、极限、积分、求和时，在开头加 `\displaystyle`，让大小接近原图。例如 `$\displaystyle\lim_{x\to0}\frac{…}{…}$`。
3. **选择题括号**写全角 `（　　）`（两个全角空格）。**填空题的空位**写 `$\underline{\qquad\qquad}$`，有几个空就写几个。
4. **去掉书上原来的题号**，比如开头的 `(5)`、`【11】`、`4.`。题号由网站自己显示。
5. **分问** `(I)`、`(II)` 或 `(1)`、`(2)` 各占一段，段与段之间空一行（JSON 里写 `\n\n`），分问的标号保留。
6. **标点照原图**：书上中文句子里多用半角逗号、句号，不要统一改成全角。
7. **只用 KaTeX 支持的命令。** 可用的环境：`cases`、`aligned`、`array`、`pmatrix`、`vmatrix`。不要自定义宏，不要用 `\newcommand`。表格用 Markdown 表格。
8. **图形**：图里的坐标、曲线不用描述；图形以外的文字照常转写。有图就设 `figure: true`，网站会继续显示原图。
9. **书上的错**：
   - 明显的排版错误，按数学含义改正，并在 `note` 里写明原样。例如 #470 把 `|x|` 印成了 `// x |`，见第 10 节示例。
   - 内容上的疑问，例如数字可疑，**不要改**，照原图写，并在 `note` 里说明。
10. **答案速查**：
    - 选择题只写字母；
    - 填空题、计算题写图上的结果；
    - 多行或多个小问的答案，每行一段（`\n\n`），标号照原图保留，例如 `①`、`②`。
11. **拿不准时**：写下你最确定的版本，`confidence` 设为 `low`，在 `note` 里写清是哪一处。

## 7. 校验

随时可以运行：

```bash
.venv/bin/python -m pipeline.transcribe_questions check
```

它会检查：

- **错误**：
  - 613 题齐全，不重复，字段都有；
  - 题型、选项、空位格式正确；`$` 成对；
  - **每一段公式都能被网站用的 KaTeX 渲染**，渲染不了的会列出来，并附错误原因。
- **警告**：
  - **可能漏字**：把 PDF 文字里的数字、字母和你的转写比对，找回不到 80% 的题会列出来，请回到原图逐字核对；
  - 开头疑似残留书上的题号。
- **说明**：低把握题号、各题型数量、带图题数、固定抽查的 40 题。

想自己对照着看，可以运行 `.venv/bin/python -m pipeline.transcribe_questions review`。它会生成 `content/transcribe/review.html`：左边原图，右边是渲染后的转写。

## 8. 完成标准与交回

**完成标准**：

- 错误为 0；
- 每条警告都逐一核对过，要么改正，要么确认无误并在 `note` 里写明；
- 低把握题不超过 60 道。

**完成后回复**：

1. `check` 的完整输出。
2. 低把握题号，以及原因分类，例如图片模糊、符号认不出、疑似印错。
3. 你改正过的排版错误清单（题号 + 原样 + 改成什么）。
4. 你发现的、书上内容本身可疑的地方。

## 9. 一道题的完整写法

```json
{"questions": [
  {"num": 7, "type": "solve",
   "stem": "求 $\\displaystyle\\lim_{x\\to0}\\frac{\\mathrm{e}^x-\\sin x-1}{1-\\sqrt{1-x^2}}$.",
   "options": null, "figure": false, "answer": "$1$", "confidence": "high", "note": ""}
]}
```

JSON 字符串里的反斜杠要写两个：`\\lim`、`\\frac`。

## 10. 示例（已对照原图核对）

**#007**（解答题，原图：求 lim_{x→0} (eˣ − sin x − 1)/(1 − √(1−x²))，答案 1）

```json
{"num": 7, "type": "solve", "stem": "求 $\\displaystyle\\lim_{x\\to0}\\frac{\\mathrm{e}^x-\\sin x-1}{1-\\sqrt{1-x^2}}$.", "options": null, "figure": false, "answer": "$1$", "confidence": "high", "note": ""}
```

**#470**（填空题，原图集合条件印错了一处）

```json
{"num": 470, "type": "fill", "stem": "设 $D=\\{(x,y)\\mid |x|\\leqslant y\\leqslant 1,\\ -1\\leqslant x\\leqslant 1\\}$, 则 $\\displaystyle\\iint_D x^2\\mathrm{e}^{-y^2}\\,\\mathrm{d}x\\,\\mathrm{d}y=\\underline{\\qquad\\qquad}$.", "options": null, "figure": false, "answer": "$\\dfrac{1}{3}-\\dfrac{2}{3\\mathrm{e}}$", "confidence": "high", "note": "原图集合条件印成「// x |」，按 |x| 改正"}
```

**#526**（选择题）

```json
{"num": 526, "type": "choice", "stem": "设 $y_1(x),y_2(x)$ 是某 2 阶非齐次线性微分方程的两个特解.若常数 $\\lambda,\\mu$ 使得 $2\\lambda y_1(x)+\\mu y_2(x)$ 是该方程的解, $\\lambda y_1(x)-2\\mu y_2(x)$ 是该方程对应的齐次方程的解, 则（　　）", "options": {"A": "$\\lambda=\\dfrac{1}{5},\\ \\mu=\\dfrac{2}{5}$", "B": "$\\lambda=\\dfrac{2}{5},\\ \\mu=\\dfrac{1}{5}$", "C": "$\\lambda=\\dfrac{1}{4},\\ \\mu=\\dfrac{1}{2}$", "D": "$\\lambda=\\dfrac{1}{2},\\ \\mu=\\dfrac{1}{4}$"}, "figure": false, "answer": "B", "confidence": "high", "note": ""}
```

## 11. 中途接手（换模型或换工具继续）

前一个执行者（opencode 里的 DeepSeek）做到一半停了。接手时按下面的顺序做，**已完成的题不要重做**。

1. **先查进度**：

   ```bash
   .venv/bin/python content/transcribe/out/.qa.py validate
   ```

   它会把 `out/.parts/` 里的分片和 `out/probe.json` 一起校验，报出“进度 X/613”和“未做”的题号，以它为准。2026-10-17 停下时已完成 398 题，**未做的是 #371–#585**。
2. **换了模型，先重做看图测验**：
   - 转写 #012、#205、#300，写进 `out/probe-harness.json`，**不要动 `out/probe.json`**；
   - 运行 `.venv/bin/python -m pipeline.transcribe_questions check --probe --probe-file probe-harness.json`；
   - 校验通过才继续，不通过就停下回报。
3. **分片规则**：
   - 剩下的题按章分批，每批 20–30 题，写成 `out/.parts/<章>-<起>-<止>.json`，例如 `D-399-430.json`，格式同第 5 节；
   - 一个分片文件只能由一个执行者写；
   - 不确定接口有没有限流时，**一次只跑一批**。前一个执行者就是因为同时开了 4 个子代理才被限流卡死的。
4. **修复前一个执行者留下的错误**：
   - **#113、#142、#146、#147、#290**：它用脚本批量改标点时，把公式里的一些字符换成了全角逗号、分号，有时连原来的字符都吞掉了。到各自所在的分片里，对照原图改回原来的符号，`note` 写“修正批量替换造成的全角标点”。已核对的几处：
     - #146 的 `g；(0)` 应为 `g'(0)`；
     - #147 的 `(\alpha>0,\beta>0，` 应为 `(\alpha>0,\beta>0)`；
     - #290 的 `& ，\geqslant1` 应为 `& x\geqslant1`；
     - #113、#142 的 `…0，end{cases}` 处吞掉了反斜杠，应为 `…0,\end{cases}` 一类写法，以原图为准。
   - **#300 重复**：它在 `.parts/C-276-306.json` 和 `out/probe.json` 里各有一份。对照原图确认分片里那份无误后，**只从 `out/probe.json` 删掉 #300 这一条**，probe.json 里只留 #12、#205。
5. **禁止用脚本批量改标点或做全局替换**，尤其不能动 `$…$` 里的内容。校验现在会把公式里的全角标点直接报成错误。
6. **收尾**：
   - `.qa.py validate` 零错误后，运行 `.venv/bin/python content/transcribe/out/.qa.py merge`，生成 `out/A.json`…`out/F.json`；
   - 再运行 `.venv/bin/python -m pipeline.transcribe_questions check`；
   - 按第 8 节汇报。**不要运行 `check --write`。**
