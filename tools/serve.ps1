# Minimal static web server for the game (no installs needed - uses .NET HttpListener).
# Usage: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8642] [-NoBrowser]
param([int]$Port = 8642, [switch]$NoBrowser)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.m4a' = 'audio/mp4'
  '.webp' = 'image/webp'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.woff2' = 'font/woff2'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
}

# try the requested port, then the next 20 if it is busy (e.g. another copy is already running)
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch { $l.Close() }
}
if (-not $listener) { Write-Host "Could not open a local port ($Port-$($Port + 19))."; exit 1 }
$url = "http://localhost:$Port/index.html"
Write-Host "Phra Aphai Mani - Rhythm of Love"
Write-Host "Serving $root"
Write-Host "Open $url   (close this window to stop the server)"
if (-not $NoBrowser) { Start-Process $url }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root) -or -not (Test-Path $path -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $res.Headers.Add('Accept-Ranges', 'bytes')
      $bytes = [IO.File]::ReadAllBytes($path)
      # Range requests let <audio> elements seek and know their duration (menu music crossfades)
      $range = $ctx.Request.Headers['Range']
      if ($range -match '^bytes=(\d*)-(\d*)$') {
        $size = $bytes.Length
        if ($Matches[1] -ne '') { $start = [long]$Matches[1]; $end = if ($Matches[2] -ne '') { [Math]::Min([long]$Matches[2], $size - 1) } else { $size - 1 } }
        else { $start = [Math]::Max(0, $size - [long]$Matches[2]); $end = $size - 1 }
        if ($start -lt $size -and $start -le $end) {
          $res.StatusCode = 206
          $res.Headers.Add('Content-Range', "bytes $start-$end/$size")
          $part = New-Object byte[] ($end - $start + 1)
          [Array]::Copy($bytes, $start, $part, 0, $part.Length)
          $bytes = $part
        }
      }
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    # the browser closed the connection early; ignore
  } finally {
    try { $res.OutputStream.Close() } catch { }
  }
}
