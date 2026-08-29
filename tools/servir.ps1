# Servidor local simples para testar o aplicativo (incluindo o modo offline / PWA).
# Uso:  ./tools/servir.ps1   e depois abra  http://localhost:8080
param(
  [int]$Porta = 8080
)

$raiz = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Web  # para MIME, se disponivel

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Porta/")
$listener.Start()
Write-Host "Servindo $raiz"
Write-Host "Abra:  http://localhost:$Porta/"
Write-Host "Ctrl+C para parar."

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))
      if ($rel -eq "") { $rel = "index.html" }
      $full = Join-Path $raiz $rel
      if ((Test-Path $full) -and -not (Get-Item $full).PSIsContainer) {
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        $res.Headers.Add("Cache-Control", "no-cache")
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $b = [System.Text.Encoding]::UTF8.GetBytes("404 - nao encontrado: $rel")
        $res.OutputStream.Write($b, 0, $b.Length)
      }
    } catch {
      $res.StatusCode = 500
      $b = [System.Text.Encoding]::UTF8.GetBytes("500 - $($_.Exception.Message)")
      try { $res.OutputStream.Write($b, 0, $b.Length) } catch {}
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
