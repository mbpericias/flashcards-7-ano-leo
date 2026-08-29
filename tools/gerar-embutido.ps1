# Gera js/embedded-content.js a partir de data/catalog.json e dos bancos.
#
# O arquivo embutido e apenas uma RESERVA, usada quando o navegador nao consegue
# ler a pasta data/ (por exemplo, ao abrir index.html direto pelo sistema de
# arquivos, sem servidor). Ao hospedar em um servidor ou no GitHub Pages, a pasta
# data/ e a fonte de verdade e regenerar este arquivo passa a ser opcional.
#
# Uso (no PowerShell, dentro da pasta do projeto):
#   ./tools/gerar-embutido.ps1

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$catalogoPath = Join-Path $raiz "data/catalog.json"
$catalogo = Get-Content $catalogoPath -Raw -Encoding UTF8 | ConvertFrom-Json

$banks = [ordered]@{}
foreach ($b in $catalogo.bancos) {
  $p = Join-Path $raiz $b.arquivo
  $banks[$b.id] = Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json
}

$payload = [ordered]@{
  catalog = $catalogo
  banks   = $banks
}

$json = $payload | ConvertTo-Json -Depth 20

$cab = "/* embedded-content.js - GERADO por tools/gerar-embutido.ps1"
$cab += "`n   Reserva usada apenas quando data/*.json nao pode ser lido pelo navegador."
$cab += "`n   Nao edite a mao: altere os arquivos em data/ e rode o script de novo. */`n"
$conteudo = $cab + "window.App = window.App || {};`n" + "App.embeddedContent = " + $json + ";`n"

$destino = Join-Path $raiz "js/embedded-content.js"
$enc = New-Object System.Text.UTF8Encoding($false)   # UTF-8 sem BOM
[System.IO.File]::WriteAllText($destino, $conteudo, $enc)
Write-Host "OK: $destino"
