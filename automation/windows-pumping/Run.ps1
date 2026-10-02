param([string]$Config, [ValidateSet('scheduled','login','plan','smoke','smoke-upload')][string]$Mode='scheduled')
$ErrorActionPreference='Stop'
$settings=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$mutex=[System.Threading.Mutex]::new($false,'Local\GroundwaterWraBrowser')
$acquired=$false
try {
  try { $acquired=$mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired=$true }
  if(-not $acquired) { exit 0 }
  & $settings.nodeExecutable (Join-Path $PSScriptRoot 'run.cjs') $Config $Mode
  exit $LASTEXITCODE
} finally { if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose() }
