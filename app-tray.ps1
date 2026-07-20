# Korr - application de bureau.
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
$configPath = Join-Path $env:LOCALAPPDATA "Korr\app-config.json"

# L'interface suit la langue d'affichage de Windows. Le français est utilisé
# sur un Windows français ; l'anglais sert de langue internationale sinon.
$script:isFrench = [System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName -eq "fr"
function Get-KorrText {
  param(
    [Parameter(Mandatory = $true)][string]$Fr,
    [Parameter(Mandatory = $true)][string]$En
  )
  if ($script:isFrench) { return $Fr }
  return $En
}

# --- Arrêt d'une instance déjà lancée -------------------------------------
if ($Stop) {
  $me = $PID
  $others = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -match "app-tray\.ps1" -and $_.CommandLine -notmatch "-Stop" }
  if ($others) {
    $others | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Output (Get-KorrText -Fr "Application arrêtée." -En "Application stopped.")
  } else {
    Write-Output (Get-KorrText -Fr "L'application n'était pas lancée." -En "The application was not running.")
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
function Invoke-Backend($text, $language = "auto") {
  $payload = @{ mode = $script:config.mode; style = $script:config.style; text = $text; language = $language } |
    ConvertTo-Json -Depth 3
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  return Invoke-RestMethod -Uri "$backendUrl/api/correct" -Method Post `
    -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 180
}

# Sur un texte réellement bilingue, le moteur refuse de trancher seul : envoyer
# le tout à un seul dictionnaire ferait « corriger » les mots de l'autre langue.
# Plutôt que de renvoyer l'utilisateur vers un réglage, on lui pose la question.
function Get-MixedLanguageChoice {
  $title = Get-KorrText -Fr "Texte bilingue" -En "Mixed-language text"
  $message = Get-KorrText `
    -Fr "Ce texte mélange le français et l'anglais. Dans quelle langue faut-il le corriger ?`n`n Oui = Français`n Non = Anglais" `
    -En "This text mixes French and English. Which language should Korr correct it in?`n`n Yes = French`n No = English"
  $answer = [System.Windows.Forms.MessageBox]::Show(
    $message, $title,
    [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
    [System.Windows.Forms.MessageBoxIcon]::Question)
  switch ($answer) {
    ([System.Windows.Forms.DialogResult]::Yes) { return "fr" }
    ([System.Windows.Forms.DialogResult]::No)  { return "en" }
    default { return $null }
  }
}

function Start-BackendIfDown {
  try {
    Invoke-RestMethod -Uri "$backendUrl/api/health" -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    try {
      # Runtime embarqué s'il est présent (paquet autonome), sinon Node du système
      # (dépôt de développement).
      $bundled = Join-Path $projectDir "runtime" | Join-Path -ChildPath "node.exe"
      $nodePath = if (Test-Path $bundled) { $bundled } else { "node" }
      Start-Process -FilePath $nodePath -ArgumentList "server.js" -WorkingDirectory $projectDir -WindowStyle Hidden
      Start-Sleep -Milliseconds 1800
      return $true
    } catch { return $false }
  }
}

# --- Mode auto-test : valide le circuit HTTP sans interface -----------------
if ($SelfTest) {
  [void](Start-BackendIfDown)
  $result = Invoke-Backend $SelfTest
  Write-Output ((Get-KorrText -Fr "moteur : " -En "engine : ") + $result.engine)
  Write-Output ((Get-KorrText -Fr "texte   : " -En "text   : ") + $result.text)
  exit 0
}

# --- Interface : instance unique, raccourci global, icône de notification ---
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$created = $false
$mutex = New-Object System.Threading.Mutex($true, "KorrTrayApp", [ref]$created)
if (-not $created) { exit 0 }

Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class KorrHotkey : NativeWindow, IDisposable {
  [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  private const int WM_HOTKEY = 0x0312;
  private int count = 0;
  public int PressCount = 0;
  public int LastId = 0;
  public KorrHotkey() { CreateHandle(new CreateParams()); }
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

public static class KorrClipboardNative {
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
      if ($null -eq $payload) {
        throw (Get-KorrText -Fr "Format vide : $format" -En "Empty clipboard format: $format")
      }
      $materialized = Copy-ClipboardPayload $payload
      $copy.SetData($format, $false, $materialized)
    } catch {
      throw (Get-KorrText `
        -Fr "Impossible de sauvegarder le format '$format' du presse-papiers : $($_.Exception.Message)" `
        -En "Unable to preserve clipboard format '$format': $($_.Exception.Message)")
    }
  }

  return [pscustomobject]@{
    WasEmpty = $false
    DataObject = $copy
    FormatCount = $formats.Count
  }
}

function Get-ClipboardSequence {
  return [uint32][KorrClipboardNative]::GetClipboardSequenceNumber()
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
$notify.Text = Get-KorrText `
  -Fr "Korr - Ctrl+Alt+C corrige la sélection" `
  -En "Korr - Ctrl+Alt+C corrects selected text"
$notify.Visible = $true

function Show-Balloon($title, $message, $kind) {
  $notify.BalloonTipTitle = $title
  $notify.BalloonTipText = $message
  $notify.BalloonTipIcon = $kind
  $notify.ShowBalloonTip(3500)
}

function Get-CorrectionSummary($result) {
  $undo = Get-KorrText -Fr "Ctrl+Z pour annuler." -En "Press Ctrl+Z to undo."
  $engine = [string]$result.engine

  if ($result.fallback) {
    if ($script:isFrench) { return [string]$result.fallback }
    $fallback = [string]$result.fallback
    if ($fallback -match "SMS") {
      return "SMS language corrected locally; AI was not needed. $undo"
    }
    if ($fallback -match "IA|AI") {
      return "AI result rejected for safety; local correction used. $undo"
    }
    return "Local correction used. $undo"
  }

  switch ($engine) {
    "grammalecte" {
      return Get-KorrText `
        -Fr "Corrigé localement avec Grammalecte · $undo" `
        -En "Corrected locally with Grammalecte · $undo"
    }
    "harper" {
      return Get-KorrText `
        -Fr "Corrigé localement avec Harper · $undo" `
        -En "Corrected locally with Harper · $undo"
    }
    "ollama+grammalecte" {
      return Get-KorrText `
        -Fr "Réécrit par l'IA locale, puis vérifié avec Grammalecte · $undo" `
        -En "Rewritten by local AI, then checked with Grammalecte · $undo"
    }
    "ollama+harper" {
      return Get-KorrText `
        -Fr "Réécrit par l'IA locale, puis vérifié avec Harper · $undo" `
        -En "Rewritten by local AI, then checked with Harper · $undo"
    }
    default {
      return Get-KorrText `
        -Fr "Texte corrigé · $undo" `
        -En "Text corrected · $undo"
    }
  }
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
    Show-Balloon `
      (Get-KorrText -Fr "Presse-papiers occupé" -En "Clipboard busy") `
      (Get-KorrText -Fr "Impossible de le sauvegarder sans risque. Réessayez dans un instant." -En "Korr could not preserve it safely. Please try again in a moment.") `
      "Warning"
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
    $targetWindow = [KorrClipboardNative]::GetForegroundWindow()
    $copied = Wait-ForCopiedText $sequenceBeforeCopy
    $copySequence = [long]$copied.Sequence
    $selection = [string]$copied.Text
  } catch {
    if ($copySequence -lt 0) { $copySequence = [long](Get-ClipboardSequence) }
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon `
      (Get-KorrText -Fr "Copie impossible" -En "Unable to copy") `
      (Get-KorrText -Fr "La sélection n'a pas pu être lue. Réessayez dans un instant." -En "Korr could not read the selection. Please try again in a moment.") `
      "Warning"
    return
  }

  if (-not $selection -or -not $selection.Trim()) {
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon `
      (Get-KorrText -Fr "Rien à corriger" -En "Nothing to correct") `
      (Get-KorrText -Fr "Sélectionnez d'abord du texte, puis appuyez sur Ctrl+Alt+C." -En "Select some text first, then press Ctrl+Alt+C.") `
      "Warning"
    return
  }

  if ($script:config.mode -eq "deep") {
    Show-Balloon `
      (Get-KorrText -Fr "Correction IA en cours…" -En "AI correction in progress…") `
      (Get-KorrText -Fr "Le modèle local travaille pendant quelques secondes." -En "The local model is working. This may take a few seconds.") `
      "Info"
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
    Show-Balloon `
      (Get-KorrText -Fr "Moteur local inaccessible" -En "Local engine unavailable") `
      (Get-KorrText -Fr "Korr n'a pas pu démarrer son moteur. Fermez Korr, puis relancez-le depuis le menu Démarrer." -En "Korr could not start its local engine. Close Korr, then launch it again from the Start menu.") `
      "Error"
    return
  }

  if ($result.engine -eq "mixed") {
    $chosen = Get-MixedLanguageChoice
    if (-not $chosen) {
      [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
      return
    }
    try {
      $result = Invoke-Backend $selection $chosen
    } catch {
      [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
      Show-Balloon `
        (Get-KorrText -Fr "Correction impossible" -En "Correction failed") `
        (Get-KorrText -Fr "Le moteur n'a pas répondu. Réessayez dans un instant." -En "The engine did not respond. Please try again in a moment.") `
        "Warning"
      return
    }
  }

  if ($result.text -eq $selection) {
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon `
      (Get-KorrText -Fr "Déjà correct" -En "Already correct") `
      (Get-KorrText -Fr "Aucune faute détectée." -En "No error detected.") `
      "Info"
    return
  }

  # Une correction IA peut durer plusieurs secondes. On n'écrase pas une
  # nouvelle copie effectuée entre-temps et on ne colle pas dans une autre
  # fenêtre si l'utilisateur a changé d'application.
  if ([long](Get-ClipboardSequence) -ne $copySequence) {
    Show-Balloon `
      (Get-KorrText -Fr "Correction annulée" -En "Correction cancelled") `
      (Get-KorrText -Fr "Le presse-papiers a été modifié pendant la correction." -En "The clipboard changed while Korr was correcting the text.") `
      "Warning"
    return
  }
  if ($targetWindow -ne [IntPtr]::Zero -and [KorrClipboardNative]::GetForegroundWindow() -ne $targetWindow) {
    [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $copySequence)
    Show-Balloon `
      (Get-KorrText -Fr "Correction annulée" -En "Correction cancelled") `
      (Get-KorrText -Fr "Revenez dans le champ d'origine avant de relancer la correction." -En "Return to the original text field before trying again.") `
      "Warning"
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
    if ($targetWindow -ne [IntPtr]::Zero -and [KorrClipboardNative]::GetForegroundWindow() -ne $targetWindow) {
      [void](Try-RestoreClipboardSnapshot $clipboardSnapshot $pasteSequence)
      Show-Balloon `
        (Get-KorrText -Fr "Correction annulée" -En "Correction cancelled") `
        (Get-KorrText -Fr "La fenêtre active a changé avant le collage." -En "The active window changed before Korr could paste the correction.") `
        "Warning"
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
    Show-Balloon `
      (Get-KorrText -Fr "Collage impossible" -En "Unable to paste") `
      (Get-KorrText -Fr "Le texte corrigé n'a pas pu être collé." -En "Korr could not paste the corrected text.") `
      "Error"
    return
  }

  $summary = Get-CorrectionSummary $result
  Show-Balloon (Get-KorrText -Fr "Texte corrigé" -En "Text corrected") $summary "Info"
}

# --- Menu de la zone de notification ----------------------------------------
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$correctItem = $menu.Items.Add((Get-KorrText -Fr "Corriger la sélection`tCtrl+Alt+C" -En "Correct selected text`tCtrl+Alt+C"))
$correctItem.add_Click({ Invoke-Correction $null })
[void]$menu.Items.Add("-")

$shortcutsHeader = $menu.Items.Add((Get-KorrText -Fr "Raccourcis IA directs :" -En "Direct AI shortcuts:"))
$shortcutsHeader.Enabled = $false
foreach ($shortcut in @(
  @{ Label = (Get-KorrText -Fr "  Style pro`tCtrl+Alt+P" -En "  Professional`tCtrl+Alt+P"); Mode = "deep"; Style = "professionnel" },
  @{ Label = (Get-KorrText -Fr "  Amical`tCtrl+Alt+A" -En "  Friendly`tCtrl+Alt+A");       Mode = "deep"; Style = "amical" },
  @{ Label = (Get-KorrText -Fr "  Raccourcir`tCtrl+Alt+R" -En "  Shorten`tCtrl+Alt+R");    Mode = "deep"; Style = "concis" }
)) {
  $item = $menu.Items.Add($shortcut.Label)
  $item.Tag = $shortcut
  $item.add_Click({
    param($sender, $eventArgs)
    Invoke-Correction @{ mode = $sender.Tag.Mode; style = $sender.Tag.Style }
  })
}
[void]$menu.Items.Add("-")
$defaultHeader = $menu.Items.Add((Get-KorrText -Fr "Mode par défaut (Ctrl+Alt+C) :" -En "Default mode (Ctrl+Alt+C):"))
$defaultHeader.Enabled = $false

$modeChoices = @(
  @{ Label = (Get-KorrText -Fr "Instantané (rapide)" -En "Instant (fast)");          Mode = "instant"; Style = "corriger" },
  @{ Label = (Get-KorrText -Fr "IA - Corriger" -En "AI - Correct");                 Mode = "deep";    Style = "corriger" },
  @{ Label = (Get-KorrText -Fr "IA - Style pro" -En "AI - Professional");           Mode = "deep";    Style = "professionnel" },
  @{ Label = (Get-KorrText -Fr "IA - Style amical" -En "AI - Friendly");            Mode = "deep";    Style = "amical" },
  @{ Label = (Get-KorrText -Fr "IA - Concis" -En "AI - Concise");                   Mode = "deep";    Style = "concis" }
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
    Show-Balloon (Get-KorrText -Fr "Mode changé" -En "Mode changed") $picked.Label "Info"
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
$quitItem = $menu.Items.Add((Get-KorrText -Fr "Quitter" -En "Quit"))
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
$hotkey = New-Object KorrHotkey
$failed = @()
foreach ($binding in @(
  @{ Id = 1; Key = "C" }, @{ Id = 2; Key = "P" }, @{ Id = 3; Key = "A" }, @{ Id = 4; Key = "R" }
)) {
  if (-not $hotkey.Register($binding.Id, 0x4003, [uint32][char]$binding.Key)) {
    $failed += "Ctrl+Alt+" + $binding.Key
  }
}
if ($failed.Count) {
  $shortcutMessage = if ($failed.Count -eq 1) {
    Get-KorrText -Fr (($failed -join ", ") + " est déjà utilisé par une autre application.") -En (($failed -join ", ") + " is already used by another application.")
  } else {
    Get-KorrText -Fr (($failed -join ", ") + " sont déjà utilisés par une autre application.") -En (($failed -join ", ") + " are already used by another application.")
  }
  Show-Balloon (Get-KorrText -Fr "Raccourci indisponible" -En "Shortcut unavailable") $shortcutMessage "Warning"
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
Show-Balloon `
  (Get-KorrText -Fr "Korr actif" -En "Korr is ready") `
  (Get-KorrText -Fr "Ctrl+Alt+C corrige · P pro · A amical · R raccourcit." -En "Ctrl+Alt+C corrects · P professional · A friendly · R shortens.") `
  "Info"

[System.Windows.Forms.Application]::Run()

$timer.Stop()
$hotkey.Dispose()
$notify.Dispose()
[void]$mutex.ReleaseMutex()
