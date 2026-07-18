#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define AppName "Korr"
#define AppPublisher "Korr"
#define AppURL "https://github.com/geoffreyg81/Korr"
#define LauncherName "1 - START KORR - DÉMARRER KORR.vbs"
#define InternalDir "Korr engine - moteur - do not modify"

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

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[CustomMessages]
english.DesktopShortcut=Create a Desktop shortcut
french.DesktopShortcut=Créer un raccourci sur le Bureau
english.ShortcutsGroup=Shortcuts:
french.ShortcutsGroup=Raccourcis :
english.AutoStart=Start Korr automatically with Windows
french.AutoStart=Lancer Korr automatiquement avec Windows
english.StartupGroup=Startup:
french.StartupGroup=Démarrage :
english.UninstallKorr=Uninstall Korr
french.UninstallKorr=Désinstaller Korr
english.LaunchNow=Launch Korr now
french.LaunchNow=Lancer Korr maintenant

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; GroupDescription: "{cm:ShortcutsGroup}"; Flags: unchecked
Name: "autostart"; Description: "{cm:AutoStart}"; GroupDescription: "{cm:StartupGroup}"

[Files]
Source: "dist\desktop\Korr\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Korr"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#LauncherName}"""; WorkingDir: "{app}"; IconFilename: "{app}\{#InternalDir}\icons\korr.ico"
Name: "{group}\{cm:UninstallKorr}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Korr"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#LauncherName}"""; WorkingDir: "{app}"; IconFilename: "{app}\{#InternalDir}\icons\korr.ico"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Korr"; ValueData: """{sys}\wscript.exe"" ""{app}\{#LauncherName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#LauncherName}"""; WorkingDir: "{app}"; Description: "{cm:LaunchNow}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#InternalDir}\app-tray.ps1"" -Stop"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopTray"
Filename: "{app}\{#InternalDir}\runtime\node.exe"; Parameters: """{app}\{#InternalDir}\stop.js"""; WorkingDir: "{app}\{#InternalDir}"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopBackend"
