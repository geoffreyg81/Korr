# Genere toutes les icones de Korr a partir des logos sources.
#
#   imagelogocarre.png -> icones classiques (carre arrondi, deja concu pour cela)
#   imagelogorond.png  -> icone « maskable » Android, recadree en cercle
#
# Les sources ont un fond transparent tres large : on detecte la boite
# englobante des pixels visibles avant de redimensionner, sinon le logo
# apparaitrait minuscule au centre d'une icone vide.
#
#   powershell -ExecutionPolicy Bypass -File build-icons.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectDir = $PSScriptRoot
$iconsDir = Join-Path $projectDir "icons"
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Force $iconsDir | Out-Null }

# Boite englobante des pixels non transparents.
function Get-ContentBounds($bitmap) {
  $minX = $bitmap.Width; $minY = $bitmap.Height; $maxX = -1; $maxY = -1
  $data = $bitmap.LockBits(
    (New-Object System.Drawing.Rectangle 0, 0, $bitmap.Width, $bitmap.Height),
    [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $bitmap.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      $row = $y * $stride
      for ($x = 0; $x -lt $bitmap.Width; $x++) {
        # Format32bppArgb en memoire : B,G,R,A
        if ($bytes[$row + $x * 4 + 3] -gt 12) {
          if ($x -lt $minX) { $minX = $x }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }
  } finally { $bitmap.UnlockBits($data) }

  if ($maxX -lt 0) { throw "Image entierement transparente" }
  return New-Object System.Drawing.Rectangle $minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1)
}

# Recadre au contenu, puis centre dans un carre pour ne pas deformer.
function Get-SquareTrimmed($path) {
  $source = [System.Drawing.Bitmap]::new($path)
  try {
    $bounds = Get-ContentBounds $source
    $side = [Math]::Max($bounds.Width, $bounds.Height)
    $square = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($square)
    $g.InterpolationMode = "HighQualityBicubic"
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($source,
      (New-Object System.Drawing.Rectangle ([int](($side - $bounds.Width) / 2)), ([int](($side - $bounds.Height) / 2)), $bounds.Width, $bounds.Height),
      $bounds, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    return $square
  } finally { $source.Dispose() }
}

function Save-Resized($bitmap, $size, $target) {
  $out = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = "HighQualityBicubic"
  $g.SmoothingMode = "AntiAlias"
  $g.PixelOffsetMode = "HighQuality"
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($bitmap, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $g.Dispose()
  $out.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  "  $(Split-Path $target -Leaf) ($size x $size)"
}

"Icones classiques (logo carre) :"
$square = Get-SquareTrimmed (Join-Path $projectDir "imagelogocarre.png")
foreach ($size in 16, 32, 48, 128, 192, 512) {
  Save-Resized $square $size (Join-Path $iconsDir "icon-$size.png")
}

# Icone maskable : Android recadre en cercle et rogne jusqu'a 20 % de chaque
# bord. Le fond doit donc etre plein bord a bord, et le motif tenir au centre.
""
"Icone maskable (logo rond, fond plein) :"
$round = Get-SquareTrimmed (Join-Path $projectDir "imagelogorond.png")
$maskSize = 512
$maskable = New-Object System.Drawing.Bitmap $maskSize, $maskSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($maskable)
$g.InterpolationMode = "HighQualityBicubic"
$g.SmoothingMode = "AntiAlias"
# Fond plein aux couleurs de la marque, pour qu'aucun coin ne soit transparent.
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle 0, 0, $maskSize, $maskSize),
  [System.Drawing.Color]::FromArgb(139, 92, 246),
  [System.Drawing.Color]::FromArgb(67, 56, 202),
  45.0)
$g.FillRectangle($brush, 0, 0, $maskSize, $maskSize)
# Le logo occupe 66 % : il reste entier meme apres le rognage le plus agressif.
$inner = [int]($maskSize * 0.66)
$offset = [int](($maskSize - $inner) / 2)
$g.DrawImage($round, (New-Object System.Drawing.Rectangle $offset, $offset, $inner, $inner))
$g.Dispose()
$maskable.Save((Join-Path $iconsDir "icon-512-maskable.png"), [System.Drawing.Imaging.ImageFormat]::Png)
"  icon-512-maskable.png (512 x 512, fond plein)"

# Version ronde pleine resolution, utile pour le site et les fiches boutique.
Save-Resized $round 512 (Join-Path $iconsDir "logo-round-512.png")

$square.Dispose(); $round.Dispose(); $maskable.Dispose()
""
"Termine."
