$taskName = "ATN Miner"
$root = Join-Path $env:ProgramData "ATN"

try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
try { Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue } catch {}

Write-Host "Uninstalled."

