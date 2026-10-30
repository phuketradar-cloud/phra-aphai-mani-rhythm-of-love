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
      $bytes = [IO.File]::ReadAllBytes($path)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    # the browser closed the connection early; ignore
  } finally {
    try { $res.OutputStream.Close() } catch { }
  }
}
