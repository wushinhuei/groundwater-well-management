$ErrorActionPreference='Stop'
$config=Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'GroundwaterPC\config.json') -Raw | ConvertFrom-Json
if(-not $config.pythonExecutable -or -not $config.githubExecutable){throw 'Run Configure-Local.cmd before installing the task.'}
$proof=Get-Content -LiteralPath (Join-Path $config.stateDirectory 'verification.json') -Raw | ConvertFrom-Json
$age=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[long]$proof.at
if(-not $proof.ok -or $age -lt 0 -or $age -gt 86400000){throw 'Run Verify.cmd successfully within the last 24 hours first.'}
$name='Groundwater-WRA-Monthly'
if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'Task already exists. Inspect or remove it before installing.'}
if((Get-TimeZone).Id -ne 'Taipei Standard Time'){throw 'Set Windows timezone to Taipei before installing this task.'}
$arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $PSScriptRoot 'Run.ps1')+'" -Mode scheduled'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger=New-ScheduledTaskTrigger -Daily -At '14:13'
$principal=New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Checks due previous-month batches on 6/16/26 and catches up one unfinished batch daily. Requires local login.'
