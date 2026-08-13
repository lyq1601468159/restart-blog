@echo off
rem ═════════════════════════════════════════════════
rem 一键上线公网：启动博客 + 打开 Cloudflare 隧道
rem 双击运行后，等待几秒，
rem 看窗口里 "https://xxx.trycloudflare.com" 那行 = 你的公网网址
rem 关掉这个窗口 = 网站下线
rem ═════════════════════════════════════════════════
cd /d %~dp0

rem 1. 启动博客（后台小窗）
start /min cmd /c "node start.js"
timeout /t 3 >nul

rem 2. 打开隧道（这个窗口会显示网址）
echo 正在连接公网隧道，请稍等几秒...
"%USERPROFILE%\cloudflared.exe" tunnel --url http://localhost:3000

echo.
echo 隧道已关闭，网站已下线。
pause
