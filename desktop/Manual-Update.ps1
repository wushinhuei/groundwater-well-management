$ErrorActionPreference='Stop'
try {
  Write-Host '=== 手動更新抽水紀錄 ===' -ForegroundColor Cyan
  Write-Host ('開始時間：'+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  Write-Host '每次處理到期佇列中的一批，優先補查最近三個已結束月份，保留節流及冷卻限制。'
  $configPath=Join-Path $env:LOCALAPPDATA 'GroundwaterPC\config.json'
  if(-not (Test-Path -LiteralPath $configPath)) {throw '尚未設定。請先執行同資料夾的 Setup.cmd，再執行 Login.cmd 與 Verify.cmd。'}
  $config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if(-not $config.nodeExecutable -or -not (Test-Path -LiteralPath $config.nodeExecutable)) {throw '找不到設定中的 Node.js，請檢查本機設定。'}
  if(-not $config.serviceAccountFile -or -not (Test-Path -LiteralPath $config.serviceAccountFile)) {throw '找不到 Google Drive 金鑰檔，請檢查本機設定的檔案路徑。'}
  if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\playwright\package.json'))) {throw '缺少 Playwright。請在此套件資料夾執行 npm install --ignore-scripts --no-audit --no-fund。'}
  Write-Host '開始執行；若登入過期，請執行 Login.cmd 後重試。'
  & powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $PSScriptRoot 'Run.ps1') -Mode scheduled
  $result=$LASTEXITCODE
  Write-Host ('結束時間：'+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  Write-Host ('月份日誌：'+(Join-Path $env:LOCALAPPDATA 'GroundwaterPC\logs'))
  Write-Host ('執行日誌：'+$config.stateDirectory)
  if($result -ne 0) {Write-Host '本次未正常完成。請依上方錯誤與日誌處理；本工具不會自動反覆重試。' -ForegroundColor Yellow;exit $result}
  Write-Host '本次指令正常結束；可能已上傳一批、沒有到期批次，或已有其他更新正在執行。' -ForegroundColor Green
  Write-Host '請以上方結果與日誌為準。網站更新以 published-verified 狀態為準；失敗請查看 local-publish-status.json。'
  exit 0
} catch {
  Write-Host ('無法執行：'+$_.Exception.Message) -ForegroundColor Red
  exit 1
}
