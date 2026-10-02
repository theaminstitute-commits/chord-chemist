# Builds the Chord Chemist test APK without Gradle (same recipe as Guitar Path).
# Needs Android Studio's JBR plus SDK build-tools 36.0.0 and platform android-36.
# Usage (from the repo root, after `node build.js`):
#   powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 -Version 0.1 -Code 1
param([string]$Version = "0.1", [int]$Code = 1)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$App = $PSScriptRoot
$Sdk = "$env:LOCALAPPDATA\Android\Sdk"
$Bt = "$Sdk\build-tools\36.0.0"
$Jar = "$Sdk\platforms\android-36\android.jar"
$Jbr = "C:\Program Files\Android\Android Studio\jbr\bin"
$Out = "$App\out"
$env:JAVA_HOME = Split-Path -Parent $Jbr # d8.bat and apksigner.bat look for java here
$Apk = "$Root\dist\ChordChemist-v$Version-test.apk"

function Run($exe) {
  & $exe @args
  if ($LASTEXITCODE -ne 0) { throw "$exe failed ($LASTEXITCODE)" }
}

if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force "$Out\assets", "$Out\gen", "$Out\classes", "$Out\dex" | Out-Null
Copy-Item "$Root\dist\chord-chemist.html" "$Out\assets\index.html"

Run "$Bt\aapt2.exe" compile --dir "$App\res" -o "$Out\res.zip"
Run "$Bt\aapt2.exe" link -o "$Out\base.apk" -I $Jar --manifest "$App\AndroidManifest.xml" `
  -A "$Out\assets" --java "$Out\gen" --min-sdk-version 26 --target-sdk-version 36 `
  --version-code $Code --version-name $Version "$Out\res.zip"

$Sources = @(Get-ChildItem -Recurse "$App\src", "$Out\gen" -Filter *.java | ForEach-Object FullName)
Run "$Jbr\javac.exe" --release 11 -classpath $Jar -d "$Out\classes" @Sources
$Classes = @(Get-ChildItem -Recurse "$Out\classes" -Filter *.class | ForEach-Object FullName)
Run "$Bt\d8.bat" --release --min-api 26 --lib $Jar --output "$Out\dex" @Classes

Copy-Item "$Out\base.apk" "$Out\unaligned.apk"
Run "$Jbr\jar.exe" -uf "$Out\unaligned.apk" -C "$Out\dex" classes.dex
Run "$Bt\zipalign.exe" -p -f 4 "$Out\unaligned.apk" "$Out\aligned.apk"
Run "$Bt\apksigner.bat" sign --ks "$env:USERPROFILE\.android\debug.keystore" --ks-pass pass:android `
  --key-pass pass:android --ks-key-alias androiddebugkey --out $Apk "$Out\aligned.apk"
Run "$Bt\apksigner.bat" verify $Apk
Remove-Item -ErrorAction SilentlyContinue "$Apk.idsig"
Write-Host "Built $Apk"
