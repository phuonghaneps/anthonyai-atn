param(
  [Alias('Wallet','W')] [string]$Wallet
)

$ErrorActionPreference = 'Stop'
if (-not $Wallet -or ($Wallet -notmatch '^0x[0-9a-fA-F]{40}$')) {
  throw "Thiếu hoặc sai ví BSC. Dùng: install.ps1 -Wallet 0xYourWallet"
}

$Base      = "https://atncrypto.com/claim/dl"
$Root      = Join-Path $env:ProgramData "ATN"
$MinerPath = Join-Path $Root "miner.ps1"
$LogFile   = Join-Path $Root "miner.log"
$CfgFile   = Join-Path $Root "config.json"

New-Item -ItemType Directory -Force -Path $Root | Out-Null

# Tải miner.ps1 (bạn đã upload miner.ps1 lên claim/dl/)
Invoke-WebRequest -UseBasicParsing -Uri "$Base/miner.ps1" -OutFile $MinerPath

# Lưu ví vào config (để miner chạy không hỏi)
@{ wallet = $Wallet } | ConvertTo-Json -Compress | Set-Content $CfgFile -Encoding UTF8

# Tạo Scheduled Task: ATN Miner (chạy 5 phút/lần, ẩn cửa sổ)
$taskName = "ATN Miner"
$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$MinerPath`" -Wallet `"$Wallet`""

# Trigger: on logon + 5 phút/lặp
$triggers = @(
  (New-ScheduledTaskTrigger -AtLogOn),
  (New-ScheduledTaskTrigger -Once (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue))
)

# Nếu task cũ tồn tại -> xoá để tạo mới
try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}

# Đăng ký
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -RunLevel Highest | Out-Null

Write-Host "Installed. Wallet: $Wallet"
Write-Host "Logs: $LogFile"

