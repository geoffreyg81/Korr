# Zéro Friction — application de bureau.
# Corrige la sélection dans N'IMPORTE QUELLE application Windows :
# sélectionne du texte, appuie sur Ctrl+Alt+C, le texte corrigé est recollé.
#
# 100 % locale : copie la sélection, l'envoie au backend (127.0.0.1:8787),
# recolle le résultat. Icône dans la zone de notification pour changer de
# mode (Instantané / IA) et de style (Pro, Amical, Concis).
#
#   npm run app        -> lance l'application (sans fenêtre)
#   npm run app:stop   -> l'arrête
param(
  [switch]$Stop,
  [string]$SelfTest
)

$ErrorActionPreference = "Stop"
$projectDir = $PSScriptRoot
$backendUrl = "http://127.0.0.1:8787"
$configPath = Join-Path $env:LOCALAPPDATA "ZeroFriction\app-config.json"

# --- Arrêt d'une instance déjà lancée -------------------------------------
if ($Stop) {
  $me = $PID
  $others = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -match "app-tray\.ps1" -and $_.CommandLine -notmatch "-Stop" }
  if ($others) {
    $others | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Output "Application arretee."
  } else {
    Write-Output "L'application n'etait pas lancee."
  }
  exit 0
}

# --- Configuration (mode + style), persistée entre les sessions ------------
function Load-Config {
  try {
    $raw = Get-Content -Raw -Encoding UTF8 $configPath
    $json = $raw | ConvertFrom-Json
    return @{ mode = [string]$json.mode; style = [string]$json.style }
  } catch {
    return @{ mode = "instant"; style = "corriger" }
  }
}
function Save-Config($config) {
  try {
    $dir = Split-Path $configPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    @{ mode = $config.mode; style = $config.style } | ConvertTo-Json |
      Out-File -FilePath $configPath -Encoding utf8
  } catch {}
}
$script:config = Load-Config

