@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [大观园] 没找到 .venv 虚拟环境，请先按 README 里的“第一次使用”创建。
  pause
  exit /b 1
)

if not exist "content\manifest.json" (
  echo [大观园] 第一次运行：正在从 PDF 提取题目、答案和解析，需要几分钟……
  ".venv\Scripts\python.exe" -m pipeline.build
  if errorlevel 1 (
    echo [大观园] 提取失败，请把上面的报错发给 Claude。
    pause
    exit /b 1
  )
)

echo [大观园] 正在启动：http://127.0.0.1:8000/  （关掉这个窗口就停止）
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8000/"
".venv\Scripts\python.exe" -m dgy
pause
