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
$dataRoot=Read-Host 'Local authoritative data folder (Enter = D:\地下水井管理系統)'
if(-not $dataRoot){$dataRoot='D:\地下水井管理系統'}
$dataRoot=(Resolve-Path -LiteralPath $dataRoot).Path
$config | Add-Member -NotePropertyName dataRoot -NotePropertyValue $dataRoot -Force
$config | Add-Member -NotePropertyName pumpingSourcePath -NotePropertyValue (Join-Path $dataRoot '抽水紀錄\pumping-history.json') -Force
$config | Add-Member -NotePropertyName registryBackupFileId -NotePropertyValue '1ulrCxomjd3I041cfncqLymkQUWCqJPNi' -Force
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host 'Local publication configured. No Apps Script trigger is required. Run Publish-Now.cmd to verify.'
