
param(
  [Alias("Wallet","W")] [string]$WalletParam
)

# ===== Cấu hình mặc định =====
$ApiBase   = "https://api.atncrypto.com"    # backend public
$IntervalS = 60                             # chu kỳ gửi
$AutoCreateBinding = $false                 # $true: miner tự register nếu ví chưa có thiết bị

# Thư mục & file
$Root      = Join-Path $env:ProgramData "ATN"
$LogFile   = Join-Path $Root "miner.log"
$StateFile = Join-Path $Root "state.json"
$CfgFile   = Join-Path $Root "config.json"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force -Path $Root | Out-Null
function Log($m){ $t=(Get-Date).ToString("yyyy-MM-dd HH:mm:ss"); Add-Content -Path $LogFile -Value "[$t] $m" }

# ===== Lấy ví người dùng: Tham số -> Env -> config.json -> hỏi 1 lần =====
$Wallet = $null
if ($WalletParam) { $Wallet = $WalletParam }
elseif ($env:ATN_WALLET) { $Wallet = $env:ATN_WALLET }
elseif (Test-Path $CfgFile) {
  try { $Wallet = (Get-Content $CfgFile -Raw | ConvertFrom-Json).wallet } catch {}
}
function Save-Wallet($w){ try { @{ wallet=$w } | ConvertTo-Json -Compress | Set-Content $CfgFile -Encoding UTF8 } catch {} }
if (-not $Wallet -or ($Wallet -notmatch '^0x[0-9a-fA-F]{40}$')) {
  $Wallet = Read-Host "Nhập ví BSC (0x...) cho miner (lưu 1 lần)"
  if ($Wallet -notmatch '^0x[0-9a-fA-F]{40}$') { Write-Host "Ví không hợp lệ." -ForegroundColor Red; exit 1 }
  Save-Wallet $Wallet
}
Write-Host "Using wallet: $Wallet"

# Tên/NIC ảo cần loại trừ
$ExcludeLike = @("Loopback","Bluetooth","Hyper-V","Virtual","VMware","Teredo","ISATAP","Miniport","Container","vEthernet","NdisWan")
$pattern = ($ExcludeLike | ForEach-Object { [regex]::Escape($_) }) -join '|'

# Helper: đọc MachineGuid (ổn định theo cài đặt Windows)
function Get-MachineGuid { try { (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid } catch { "" } }

# Resolve device_id theo ví
function Resolve-DeviceId {
  if (Test-Path $StateFile) {
    try { $st = Get-Content $StateFile -Raw | ConvertFrom-Json; if ($st.device_id) { return $st.device_id } } catch {}
  }
  try {
    $res = Invoke-RestMethod -Uri "$ApiBase/device/binding?wallet=$Wallet" -Method GET -TimeoutSec 15
    if ($res.device_id) {
      Log "Resolved device_id from server: $($res.device_id)"
      $st = @{ device_id = $res.device_id; rx = 0; tx = 0 }
      ($st | ConvertTo-Json -Compress) | Set-Content $StateFile -Encoding UTF8
      return $res.device_id
    }
  } catch { Log "Resolve server note: $($_.Exception.Message)" }
  if ($AutoCreateBinding) {
    $did = Get-MachineGuid; if (-not $did) { $did = [guid]::NewGuid().ToString() }
    try {
      $body = @{ wallet=$Wallet; device_id=$did; os="win"; fp="" } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$ApiBase/register" -Method POST -ContentType "application/json" -Body $body | Out-Null
      Log "Registered new binding via miner: $Wallet / $did"
      $st = @{ device_id = $did; rx = 0; tx = 0 }
      ($st | ConvertTo-Json -Compress) | Set-Content $StateFile -Encoding UTF8
      return $did
    } catch { Log "AutoCreate binding failed: $($_.Exception.Message)" }
  }
  return ""
}

function Read-Totals {
  $adapters = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Up" -and ($_.Name -notmatch $pattern) }
  if(-not $adapters){ return @{ rx=0; tx=0 } }

  $stats = @()
  foreach($a in $adapters){
    try { $s = Get-NetAdapterStatistics -Name $a.Name -ErrorAction Stop; if ($null -ne $s) { $stats += $s } } catch {}
  }
  if(-not $stats){ return @{ rx=0; tx=0 } }

  $rx = ($stats | Measure-Object -Property ReceivedBytes -Sum).Sum
  $tx = ($stats | Measure-Object -Property SentBytes     -Sum).Sum
  return @{ rx=[int64]$rx; tx=[int64]$tx }
}

# ===== Khởi tạo device_id =====
$DeviceId = Resolve-DeviceId
if (-not $DeviceId) {
  Log "Chưa có device_id cho ví $Wallet. Dừng miner."
  Write-Host "No device_id yet for $Wallet. Please register via Extension first." -ForegroundColor Yellow
  exit 1
}

# Gọi /register idempotent
try {
  $regBody = @{ wallet=$Wallet; device_id=$DeviceId; os="win"; fp="" } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "$ApiBase/register" -Method POST -ContentType "application/json" -Body $regBody | Out-Null
  Log "Register OK: $Wallet / $DeviceId"
} catch { Log "Register note: $($_.Exception.Message)" }

# ===== Vòng lặp báo cáo =====
$prev = @{ rx=0; tx=0 }
if(Test-Path $StateFile){
  try { $j = Get-Content $StateFile -Raw | ConvertFrom-Json; if ($j.rx -ne $null) { $prev.rx = $j.rx; $prev.tx = $j.tx } } catch {}
}
$first = $true
$maxDelta = 50GB

while($true){
  try {
    $cur  = Read-Totals
    if($first -and ($prev.rx -eq 0 -and $prev.tx -eq 0)){ $prev = $cur; $first = $false; Start-Sleep -Seconds $IntervalS; continue }
    $dRx = [int64]($cur.rx - $prev.rx); $dTx = [int64]($cur.tx - $prev.tx)

    if($dRx -lt 0 -or $dTx -lt 0 -or $dRx -gt $maxDelta -or $dTx -gt $maxDelta){
      Log "Delta anomaly rx=$dRx tx=$dTx → reset baseline."; $prev = $cur; Start-Sleep -Seconds $IntervalS; continue
    }

    if(($dRx + $dTx) -gt 0){
      $body = @{ wallet=$Wallet; device_id=$DeviceId; bytes_up=$dTx; bytes_down=$dRx; ip=""; asn=0 } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$ApiBase/report" -Method POST -ContentType "application/json" -Body $body | Out-Null
      Log "Report OK: up=$dTx down=$dRx"
    }

    $prev = $cur
    @{ device_id=$DeviceId; rx=$prev.rx; tx=$prev.tx } | ConvertTo-Json -Compress | Set-Content $StateFile -Encoding UTF8
  } catch { Log "Loop err: $($_.Exception.Message)" }
  Start-Sleep -Seconds $IntervalS
}

