$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$node=(Get-Command node.exe -ErrorAction Stop).Source
if([int]((& $node -p "process.versions.node.split('.')[0]") ) -lt 22){throw 'Install Node.js 22 or newer first.'}
$key=Read-Host 'Full path to your Google service-account JSON (kept outside this package)'
$key=(Resolve-Path -LiteralPath $key).Path
$month=Read-Host 'First reporting month to check, Gregorian YYYY-MM (example 2026-09)'
if($month -notmatch '^20\d{2}-(0[1-9]|1[0-2])$'){throw 'Invalid month'}
$state=Join-Path $env:LOCALAPPDATA 'GroundwaterPC'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $state '/inheritance:r' '/grant:r' "*$($sid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect local state directory'}
$config=Join-Path $state 'config.json'
if(Test-Path -LiteralPath $config){throw 'Configuration exists. Edit it explicitly instead of overwriting.'}
& npm.cmd install --ignore-scripts --no-audit --no-fund
if($LASTEXITCODE -ne 0){throw 'Dependency installation failed'}
@{nodeExecutable=$node;serviceAccountFile=$key;stateDirectory=$state;startMonth=$month;requestIntervalMs=15000;sourceFileId='1hqN1we88i-RJf9RJNn_vXjXIyL97Lceo';indexFolderId='1U9xQgNmEKb-QiHLMjKRNsC6lhImUp2Rz'} | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
Write-Host 'Setup complete. Run Configure-Local.cmd, Login.cmd, Verify.cmd, Publish-Now.cmd, then Install-Task.cmd.'
