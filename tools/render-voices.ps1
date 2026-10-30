# Renders the Thai vocal-reaction source clips with the Windows "Pattara" (th-TH) voice.
# This runs OFFLINE, once: the game only plays the resulting audio files (no text-to-speech at runtime).
# Output: tools/voice-src/<category>_<n>_<variant>.wav  (then run: node tools/build-voices.js)
# Replace these with real recorded voices any time - see README "Voice and crowd samples".
param([string]$OutDir = (Join-Path $PSScriptRoot 'voice-src'))

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq 'th-TH' } | Select-Object -First 1
if (-not $voice) { throw 'No Thai (th-TH) voice installed.' }
$synth.Voice = $voice

# category -> phrases. Each phrase is rendered in several deliveries (pitch / rate) for variety.
$phrases = [ordered]@{
  perfect   = @('เย้!', 'สุดยอด!', 'วู้ววว!', 'เก่งมาก!', 'แจ๋วเลย!')
  good      = @('เยี่ยม!', 'ดีมาก!', 'ใช่เลย!', 'ดีๆ!')
  miss      = @('อ้าว!', 'โธ่!', 'เฮ้ย!', 'พลาดแล้ว!', 'อุ๊ย!')
  streak    = @('สุดยอดไปเลย!', 'ไฟลุกแล้ว!', 'หยุดไม่อยู่แล้ว!', 'เทพมาก!')
  celebrate = @('ไชโย!', 'เก่งที่สุดเลย!', 'สุดยอดการแสดง!')
  worried   = @('ระวัง!', 'นางมาแล้ว!', 'ใกล้แล้ว!')
}
$deliveries = @(
  @{ pitch = '+25%'; rate = '1.25' },
  @{ pitch = '+45%'; rate = '1.4' },
  @{ pitch = '+10%'; rate = '1.15' }
)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$count = 0
foreach ($cat in $phrases.Keys) {
  $i = 0
  foreach ($text in $phrases[$cat]) {
    $v = 0
    foreach ($d in $deliveries) {
      $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='th-TH'><voice name='$($voice.DisplayName)'><prosody pitch='$($d.pitch)' rate='$($d.rate)' volume='x-loud'>$text</prosody></voice></speak>"
      $stream = Await ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
      $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
      $n = [uint32]$stream.Size
      $null = Await ($reader.LoadAsync($n)) ([uint32])
      $bytes = New-Object byte[] $n
      $reader.ReadBytes($bytes)
      [IO.File]::WriteAllBytes((Join-Path $OutDir ("{0}_{1}_{2}.wav" -f $cat, $i, $v)), $bytes)
      $count++; $v++
    }
    $i++
  }
}
"Rendered $count clips with voice '$($voice.DisplayName)' to $OutDir"
