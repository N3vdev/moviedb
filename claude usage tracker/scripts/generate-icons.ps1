Add-Type -AssemblyName System.Drawing

# Mirrors the "happy" cat drawn in shared/mascot.js (16x16 grid, ears, tail,
# whiskers). Static PNG only — no animation — used for the toolbar icon.
$gridW = 16
$gridH = 16
$centerX = 7.5
$centerY = 8.5
$radius = 6.4

$bodyColor = [System.Drawing.Color]::FromArgb(255, 125, 211, 168)   # happy mint
$ink = [System.Drawing.Color]::FromArgb(255, 43, 39, 64)
$blush = [System.Drawing.Color]::FromArgb(255, 244, 163, 184)
$innerEar = [System.Drawing.Color]::FromArgb(255, 247, 198, 217)
$whisker = [System.Drawing.Color]::FromArgb(217, 255, 255, 255)

function Test-Body([double]$x, [double]$y) {
    $dx = $x - $centerX
    $dy = $y - $centerY
    return ([Math]::Sqrt($dx * $dx + $dy * $dy) -le $radius)
}

# Cell -> color map, later entries win (draw order: body, ears, whiskers, eyes, mouth, blush)
$cellColor = @{}

for ($y = 0; $y -lt $gridH; $y++) {
    for ($x = 0; $x -lt $gridW; $x++) {
        if (Test-Body $x $y) { $cellColor["$x,$y"] = $bodyColor }
    }
}

# Ears (triangles) + inner ear
foreach ($x in @(4)) { $cellColor["$x,0"] = $bodyColor }
foreach ($x in @(3,4,5)) { $cellColor["$x,1"] = $bodyColor }
foreach ($x in @(3,4,5,6)) { $cellColor["$x,2"] = $bodyColor }
$cellColor["4,1"] = $innerEar

foreach ($x in @(11)) { $cellColor["$x,0"] = $bodyColor }
foreach ($x in @(10,11,12)) { $cellColor["$x,1"] = $bodyColor }
foreach ($x in @(9,10,11,12)) { $cellColor["$x,2"] = $bodyColor }
$cellColor["11,1"] = $innerEar

# Tail (static curl, no animation for the icon)
foreach ($c in @(@(12,12),@(13,12),@(13,13),@(14,13),@(14,14),@(15,14))) {
    $cellColor["$($c[0]),$($c[1])"] = $bodyColor
}

# Whiskers
foreach ($c in @(@(0,9),@(1,9),@(2,9),@(1,11),@(2,11),@(13,9),@(14,9),@(15,9),@(13,11),@(14,11))) {
    $cellColor["$($c[0]),$($c[1])"] = $whisker
}

# Eyes (open, happy)
foreach ($c in @(@(5,8),@(6,8),@(5,9),@(6,9),@(9,8),@(10,8),@(9,9),@(10,9))) {
    $cellColor["$($c[0]),$($c[1])"] = $ink
}

# Happy mouth
$cellColor["6,11"] = $ink
$cellColor["7,12"] = $ink
$cellColor["8,12"] = $ink
$cellColor["9,11"] = $ink

# Blush
$cellColor["3,10"] = $blush
$cellColor["12,10"] = $blush

$sizes = @(16, 32, 48, 128)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $scriptDir "..\icons"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

foreach ($size in $sizes) {
    $cell = $size / [double]$gridW
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.Clear([System.Drawing.Color]::Transparent)

    foreach ($key in $cellColor.Keys) {
        $parts = $key -split ","
        $x = [int]$parts[0]
        $y = [int]$parts[1]
        $color = $cellColor[$key]
        $brush = New-Object System.Drawing.SolidBrush($color)
        $rx = [Math]::Floor($x * $cell)
        $ry = [Math]::Floor($y * $cell)
        $rw = [Math]::Ceiling($cell)
        $rh = [Math]::Ceiling($cell)
        $g.FillRectangle($brush, $rx, $ry, $rw, $rh)
        $brush.Dispose()
    }

    $outPath = Join-Path $outDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Wrote $outPath"
}
