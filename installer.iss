#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define AppName "Korr"
#define AppPublisher "Korr"
#define AppURL "https://github.com/geoffreyg81/Korr"
#define LauncherName "1 - DÉMARRER KORR.vbs"
#define InternalDir "Fichiers de Korr - ne pas modifier"

[Setup]
AppId={{66B32960-D156-4D47-9D79-7EE3A776C352}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases
DefaultDirName={localappdata}\Programs\Korr
DefaultGroupName=Korr
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=Korr-Setup-{#AppVersion}
SetupIconFile=dist\desktop\korr.ico
UninstallDisplayIcon={app}\{#InternalDir}\icons\korr.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
LicenseFile=LICENSE
InfoBeforeFile=dist\desktop\Korr\0 - À LIRE AVANT DE COMMENCER.txt

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"; Flags: unchecked
Name: "autostart"; Description: "Lancer Korr automatiquement avec Windows"; GroupDescription: "Démarrage :"

[Files]
Source: "dist\desktop\Korr\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Korr"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#LauncherName}"""; WorkingDir: "{app}"; IconFilename: "{app}\{#InternalDir}\icons\korr.ico"
Name: "{group}\Désinstaller Korr"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Korr"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#LauncherName}"""; WorkingDir: "{app}"; IconFilename: "{app}\{#InternalDir}\icons\korr.ico"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Korr"; ValueData: """{sys}\wscript.exe"" ""{app}\{#LauncherName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#LauncherName}"""; WorkingDir: "{app}"; Description: "Lancer Korr maintenant"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#InternalDir}\app-tray.ps1"" -Stop"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopTray"
Filename: "{app}\{#InternalDir}\runtime\node.exe"; Parameters: """{app}\{#InternalDir}\stop.js"""; WorkingDir: "{app}\{#InternalDir}"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopBackend"
