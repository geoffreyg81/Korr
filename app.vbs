' Lance l'application de bureau Korr sans fenetre.
' Utilise par "npm run app" et par le demarrage automatique.
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = projectDir
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & projectDir & "\app-tray.ps1""", 0, False
