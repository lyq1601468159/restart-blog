@echo off
rem ═════════════════════════════════════════════════
rem 一键上线公网（cpolar 免费版）
rem 1. 双击运行：启动博客服务 + 打开 cpolar 隧道
rem 2. 看窗口里 "https://xxx.cpolar.cn" 那行 = 你的公网网址
rem 3. 免费版注意：重启本脚本会换新网址；电脑关机则下线
rem 关掉本窗口 = 网站下线
rem ═════════════════════════════════════════════════
cd /d %~dp0

echo 正在启动博客服务...
start /min cmd /c "node start.js"
timeout /t 3 >nul

echo 正在连接公网隧道...
"%USERPROFILE%\cpolar\cpolar.exe" http 3000 -region cn -log stdout -log-level INFO

echo.
echo 隧道已关闭，网站已下线。
pause
