# ─────────────────────────────────────────────────────────────────────────────
# import-a3-markers.ps1
# Converts Arma 3 .paa marker files to .png and copies them into
# public/markers/icons/ with the correct Arma 3 marker type names.
# ─────────────────────────────────────────────────────────────────────────────

$SrcBase   = "C:\Users\koda\OneDrive\Desktop\ui_f_data\Map\Markers"
$Dest      = Join-Path $PSScriptRoot "..\public\markers\icons"
$ConverterDir = "D:\SteamLibrary\steamapps\common\Arma 3 Tools\ImageToPAA"
$Converter = Join-Path $ConverterDir "ImageToPAA.exe"

if (-not (Test-Path $Converter)) {
    Write-Host "ERROR: ImageToPAA.exe not found at: $Converter" -ForegroundColor Red
    exit 1
}

Write-Host "Converter: $Converter" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$copied = 0; $skipped = 0

function ConvertAndCopy($paaPath, $destName) {
    $destFile = Join-Path $Dest $destName
    $tmpPng   = Join-Path $ConverterDir ([System.IO.Path]::GetFileNameWithoutExtension($paaPath) + "_tmp.png")

    Push-Location $ConverterDir
    try {
        $result = & $Converter $paaPath $tmpPng 2>&1
        if (Test-Path $tmpPng) {
            Move-Item $tmpPng $destFile -Force
            Write-Host "  OK  $destName" -ForegroundColor Green
            $script:copied++
        } else {
            Write-Host "  ??  $destName  (no output: $result)" -ForegroundColor Yellow
            $script:skipped++
        }
    } catch {
        Write-Host "  ERR $destName  ($_)" -ForegroundColor Red
        $script:skipped++
    } finally {
        Pop-Location
        if (Test-Path $tmpPng) { Remove-Item $tmpPng -Force }
    }
}

# NATO — filenames already match Arma 3 marker type names
Write-Host "`nNATO markers…"
Get-ChildItem "$SrcBase\NATO\*.paa" | ForEach-Object {
    ConvertAndCopy $_.FullName ($_.BaseName.ToLower() + ".png")
}

# HandDrawn — add hd_ prefix, strip _CA/_ca suffix
Write-Host "`nHandDrawn (hd_) markers…"
Get-ChildItem "$SrcBase\HandDrawn\*.paa" | ForEach-Object {
    $base = ($_.BaseName -replace '_CA$', '' -replace '_ca$', '').ToLower()
    ConvertAndCopy $_.FullName "hd_$base.png"
}

# Military — add mil_ prefix, special renames for mismatched names
Write-Host "`nMilitary (mil_) markers…"
$milRename = @{ "box" = "square"; "arrow" = "arrow1" }
Get-ChildItem "$SrcBase\Military\*.paa" | ForEach-Object {
    $base = ($_.BaseName -replace '_CA$', '' -replace '_ca$', '').ToLower()
    if ($milRename.ContainsKey($base)) { $base = $milRename[$base] }
    ConvertAndCopy $_.FullName "mil_$base.png"
}

Write-Host "`n── Done ──────────────────────────────────────────────────────────────"
Write-Host "  Copied : $copied"
Write-Host "  Skipped: $skipped"
Write-Host "  Output : $Dest"
