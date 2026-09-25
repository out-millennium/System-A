[CmdletBinding()]
param(
  [string]$Root = "",
  [string]$CoreUrl = "http://localhost:8000",
  [switch]$NoRegisterExternalApp,
  [switch]$RotateGeneratedSecrets,
  [switch]$SyncMeridianDbPassword,
  [switch]$SyncGrafanaPassword,
  [switch]$SkipRuntimeSync
)

Set-StrictMode -Version Latest
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$ErrorActionPreference = "Stop"

function New-RandomSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

function New-Key([string]$Prefix) {
  return "$Prefix$(New-RandomSecret 32)"
}

function Is-Placeholder([string]$Value) {
  return [string]::IsNullOrWhiteSpace($Value) -or $Value -match '^(FILL_|<|change[-_ ]?me|placeholder|example|your[-_ ])'
}

function Read-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }
  $escaped = [regex]::Escape($Name)
  $line = (Get-Content -LiteralPath $Path -ErrorAction Stop | Where-Object { $_ -match "^\s*$escaped=" } | Select-Object -First 1)
  if ($null -eq $line) { return $null }
  return ($line -replace "^\s*$escaped=", "")
}

function Backup-Once([string]$Path) {
  # Deliberately do not create .env.backup-* or any other backup artifact.
  # Runtime env files are the only files this generator may write.
  return
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
  try { chmod 600 $Path 2>$null } catch { }
}

function Ensure-EnvValue([string]$Path, [string]$Name, [string]$Value, [switch]$ForceValue) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Refusing to write empty value for $Name" }
  $existing = Read-EnvValue $Path $Name
  if ((-not $ForceValue) -and (-not $RotateGeneratedSecrets) -and (-not (Is-Placeholder $existing))) {
    Write-Output "preserved: $Name in $Path"
    return $existing
  }
  Backup-Once $Path
  $content = if (Test-Path $Path) { Get-Content -LiteralPath $Path -Raw } else { "" }
  $escaped = [regex]::Escape($Name)
  $line = "$Name=$Value"
  if ($content -match "(?m)^\s*$escaped=.*$") {
    $content = [regex]::Replace($content, "(?m)^\s*$escaped=.*$", [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line })
  } else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) { $content += "`n" }
    $content += "$line`n"
  }
  Write-Utf8NoBom $Path $content
  Write-Output "updated: $Name in $Path"
  return $Value
}

function Sync-MeridianDatabasePassword([string]$ComposeDirectory, [string]$DesiredPassword) {
  if ([string]::IsNullOrWhiteSpace($DesiredPassword)) {
    throw "Refusing to sync an empty MERIDIAN_DB_PASSWORD"
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is required for -SyncMeridianDbPassword"
  }
  $composeFile = Join-Path $ComposeDirectory "docker-compose.yml"
  if (-not (Test-Path $composeFile)) {
    throw "Meridian compose file not found: $composeFile"
  }

  Push-Location $ComposeDirectory
  try {
    # Feed the desired password only through stdin to psql; do not print it or
    # place it in a SQL command line. The existing database volume is preserved.
    $escapedPassword = $DesiredPassword.Replace("'", "''")
    $passwordInput = "\set desired '$escapedPassword'`nALTER ROLE meridian PASSWORD :'desired';`n"
    $passwordInput | & docker compose exec -T meridian-db psql -U meridian -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to synchronize the meridian PostgreSQL role password"
    }

    & docker compose up -d --no-deps --force-recreate meridian
    if ($LASTEXITCODE -ne 0) {
      throw "Meridian container recreation failed after password synchronization"
    }
    Write-Output "synchronized: PostgreSQL role meridian and recreated Meridian container"
  } finally {
    Pop-Location
  }
}

