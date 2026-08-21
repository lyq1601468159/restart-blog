@echo off
chcp 65001 >nul
title Blog URL Finder
echo.
echo Looking up your blog URL...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0find-url.ps1"
echo.
pause