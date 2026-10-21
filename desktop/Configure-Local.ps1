$ErrorActionPreference='Stop'
$configPath=Join-Path $env:LOCALAPPDATA 'GroundwaterPC\config.json'
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$python=(Get-Command python.exe -ErrorAction Stop).Source
$gh=(Get-Command gh.exe -ErrorAction Stop).Source
& $python -c "import sys; assert sys.version_info >= (3,10), 'Python 3.10+ required'"
if($LASTEXITCODE -ne 0){throw 'Python version check failed'}
& $gh auth status
if($LASTEXITCODE -ne 0){throw 'Run gh auth login locally, then retry. Repository write access is required.'}
& $python -m pip install -r (Join-Path $PSScriptRoot 'local-sync\requirements.txt')
if($LASTEXITCODE -ne 0){throw 'Python dependency installation failed'}
$config | Add-Member -NotePropertyName pythonExecutable -NotePropertyValue $python -Force
$config | Add-Member -NotePropertyName githubExecutable -NotePropertyValue $gh -Force
$config | Add-Member -NotePropertyName githubRepository -NotePropertyValue 'wushinhuei/groundwater-well-management' -Force
$config | Add-Member -NotePropertyName githubBranch -NotePropertyValue 'main' -Force
$config | Add-Member -NotePropertyName publicSiteUrl -NotePropertyValue 'https://wushinhuei.github.io/groundwater-well-management' -Force
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host 'Local publication configured. No Apps Script trigger is required. Run Publish-Now.cmd to verify.'
