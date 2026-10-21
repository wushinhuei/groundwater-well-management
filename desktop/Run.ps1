param([ValidateSet('scheduled','login','plan','smoke','publish')][string]$Mode='scheduled')
$ErrorActionPreference='Stop'
$config=Join-Path $env:LOCALAPPDATA 'GroundwaterPC\config.json'
$settings=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
$mutex=[System.Threading.Mutex]::new($false,'Local\GroundwaterWraBrowser')
$held=$false
try {
 try {$held=$mutex.WaitOne(0)}catch [System.Threading.AbandonedMutexException] {$held=$true}
 if(-not $held){Write-Host 'Already running';exit 0}
 $log=Join-Path $settings.stateDirectory ('run-'+(Get-Date -Format 'yyyy-MM-dd')+'.log')
 & $settings.nodeExecutable (Join-Path $PSScriptRoot 'run.cjs') $config $Mode 2>&1 | Tee-Object -FilePath $log -Append
 $result=$LASTEXITCODE
 exit $result
} finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
