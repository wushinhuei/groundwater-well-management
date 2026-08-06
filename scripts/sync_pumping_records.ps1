param(
  [string]$SpreadsheetId = "1pYv1n_6dEsU0digJY-X1ZlpEPQPxsFkgrnK1Mz6G_1Q",
  [string]$SheetGid = "1278614012",
  [string]$RegistrySheetGid = "1283183373"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot "docs\data\pumping-records"
$xlsxPath = Join-Path $outputDir "pumping-records-115.xlsx"
$csvPath = Join-Path $outputDir "pumping-records-115.csv"
$jsonPath = Join-Path $outputDir "pumping-records-115.json"
$registryCsvPath = Join-Path $outputDir "well-registry-115.csv"
$registryJsonPath = Join-Path $outputDir "well-registry-115.json"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$baseUrl = "https://docs.google.com/spreadsheets/d/$SpreadsheetId/export"
Invoke-WebRequest -UseBasicParsing "${baseUrl}?format=xlsx" -OutFile $xlsxPath
Invoke-WebRequest -UseBasicParsing "${baseUrl}?format=csv&gid=$SheetGid" -OutFile $csvPath
Invoke-WebRequest -UseBasicParsing "${baseUrl}?format=csv&gid=$RegistrySheetGid" -OutFile $registryCsvPath

$headers = @(
  "recordNo", "station", "wellName", "waterRightNo",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "annualActualM3", "note"
)

function Convert-PumpingValue([string]$value) {
  $normalized = ([string]$value).Trim()
  if (-not $normalized -or $normalized -eq "-") {
    return $null
  }

  return [decimal]::Parse(
    $normalized.Replace(",", ""),
    [Globalization.CultureInfo]::InvariantCulture
  )
}

$csvLines = Get-Content -LiteralPath $csvPath -Encoding UTF8
$sourceRows = @($csvLines | Select-Object -Skip 2 | ConvertFrom-Csv -Header $headers)
$months = @(
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
)

$records = foreach ($row in $sourceRows) {
  if (-not $row.recordNo.Trim()) {
    continue
  }

  $monthly = [ordered]@{}
  foreach ($month in $months) {
    $monthly[$month] = Convert-PumpingValue $row.$month
  }

  [ordered]@{
    recordNo = [int]$row.recordNo.Trim()
    station = $row.station.Trim()
    wellName = $row.wellName.Trim()
    waterRightNo = $row.waterRightNo.Trim()
    monthlyActualM3 = $monthly
    annualActualM3 = Convert-PumpingValue $row.annualActualM3
    note = if (([string]$row.note).Trim()) { ([string]$row.note).Trim() } else { $null }
  }
}

$payload = [ordered]@{
  schemaVersion = 1
  title = "115年地下水水權用水紀錄表"
  yearMinguo = 115
  yearGregorian = 2026
  unit = "m3"
  sourceUrl = "https://docs.google.com/spreadsheets/d/$SpreadsheetId/edit?gid=$SheetGid#gid=$SheetGid"
  sourceSheet = "月實取水量表"
  synchronizedAt = (Get-Date).ToUniversalTime().ToString("o")
  availableThroughMonth = 7
  recordCount = @($records).Count
  sourceFiles = [ordered]@{
    xlsx = "pumping-records-115.xlsx"
    csv = "pumping-records-115.csv"
    xlsxSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $xlsxPath).Hash.ToLowerInvariant()
    csvSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $csvPath).Hash.ToLowerInvariant()
  }
  records = @($records)
}

$payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$registryHeaders = @(
  "recordNo", "station", "wellName", "waterRightNo", "approvedStart", "approvedEnd",
  "benefitedAreaHa", "address", "useMethod", "registeredFlowCms", "dailyHours",
  "annualAllowedM3", "depthMeters", "diversionMonths", "waterSystem", "note",
  "extraQ", "extraR", "cmd", "extraT", "extraU", "extraV", "extraW", "extraX", "extraY"
)
$registryLines = Get-Content -LiteralPath $registryCsvPath -Encoding UTF8
$registryRows = @($registryLines | Select-Object -Skip 2 | ConvertFrom-Csv -Header $registryHeaders)
$registryRecords = foreach ($row in $registryRows) {
  if (-not ([string]$row.recordNo).Trim()) {
    continue
  }

  [ordered]@{
    recordNo = [int]$row.recordNo.Trim()
    station = $row.station.Trim()
    wellName = $row.wellName.Trim()
    waterRightNo = $row.waterRightNo.Trim()
    approvedStart = $row.approvedStart.Trim()
    approvedEnd = $row.approvedEnd.Trim()
    benefitedAreaHa = Convert-PumpingValue $row.benefitedAreaHa
    address = $row.address.Trim()
    registeredFlowCms = Convert-PumpingValue $row.registeredFlowCms
    dailyHours = Convert-PumpingValue $row.dailyHours
    annualAllowedM3 = Convert-PumpingValue $row.annualAllowedM3
    depthMeters = Convert-PumpingValue $row.depthMeters
    diversionMonths = $row.diversionMonths.Trim()
    waterSystem = $row.waterSystem.Trim()
    note = if (([string]$row.note).Trim()) { ([string]$row.note).Trim() } else { $null }
  }
}

$registryPayload = [ordered]@{
  schemaVersion = 1
  title = "臺中管理處地下水水權狀總表"
  yearMinguo = 115
  yearGregorian = 2026
  sourceUrl = "https://docs.google.com/spreadsheets/d/$SpreadsheetId/edit?gid=$RegistrySheetGid#gid=$RegistrySheetGid"
  sourceSheet = "總表"
  synchronizedAt = (Get-Date).ToUniversalTime().ToString("o")
  recordCount = @($registryRecords).Count
  records = @($registryRecords)
}
$registryPayload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $registryJsonPath -Encoding UTF8

[pscustomobject]@{
  Records = @($records).Count
  RegistryRecords = @($registryRecords).Count
  Xlsx = $xlsxPath
  Csv = $csvPath
  Json = $jsonPath
  RegistryCsv = $registryCsvPath
  RegistryJson = $registryJsonPath
}
