@echo off
rem ═════════════════════════════════════════════════
rem 一键启动博客：先开浏览器，再起服务器
rem 双击这个文件即可；关掉这个黑色窗口 = 关闭博客
rem ═════════════════════════════════════════════════
cd /d %~dp0
start /min cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node --experimental-sqlite server.js
pause
