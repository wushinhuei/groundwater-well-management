$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot "batch_docs_catalog.json"
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $configPath | ConvertFrom-Json
$outputPath = Join-Path $root $config.outputFileName

$catalog = @{}
foreach ($property in $config.entries.PSObject.Properties) {
    $catalog[$property.Name] = $property.Value
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add($config.title)
$lines.Add("=" * 54)
$lines.Add("")
foreach ($line in $config.introduction) {
    $lines.Add($line)
}
$lines.Add("")

$batchFiles = Get-ChildItem -LiteralPath $root -Filter "*.bat" -File | Sort-Object Name
foreach ($file in $batchFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName
    $match = [regex]::Match($content, "(?im)^\s*rem\s+DOC_ID=([A-Za-z0-9_-]+)\s*$")
    $docId = if ($match.Success) { $match.Groups[1].Value } else { "" }
    $entry = if ($docId -and $catalog.ContainsKey($docId)) { $catalog[$docId] } else { $null }

    $lines.Add($config.labels.filePrefix + $file.Name + $config.labels.fileSuffix)
    if ($entry) {
        $lines.Add($config.labels.purpose + $entry.purpose)
        $lines.Add($config.labels.usage + $entry.usage)
        $lines.Add($config.labels.note + $entry.note)
    } else {
        $lines.Add($config.labels.purpose + $config.unknown.purpose)
        $lines.Add($config.labels.usage + $config.unknown.usage)
        $lines.Add($config.labels.note + $config.unknown.note)
    }
    $lines.Add("")
}

$newContent = ($lines -join "`r`n") + "`r`n"
$oldContent = if (Test-Path -LiteralPath $outputPath) {
    [System.IO.File]::ReadAllText($outputPath)
} else {
    ""
}

if ($oldContent -ne $newContent) {
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($outputPath, $newContent, $utf8Bom)
}