function Sync-GrafanaAdminPassword([string]$ComposeDirectory, [string]$DesiredPassword, [string]$GrafanaService = "grafana") {
  if ([string]::IsNullOrWhiteSpace($DesiredPassword)) {
    throw "Refusing to sync an empty GRAFANA_PASSWORD"
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is required for -SyncGrafanaPassword"
  }
  $composeFile = Join-Path $ComposeDirectory "docker-compose.yml"
  if (-not (Test-Path $composeFile)) {
    throw "System A compose file not found: $composeFile"
  }

  Push-Location $ComposeDirectory
  try {
    # Grafana reads GF_SECURITY_ADMIN_PASSWORD only during first admin-user
    # creation. Reset the existing admin account through the CLI instead.
    # The password is sent through stdin and never printed or put in SQL.
    $passwordInput = "$DesiredPassword`n"
    $passwordInput | & docker compose exec -T $GrafanaService grafana cli --homepath /usr/share/grafana admin reset-admin-password --password-from-stdin
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to synchronize the Grafana admin password"
    }
    Write-Output "synchronized: Grafana admin password"
  } finally {
    Pop-Location
  }
}

$Root = (Resolve-Path $Root).Path
$systemCore = Join-Path $Root "system-a-core\.env"
$frontend = Join-Path $Root "frontend\.env.local"
$grm = Join-Path $Root "grm-service\.env"
$external = Join-Path (Join-Path $Root "..") "external-app\.env"

# Existing non-placeholder values are preserved by default. This makes the
# command safe to run on a live checkout; use -RotateGeneratedSecrets only when
# an intentional coordinated rotation is planned.
$adminApiKey = Read-EnvValue $systemCore "ADMIN_API_KEY"
if (Is-Placeholder $adminApiKey) { $adminApiKey = New-Key "sa_" }
$nextAuthSecret = Read-EnvValue $systemCore "NEXTAUTH_SECRET"
if (Is-Placeholder $nextAuthSecret) { $nextAuthSecret = New-RandomSecret 32 }
$dbPassword = Read-EnvValue $systemCore "DB_PASSWORD"
if (Is-Placeholder $dbPassword) { $dbPassword = New-RandomSecret 32 }
$frontendDbPassword = Read-EnvValue $systemCore "FRONTEND_DB_PASSWORD"
if (Is-Placeholder $frontendDbPassword) { $frontendDbPassword = New-RandomSecret 32 }
$grafanaPassword = Read-EnvValue $systemCore "GRAFANA_PASSWORD"
if (Is-Placeholder $grafanaPassword) { $grafanaPassword = New-RandomSecret 32 }
$externalGrafanaPassword = Read-EnvValue $external "GRAFANA_PASSWORD"
if (Is-Placeholder $externalGrafanaPassword) { $externalGrafanaPassword = New-RandomSecret 32 }
$meridianDbPassword = Read-EnvValue $external "MERIDIAN_DB_PASSWORD"
if (Is-Placeholder $meridianDbPassword) { $meridianDbPassword = New-RandomSecret 32 }
$coreHmacSecret = Read-EnvValue $systemCore "CORE_HMAC_SECRET"
if (Is-Placeholder $coreHmacSecret) { $coreHmacSecret = New-RandomSecret 32 }
$visitorIpHashSecret = Read-EnvValue $systemCore "VISITOR_IP_HASH_SECRET"
if (Is-Placeholder $visitorIpHashSecret) { $visitorIpHashSecret = New-RandomSecret 32 }
$webhookSecret = Read-EnvValue $external "MERIDIAN_WEBHOOK_SECRET"
if (Is-Placeholder $webhookSecret) { $webhookSecret = New-RandomSecret 32 }

