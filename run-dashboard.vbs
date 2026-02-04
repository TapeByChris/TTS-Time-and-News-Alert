Set shell = CreateObject("WScript.Shell")
cmd = "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""C:\Users\itszi\OneDrive\Documents\Library Studies\TTS-Time-and-News-Alert\run-dashboard.ps1"""
shell.Run cmd, 0
