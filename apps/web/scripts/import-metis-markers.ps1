# ─────────────────────────────────────────────────────────────────────────────
# import-metis-markers.ps1
# Converts METIS marker PAA files → PNG, crops to a symmetric canvas centered
# on the BLUFOR frame shape, then saves to public/markers/metis/.
#
# Requires: Arma 3 Tools (ImageToPAA.exe), Python 3 + Pillow
# ─────────────────────────────────────────────────────────────────────────────

$ModBase      = "D:\SteamLibrary\steamapps\workshop\content\107410\1508091616\addons\mts_markers\data"
$DestBase     = Join-Path $PSScriptRoot "..\public\markers\metis"
$ConverterDir = "D:\SteamLibrary\steamapps\common\Arma 3 Tools\ImageToPAA"
$Converter    = Join-Path $ConverterDir "ImageToPAA.exe"
$TmpDir       = Join-Path ([System.IO.Path]::GetTempPath()) "metis_import_tmp"

if (-not (Test-Path $Converter)) {
    Write-Host "ERROR: ImageToPAA.exe not found at $Converter" -ForegroundColor Red; exit 1
}
python3 -c "from PIL import Image" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python Pillow not installed. Run: pip install Pillow" -ForegroundColor Red; exit 1
}

# ── Build conversion list ────────────────────────────────────────────────────
# Each entry: @{ src = absolute PAA path; dest = relative dest path under $DestBase }

$jobs = [System.Collections.Generic.List[hashtable]]::new()
$sides = @('blu', 'red', 'neu', 'unk')

foreach ($side in $sides) {
    $sd = Join-Path $ModBase $side

    # Solid frame, dashed frame, HQ stave
    $jobs.Add(@{ src = "$sd\mts_markers_${side}_frameshape.paa";      dest = "frame/$side.png"      })
    $jobs.Add(@{ src = "$sd\mts_markers_${side}dash_frameshape.paa";  dest = "frame/${side}_dash.png" })
    $jobs.Add(@{ src = "$sd\mts_markers_${side}_hq.paa";             dest = "frame/${side}_hq.png"  })

    # All mod icons for this side
    $modDir = Join-Path $sd "mod"
    if (Test-Path $modDir) {
        Get-ChildItem "$modDir\*.paa" | ForEach-Object {
            $name = $_.BaseName -replace "mts_markers_${side}_mod_", ""
            $jobs.Add(@{ src = $_.FullName; dest = "mod/${side}_${name}.png" })
        }
    }

    # Size echelons 1–12
    $sizeDir = Join-Path $sd "size"
    if (Test-Path $sizeDir) {
        Get-ChildItem "$sizeDir\*.paa" | ForEach-Object {
            $n = $_.BaseName -replace "mts_markers_${side}_size_", ""
            $jobs.Add(@{ src = $_.FullName; dest = "size/${side}_${n}.png" })
        }
    }
}

# Reinforced / reduced common overlays
$comSz = Join-Path $ModBase "com\size"
$jobs.Add(@{ src = "$comSz\mts_markers_com_size_reinforced.paa";          dest = "com/reinforced.png"          })
$jobs.Add(@{ src = "$comSz\mts_markers_com_size_reduced.paa";             dest = "com/reduced.png"             })
$jobs.Add(@{ src = "$comSz\mts_markers_com_size_reinforced_reduced.paa";  dest = "com/reinforced_reduced.png"  })

# ── Convert PAA → tmp PNG ────────────────────────────────────────────────────

