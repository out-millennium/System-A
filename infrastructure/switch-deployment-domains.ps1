[CmdletBinding()]
param(
  [ValidateSet("Local", "Domain")]
  [string]$Mode,
  [switch]$Apply,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Mode) {
  Write-Host "Выберите режим:" -ForegroundColor Cyan
  Write-Host "  1. Local  — localhost для локального Docker/dev запуска"
  Write-Host "  2. Domain — https://system-a.win и https://merid.win"
  $choice = Read-Host "Введите 1 или 2"
  $Mode = if ($choice -eq "2") { "Domain" } else { "Local" }
}

$A = (Resolve-Path $Root).Path
$Meridian = Join-Path $A "..\external-app"
$domainMode = $Mode -eq "Domain"
$systemPublic = if ($domainMode) { "https://system-a.win" } else { "http://localhost" }
$systemDev = if ($domainMode) { "https://system-a.win" } else { "http://localhost:3000" }
$meridianPublic = if ($domainMode) { "https://merid.win" } else { "http://localhost:8080" }
$systemHost = if ($domainMode) { "system-a.win" } else { "localhost" }
$meridianHost = if ($domainMode) { "merid.win" } else { "localhost" }

function Set-FileText([string]$Path, [string[]]$Old, [string]$New) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Файл не найден: $Path"
  }
  $text = [System.IO.File]::ReadAllText($Path)
  $found = $Old | Where-Object { $text.Contains($_) } | Select-Object -First 1
  if (-not $found) {
    throw "Ожидаемый доменный фрагмент не найден в $Path : $($Old -join ' OR ')"
  }
  $updated = $text.Replace($found, $New)
  if ($Apply) {
    [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
    Write-Host "UPDATED  $Path" -ForegroundColor Green
  } else {
    Write-Host "WOULD UPDATE  $Path" -ForegroundColor Yellow
  }
}

function Set-KeyLine([string]$Path, [string]$Key, [string]$Value) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "SKIP  $Path (file absent)" -ForegroundColor DarkYellow
    return
  }
  $text = [System.IO.File]::ReadAllText($Path)
  $escaped = [regex]::Escape($Key)
  $pattern = "(?m)^$escaped=.*$"
  $line = "$Key=$Value"
  if ([regex]::IsMatch($text, $pattern)) {
    $updated = [regex]::Replace($text, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line }, 1)
  } else {
    $separator = if ($text.EndsWith("`n")) { "" } else { "`r`n" }
    $updated = $text + $separator + $line + "`r`n"
  }
  if ($Apply) {
    [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
    Write-Host "UPDATED  $Path [$Key]" -ForegroundColor Green
  } else {
    Write-Host "WOULD UPDATE  $Path [$Key]" -ForegroundColor Yellow
  }
}

