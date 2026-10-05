param([Parameter(Mandatory=$true)][string]$Config, [switch]$Enable)
$ErrorActionPreference='Stop'
$configPath=(Resolve-Path -LiteralPath $Config).Path
$taskName='Groundwater-WRA-Monthly'
$settings=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if($Enable) {
  $status=Get-Content -LiteralPath (Join-Path $settings.stateDirectory 'status.json') -Raw | ConvertFrom-Json
  if($status.status -ne 'uploaded-awaiting-apps-script' -or $status.kind -ne 'single-well-verification' -or ([DateTimeOffset]::Now-[DateTimeOffset]::Parse($status.completedAt)).TotalHours -gt 24) { throw 'A successful fresh headless browser-to-Drive verification is required.' }
}
$enabledText=if($Enable){'true'}else{'false'}
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task already exists; inspect before replacing it.' }
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$runner=Join-Path $PSScriptRoot 'Run.ps1'
$arguments='-NoProfile -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File "'+$runner+'" -Config "'+$configPath+'"'
$escaped=[System.Security.SecurityElement]::Escape($arguments)
$triggers=@(@{Day=6;Time='12:43:00'},@{Day=16;Time='14:13:00'},@{Day=26;Time='15:23:00'}) | ForEach-Object {
 '<CalendarTrigger><StartBoundary>2026-10-01T'+$_.Time+'</StartBoundary><Enabled>true</Enabled><ScheduleByMonth><DaysOfMonth><Day>'+ $_.Day +'</Day></DaysOfMonth><Months><January/><February/><March/><April/><May/><June/><July/><August/><September/><October/><November/><December/></Months></ScheduleByMonth></CalendarTrigger>'
}
$xml=@"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<RegistrationInfo><Description>WRA browser: previous complete month, three sequential batches, eight seconds between wells.</Description></RegistrationInfo>
<Triggers>$($triggers -join '')</Triggers>
<Principals><Principal id="Author"><UserId>$sid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><Enabled>$enabledText</Enabled><ExecutionTimeLimit>PT1H</ExecutionTimeLimit></Settings>
<Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>$escaped</Arguments></Exec></Actions>
</Task>
"@
Register-ScheduledTask -TaskName $taskName -Xml $xml | Select-Object TaskName,State
