@echo off
chcp 65001 >nul
title AI 图片生成器 - Web 界面 (FastAPI)

echo ============================================
echo   AI 图片生成器 - Web 界面 (前后端分离)
echo ============================================
echo.

cd /d "%~dp0"

:: ========== 检测 Python 可执行文件路径 ==========
set PYTHON_EXE=

:: 1) 优先从 PATH 中查找 python.exe
where python >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%i in ('where python') do (
        set "PYTHON_EXE=%%i"
        goto :found_python
    )
)

:found_python

:: 2) 如果 PATH 中未找到，搜索常见安装目录
if not defined PYTHON_EXE (
    for %%d in (
        "%LocalAppData%\Programs\Python\Python314\python.exe"
        "%LocalAppData%\Programs\Python\Python313\python.exe"
        "%LocalAppData%\Programs\Python\Python312\python.exe"
        "%LocalAppData%\Programs\Python\Python311\python.exe"
        "%LocalAppData%\Programs\Python\Python310\python.exe"
        "%LocalAppData%\Programs\Python\Python39\python.exe"
        "%LocalAppData%\Programs\Python\Python38\python.exe"
        "%ProgramFiles%\Python314\python.exe"
        "%ProgramFiles%\Python313\python.exe"
        "%ProgramFiles%\Python312\python.exe"
        "%ProgramFiles%\Python311\python.exe"
        "%ProgramFiles%\Python310\python.exe"
        "%ProgramFiles(x86)%\Python314\python.exe"
        "%ProgramFiles(x86)%\Python313\python.exe"
        "%ProgramFiles(x86)%\Python312\python.exe"
        "%ProgramFiles(x86)%\Python311\python.exe"
        "%ProgramFiles(x86)%\Python310\python.exe"
        "C:\Python314\python.exe"
        "C:\Python313\python.exe"
        "C:\Python312\python.exe"
        "C:\Python311\python.exe"
        "C:\Python310\python.exe"
        "C:\Python39\python.exe"
    ) do (
        if exist "%%~d" (
            set "PYTHON_EXE=%%~d"
            goto :found_python2
        )
    )
)

:found_python2

:: 3) 注册表中查找 Python 安装路径
if not defined PYTHON_EXE (
    for %%k in (
        "HKLM\SOFTWARE\Python\PythonCore\3.14\InstallPath"
        "HKLM\SOFTWARE\Python\PythonCore\3.13\InstallPath"
        "HKLM\SOFTWARE\Python\PythonCore\3.12\InstallPath"
        "HKLM\SOFTWARE\Python\PythonCore\3.11\InstallPath"
        "HKLM\SOFTWARE\Python\PythonCore\3.10\InstallPath"
        "HKLM\SOFTWARE\Python\PythonCore\3.9\InstallPath"
        "HKLM\SOFTWARE\Python\PythonCore\3.8\InstallPath"
        "HKCU\SOFTWARE\Python\PythonCore\3.14\InstallPath"
        "HKCU\SOFTWARE\Python\PythonCore\3.13\InstallPath"
        "HKCU\SOFTWARE\Python\PythonCore\3.12\InstallPath"
        "HKCU\SOFTWARE\Python\PythonCore\3.11\InstallPath"
        "HKCU\SOFTWARE\Python\PythonCore\3.10\InstallPath"
        "HKCU\SOFTWARE\Python\PythonCore\3.9\InstallPath"
    ) do (
        for /f "skip=2 tokens=2,*" %%a in ('reg query "%%~k" /ve 2^>nul') do (
            if exist "%%b\python.exe" (
                set "PYTHON_EXE=%%b\python.exe"
                goto :found_python3
            )
        )
    )
)

:found_python3

:: 4) 最终检查——仍未找到则报错退出
if not defined PYTHON_EXE (
    echo [错误] 未检测到 Python！
    echo.
    echo   请先安装 Python，访问: https://www.python.org/downloads/
    echo   安装时请务必勾选 "Add Python to PATH"
    echo.
    echo   安装完成后重新双击本脚本即可。
    echo.
    pause
    exit /b 1
)

:: 显示 Python 版本和路径
echo   检测到 Python: %PYTHON_EXE%
for /f "tokens=*" %%i in ('"%PYTHON_EXE%" --version 2^>^&1') do set PY_VER=%%i
echo   版本: %PY_VER%
echo.

:: ========== 配置虚拟环境 ==========
if not exist ".venv\Scripts\activate.bat" (
    echo.
    echo [配置] 正在创建虚拟环境...
    "%PYTHON_EXE%" -m venv .venv
    if errorlevel 1 (
        echo [错误] 虚拟环境创建失败
        pause
        exit /b 1
    )
    echo [配置] 虚拟环境创建成功
)
call .venv\Scripts\activate.bat

:: ========== 安装依赖 ==========
echo.
echo [配置] 检查项目依赖...
python -m pip install -r backend\requirements.txt -q
if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络连接后重试
    echo [提示] 可尝试手动运行: python -m pip install -r backend\requirements.txt
    pause
    exit /b 1
)
echo [配置] 依赖检查完成

:: ========== 检查关键目录 ==========
if not exist "data\uploads" (
    mkdir data\uploads >nul 2>&1
)
if not exist "data\output" (
    mkdir data\output >nul 2>&1
)

:: ========== 检查 API Key 数据 ==========
if not exist "data\api_config.json" (
    echo.
    echo [提示] 尚未检测到 API 配置数据。
    echo   请启动后在网页右上角「API 设置」中填写你的 API Key
    echo   （密钥将加密保存到项目主目录 data\ 下，无需手动编辑配置文件）
    echo.
    echo   获取方式: 阿里云百炼控制台 ^(https://bailian.console.aliyun.com/^)
    echo   左侧菜单 ^> API Key 管理 ^> 创建新的 API Key
    echo.
    timeout /t 5 /nobreak >nul
)

:: ========== 校验必需的环境变量（JWT 密钥强制注入） ==========
if "%JWT_SECRET%"=="" (
    echo.
    echo [错误] 未检测到环境变量 JWT_SECRET！
    echo   本项目的 JWT 签名密钥不再自动生成或落盘，必须通过环境变量注入。
    echo   请先执行一次（之后永久生效，重开窗口即可）：
    echo     setx JWT_SECRET "你的至少32位随机字符串"
    echo.
    pause
    exit /b 1
)

if not exist "data\app.db" (
    if "%SUPER_ADMIN_PASSWORD%"=="" (
        echo.
        echo [错误] 首次建库需要环境变量 SUPER_ADMIN_PASSWORD（超级管理员初始口令）！
        echo   请先执行一次（之后永久生效，重开窗口即可）：
        echo     setx SUPER_ADMIN_PASSWORD "你的口令"
        echo.
        pause
        exit /b 1
    )
)

:: ========== 启动服务 ==========
echo.
echo   [后端] FastAPI 服务启动中...
echo   [前端] React (Vite) 开发服务器启动中...
echo.

:: 启动 FastAPI 后端服务器
start /B python -m uvicorn backend.main:app --host 127.0.0.1 --port 8003

:: 等待后端初始化
timeout /t 3 /nobreak >nul

:: 启动前端 React 开发服务器
start /B cmd /c "cd /d %~dp0frontend && npx vite --host 127.0.0.1 --port 5176"

:: 等待前端服务器初始化
timeout /t 3 /nobreak >nul

:: 自动打开浏览器（前端页面）
start http://127.0.0.1:5176
echo.
echo   按 Ctrl+C 停止服务，或直接关闭此窗口
echo.

:: 保持窗口打开
pause >nul
