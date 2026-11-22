param(
  [string]$TextFile = "",
  [string]$OutputFile = "",
  [string]$Voice = "",
  [int]$Rate = 0,
  [switch]$ListVoices
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($ListVoices) {
  $voices = @()
  foreach ($v in $synth.GetInstalledVoices()) {
    if ($v.Enabled) {
      $info = $v.VoiceInfo
      $voices += [PSCustomObject]@{
        name = $info.Name
        culture = $info.Culture.Name
        gender = $info.Gender.ToString()
        age = $info.Age.ToString()
      }
    }
  }
  $voices | ConvertTo-Json -Compress
  $synth.Dispose()
  exit 0
}

if (-not (Test-Path $TextFile)) { throw "Text file not found." }
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
if ([string]::IsNullOrWhiteSpace($text)) { throw "The text to speak is empty." }

$installed = @()
foreach ($v in $synth.GetInstalledVoices()) {
  if ($v.Enabled) { $installed += $v.VoiceInfo.Name }
}
if (-not $installed -or $installed.Count -eq 0) {
  throw "No Windows speech voices are installed. Install a Windows language voice pack or connect ElevenLabs."
}

$selected = $installed[0]
if (-not [string]::IsNullOrWhiteSpace($Voice)) {
  $match = $installed | Where-Object { $_ -eq $Voice } | Select-Object -First 1
  if (-not $match) {
    $match = $installed | Where-Object { $_ -like "*$Voice*" } | Select-Object -First 1
  }
  if ($match) { $selected = $match }
}

$synth.SelectVoice($selected)
$synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))
$synth.Volume = 100
$synth.SetOutputToWaveFile($OutputFile)
$synth.Speak($text)
$synth.SetOutputToNull()
$synth.Dispose()