$changes = @(
  @{ Path = (Join-Path $A "frontend\components\LandingPage.tsx"); Old = @('process.env.NEXT_PUBLIC_MERIDIAN_URL || "https://merid.win"', 'process.env.NEXT_PUBLIC_MERIDIAN_URL || "https://merid.space"', 'process.env.NEXT_PUBLIC_MERIDIAN_URL || "http://localhost:8080"'); New = "process.env.NEXT_PUBLIC_MERIDIAN_URL || `"$meridianPublic`"" },
  @{ Path = (Join-Path $A "frontend\lib\mail.ts"); Old = @('process.env.NEXTAUTH_URL || "https://system-a.win"', 'process.env.NEXTAUTH_URL || "https://system-a.space"', 'process.env.NEXTAUTH_URL || "http://localhost"'); New = "process.env.NEXTAUTH_URL || `"$systemPublic`"" },
  @{ Path = (Join-Path $A "system-a-core\docker-compose.yml"); Old = @('NEXTAUTH_URL: https://system-a.win', 'NEXTAUTH_URL: https://system-a.space', 'NEXTAUTH_URL: http://localhost'); New = "NEXTAUTH_URL: $systemPublic" },
  @{ Path = (Join-Path $A "system-a-core\docker-compose.yml"); Old = @('NEXT_PUBLIC_MERIDIAN_URL: https://merid.win', 'NEXT_PUBLIC_MERIDIAN_URL: https://merid.space', 'NEXT_PUBLIC_MERIDIAN_URL: http://localhost:8080'); New = "NEXT_PUBLIC_MERIDIAN_URL: $meridianPublic" },
  @{ Path = (Join-Path $A "infrastructure\nginx\nginx.conf"); Old = @('server_name system-a.win;', 'server_name system-a.space;', 'server_name localhost;'); New = "server_name $systemHost;" },
  @{ Path = (Join-Path $Meridian "nginx.conf"); Old = @('server_name merid.win;', 'server_name merid.space;', 'server_name localhost;', 'server_name _;'); New = "server_name $meridianHost;" },
  @{ Path = (Join-Path $Meridian "docker-compose.yml"); Old = @('NEXT_PUBLIC_SYSTEM_A_URL: `${NEXT_PUBLIC_SYSTEM_A_URL:-https://system-a.win}`', 'NEXT_PUBLIC_SYSTEM_A_URL: `${NEXT_PUBLIC_SYSTEM_A_URL:-http://localhost}`'); New = "NEXT_PUBLIC_SYSTEM_A_URL: `${NEXT_PUBLIC_SYSTEM_A_URL:-$systemPublic}`" },
  @{ Path = (Join-Path $Meridian "app\legal\page.tsx"); Old = @('process.env.NEXT_PUBLIC_SYSTEM_A_URL || "https://system-a.win"', 'process.env.NEXT_PUBLIC_SYSTEM_A_URL || "https://system-a.space"', 'process.env.NEXT_PUBLIC_SYSTEM_A_URL || "http://localhost"'); New = "process.env.NEXT_PUBLIC_SYSTEM_A_URL || `"$systemPublic`"" },
  @{ Path = (Join-Path $Meridian "app\recognition\page.tsx"); Old = @('process.env.NEXT_PUBLIC_SYSTEM_A_URL || "https://system-a.win"', 'process.env.NEXT_PUBLIC_SYSTEM_A_URL || "https://system-a.space"', 'process.env.NEXT_PUBLIC_SYSTEM_A_URL || "http://localhost"'); New = "process.env.NEXT_PUBLIC_SYSTEM_A_URL || `"$systemPublic`"" },
  @{ Path = (Join-Path $Meridian "app\transparency\page.tsx"); Old = @('process.env.NEXT_PUBLIC_SYSTEM_A_URL || "https://system-a.win"', 'process.env.NEXT_PUBLIC_SYSTEM_A_URL || "https://system-a.space"', 'process.env.NEXT_PUBLIC_SYSTEM_A_URL || "http://localhost"'); New = "process.env.NEXT_PUBLIC_SYSTEM_A_URL || `"$systemPublic`"" },
  @{ Path = (Join-Path $Meridian ".env.mainnet.example"); Old = @('NEXT_PUBLIC_SYSTEM_A_URL=https://system-a.win', 'NEXT_PUBLIC_SYSTEM_A_URL=https://system-a.space', 'NEXT_PUBLIC_SYSTEM_A_URL=http://localhost'); New = "NEXT_PUBLIC_SYSTEM_A_URL=$systemPublic" },
  @{ Path = (Join-Path $A "scripts\healthcheck.mjs"); Old = @('"https://system-a.win";', '"https://system-a.space";', '"http://localhost";'); New = "`"$systemPublic`";" },
  @{ Path = (Join-Path $A "scripts\healthcheck.mjs"); Old = @('"https://merid.win";', '"https://merid.space";', '"http://localhost:8080";'); New = "`"$meridianPublic`";" }
)

Write-Host "Mode: $Mode" -ForegroundColor Cyan
Write-Host "System A public URL: $systemPublic"
Write-Host "Meridian public URL: $meridianPublic"
if (-not $Apply) {
  Write-Host "DRY RUN: ничего не изменяется. Для применения добавьте -Apply." -ForegroundColor Yellow
}

foreach ($change in $changes) {
  Set-FileText $change.Path $change.Old $change.New
}

# Runtime env files are changed only at the named public URL keys. Secrets,
# database URLs, Core URLs and provider keys are never printed or modified.
Set-KeyLine (Join-Path $A "frontend\.env.local") "NEXTAUTH_URL" $systemDev
Set-KeyLine (Join-Path $A "frontend\.env.local") "NEXT_PUBLIC_MERIDIAN_URL" $meridianPublic
Set-KeyLine (Join-Path $Meridian ".env") "NEXT_PUBLIC_SYSTEM_A_URL" $systemPublic

Write-Host "Completed. Only domain/public URL lines are in scope; secrets and internal service URLs were not changed." -ForegroundColor Cyan