Write-Host "`nPreparing temp dir: $TmpDir"
if (Test-Path $TmpDir) { Remove-Item $TmpDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

Write-Host "Converting $($jobs.Count) PAA files..."
$ok = 0; $fail = 0

# tmpMap: dest relative path → absolute tmp PNG path
$tmpMap = @{}

foreach ($j in $jobs) {
    if (-not (Test-Path $j.src)) {
        Write-Host "  SKIP (not found)  $($j.dest)" -ForegroundColor DarkGray
        $fail++; continue
    }

    # Unique flat filename to avoid collisions in tmp dir
    $tmpName = ($j.dest -replace '[/\\]', '_')
    $tmpPng  = Join-Path $TmpDir $tmpName

    Push-Location $ConverterDir
    $null = & $Converter $j.src $tmpPng 2>&1
    Pop-Location

    if (Test-Path $tmpPng) {
        $tmpMap[$j.dest] = ($tmpPng -replace '\\', '/')
        Write-Host "  OK   $($j.dest)" -ForegroundColor Green
        $ok++
    } else {
        Write-Host "  FAIL $($j.dest)" -ForegroundColor Yellow
        $fail++
    }
}

Write-Host "Converted: $ok  Failed/skipped: $fail"

# ── Python: analyse + crop ────────────────────────────────────────────────────

$mapJson = ($tmpMap.GetEnumerator() | ForEach-Object {
    '"' + $_.Key + '": "' + $_.Value + '"'
}) -join ", "

$destFwd = $DestBase -replace '\\', '/'

$pyScript = @"
import json, os, sys
from PIL import Image

mapping = { $mapJson }
dest_base = r"$destFwd"

# 1. Find the BLUFOR frame center in the raw 1024x1024 image
frame_key = 'frame/blu.png'
if frame_key not in mapping:
    print('ERROR: frame/blu.png was not converted – cannot determine crop region.')
    sys.exit(1)

frame_img = Image.open(mapping[frame_key]).convert('RGBA')
fb = frame_img.getbbox()
W, H = frame_img.size
print(f'Source image size: {W}x{H}')
print(f'Frame (blu) bbox:  {fb}')

fx = (fb[0] + fb[2]) // 2
fy = (fb[1] + fb[3]) // 2
print(f'Frame center:      ({fx}, {fy})')

# 2. Walk all converted images to find max content extents from frame center
max_l = max_r = max_t = max_b = 0
for dest, src in mapping.items():
    img = Image.open(src).convert('RGBA')
    bb  = img.getbbox()
    if bb is None:
        continue
    max_l = max(max_l, fx - bb[0])
    max_t = max(max_t, fy - bb[1])
    max_r = max(max_r, bb[2] - fx)
    max_b = max(max_b, bb[3] - fy)

PAD = 10  # pixels of breathing room on each side

# Symmetric crop so frame sits at exact centre of output image
half_w = max(max_l, max_r) + PAD
half_h = max(max_t, max_b) + PAD

crop = (
    max(0, fx - half_w),
    max(0, fy - half_h),
    min(W, fx + half_w),
    min(H, fy + half_h),
)
out_w = crop[2] - crop[0]
out_h = crop[3] - crop[1]

print(f'Crop box:          {crop}')
print(f'Output size:       {out_w} x {out_h}')

# 3. Crop every image and write to dest
import shutil
if os.path.exists(dest_base):
    shutil.rmtree(dest_base)

saved = 0
for dest, src in mapping.items():
    out_path = os.path.join(dest_base, dest.replace('/', os.sep))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img = Image.open(src).convert('RGBA')
    img.crop(crop).save(out_path)
    saved += 1

print(f'Saved {saved} images to {dest_base}')
print()
print('=== Update these constants in your code ===')
print(f'const METIS_W = {out_w}')
print(f'const METIS_H = {out_h}')
"@

$pyFile = Join-Path $TmpDir "crop.py"
$pyScript | Set-Content $pyFile -Encoding utf8

Write-Host "`nAnalysing bounding boxes and cropping..."
python3 $pyFile

# ── Cleanup ──────────────────────────────────────────────────────────────────
Remove-Item $TmpDir -Recurse -Force
Write-Host "`nDone. Check the METIS_W / METIS_H values above and update:"
Write-Host "  components/operations/map/LayersPanel.tsx"
Write-Host "  components/operations/map/AnnotationEditor.tsx"