# --- Appel du backend -------------------------------------------------------
function Invoke-Backend($text) {
  $payload = @{ mode = $script:config.mode; style = $script:config.style; text = $text } | ConvertTo-Json -Depth 3
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  return Invoke-RestMethod -Uri "$backendUrl/api/correct" -Method Post `
    -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 180
}

function Start-BackendIfDown {
  try {
    Invoke-RestMethod -Uri "$backendUrl/api/health" -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    try {
      Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $projectDir -WindowStyle Hidden
      Start-Sleep -Milliseconds 1800
      return $true
    } catch { return $false }
  }
}

# --- Mode auto-test : valide le circuit HTTP sans interface -----------------
if ($SelfTest) {
  [void](Start-BackendIfDown)
  $result = Invoke-Backend $SelfTest
  Write-Output ("engine : " + $result.engine)
  Write-Output ("texte  : " + $result.text)
  exit 0
}

# --- Interface : instance unique, raccourci global, icône de notification ---
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$created = $false
$mutex = New-Object System.Threading.Mutex($true, "ZeroFrictionTrayApp", [ref]$created)
if (-not $created) { exit 0 }

Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class ZeroFrictionHotkey : NativeWindow, IDisposable {
  [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  private const int WM_HOTKEY = 0x0312;
  private int count = 0;
  public int PressCount = 0;
  public int LastId = 0;
  public ZeroFrictionHotkey() { CreateHandle(new CreateParams()); }
  public bool Register(int id, uint modifiers, uint key) {
    if (RegisterHotKey(Handle, id, modifiers, key)) { count++; return true; }
    return false;
  }
  protected override void WndProc(ref Message m) {
    if (m.Msg == WM_HOTKEY) { LastId = (int)m.WParam; PressCount++; }
    base.WndProc(ref m);
  }
  public void Dispose() {
    for (int id = 1; id <= 9; id++) { UnregisterHotKey(Handle, id); }
    DestroyHandle();
  }
}

public static class ZeroFrictionClipboardNative {
  [DllImport("user32.dll")]
  public static extern uint GetClipboardSequenceNumber();

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@

# Le presse-papiers Windows peut être momentanément verrouillé par une autre
# application. Toutes les opérations sensibles sont donc retentées brièvement.
function Invoke-ClipboardRetry {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Operation,
    [int]$Attempts = 12,
    [int]$DelayMs = 35
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try { return (& $Operation) } catch {
      $lastError = $_
      if ($attempt -lt $Attempts) { Start-Sleep -Milliseconds $DelayMs }
    }
  }
  throw $lastError
}

# Matérialise les données différées avant d'effacer le presse-papiers. Les
# flux, images et tableaux sont copiés pour ne pas rester liés à leur source.
function Copy-ClipboardPayload($value) {
  if ($null -eq $value) { return $null }

  if ($value -is [System.IO.MemoryStream]) {
    $memoryCopy = New-Object System.IO.MemoryStream
    $bytes = [byte[]]$value.ToArray()
    $memoryCopy.Write($bytes, 0, $bytes.Length)
    $memoryCopy.Position = 0
    return $memoryCopy
  }

  if ($value -is [System.IO.Stream]) {
    $copy = New-Object System.IO.MemoryStream
    $position = $null
    if ($value.CanSeek) {
      $position = $value.Position
      $value.Position = 0
    }
    try { $value.CopyTo($copy) } finally {
      if ($null -ne $position) { $value.Position = $position }
    }
    $copy.Position = 0
    return $copy
  }

  if ($value -is [System.Drawing.Image]) { return $value.Clone() }
  if ($value -is [System.Array]) {
    Write-Output -NoEnumerate ($value.Clone())
    return
  }

  return $value
}

# Sauvegarde tous les formats natifs présents (texte, HTML/RTF, bitmap,
# FileDrop et formats applicatifs). Si un format ne peut pas être matérialisé,
# on refuse la correction plutôt que de risquer de perdre cette donnée.
function Get-ClipboardSnapshot {
  $source = Invoke-ClipboardRetry { [System.Windows.Forms.Clipboard]::GetDataObject() }
  if ($null -eq $source) {
    return [pscustomobject]@{ WasEmpty = $true; DataObject = $null; FormatCount = 0 }
  }

  $formats = @($source.GetFormats($false))
  $autoConvert = $false
  if ($formats.Count -eq 0) {
    $formats = @($source.GetFormats($true))
    $autoConvert = $true
  }
  if ($formats.Count -eq 0) {
    return [pscustomobject]@{ WasEmpty = $true; DataObject = $null; FormatCount = 0 }
  }

  $copy = New-Object System.Windows.Forms.DataObject
  foreach ($format in $formats) {
    try {
      $payload = $source.GetData($format, $autoConvert)
      if ($null -eq $payload) { throw "Format vide : $format" }
      $materialized = Copy-ClipboardPayload $payload
      $copy.SetData($format, $false, $materialized)
    } catch {
      throw "Impossible de sauvegarder le format '$format' du presse-papiers : $($_.Exception.Message)"
    }
  }

  return [pscustomobject]@{
    WasEmpty = $false
    DataObject = $copy
    FormatCount = $formats.Count
  }
}

function Get-ClipboardSequence {
  return [uint32][ZeroFrictionClipboardNative]::GetClipboardSequenceNumber()
}

# Ne restaure jamais notre sauvegarde par-dessus un presse-papiers que
# l'utilisateur ou une autre application vient de modifier.
function Restore-ClipboardSnapshot($snapshot, [long]$expectedSequence = -1) {
  if ($expectedSequence -ge 0 -and [long](Get-ClipboardSequence) -ne $expectedSequence) {
    return $false
  }

  if ($snapshot.WasEmpty) {
    Invoke-ClipboardRetry { [System.Windows.Forms.Clipboard]::Clear() }
  } else {
    $dataObject = $snapshot.DataObject
    Invoke-ClipboardRetry {
      [System.Windows.Forms.Clipboard]::SetDataObject($dataObject, $true, 10, 40)
    }
  }
  return $true
}

function Wait-ForCopiedText([uint32]$sequenceBefore, [int]$timeoutMs = 1000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  $currentSequence = $sequenceBefore

  do {
    $currentSequence = Get-ClipboardSequence
    if ($currentSequence -ne $sequenceBefore) {
      try {
        $text = Invoke-ClipboardRetry -Attempts 3 -DelayMs 20 {
          if (-not [System.Windows.Forms.Clipboard]::ContainsText()) { return $null }
          return [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::UnicodeText)
        }
        if ($null -ne $text) {
          return [pscustomobject]@{ Text = [string]$text; Sequence = [uint32]$currentSequence }
        }
      } catch {}
    }
    Start-Sleep -Milliseconds 20
  } while ([DateTime]::UtcNow -lt $deadline)

  return [pscustomobject]@{ Text = ""; Sequence = [uint32]$currentSequence }
}

# Icône : coche blanche sur carré violet, dessinée à la volée.
$bitmap = New-Object System.Drawing.Bitmap 32, 32
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = "AntiAlias"
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(79, 70, 229))
$graphics.FillRectangle($brush, 0, 0, 32, 32)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 4
$pen.StartCap = "Round"; $pen.EndCap = "Round"
$graphics.DrawLines($pen, @(
  (New-Object System.Drawing.Point 7, 17),
  (New-Object System.Drawing.Point 13, 23),
  (New-Object System.Drawing.Point 25, 9)
))
$graphics.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $icon
$notify.Text = "Zéro Friction — Ctrl+Alt+C corrige la sélection"
$notify.Visible = $true

function Show-Balloon($title, $message, $kind) {
  $notify.BalloonTipTitle = $title
  $notify.BalloonTipText = $message
  $notify.BalloonTipIcon = $kind
  $notify.ShowBalloonTip(3500)
}

# --- Le cœur : copier la sélection, corriger, recoller ----------------------
# $override force un mode/style le temps d'une correction, sans changer le
# réglage retenu : c'est ce que font les raccourcis dédiés.
function Invoke-Correction($override) {
  $saved = $script:config
  if ($override) { $script:config = $override }
  try { Invoke-CorrectionCore } finally { $script:config = $saved }
}

function Try-RestoreClipboardSnapshot($snapshot, [long]$expectedSequence) {
  try { return [bool](Restore-ClipboardSnapshot $snapshot $expectedSequence) }
  catch { return $false }
}

function Invoke-CorrectionCore {
  # Attend que Ctrl+Alt soient relâchés, sinon le Ctrl+C simulé se mélange
  # aux touches encore enfoncées.
  $deadline = [DateTime]::Now.AddMilliseconds(1500)
  while ([System.Windows.Forms.Control]::ModifierKeys -ne [System.Windows.Forms.Keys]::None -and [DateTime]::Now -lt $deadline) {
    Start-Sleep -Milliseconds 20
  }

  # L'instantané conserve les formats natifs du presse-papiers, pas seulement
  # son éventuelle représentation texte.
  $clipboardSnapshot = $null
  try { $clipboardSnapshot = Get-ClipboardSnapshot } catch {
    Show-Balloon "Presse-papiers occupé" "Impossible de le sauvegarder sans risque. Réessaie dans un instant." "Warning"
    return
  }

  $targetWindow = [IntPtr]::Zero
  $copySequence = -1
  try {
    Invoke-ClipboardRetry { [System.Windows.Forms.Clipboard]::Clear() }
    $sequenceBeforeCopy = Get-ClipboardSequence
    [System.Windows.Forms.SendKeys]::SendWait("^c")
    # Capturé après Ctrl+C pour que le lancement depuis le menu de l'icône
    # retrouve bien l'application cible, une fois le menu refermé.
    $targetWindow = [ZeroFrictionClipboardNative]::GetForegroundWindow()
    $copied = Wait-ForCopiedText $sequenceBeforeCopy
    $copySequence = [long]$copied.Sequence
    $selection = [string]$copied.Text
  } catch {
    if ($copySequence -lt 0) { $copySequence = [long](Get-ClipboardSequence) }
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon "Copie impossible" "La sélection n'a pas pu être lue. Réessaie dans un instant." "Warning"
    return
  }

  if (-not $selection -or -not $selection.Trim()) {
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon "Rien à corriger" "Sélectionne d'abord du texte, puis Ctrl+Alt+C." "Warning"
    return
  }

  if ($script:config.mode -eq "deep") {
    Show-Balloon "Correction IA en cours…" "Le modèle local travaille, quelques secondes." "Info"
  }

  $result = $null
  try {
    $result = Invoke-Backend $selection
  } catch {
    if (Start-BackendIfDown) {
      try { $result = Invoke-Backend $selection } catch {}
    }
  }

  if (-not $result -or -not $result.text) {
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon "Backend inaccessible" "Lance « npm start » dans le dossier du projet." "Error"
    return
  }

  if ($result.text -eq $selection) {
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon "Déjà correct" "Aucune faute détectée." "Info"
    return
  }

  # Une correction IA peut durer plusieurs secondes. On n'écrase pas une
  # nouvelle copie effectuée entre-temps et on ne colle pas dans une autre
  # fenêtre si l'utilisateur a changé d'application.
  if ([long](Get-ClipboardSequence) -ne $copySequence) {
    Show-Balloon "Correction annulée" "Le presse-papiers a été modifié pendant la correction." "Warning"
    return
  }
  if ($targetWindow -ne [IntPtr]::Zero -and [ZeroFrictionClipboardNative]::GetForegroundWindow() -ne $targetWindow) {
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon "Correction annulée" "Reviens dans le champ d'origine avant de relancer la correction." "Warning"
    return
  }

  $pasteSequence = -1
  try {
    $correctedText = [string]$result.text
    Invoke-ClipboardRetry {
      [System.Windows.Forms.Clipboard]::SetText($correctedText, [System.Windows.Forms.TextDataFormat]::UnicodeText)
    }
    $pasteSequence = [long](Get-ClipboardSequence)

    # Vérification une seconde fois juste avant le collage : elle évite de
    # coller dans une fenêtre activée pendant la mise à jour du presse-papiers.
    if ($targetWindow -ne [IntPtr]::Zero -and [ZeroFrictionClipboardNative]::GetForegroundWindow() -ne $targetWindow) {
      [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $pasteSequence)
      Show-Balloon "Correction annulée" "La fenêtre active a changé avant le collage." "Warning"
      return
    }

    [System.Windows.Forms.SendKeys]::SendWait("^v")
    # SendWait attend les touches, mais certaines applications (Electron/web)
    # lisent encore le presse-papiers de façon asynchrone après Ctrl+V.
    Start-Sleep -Milliseconds 650
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $pasteSequence)
  } catch {
    $restoreSequence = if ($pasteSequence -ge 0) { $pasteSequence } else { $copySequence }
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $restoreSequence)
    Show-Balloon "Collage impossible" "Le texte corrigé n'a pas pu être collé." "Error"
    return
  }

  $summary = if ($result.fallback) { [string]$result.fallback }
    elseif ($result.engine -eq "grammalecte") { "Corrigé instantanément · Ctrl+Z pour annuler." }
    else { "Réécrit par l'IA · Ctrl+Z pour annuler." }
  Show-Balloon "Texte corrigé" $summary "Info"
}

# --- Menu de la zone de notification ----------------------------------------
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$correctItem = $menu.Items.Add("Corriger la sélection`tCtrl+Alt+C")
$correctItem.add_Click({ Invoke-Correction $null })
[void]$menu.Items.Add("-")

$shortcutsHeader = $menu.Items.Add("Raccourcis IA directs :")
$shortcutsHeader.Enabled = $false
foreach ($shortcut in @(
  @{ Label = "  Style pro`tCtrl+Alt+P";   Mode = "deep"; Style = "professionnel" },
  @{ Label = "  Amical`tCtrl+Alt+A";      Mode = "deep"; Style = "amical" },
  @{ Label = "  Raccourcir`tCtrl+Alt+R";  Mode = "deep"; Style = "concis" }
)) {
  $item = $menu.Items.Add($shortcut.Label)
  $item.Tag = $shortcut
  $item.add_Click({
    param($sender, $eventArgs)
    Invoke-Correction @{ mode = $sender.Tag.Mode; style = $sender.Tag.Style }
  })
}
[void]$menu.Items.Add("-")
$defaultHeader = $menu.Items.Add("Mode par défaut (Ctrl+Alt+C) :")
$defaultHeader.Enabled = $false

$modeChoices = @(
  @{ Label = "Instantané (rapide)"; Mode = "instant"; Style = "corriger" },
  @{ Label = "IA — Corriger";       Mode = "deep";    Style = "corriger" },
  @{ Label = "IA — Style pro";      Mode = "deep";    Style = "professionnel" },
  @{ Label = "IA — Style amical";   Mode = "deep";    Style = "amical" },
  @{ Label = "IA — Concis";         Mode = "deep";    Style = "concis" }
)
$modeItems = @()
foreach ($choice in $modeChoices) {
  $item = $menu.Items.Add($choice.Label)
  $item.Tag = $choice
  $item.add_Click({
    param($sender, $eventArgs)
    $picked = $sender.Tag
    $script:config = @{ mode = $picked.Mode; style = $picked.Style }
    Save-Config $script:config
    foreach ($other in $script:modeItems) { $other.Checked = ($other -eq $sender) }
    Show-Balloon "Mode changé" $picked.Label "Info"
  })
  $modeItems += $item
}
$script:modeItems = $modeItems
foreach ($item in $modeItems) {
  $choice = $item.Tag
  $item.Checked = ($choice.Mode -eq $script:config.mode -and $choice.Style -eq $script:config.style)
}
if (-not ($modeItems | Where-Object { $_.Checked })) { $modeItems[0].Checked = $true }

[void]$menu.Items.Add("-")
$quitItem = $menu.Items.Add("Quitter")
$quitItem.add_Click({
  $notify.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$notify.ContextMenuStrip = $menu

# --- Raccourcis globaux (0x0001 CTRL | 0x0002 ALT | 0x4000 NOREPEAT) --------
# Un raccourci par style : plus besoin d'ouvrir le menu pour reformuler.
$hotkeyMap = @{
  1 = $null                                                # Ctrl+Alt+C : mode retenu
  2 = @{ mode = "deep"; style = "professionnel" }          # Ctrl+Alt+P
  3 = @{ mode = "deep"; style = "amical" }                 # Ctrl+Alt+A
  4 = @{ mode = "deep"; style = "concis" }                 # Ctrl+Alt+R
}
$hotkey = New-Object ZeroFrictionHotkey
$failed = @()
foreach ($binding in @(
  @{ Id = 1; Key = "C" }, @{ Id = 2; Key = "P" }, @{ Id = 3; Key = "A" }, @{ Id = 4; Key = "R" }
)) {
  if (-not $hotkey.Register($binding.Id, 0x4003, [uint32][char]$binding.Key)) {
    $failed += "Ctrl+Alt+" + $binding.Key
  }
}
if ($failed.Count) {
  Show-Balloon "Raccourci indisponible" (($failed -join ", ") + " est deja pris par une autre application.") "Warning"
}

# Le WM_HOTKEY arrive dans la fenêtre C# ; un minuteur sur le fil d'interface
# relève le compteur et lance la correction sur le bon thread (presse-papiers).
$script:seenPresses = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 120
$timer.add_Tick({
  if ($hotkey.PressCount -ne $script:seenPresses) {
    $script:seenPresses = $hotkey.PressCount
    Invoke-Correction $hotkeyMap[[int]$hotkey.LastId]
  }
})
$timer.Start()

[void](Start-BackendIfDown)
Show-Balloon "Zéro Friction actif" "Ctrl+Alt+C corrige · P pro · A amical · R raccourcit." "Info"

[System.Windows.Forms.Application]::Run()

$timer.Stop()
$hotkey.Dispose()
$notify.Dispose()
[void]$mutex.ReleaseMutex()
