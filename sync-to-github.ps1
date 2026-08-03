$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = "C:\Users\a0802\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$Node = "C:\Users\a0802\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

Set-Location $Root

& $Python "tools\import_station_wells.py"
& $Python "scripts\export_github_pages_data.py"
& $Node --test

$changes = git status --short
if (-not $changes) {
  Write-Output "No changes to publish."
  exit 0
}

git add -A docs public
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "Sync well data $timestamp"
git push

Write-Output "Published to https://wushinhuei.github.io/groundwater-well-management/"
