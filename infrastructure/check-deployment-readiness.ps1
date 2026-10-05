[CmdletBinding()]
param(
  [ValidateSet("Local", "Domain")]
  [string]$Mode = "Domain",
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$SkipLive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"
$A = (Resolve-Path $Root).Path
$Meridian = Join-Path $A "..\external-app"
$SystemHost = if ($Mode -eq "Domain") { "system-a.win" } else { "localhost" }
$MeridianHost = if ($Mode -eq "Domain") { "merid.win" } else { "localhost" }
$SystemUrl = if ($Mode -eq "Domain") { "https://system-a.win" } else { "http://localhost" }
$MeridianUrl = if ($Mode -eq "Domain") { "https://merid.win" } else { "http://localhost:8080" }
$passes = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$failures = [System.Collections.Generic.List[string]]::new()

function Pass([string]$Message) { $passes.Add($Message) }
function Warn([string]$Message) { $warnings.Add($Message) }
function Fail([string]$Message) { $failures.Add($Message) }

function Check-Contains([string]$Path, [string]$Needle, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { Fail "$Label: file missing ($Path)"; return }
  $text = Get-Content -LiteralPath $Path -Raw
  if ($text.Contains($Needle)) { Pass $Label } else { Fail "$Label: expected value not found ($Needle)" }
}

function Check-EnvKey([string]$Path, [string]$Key, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { Warn "$Label: env file absent ($Path)"; return }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Key))=" } | Select-Object -First 1
  if ($line -and $line.Split("=", 2)[1].Trim()) { Pass $Label } else { Warn "$Label: key missing or empty" }
}

Write-Host "Read-only deployment readiness check" -ForegroundColor Cyan
Write-Host "Mode: $Mode"
Write-Host "System A: $SystemUrl"
Write-Host "Meridian: $MeridianUrl"
Write-Host "NO FILES WILL BE CHANGED." -ForegroundColor Yellow

# Verify that source/runtime domain declarations are aligned with the selected mode.
$systemPublic = if ($Mode -eq "Domain") { "https://system-a.win" } else { "http://localhost" }
$meridianPublic = if ($Mode -eq "Domain") { "https://merid.win" } else { "http://localhost:8080" }
Check-Contains (Join-Path $A "infrastructure\nginx\nginx.conf") "server_name $SystemHost;" "System A nginx host"
Check-Contains (Join-Path $Meridian "nginx.conf") "server_name $MeridianHost;" "Meridian nginx host"
Check-Contains (Join-Path $A "system-a-core\docker-compose.yml") "NEXTAUTH_URL: $systemPublic" "System A NEXTAUTH_URL"
Check-Contains (Join-Path $A "system-a-core\docker-compose.yml") "NEXT_PUBLIC_MERIDIAN_URL: $meridianPublic" "System A Meridian public URL"
Check-Contains (Join-Path $Meridian ".env.mainnet.example") "NEXT_PUBLIC_SYSTEM_A_URL=$systemPublic" "Meridian public System A URL"

# Runtime env keys are checked by presence only. Values and secrets are never printed.
Check-EnvKey (Join-Path $A "frontend\.env.local") "NEXTAUTH_URL" "Frontend NEXTAUTH_URL"
Check-EnvKey (Join-Path $A "frontend\.env.local") "NEXT_PUBLIC_MERIDIAN_URL" "Frontend Meridian URL"
Check-EnvKey (Join-Path $Meridian ".env") "NEXT_PUBLIC_SYSTEM_A_URL" "Meridian System A URL"

# Public DNS and TLS endpoint checks.
if ($Mode -eq "Domain") {
  foreach ($host in @($SystemHost, $MeridianHost)) {
    try {
      $dns = Resolve-DnsName -Name $host -ErrorAction Stop
      if ($dns) { Pass "DNS resolves: $host" } else { Fail "DNS has no answer: $host" }
    } catch { Fail "DNS does not resolve: $host" }
    try {
      if (Test-NetConnection -ComputerName $host -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue) {
        Pass "TCP 443 reachable: $host"
      } else { Fail "TCP 443 is not reachable: $host" }
    } catch { Warn "Could not test TCP 443: $host" }
  }

  # Current compose files expose System A on 80/443 but Meridian on 8080/8443.
  # DNS cannot encode a port. This is a required manual ingress decision, not an
  # automatic change by the domain switcher.
  Warn "Domain mode requires Meridian to be reachable on default HTTPS 443. Current Meridian compose mapping is 8080/8443; configure a shared reverse proxy, a second public IP, or a deliberate :8443 URL before production."
}

# Local port conflicts: a warning is useful before `docker compose up`.
foreach ($port in @(80, 443, 8080, 8443)) {
  try {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($listener) { Warn "Port $port is already listening; inspect before starting/rebinding containers." }
    else { Pass "Port $port is free" }
  } catch { Warn "Could not inspect local port $port" }
}

# Docker and compose checks are read-only.
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { Pass "Docker daemon reachable" } else { Fail "Docker CLI exists but daemon is unavailable" }
  } catch { Fail "Docker info failed" }
  foreach ($pair in @(
    @{ Name = "System A compose"; Dir = (Join-Path $A "system-a-core") },
    @{ Name = "Meridian compose"; Dir = $Meridian }
  )) {
    Push-Location $pair.Dir
    try {
      docker compose config --quiet *> $null
      if ($LASTEXITCODE -eq 0) { Pass "$($pair.Name) config" } else { Fail "$($pair.Name) config failed" }
    } catch { Fail "$($pair.Name) config failed" }
    finally { Pop-Location }
  }
} else {
  Warn "Docker is not installed/on PATH; compose/runtime checks were not executed."
}

if (-not $SkipLive) {
  foreach ($target in @(
    @{ Name = "System A"; Url = $SystemUrl },
    @{ Name = "Meridian"; Url = $MeridianUrl }
  )) {
    try {
      $curlArgs = @("-k", "-I", "--max-time", "10", "$($target.Url)/")
      $output = & curl.exe @curlArgs 2>$null
      if ($LASTEXITCODE -eq 0 -and ($output -match "HTTP/")) { Pass "$($target.Name) HTTP endpoint responds" }
      else { Warn "$($target.Name) endpoint did not respond; check DNS/TLS/reverse proxy." }
    } catch { Warn "$($target.Name) live HTTP check unavailable" }
  }
}

Write-Host "`nPASS ($($passes.Count))" -ForegroundColor Green
$passes | ForEach-Object { Write-Host "  + $_" }
Write-Host "`nWARN ($($warnings.Count))" -ForegroundColor Yellow
$warnings | ForEach-Object { Write-Host "  ! $_" }
Write-Host "`nFAIL ($($failures.Count))" -ForegroundColor Red
$failures | ForEach-Object { Write-Host "  x $_" }

if ($failures.Count -gt 0) { exit 1 }
exit 0
