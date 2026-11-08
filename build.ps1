# Builds the plugin and packs a ready-to-install folder + zip into .\dist
param(
    [string]$Version = "1.0.0.1"
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$proj = Join-Path $root "Jellyfin.Plugin.PlaybackInfo\Jellyfin.Plugin.PlaybackInfo.csproj"

$dotnet = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
$userDotnet = Join-Path $env:LOCALAPPDATA "Microsoft\dotnet\dotnet.exe"
if (Test-Path $userDotnet) { $dotnet = $userDotnet }

& $dotnet build $proj -c Release -nologo -p:AssemblyVersion=$Version -p:FileVersion=$Version
if ($LASTEXITCODE -ne 0) { throw "build failed" }

$dist = Join-Path $root "dist"
$folder = Join-Path $dist "PlaybackInfo_$Version"
if (Test-Path $folder) { Remove-Item $folder -Recurse -Force -Confirm:$false }
New-Item -ItemType Directory -Force $folder | Out-Null

Copy-Item (Join-Path $root "Jellyfin.Plugin.PlaybackInfo\bin\Release\net10.0\Jellyfin.Plugin.PlaybackInfo.dll") $folder

Copy-Item (Join-Path $root "images\logo.png") $folder

$meta = [ordered]@{
    category    = "General"
    changelog   = "Fix: line stayed hidden and could show a previous video when jellyfin-web kept an old player page; matches the session to the playing video"
    description = "Shows resolution, video codec, bitrate and the play method (Direct Play, Direct Stream or Transcoding, with the transcode reasons) in the web player while the playback controls are visible."
    guid        = "67fca38c-954e-4db0-8a82-eaaaf1bde3da"
    name        = "Playback Info"
    overview    = "Video quality and play method in the web player controls"
    owner       = "skriewel"
    targetAbi   = "12.0.0.0"
    timestamp   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    version     = $Version
    status      = "Active"
    autoUpdate  = $true
    imagePath   = "logo.png"
    assemblies  = @("Jellyfin.Plugin.PlaybackInfo.dll")
}
[IO.File]::WriteAllText((Join-Path $folder "meta.json"), ($meta | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))

$zip = Join-Path $dist "PlaybackInfo_$Version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force -Confirm:$false }
Compress-Archive -Path (Join-Path $folder "*") -DestinationPath $zip
$md5 = (Get-FileHash $zip -Algorithm MD5).Hash
Write-Host "Done: $zip (MD5 $md5)"

& (Join-Path $root "update-manifest.ps1") -Version $Version
