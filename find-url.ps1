# -*- coding: utf-8 -*-
# 查网址脚本：从 cpolar 本地面板提取当前公网网址
$ErrorActionPreference = 'SilentlyContinue'
$h = (curl.exe -s --max-time 8 'http://127.0.0.1:4040/http/in') -join "`n"
$m = [regex]::Match($h, 'https://[a-zA-Z0-9.-]+\.cpolar\.cn')
if ($m.Success) {
  $url = $m.Value
  try { Set-Clipboard $url } catch {}
  try { Set-Content "$env:USERPROFILE\Desktop\我的博客网址.txt" $url -Encoding UTF8 } catch {}
  Write-Host ""
  Write-Host "  你的博客网址：" -NoNewline
  Write-Host $url -ForegroundColor Green
  Write-Host "  (已复制到剪贴板，并保存到桌面 我的博客网址.txt)"
} else {
  Write-Host ""
  Write-Host "  没找到网址：博客服务或隧道没在运行。" -ForegroundColor Red
  Write-Host "  请先双击 上线公网.bat 启动。"
}