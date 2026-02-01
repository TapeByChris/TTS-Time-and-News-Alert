$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$server = Start-Process -WindowStyle Hidden -PassThru node -ArgumentList "server.js"

$appPath = "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
$htmlPath = Join-Path $root "main.html"
$appUrl = (New-Object System.Uri($htmlPath)).AbsoluteUri
$profileDir = Join-Path $env:TEMP "tts-dashboard-profile"

if (Test-Path $appPath) {
    $browser = Start-Process -PassThru $appPath -ArgumentList "--app=$appUrl","--user-data-dir=$profileDir","--new-window"
    if ($browser) { Wait-Process -Id $browser.Id }
} else {
    Start-Process $appUrl
    Start-Sleep -Seconds 5
}

if ($server) { Stop-Process -Id $server.Id -Force }
