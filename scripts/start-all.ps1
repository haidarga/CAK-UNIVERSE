# ============================================================
#  CAK AI Ecosystem — START ALL (1 klik nyalain platform)
#  Nyalain 3 service: Chrome CDP, Scraper sidecar, Next app.
#  SEMUA temp/profile ditaruh di F: (C: penuh).
# ============================================================
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

# --- semua temp ke F: (child window warisin env ini) ---
$Tmp = "F:\npm-tmp"
if (-not (Test-Path $Tmp)) { New-Item -ItemType Directory -Force $Tmp | Out-Null }
$env:TMP = $Tmp
$env:TEMP = $Tmp

$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$ChromeProfile = "F:\chrome-cdp-profile"
if (-not (Test-Path $ChromeProfile)) { New-Item -ItemType Directory -Force $ChromeProfile | Out-Null }

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  CAK AI ECOSYSTEM - starting platform" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# --- 1) Chrome CDP (scraping SGE/IG) :9222 ---
$cdpUp = Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue
if ($cdpUp) {
  Write-Host "[1/3] Chrome CDP  : sudah jalan (:9222) - skip" -ForegroundColor Yellow
} else {
  Write-Host "[1/3] Chrome CDP  : nyalain HEADLESS (:9222, no window, profile di F:)" -ForegroundColor Green
  Start-Process $Chrome -WindowStyle Hidden -ArgumentList "--headless=new","--disable-gpu","--remote-debugging-port=9222","--user-data-dir=$ChromeProfile","--no-first-run","--no-default-browser-check"
}

# --- 2) Scraper sidecar (TikTok/IG) :8900 ---
$svcUp = Get-NetTCPConnection -LocalPort 8900 -State Listen -ErrorAction SilentlyContinue
if ($svcUp) {
  Write-Host "[2/3] Scraper svc : sudah jalan (:8900) - skip" -ForegroundColor Yellow
} else {
  Write-Host "[2/3] Scraper svc : nyalain (:8900) di window baru" -ForegroundColor Green
  $svcCmd = "Set-Location '$Root\scraper-service'; .\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8900"
  Start-Process powershell -ArgumentList "-NoExit","-Command",$svcCmd
}

# --- 3) Next app :3000 ---
Write-Host "[3/3] Next app    : nyalain (:3000) di window baru" -ForegroundColor Green
$nextCmd = "Set-Location '$Root'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit","-Command",$nextCmd

Write-Host ""
Write-Host "SEMUA NYALA. Buka browser ke: " -NoNewline -ForegroundColor Cyan
Write-Host "http://localhost:3000" -ForegroundColor White
Write-Host "(tunggu ~10 detik Next app siap dulu)" -ForegroundColor DarkGray
