# ═══════════════════════════════════════════════════
# 重启日志 · 看门狗
# 功能：每 2 分钟检查博客服务 + cpolar 隧道，谁挂拉起谁；
#       隧道重建后自动把新网址写到桌面"我的博客网址.txt"
# 用法：powershell -File watchdog.ps1          （常驻循环）
#       powershell -File watchdog.ps1 -Once    （只检查一轮，测试用）
# ═══════════════════════════════════════════════════
param([switch]$Once)

$ErrorActionPreference = 'SilentlyContinue'
$BlogDir = 'C:\Users\lyq\.openclaw-autoclaw\workspace\my-blog'
$Cpolar  = "$env:USERPROFILE\cpolar\cpolar.exe"
$UrlTxt  = "$env:USERPROFILE\Desktop\我的博客网址.txt"
$Log     = "$BlogDir\watchdog.log"

function Log($msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
}

function Test-Blog {
  $r = curl.exe -s -o NUL -w "%{http_code}" --max-time 8 'http://localhost:3000/'
  return ($r -eq '200')
}

function Test-Tunnel {
  $h = (curl.exe -s --max-time 8 'http://127.0.0.1:4040/http/in') -join "`n"
  return [regex]::IsMatch($h, 'https://[a-zA-Z0-9.-]+\.cpolar\.cn')
}

function Free-Port3000 {
  # 如果 3000 被僵尸进程占着，精确杀掉占用者（绝不用 taskkill /IM node 误伤网关）
  $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
      $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
      if ($proc -and $proc.ProcessName -eq 'node') {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Log "已清理占用3000的僵尸node进程 PID=$p"
      }
    }
  }
}

function Start-Blog {
  Free-Port3000
  Start-Sleep -Seconds 1
  Start-Process -FilePath 'node' -ArgumentList 'start.js' -WorkingDirectory $BlogDir -WindowStyle Hidden
  Log '博客服务已拉起'
}

function Start-Tunnel {
  Start-Process -FilePath $Cpolar -ArgumentList 'http','3000','-region','cn' -WorkingDirectory $BlogDir -WindowStyle Hidden
  Log 'cpolar 隧道已拉起'
}

function Update-Url {
  Start-Sleep -Seconds 15  # 等隧道建立
  $h = (curl.exe -s --max-time 8 'http://127.0.0.1:4040/http/in') -join "`n"
  $m = [regex]::Match($h, 'https://[a-zA-Z0-9.-]+\.cpolar\.cn')
  if ($m.Success) {
    Set-Content -Path $UrlTxt -Value $m.Value -Encoding UTF8
    Log "网址已更新: $($m.Value)"
  } else {
    Log '网址更新失败（隧道未就绪）'
  }
}

Log '看门狗启动'
while ($true) {
  $blogOk  = Test-Blog
  $tunOk   = Test-Tunnel
  if (-not $blogOk)  { Start-Blog;  Start-Sleep -Seconds 5 }
  if (-not $tunOk)   { Start-Tunnel; Update-Url }
  if (-not (Test-Path $UrlTxt)) { Update-Url }
  if ($Once) { Log '一轮检查完成（测试模式）'; break }
  Start-Sleep -Seconds 120
}
Log '看门狗退出'