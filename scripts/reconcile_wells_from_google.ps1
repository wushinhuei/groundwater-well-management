param(
  [string]$RegistryPath = "docs\data\pumping-records\well-registry-115.json",
  [string]$WellsPath = "data\wells.json"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$registryFile = Join-Path $projectRoot $RegistryPath
$wellsFile = Join-Path $projectRoot $WellsPath
$registry = Get-Content -Raw -Encoding UTF8 -LiteralPath $registryFile | ConvertFrom-Json
$parsedWells = Get-Content -Raw -Encoding UTF8 -LiteralPath $wellsFile | ConvertFrom-Json
$existingWells = @()
foreach ($item in $parsedWells) {
  $existingWells += $item
}
$now = (Get-Date).ToUniversalTime().ToString("o")

function Format-RocDate([string]$value) {
  $digits = ([string]$value -replace "\D", "").PadLeft(7, "0")
  if ($digits.Length -ne 7) {
    return ""
  }
  return "{0}.{1}.{2}" -f $digits.Substring(0, 3), $digits.Substring(3, 2), $digits.Substring(5, 2)
}

function Get-NextApplicationDate([string]$approvedEnd) {
  $digits = ([string]$approvedEnd -replace "\D", "").PadLeft(7, "0")
  if ($digits.Length -ne 7) {
    return ""
  }

  $year = [int]$digits.Substring(0, 3) + 1911
  $month = [int]$digits.Substring(3, 2)
  $day = [int]$digits.Substring(5, 2)
  $date = (Get-Date -Year $year -Month $month -Day $day).AddMonths(-3)
  return "{0}.{1:00}.{2:00}" -f ($date.Year - 1911), $date.Month, $date.Day
}

function Normalize-WellName([string]$name) {
  return ([string]$name -replace "-(日南圳|九張犁圳)$", "").Trim()
}

foreach ($well in $existingWells) {
  if ($well.station -eq "磁瑤" -and $well.waterRightNo -eq "B112603") {
    $well.id = "well-磁瑤-b0112603"
    $well.wellNumber = "B0112603"
    $well.waterRightNo = "B0112603"
  }
  if ($well.station -eq "大安" -and $well.waterRightNo -eq "K0123725") {
    $well.id = "well-大安-b1140034"
    $well.wellNumber = "B1140034"
    $well.waterRightNo = "B1140034"
  }
}

$existingByWaterRight = @{}
foreach ($well in $existingWells) {
  $existingByWaterRight[[string]$well.waterRightNo] = $well
}

$merged = foreach ($source in $registry.records) {
  $waterRightNo = [string]$source.waterRightNo
  $name = Normalize-WellName $source.wellName
  $period = "{0} 至 {1}" -f (Format-RocDate $source.approvedStart), (Format-RocDate $source.approvedEnd)
  $well = $existingByWaterRight[$waterRightNo]

  if ($null -eq $well) {
    $well = [pscustomobject][ordered]@{
      id = "well-$($source.station)-$($waterRightNo.ToLowerInvariant())"
      wellNumber = $waterRightNo
      name = $name
      station = [string]$source.station
      district = ""
      section = ""
      address = [string]$source.address
      latitude = $null
      longitude = $null
      twd97X = ""
      twd97Y = ""
      purpose = "農業灌溉用水"
      depthMeters = [decimal]$source.depthMeters
      diameterMm = 0
      pumpHorsepower = 0
      pumpOutletInch = 0
      planFlowCms = [decimal]$source.registeredFlowCms
      benefitedAreaHa = [decimal]$source.benefitedAreaHa
      registeredFlowCms = [decimal]$source.registeredFlowCms
      irrigationSystem = [string]$source.waterSystem
      waterRightNo = $waterRightNo
      waterRightPeriod = $period
      nextApplicationPeriod = Get-NextApplicationDate $source.approvedEnd
      completionDate = ""
      constructionYear = ""
      electricityNo = ""
      agriculturalPower = ""
      startedAt = ""
      status = "使用中"
      managementUnit = "$($source.station)工作站"
      publicNote = if ($source.note) { [string]$source.note } else { "" }
      internalNote = "由 Google 115年地下水水權用水紀錄表總表匯入。"
      isPublic = $true
      attachments = @()
      photos = @()
      auditTrail = @([pscustomobject]@{ action = "imported-google-registry"; actor = "system"; at = $now })
      createdAt = $now
      createdBy = "system"
      updatedAt = $now
      updatedBy = "system"
    }
  } else {
    $well.wellNumber = $waterRightNo
    $well.name = $name
    $well.station = [string]$source.station
    $well.address = [string]$source.address
    $well.depthMeters = [decimal]$source.depthMeters
    $well.planFlowCms = [decimal]$source.registeredFlowCms
    $well.benefitedAreaHa = [decimal]$source.benefitedAreaHa
    $well.registeredFlowCms = [decimal]$source.registeredFlowCms
    $well.waterRightNo = $waterRightNo
    $well.waterRightPeriod = $period
    $well.nextApplicationPeriod = Get-NextApplicationDate $source.approvedEnd
    if (-not $well.irrigationSystem) {
      $well.irrigationSystem = [string]$source.waterSystem
    }
    if ($source.note) {
      $well.publicNote = [string]$source.note
    }
    $well.updatedAt = $now
    $well.updatedBy = "system"
    $well.auditTrail = @($well.auditTrail) + [pscustomobject]@{
      action = "synchronized-google-registry"
      actor = "system"
      at = $now
    }
  }

  $well
}

if (@($merged).Count -ne 111) {
  throw "Expected 111 wells after reconciliation, found $(@($merged).Count)."
}

$json = $merged | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($wellsFile, $json, $utf8NoBom)

[pscustomobject]@{
  Wells = @($merged).Count
  Added = @($merged | Where-Object { $_.createdAt -eq $now }).Count
  Photos = @($merged | ForEach-Object { @($_.photos).Count } | Measure-Object -Sum).Sum
  Attachments = @($merged | ForEach-Object { @($_.attachments).Count } | Measure-Object -Sum).Sum
}