# Fill the generated values in the actual runtime env files.
Ensure-EnvValue $systemCore "ADMIN_API_KEY" $adminApiKey | Out-Null
Ensure-EnvValue $systemCore "NEXTAUTH_SECRET" $nextAuthSecret | Out-Null
Ensure-EnvValue $systemCore "DB_PASSWORD" $dbPassword | Out-Null
Ensure-EnvValue $systemCore "FRONTEND_DB_PASSWORD" $frontendDbPassword | Out-Null
Ensure-EnvValue $systemCore "GRAFANA_PASSWORD" $grafanaPassword | Out-Null
Ensure-EnvValue $systemCore "CORE_HMAC_SECRET" $coreHmacSecret -ForceValue | Out-Null
Ensure-EnvValue $systemCore "VISITOR_IP_HASH_SECRET" $visitorIpHashSecret -ForceValue | Out-Null
Ensure-EnvValue $systemCore "CORE_ENV" "production" -ForceValue | Out-Null
Ensure-EnvValue $frontend "CORE_ADMIN_KEY" $adminApiKey -ForceValue | Out-Null
Ensure-EnvValue $frontend "CORE_HMAC_SECRET" $coreHmacSecret -ForceValue | Out-Null
Ensure-EnvValue $frontend "VISITOR_IP_HASH_SECRET" $visitorIpHashSecret -ForceValue | Out-Null
Ensure-EnvValue $frontend "NEXTAUTH_SECRET" $nextAuthSecret -ForceValue | Out-Null
Ensure-EnvValue $frontend "DATABASE_URL" "postgresql://frontend:$frontendDbPassword@localhost:5433/frontend_db" | Out-Null
Ensure-EnvValue $grm "CORE_ADMIN_KEY" $adminApiKey -ForceValue | Out-Null
Ensure-EnvValue $grm "CORE_HMAC_SECRET" $coreHmacSecret -ForceValue | Out-Null
Ensure-EnvValue $external "CORE_HMAC_SECRET" $coreHmacSecret -ForceValue | Out-Null
Ensure-EnvValue $external "GRAFANA_PASSWORD" $externalGrafanaPassword | Out-Null
Ensure-EnvValue $external "MERIDIAN_DB_PASSWORD" $meridianDbPassword | Out-Null
Ensure-EnvValue $external "MERIDIAN_WEBHOOK_SECRET" $webhookSecret | Out-Null
Ensure-EnvValue $external "MERIDIAN_REQUIRE_WITHDRAWAL_CONFIRM" "true" -ForceValue | Out-Null
Ensure-EnvValue $external "MERIDIAN_MOCK_AUTOCONFIRM" "false" -ForceValue | Out-Null
Ensure-EnvValue $external "MERIDIAN_PROVIDER" "tron-usdt" -ForceValue | Out-Null

# CORE_ADMIN_KEY for Meridian is not a random secret: Core issues it once for
# the recognized external application. If it is missing, register Meridian now
# only when Core is already reachable and no active Meridian key exists.
$externalCoreKey = Read-EnvValue $external "CORE_ADMIN_KEY"
if ((-not $NoRegisterExternalApp) -and (Is-Placeholder $externalCoreKey)) {
  try {
    $headers = @{ "x-admin-key" = $adminApiKey }
    $apps = Invoke-RestMethod -Method Get -Uri "$CoreUrl/external_apps" -Headers $headers -TimeoutSec 10
    $existing = @($apps | Where-Object { $_.name -eq "meridian" -and $_.active })
    if ($existing.Count -gt 0) {
      throw "Core already has an active Meridian external key, but it cannot be retrieved. Put that existing key in external-app/.env as CORE_ADMIN_KEY or revoke it deliberately before rerunning."
    }
    $body = @{ name = "meridian"; scopes = "credit,burn,balance" } | ConvertTo-Json -Compress
    $created = Invoke-RestMethod -Method Post -Uri "$CoreUrl/external_apps" -Headers (@{ "x-admin-key" = $adminApiKey; "Content-Type" = "application/json" }) -Body $body -TimeoutSec 10
    if (Is-Placeholder $created.key) { throw "Core returned no usable external key" }
    Ensure-EnvValue $external "CORE_ADMIN_KEY" ([string]$created.key) | Out-Null
    Write-Output "registered: Meridian external CORE_ADMIN_KEY through Core"
  } catch {
    Write-Warning "CORE_ADMIN_KEY was not filled automatically: $($_.Exception.Message)"
    Write-Warning "Start Core and rerun this command, or put the already-issued Meridian external key in external-app/.env manually."
  }
} elseif (Is-Placeholder $externalCoreKey) {
  Write-Warning "external-app/.env CORE_ADMIN_KEY is still missing because -NoRegisterExternalApp was used."
}

if (-not $SkipRuntimeSync) {
  Sync-MeridianDatabasePassword (Split-Path -Parent $external) $meridianDbPassword
  Sync-GrafanaAdminPassword (Split-Path -Parent $systemCore) $grafanaPassword "grafana"
  Sync-GrafanaAdminPassword (Split-Path -Parent $external) $externalGrafanaPassword "meridian-grafana"
}

Write-Output "Completed. Existing non-placeholder values were preserved; generated values were written to the actual runtime env files."
Write-Output "Provider-issued OAuth/TRON credentials and mnemonic/private key were not invented."
