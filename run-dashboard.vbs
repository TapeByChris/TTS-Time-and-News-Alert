Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
ps1Path = root & "\run-dashboard.ps1"

cmd = """" & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1Path & """"
shell.Run cmd, 0

' Create a shortcut with a custom icon (if missing)
shortcutPath = root & "\TTS Time and News Alert.lnk"
iconPath = root & "\app_icon_windows_TTS.ico"
If Not fso.FileExists(shortcutPath) Then
    Set sc = shell.CreateShortcut(shortcutPath)
    sc.TargetPath = WScript.ScriptFullName
    sc.WorkingDirectory = root
    sc.IconLocation = iconPath
    sc.Save
End If
