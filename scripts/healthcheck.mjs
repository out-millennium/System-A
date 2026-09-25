#!/usr/bin/env node
/* =============================================================================
   System A + Meridian — universal release health check.

   This is intentionally one orchestrator instead of a collection of unrelated
   commands. It checks the whole repository in layers:

     STATIC (always, unless explicitly skipped)
       - frontend and Meridian: build, TypeScript, ESLint, unit tests, Prisma
       - Core and GRM: Python compilation, import smoke tests, every pytest suite
       - i18n parity for all locales
       - Docker Compose/config, nginx, certificates, Prometheus, backups
       - automatic page/API discovery and route classification
       - source-level safety/declaration checks

     LIVE (with --all or --live)
       - every System A page and every discovered API method
       - every Meridian API method as a non-destructive smoke request
       - Core health/version/ledger verification where a direct Core URL exists
       - GRM health/version/config/current/diagnostics/oracle endpoints
       - protected routes reject anonymous requests
       - secret-gated Meridian routes never answer 200 without a secret

     E2E (with --all or --e2e)
       - the repository's Playwright browser tests against the configured local
         stack. E2E is deliberately not faked and never runs against a remote
         production URL unless the operator explicitly supplies one.

   Important safety rule: live checks never create accounts, credits, transfers,
   orders, payouts or blockchain transactions. Mutation logic is exercised by
   the unit/invariant suites; live mutation tests require a separate disposable
   staging environment and are not silently run against production.

   One-command interactive local check (asks: selected or everything):
     node scripts/healthcheck.mjs

   One-command non-interactive release check:
     node scripts/healthcheck.mjs --all --strict

   Useful development variants:
     node scripts/healthcheck.mjs --all --stubs
     node scripts/healthcheck.mjs --all --system-a http://localhost --meridian http://localhost:8080
     node scripts/healthcheck.mjs --all --system-a http://localhost:3010 --core http://localhost:8000 --grm http://localhost:8001 --meridian http://localhost:8080
     node scripts/healthcheck.mjs --static-only
     node scripts/healthcheck.mjs --no-build
     node scripts/healthcheck.mjs --all --report release-report.json
     node scripts/healthcheck.mjs --all --insecure-tls  # local self-signed HTTPS only

   --strict makes warnings fail the process. Without --strict, warnings are still
   printed in full and saved to healthcheck-report.json, but only failures make
   the exit code non-zero. No secret values are written to the report.
   ============================================================================= */

import { execFileSync, execSync } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const CORE = path.join(ROOT, "system-a-core");
const GRM = path.join(ROOT, "grm-service");
// Meridian lives OUTSIDE the System A tree (it is an independent external app).
const MERIDIAN = path.join(ROOT, "..", "external-app");

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const STATIC_ONLY = args.includes("--static-only");
const NO_BUILD = args.includes("--no-build");
const STRICT = args.includes("--strict") || process.env.HEALTHCHECK_STRICT === "1";
const NO_REPORT = args.includes("--no-report");
const INSECURE_TLS = args.includes("--insecure-tls");
const INTERACTIVE = args.length === 0 && Boolean(process.stdin.isTTY && process.stdout.isTTY);

// These are mutable because an interactive run can select a subset, and an
// explicit local "everything" run can switch the live layer to disposable stub
// services without changing the commands used by the rest of the checker.
let RUN_LIVE = !STATIC_ONLY && (ALL || args.includes("--live"));
let RUN_E2E = !STATIC_ONLY && (ALL || args.includes("--e2e"));
let USE_STUBS = args.includes("--stubs");
let MODE = ALL ? "all" : "static";
const CHECKS = {
  frontend: true,
  i18n: true,
  backend: true,
  meridian: true,
  infrastructure: true,
  declarations: true,
  coverage: true,
  live: RUN_LIVE,
  e2e: RUN_E2E,
};
if (INSECURE_TLS) {
  // Only for local self-signed certificates. Never use this flag as the
  // production TLS check; without it, Node validates the real CA chain.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
if (USE_STUBS && !STATIC_ONLY) {
  RUN_LIVE = true;
  CHECKS.live = true;
  MODE = "stub-live";
}

function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

const optionUrls = new Set(["--system-a", "--core", "--grm", "--meridian"].map(argValue).filter(Boolean));
const httpArgs = args.filter((a) => /^https?:\/\//i.test(a) && !optionUrls.has(a));
let EXPLICIT_CORE_URL = Boolean(argValue("--core") || process.env.HEALTHCHECK_CORE_URL);
let EXPLICIT_GRM_URL = Boolean(argValue("--grm") || process.env.HEALTHCHECK_GRM_URL);
let CORE_URL =
  argValue("--core") || process.env.HEALTHCHECK_CORE_URL || "http://localhost:8000";
let GRM_URL =
  argValue("--grm") || process.env.HEALTHCHECK_GRM_URL || "http://localhost:8001";
let SYSTEM_A_URL =
  argValue("--system-a") ||
  process.env.HEALTHCHECK_SYSTEM_A_URL ||
  httpArgs[0] ||
  "http://localhost";
const mFlag = args.indexOf("--meridian");
let MERIDIAN_URL =
  (mFlag >= 0 && args[mFlag + 1]) ||
  process.env.HEALTHCHECK_MERIDIAN_URL ||
  httpArgs[1] ||
  "http://localhost:8080";
const REPORT_PATH =
  argValue("--report") ||
  process.env.HEALTHCHECK_REPORT ||
  path.join(ROOT, "healthcheck-report.json");

// ---- reporter -------------------------------------------------------------
const results = [];
let failures = 0;
let warnings = 0;
const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function indent(text, prefix = "    ") {
  return String(text || "")
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

function diagnosticContext(name, kind, detail = "") {
  const n = String(name || "").toLowerCase();
  const d = String(detail || "").toLowerCase();
  const context = {
    category: "release-check",
    cause: "Проверка вернула ошибку или предупреждение; точная причина указана в исходном выводе ниже.",
    impact: kind === "FAIL" ? "Результат нельзя считать проверенным; релиз должен быть заблокирован до исправления." : "Результат требует ручной проверки и не должен молча игнорироваться.",
    action: "Откройте полный detail этого результата, исправьте первопричину и повторите тот же healthcheck.",
    verify: "Повторить ту же команду; затем выполнить полный режим --all --strict.",
  };
  if (/playwright|e2e|browser/.test(n + d)) {
    context.category = "browser-e2e/environment";
    context.cause = "Не установлен браузер/системная библиотека, web server не стартовал или недоступна тестовая БД.";
    context.impact = "Поведение интерфейса в настоящем браузере не подтверждено; это не доказательство бага или его отсутствия.";
    context.action = "Установить браузер и системные зависимости (npx playwright install --with-deps chromium), поднять PostgreSQL и повторить E2E в staging.";
    context.verify = "npx playwright test --reporter=line и затем node scripts/healthcheck.mjs --all --strict.";
  } else if (/build|production build|typescript|compile/.test(n)) {
    context.category = "build/typecheck";
    context.cause = "Ошибка компиляции, TypeScript, Next/Webpack/Turbopack или несовместимая зависимость.";
    context.impact = "Выпускаемый артефакт может не собраться или отличаться от проверенного исходного кода.";
    context.action = "Запустить указанную build/typecheck-команду отдельно, исправить первую ошибку в цепочке и не маскировать её eslint-disable/try-catch.";
    context.verify = "Повторить build с чистым кэшем и проверить итоговый production image.";
  } else if (/lint|eslint/.test(n)) {
    context.category = "static-quality";
    context.cause = "Статический анализ нашёл потенциальную ошибку, опасный паттерн или предупреждение качества.";
    context.impact = "Проблема может скрывать регрессию, race condition, некорректный hook или уязвимый путь; warnings release-blocking в strict mode.";
    context.action = "Исправить первопричину в файле/строке из detail; не снижать severity правила без документированного обоснования.";
    context.verify = "Повторить npm run lint и полный healthcheck --strict.";
  } else if (/test|pytest|unit|invariant/.test(n)) {
    context.category = "tests/invariants";
    context.cause = "Тестовая или инвариантная проверка не прошла либо была пропущена из-за окружения.";
    context.impact = "Поведение соответствующего security/money-critical сценария не подтверждено.";
    context.action = "Запустить конкретный failing test, проверить fixture/DB/provider и добавить regression test перед релизом.";
    context.verify = "Повторить весь suite и healthcheck в чистом окружении.";
  } else if (/database|db|postgres|prisma|migration|restore|backup/.test(n + d)) {
    context.category = "database/continuity";
    context.cause = "База недоступна, схема/миграция не проверена или backup/restore drill не выполнен.";
    context.impact = "Нельзя доказать корректность balances, idempotency, locks, sessions и восстановления после сбоя.";
    context.action = "Запустить PostgreSQL, применить migrations на копии, выполнить DB-backed tests и restore drill; не использовать production для эксперимента.";
    context.verify = "Повторить Prisma/migration checks, Core/Meridian DB tests и backup restore.";
  } else if (/audit|vulnerabilit|dependency|npm|pip/.test(n + d)) {
    context.category = "dependency/supply-chain";
    context.cause = "Пакетная уязвимость, lockfile drift или невозможность проверить dependency advisory database.";
    context.impact = "Уязвимость может попасть в runtime/build chain и обходить прикладную защиту.";
    context.action = "Обновить конкретную dependency без слепого --force, проверить lockfile, build, tests и image scan.";
    context.verify = "npm audit --omit=dev, pip-audit, SBOM и повторный build из чистого checkout.";
  } else if (/tls|certificate|trust/.test(n + d)) {
    context.category = "transport-security";
    context.cause = "Сертификат self-signed, просрочен, не доверен или TLS-проверка отключена.";
    context.impact = "В production возможны MITM и подмена frontend/Core/provider traffic.";
    context.action = "Установить CA-доверенный production certificate, проверить hostname/SAN/chain и не использовать --insecure-tls.";
    context.verify = "openssl verify, curl без -k и повторный live healthcheck.";
  } else if (/docker|compose|container|image|root|port/.test(n + d)) {
    context.category = "container/infrastructure";
    context.cause = "Docker отсутствует/невалиден, image не pinned, порт опубликован или runtime user небезопасен.";
    context.impact = "Нельзя подтвердить isolation, network boundary и reproducible deployment.";
    context.action = "Запустить docker compose config, image scan, проверить non-root, exposed ports, secrets mounts и digest tags.";
    context.verify = "Повторить compose validation на машине с Docker и smoke test контейнеров.";
  } else if (/route|auth|protected|public|guard|idor|account|order|balance|wallet|webhook|hmac|rate|xff|csrf|secret/.test(n + d)) {
    context.category = "security/auth/business-abuse";
    context.cause = "Маршрут, guard, token binding, replay/rate-limit или money/business invariant не соответствует контракту.";
    context.impact = "Возможны IDOR, обход авторизации, повторная операция, утечка баланса/ключа или мошеннический вывод.";
    context.action = "Проверить маршрут вручную с anonymous/другим account/старым token/повторным request; добавить regression test и закрыть endpoint.";
    context.verify = "Повторить anonymous protected-route checks, concurrent abuse tests и staging transaction flow.";
  }
  return context;
}

function enrichedDiagnostic(name, kind, detail) {
  const context = diagnosticContext(name, kind, detail);
  return `${detail || "(детали не предоставлены)"}\n\n` +
    `DIAGNOSTIC CATEGORY: ${context.category}\n` +
    `LIKELY CAUSE: ${context.cause}\n` +
    `IMPACT: ${context.impact}\n` +
    `REQUIRED ACTION: ${context.action}\n` +
    `VERIFY AGAIN: ${context.verify}`;
}

function printDiagnostic(kind, name, detail) {
  const colour = kind === "FAIL" ? C.red : C.yellow;
  console.log(`  ${colour(kind)}  ${name}`);
  if (detail) console.log(indent(enrichedDiagnostic(name, kind, detail)));
}

function pass(name, detail = "", extra = {}) {
  results.push({ name, status: "pass", detail, ...extra });
  console.log(`  ${C.green("PASS")}  ${name}${detail ? "  " + C.dim(detail) : ""}`);
}

function fail(name, detail = "", extra = {}) {
  const diagnostic = enrichedDiagnostic(name, "FAIL", detail);
  results.push({ name, status: "fail", detail, diagnostic, ...extra });
  failures++;
  printDiagnostic("FAIL", name, detail);
}

function warn(name, detail = "", extra = {}) {
  const diagnostic = enrichedDiagnostic(name, "WARN", detail);
  results.push({ name, status: "warning", detail, diagnostic, ...extra });
  warnings++;
  printDiagnostic("WARN", name, detail);
}

function section(title) {
  console.log("\n" + C.bold("── " + title + " " + "─".repeat(Math.max(0, 62 - title.length))));
}

function redact(text) {
  let value = String(text || "");
  // Never put common secret-looking environment values into the JSON report.
  for (const [key, raw] of Object.entries(process.env)) {
    if (!raw || raw.length < 8 || !/(KEY|SECRET|PASSWORD|TOKEN|PRIV|MNEMONIC|CREDENTIAL)/i.test(key)) continue;
    value = value.split(raw).join(`[REDACTED:${key}]`);
  }
  return value;
}

function limited(text, max = 16000) {
  const value = redact(text);
  return value.length > max ? `${value.slice(0, max)}\n… [truncated; full command output is not retained]` : value;
}

function shell(command, cwd, extraEnv = {}) {
  // `execSync` uses the platform shell, so npm/python commands work on both
  // Windows PowerShell/cmd and POSIX shells. No user-provided value is put into
  // these command strings except controlled paths and fixed test commands.
  return execSync(command, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 16 * 1024 * 1024,
  });
}

function program(programName, argv, cwd, extraEnv = {}) {
  return execFileSync(programName, argv, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 16 * 1024 * 1024,
  });
}

function commandIssueLines(output) {
  const lines = String(output || "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return lines.filter((line) => {
    if (/0\s+(warnings?|skipped|errors?)/i.test(line) || /\bskipped\s+0\b/i.test(line)) return false;
    return /\bwarn(?:ing)?\b|deprecated|\bskipped\b|\bskip\b/i.test(line);
  });
}

function commandFailure(e, command, cwd) {
  const stdout = e?.stdout || "";
  const stderr = e?.stderr || "";
  return [
    `command: ${command}`,
    `cwd: ${cwd}`,
    `exit: ${e?.status ?? "unknown"}`,
    stdout ? `--- stdout ---\n${limited(stdout)}` : "",
    stderr ? `--- stderr ---\n${limited(stderr)}` : "",
    !stdout && !stderr ? `error: ${e?.message || String(e)}` : "",
  ].filter(Boolean).join("\n");
}

function tryProgramWithInput(name, programName, argv, cwd, input, matcher = null) {
  const started = Date.now();
  const command = `${programName} ${argv.map((value) => JSON.stringify(value)).join(" ")}`;
  let output = "";
  try {
    output = execFileSync(programName, argv, {
      cwd,
      input,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (matcher && !matcher(output)) {
      fail(name, [
        `command: ${command}`,
        `cwd: ${cwd}`,
        "The process exited successfully but its output did not match the expected success contract.",
        `--- output ---\n${limited(output)}`,
      ].join("\n"), { command, cwd, duration_ms: Date.now() - started });
      return false;
    }
    pass(name, `${Date.now() - started} ms`, { command, cwd, duration_ms: Date.now() - started });
    const issues = commandIssueLines(output);
    if (issues.length) {
      warn(`${name} — command diagnostics`, [
        `command: ${command}`,
        `cwd: ${cwd}`,
        "Detected warning/skip/deprecation diagnostics:",
        issues.join("\n"),
        `--- full command output ---\n${limited(output)}`,
      ].join("\n"), { command, cwd, duration_ms: Date.now() - started });
    }
    return true;
  } catch (e) {
    fail(name, commandFailure(e, command, cwd), {
      command,
      cwd,
      duration_ms: Date.now() - started,
      stdout: limited(e?.stdout),
      stderr: limited(e?.stderr),
    });
    return false;
  }
}

function tryCommand(name, command, cwd, matcher = null, extraEnv = {}) {
  const started = Date.now();
  let output = "";
  try {
    output = shell(command, cwd, extraEnv);
    if (matcher && !matcher(output)) {
      fail(name, [
        `command: ${command}`,
        `cwd: ${cwd}`,
        "The process exited successfully but its output did not match the expected success contract.",
        `--- output ---\n${limited(output)}`,
      ].join("\n"), { command, cwd, duration_ms: Date.now() - started });
      return false;
    }
    pass(name, `${Date.now() - started} ms`, { command, cwd, duration_ms: Date.now() - started });
    const issues = commandIssueLines(output);
    if (issues.length) {
      warn(`${name} — command diagnostics`, [
        `command: ${command}`,
        `cwd: ${cwd}`,
        "Detected warning/skip/deprecation diagnostics:",
        issues.join("\n"),
        `--- full command output ---\n${limited(output)}`,
      ].join("\n"), { command, cwd, duration_ms: Date.now() - started });
    }
    return true;
  } catch (e) {
    fail(name, commandFailure(e, command, cwd), {
      command,
      cwd,
      duration_ms: Date.now() - started,
      stdout: limited(e?.stdout),
      stderr: limited(e?.stderr),
    });
    return false;
  }
}

function checkFile(name, file, needles = []) {
  if (!existsSync(file)) {
    fail(name, `missing file: ${file}`);
    return false;
  }
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (e) {
    fail(name, `cannot read ${file}: ${e.message}`);
    return false;
  }
  const missing = needles.filter((needle) => !source.includes(needle));
  if (missing.length) {
    fail(name, `file: ${file}\nmissing required text:\n${missing.map((x) => `- ${x}`).join("\n")}`);
    return false;
  }
  pass(name);
  return true;
}

function commandExists(commandName) {
  try {
    shell(`${commandName} --version`, ROOT);
    return true;
  } catch {
    return false;
  }
}

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
}

function routeMethods(source) {
  const methods = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PATCH|PUT|DELETE|HEAD)\b/g)) {
    methods.add(match[1]);
  }
  // NextAuth and a few adapters export a shared handler as named methods.
  for (const match of source.matchAll(/\bas\s+(GET|POST|PATCH|PUT|DELETE|HEAD)\b/g)) {
    methods.add(match[1]);
  }
  return [...methods];
}

function routeIsGuarded(source) {
  return /getServerSession|getCurrentUserWithApiKey|getAdmin|getActiveAdmin|getCreator|verify_admin|x-admin-key|withAuth|requireAuth/i.test(source);
}

function discoverPages(root = FRONTEND) {
  return walk(path.join(root, "app"), (p) => p.endsWith("page.tsx"))
    .map((file) => {
      const rel = path.relative(path.join(root, "app"), file).replace(/\\/g, "/");
      const withoutPage = rel.replace(/(?:^|\/)page\.tsx$/, "");
      return withoutPage ? `/${withoutPage}` : "/";
    })
    .sort();
}

function discoverApiRoutes(root = FRONTEND) {
  return walk(path.join(root, "app", "api"), (p) => p.endsWith("route.ts"))
    .map((file) => {
      const rel = path.relative(path.join(root, "app", "api"), file).replace(/\\/g, "/");
      const route = "/" + rel.replace(/\/route\.ts$/, "");
      const source = readFileSync(file, "utf8");
      return {
        file,
        route,
        methods: routeMethods(source),
        guarded: routeIsGuarded(source),
        source,
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

function materializeRoute(route) {
  return route
    .replace(/\[\.\.\.[^\]]+\]/g, "healthcheck")
    .replace(/\[[^\]]+\]/g, "healthcheck");
}

/* Auth contract for every System A API route. The discovery check below fails
   when a new route is added without an explicit classification, so the health
   check cannot silently stop covering a new endpoint. */
const AUTH = {
  "/account-preview": "protected",
  "/admin/accounts": "protected",
  "/admin/announcements": "protected",
  "/admin/applications": "protected",
  "/admin/audit-log": "protected",
  "/admin/complaints": "protected",
  "/admin/creator": "protected",
  "/admin/deletion-requests": "protected",
  "/admin/key-revocation-requests": "protected",
  "/admin/messages": "protected",
  "/admin/moderation": "protected",
  "/admin/moderation-appeals": "protected",
  "/admin/operations": "protected",
  "/admin/seed": "special",
  "/admin/warnings": "protected",
  "/announcements": "public",
  "/apply-admin": "protected",
  "/auth/2fa/disable": "protected",
  "/auth/2fa/enable": "protected",
  "/auth/2fa/setup": "protected",
  "/auth/[...nextauth]": "special",
  "/auth/activity": "protected",
  "/auth/appeal-moderation": "protected",
  "/auth/cancel": "protected",
  "/auth/complete": "protected",
  "/auth/delete": "protected",
  "/auth/events": "protected",
  "/auth/forgot": "special",
  "/auth/login": "special",
  "/auth/logout": "special",
  "/auth/me": "protected",
  "/auth/moderation": "protected",
  "/auth/notifications": "protected",
  "/auth/password": "protected",
  "/auth/register": "special",
  "/auth/request-deletion": "protected",
  "/auth/request-key-revocation": "protected",
  "/auth/reveal-key": "protected",
  "/auth/mail-status": "public",
  "/auth/withdrawal-confirmations": "protected",
  "/auth/reset": "special",
  "/auth/revoke": "protected",
  "/auth/sessions": "protected",
  "/auth/sessions/revoke": "protected",
  "/auth/unlink": "protected",
  "/balance": "protected",
  "/burn": "protected",
  "/grm/at": "public",
  "/grm/compute": "special",
  "/grm/config": "public",
  "/grm/current": "public",
  "/grm/diagnostics": "public",
  "/grm/history": "public",
  "/grm/oracle": "public",
  "/grm/summary": "public",
  "/ledger": "protected",
  "/ledger/export": "protected",
  "/messages": "protected",
  "/status": "public",
  "/transfer": "protected",
};

function checkRouteCoverage(routes, map, label) {
  let uncovered = 0;
  for (const item of routes) {
    if (!item.methods.length) {
      fail(`${label} route has no exported HTTP method`, `${item.file}\nNo GET/POST/PATCH/PUT/DELETE/HEAD export was found.`);
      uncovered++;
    }
    if (!(item.route in map)) {
      fail(`${label} route not classified`, `${item.route}\nfile: ${item.file}\nAdd an explicit auth/smoke classification before merging.`);
      uncovered++;
      continue;
    }
    const expected = map[item.route];
    if (expected === "public" && item.guarded) {
      warn(`${label} classification mismatch`, `${item.route} is marked public but source contains an auth guard.`, { file: item.file });
    }
    if (expected === "protected" && !item.guarded) {
      warn(`${label} classification mismatch`, `${item.route} is marked protected but no known guard token was found. Review manually.`, { file: item.file });
    }
  }
  for (const route of Object.keys(map)) {
    if (!routes.some((item) => item.route === route)) {
      warn(`${label} stale classification`, `${route} is listed in the healthcheck but no longer exists on disk.`);
    }
  }
  if (uncovered === 0) pass(`${label} routes all classified`, `${routes.length} routes`);
}

function findPython() {
  for (const candidate of ["python", "python3", "py"]) {
    try {
      shell(`${candidate} -c "import pytest"`, ROOT);
      return candidate;
    } catch {
      // Continue to the next platform spelling.
    }
  }
  return null;
}

function note(name, detail = "") {
  results.push({ name, status: "info", detail });
  console.log(`  ${C.cyan("INFO")}  ${name}${detail ? "  " + C.dim(detail) : ""}`);
}

async function chooseInteractiveMode() {
  if (!INTERACTIVE) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(C.bold("Выберите объём проверки:"));
    console.log("  1 — выбрать, что проверять");
    console.log("  2 — выполнить всё (включая live-smoke и E2E)");
    const choice = (await rl.question("Ваш выбор [2]: ")).trim() || "2";

    if (choice === "2" || /^all$/i.test(choice)) {
      for (const key of Object.keys(CHECKS)) CHECKS[key] = true;
      RUN_LIVE = true;
      RUN_E2E = true;
      USE_STUBS = true;
      MODE = "interactive-all-stubs";
      console.log(C.cyan("Выбран полный запуск. Для live-проверок будут подняты локальные безопасные заглушки."));
      return;
    }

    console.log(C.bold("Выберите разделы через запятую:"));
    console.log("  1 — System A Frontend + i18n");
    console.log("  2 — Core + GRM backend");
    console.log("  3 — Meridian");
    console.log("  4 — infrastructure + declarations + coverage");
    console.log("  5 — live-smoke всех сервисов");
    console.log("  6 — Playwright E2E");
    const selected = (await rl.question("Разделы [1,2,3,4]: ")).trim() || "1,2,3,4";
    for (const key of Object.keys(CHECKS)) CHECKS[key] = false;
    for (const item of selected.split(",").map((x) => x.trim())) {
      if (item === "1") { CHECKS.frontend = true; CHECKS.i18n = true; }
      if (item === "2") CHECKS.backend = true;
      if (item === "3") CHECKS.meridian = true;
      if (item === "4") { CHECKS.infrastructure = true; CHECKS.declarations = true; CHECKS.coverage = true; }
      if (item === "5") { CHECKS.live = true; RUN_LIVE = true; }
      if (item === "6") { CHECKS.e2e = true; RUN_E2E = true; }
    }
    if (CHECKS.live) {
      const liveChoice = (await rl.question("Live-проверка: 1 — заглушки (безопасно) / 2 — реальные локальные сервисы [1]: ")).trim();
      if (liveChoice !== "2") USE_STUBS = true;
    }
    MODE = "interactive-selected";
    console.log(C.cyan("Выбранные проверки будут выполнены."));
  } finally {
    rl.close();
  }
}

function detectCoreDb(py) {
  const env = {
    DB_HOST: process.env.DB_HOST || "127.0.0.1",
    DB_PORT: process.env.DB_PORT || "5432",
    DB_NAME: process.env.DB_NAME || "system_a_core",
    DB_USER: process.env.DB_USER || "postgres",
    DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
    ADMIN_API_KEY: process.env.ADMIN_API_KEY || "healthcheck-admin",
  };
  const probe = [
    "import os,psycopg",
    "c=psycopg.connect(host=os.environ['DB_HOST'],port=os.environ['DB_PORT'],",
    "dbname=os.environ['DB_NAME'],user=os.environ['DB_USER'],",
    "password=os.environ['DB_PASSWORD'],connect_timeout=1)",
    "c.close()",
  ].join(";");
  try {
    shell(`${py} -c "${probe}"`, ROOT, env);
    return env;
  } catch {
    return null;
  }
}

function checkI18n() {
  section("Static: i18n parity");
  const langs = ["en", "ru", "zh", "fr", "es"];
  const keysOf = (source) => {
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const out = new Set();
    const stack = [];
    for (const line of clean.split("\n")) {
      const objectStart = line.match(/^\s*([A-Za-z0-9_]+):\s*\{\s*$/);
      if (objectStart) {
        stack.push(objectStart[1]);
        continue;
      }
      // A translated string may be on the next line after `key:`. Treat a
      // bare `key:` as a leaf unless the following character is `{` (handled
      // above), otherwise multiline catalogue entries disappear from parity.
      const leaf = line.match(/^\s*([A-Za-z0-9_]+):\s*(?:[\"']|$)/);
      if (leaf) {
        out.add([...stack, leaf[1]].join("."));
        continue;
      }
      if (/^\s*\},?\s*$/.test(line)) stack.pop();
    }
    return out;
  };
  try {
    const sets = {};
    for (const lang of langs) {
      const file = path.join(FRONTEND, "lib", "i18n", "messages", `${lang}.ts`);
      if (!existsSync(file)) throw new Error(`missing locale file: ${file}`);
      sets[lang] = keysOf(readFileSync(file, "utf8"));
    }
    const base = sets.en;
    let differences = 0;
    for (const lang of langs.slice(1)) {
      const missing = [...base].filter((key) => !sets[lang].has(key));
      const extra = [...sets[lang]].filter((key) => !base.has(key));
      if (missing.length || extra.length) {
        fail(`i18n parity ${lang}`, [
          `missing ${missing.length}: ${missing.slice(0, 30).join(", ") || "none"}`,
          `extra ${extra.length}: ${extra.slice(0, 30).join(", ") || "none"}`,
        ].join("\n"));
        differences++;
      }
    }
    if (differences === 0) pass("System A i18n parity", `${base.size} keys × ${langs.length} locales`);
  } catch (e) {
    fail("System A i18n parity", e.message);
  }
}

function checkMeridianI18n() {
  const file = path.join(MERIDIAN, "lib", "messages.ts");
  if (!existsSync(file)) {
    warn("Meridian i18n parity", `missing ${file}`);
    return;
  }
  if (!existsSync(path.join(MERIDIAN, "node_modules"))) {
    warn("Meridian i18n parity", "node_modules is absent; install dependencies before running the universal check.");
    return;
  }
  const probe = [
    'import { messages } from "./lib/messages.ts";',
    'const keys=(o,p="")=>{let r=[];for(const k in o){const v=o[k];const kk=p?p+"."+k:k;if(v&&typeof v==="object")r=r.concat(keys(v,kk));else r.push(kk);}return r;};',
    'const en=new Set(keys(messages.en));let bad=[];',
    'for(const l of ["ru","zh","fr","es"]){const s=new Set(keys(messages[l]));const m=[...en].filter(k=>!s.has(k)),e=[...s].filter(k=>!en.has(k));if(m.length||e.length)bad.push(l+": missing "+m.length+", extra "+e.length);}',
    'console.log(bad.length?("DIFF "+bad.join(";")):("OK "+en.size));',
  ].join("\n");
  const probeFile = path.join(MERIDIAN, ".healthcheck-i18n.mjs");
  try {
    writeFileSync(probeFile, probe);
    const output = shell("npx tsx .healthcheck-i18n.mjs", MERIDIAN).trim();
    const last = output.split("\n").filter(Boolean).pop() || "";
    if (last.startsWith("OK")) pass("Meridian i18n parity", `${last.slice(3)} keys × 5 locales`);
    else fail("Meridian i18n parity", last);
  } catch (e) {
    fail("Meridian i18n parity", commandFailure(e, "npx tsx .healthcheck-i18n.mjs", MERIDIAN));
  } finally {
    try { rmSync(probeFile); } catch { /* ignore */ }
  }
}

async function checkHttp(method, url, expectation, name, body = undefined) {
  const started = Date.now();
  let response;
  let responseText = "";
  try {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const fetchOnce = async (target) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        return await fetch(target, {
          method,
          redirect: "manual",
          signal: controller.signal,
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: payload,
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    let requestUrl = url;
    response = await fetchOnce(requestUrl);
    let redirectNote = "";
    // The local nginx intentionally redirects HTTP to HTTPS. Follow only a
    // same-host HTTP→HTTPS redirect; never follow an arbitrary external URL or
    // silently turn this healthcheck into an SSRF client.
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        const nextUrl = new URL(location, url);
        const originalUrl = new URL(url);
        if (nextUrl.protocol === "https:" && nextUrl.hostname === originalUrl.hostname) {
          requestUrl = nextUrl.toString();
          response = await fetchOnce(requestUrl);
          redirectNote = `\nredirect-followed: ${url} -> ${requestUrl}`;
        }
      }
    }
    responseText = await response.text();
    const elapsed = `${Date.now() - started} ms`;
    const detail = `method: ${method}\nurl: ${requestUrl}\nstatus: ${response.status} ${response.statusText}\ntime: ${elapsed}${redirectNote}\nresponse: ${limited(responseText, 6000) || "<empty>"}`;
    const verdict = expectation(response.status, responseText);
    if (verdict === "pass") pass(name, `${response.status} · ${elapsed}`, { method, url, status: response.status });
    else if (verdict === "warning") warn(name, detail, { method, url, status: response.status });
    else fail(name, detail, { method, url, status: response.status });
  } catch (e) {
    const detail = [
      `method: ${method}`,
      `url: ${url}`,
      `time: ${Date.now() - started} ms`,
      e?.name === "AbortError"
        ? "request timed out after 15000 ms"
        : `network/client error: ${e?.message || String(e)}${e?.cause ? `\ncause: ${e.cause.code || e.cause.message || String(e.cause)}` : ""}`,
    ].join("\n");
    fail(name, detail, { method, url });
  }
}

function anyUnder500(status) {
  return status < 500 ? "pass" : "fail";
}

function liveExpectation(kind, method) {
  if (kind === "protected") return (status) => status === 401 || status === 403 ? "pass" : "fail";
  if (kind === "public") return anyUnder500;
  // Special routes often need a body, CSRF/session state or framework params.
  // This smoke test still proves they are wired and do not throw a 5xx.
  return anyUnder500;
}

function sendStub(res, status, body, contentType = "application/json") {
  res.writeHead(status, { "content-type": contentType });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function createStubServer(kind, routes) {
  const routeMap = new Map(routes.map((item) => [materializeRoute(item.route), item]));
  return createServer((req, res) => {
    const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
    if (kind === "system") {
      if (!pathname.startsWith("/api/")) {
        sendStub(res, 200, "<!doctype html><html><body>System A local stub</body></html>", "text/html; charset=utf-8");
        return;
      }
      const route = pathname.slice("/api".length);
      const item = routeMap.get(route);
      if (!item) { sendStub(res, 404, { error: "stub_route_not_found" }); return; }
      const auth = AUTH[item.route] || "special";
      if (auth === "protected") { sendStub(res, 401, { error: "unauthenticated_stub" }); return; }
      if (route === "/grm/current") {
        sendStub(res, 200, { ts: new Date().toISOString(), basket_id: "stub:v1", L: 0, I: 1, A: 1, weights: { BTC: 1 }, meta: { BTC: { sources: 1, spread: 0, flagged: false } } });
        return;
      }
      sendStub(res, 200, { ok: true, stub: true, route, method: req.method });
      return;
    }

    if (kind === "core") {
      if (pathname === "/health" || pathname === "/version" || pathname === "/ledger/verify") {
        sendStub(res, 200, { ok: true, service: "core", stub: true });
      } else sendStub(res, 404, { error: "stub_route_not_found" });
      return;
    }

    if (kind === "grm") {
      if (pathname === "/grm/current") {
        sendStub(res, 200, { ts: new Date().toISOString(), basket_id: "stub:v1", L: 0, I: 1, A: 1, weights: { BTC: 1 }, weight_meta: { BTC: { sources: 1, spread: 0, included: true, in_grm: true, grm_weight: 1 } } });
      } else if (pathname === "/health" || pathname === "/version" || pathname === "/grm/config" || pathname === "/grm/diagnostics" || pathname === "/grm/oracle/rates") {
        sendStub(res, 200, { ok: true, service: "grm", stub: true });
      } else sendStub(res, 404, { error: "stub_route_not_found" });
      return;
    }

    if (kind === "meridian") {
      if (/^\/api\/reconcile$|^\/api\/webhook\/tron$/i.test(pathname)) {
        sendStub(res, 401, { error: "unauthenticated_stub" });
      } else if (pathname.startsWith("/api/") || pathname === "/" || !pathname.startsWith("/")) {
        sendStub(res, 200, { ok: true, service: "meridian", stub: true });
      } else {
        sendStub(res, 200, "<!doctype html><html><body>Meridian local stub</body></html>", "text/html; charset=utf-8");
      }
    }
  });
}

function listenStub(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

async function startStubSuite(systemRoutes, meridianRoutes) {
  const entries = [
    ["system", createStubServer("system", systemRoutes)],
    ["core", createStubServer("core", [])],
    ["grm", createStubServer("grm", [])],
    ["meridian", createStubServer("meridian", meridianRoutes)],
  ];
  const ports = {};
  try {
    for (const [kind, server] of entries) ports[kind] = await listenStub(server);
  } catch (e) {
    for (const [, server] of entries) { try { server.close(); } catch { /* ignore */ } }
    throw e;
  }
  SYSTEM_A_URL = `http://127.0.0.1:${ports.system}`;
  CORE_URL = `http://127.0.0.1:${ports.core}`;
  GRM_URL = `http://127.0.0.1:${ports.grm}`;
  MERIDIAN_URL = `http://127.0.0.1:${ports.meridian}`;
  EXPLICIT_CORE_URL = true;
  EXPLICIT_GRM_URL = true;
  // Keep a local stub run explicit in the report and console. It validates the
  // complete HTTP contract without touching real databases or blockchains.
  pass("local stub integration environment", "four disposable HTTP stubs started; no real mutation or blockchain operation is possible");
  return async () => {
    await Promise.all(entries.map(([, server]) => new Promise((resolve) => server.close(() => resolve()))));
  };
}

async function checkSystemALive(pages, routes) {
  section(`Live: System A pages (${SYSTEM_A_URL})`);
  for (const page of pages) {
    await checkHttp("GET", `${SYSTEM_A_URL}${materializeRoute(page)}`, (status) => status < 400 ? "pass" : "fail", `System A page ${page}`);
  }

  section(`Live: System A API methods (${SYSTEM_A_URL})`);
  for (const item of routes) {
    const kind = AUTH[item.route] || "special";
    for (const method of item.methods) {
      const route = materializeRoute(item.route);
      const url = `${SYSTEM_A_URL}/api${route}`;
      const body = ["POST", "PATCH", "PUT"].includes(method) ? {} : undefined;
      await checkHttp(method, url, liveExpectation(kind, method), `${kind} ${method} /api${item.route}`, body);
    }
  }
}

function checkInternalServiceViaCompose(service, baseUrl, paths, label) {
  if (!commandExists("docker")) {
    warn(`${label} internal live checks`, [
      `${service} is not published to the host and Docker is unavailable, so its internal endpoints were not checked.`,
      `Pass an explicit --${service === "core" ? "core" : "grm"} URL if you have a loopback/debug bind.`,
    ].join("\n"));
    return;
  }
  const probe = [
    "import os, urllib.request",
    `base=${JSON.stringify(baseUrl)}`,
    `paths=${JSON.stringify(paths)}`,
    "def check(p):",
    "  headers = {'x-admin-key': os.environ.get('ADMIN_API_KEY', '')} if p == '/ledger/verify' else {}",
    "  req = urllib.request.Request(base + p, headers=headers)",
    "  return urllib.request.urlopen(req, timeout=5).status",
    "for p in paths:",
    "  print(p, check(p))",
  ].join("\n");
  // Feed Python through stdin instead of embedding it in `python -c`: the
  // latter is parsed by cmd.exe/PowerShell on Windows and nested quotes can be
  // stripped, producing a false SyntaxError before the container is tested.
  tryProgramWithInput(
    `${label} internal Docker endpoints`,
    "docker",
    ["compose", "exec", "-T", service, "python", "-"],
    CORE,
    probe,
    (output) => paths.every((p) => new RegExp(`${p.replace(/\//g, "\\/")}\\s+200`).test(output))
  );
}

async function checkServiceLive() {
  section("Live: Core service");
  if (EXPLICIT_CORE_URL) {
    await checkHttp("GET", `${CORE_URL}/health`, (s) => s === 200 ? "pass" : "fail", "Core /health");
    await checkHttp("GET", `${CORE_URL}/version`, (s) => s === 200 ? "pass" : "fail", "Core /version");
    await checkHttp("GET", `${CORE_URL}/ledger/verify`, (s) => s === 200 ? "pass" : "fail", "Core /ledger/verify");
  } else {
    checkInternalServiceViaCompose("core", "http://127.0.0.1:8000", ["/health", "/version", "/ledger/verify"], "Core");
  }

  section("Live: GRM service");
  if (EXPLICIT_GRM_URL) {
    await checkHttp("GET", `${GRM_URL}/health`, (s) => s === 200 ? "pass" : "fail", "GRM /health");
    await checkHttp("GET", `${GRM_URL}/version`, (s) => s === 200 ? "pass" : "fail", "GRM /version");
    await checkHttp("GET", `${GRM_URL}/grm/config`, (s) => s === 200 ? "pass" : "fail", "GRM /grm/config");
    await checkHttp("GET", `${GRM_URL}/grm/diagnostics`, (s) => s === 200 ? "pass" : "fail", "GRM /grm/diagnostics");
    await checkHttp("GET", `${GRM_URL}/grm/oracle/rates`, (s) => s === 200 || s === 502 ? (s === 200 ? "pass" : "warning") : "fail", "GRM /grm/oracle/rates");
    await checkHttp("GET", `${GRM_URL}/grm/current`, (s, body) => {
      if (s === 200) return "pass";
      if (s === 503 && /GRM_UNAVAILABLE|unavailable/i.test(body)) return "warning";
      return "fail";
    }, "GRM /grm/current");
  } else {
    // GRM is also internal-only in the shipped Compose file. The Docker probe
    // checks the always-safe endpoints; /grm/current is checked through the
    // public Frontend proxy and by Meridian's live integration path.
    checkInternalServiceViaCompose("grm", "http://127.0.0.1:8001", ["/health", "/version", "/grm/config", "/grm/diagnostics"], "GRM");
  }
}

async function checkMeridianLive() {
  section(`Live: Meridian (${MERIDIAN_URL})`);
  await checkHttp("GET", `${MERIDIAN_URL}/api/health`, (s, body) => {
    if (s === 200) return "pass";
    if (s === 503) return "warning";
    return "fail";
  }, "Meridian /api/health");
  await checkHttp("GET", `${MERIDIAN_URL}/api/core-status`, anyUnder500, "Meridian /api/core-status");
  await checkHttp("GET", `${MERIDIAN_URL}/api/exchange-config`, anyUnder500, "Meridian /api/exchange-config");
  await checkHttp("GET", `${MERIDIAN_URL}/api/payout-status`, (s) => s === 200 ? "pass" : "fail", "Meridian /api/payout-status");
  await checkHttp("GET", `${MERIDIAN_URL}/api/metrics`, (s) => s === 200 ? "pass" : "fail", "Meridian /api/metrics");
  for (const page of ["/", "/exchange", "/transparency", "/legal", "/recognition"]) {
    await checkHttp("GET", `${MERIDIAN_URL}${page}`, (s) => s < 400 ? "pass" : "fail", `Meridian page ${page}`);
  }

  // Smoke every Meridian route discovered on disk. Empty bodies are intentional:
  // no order/payment/payout is created by this script. Secret endpoints must be
  // closed to an anonymous caller and are never allowed to return 200 here.
  const routes = discoverApiRoutes(MERIDIAN);
  for (const item of routes) {
    for (const method of item.methods) {
      const route = materializeRoute(item.route);
      const body = ["POST", "PATCH", "PUT"].includes(method) ? {} : undefined;
      const secretGated = /\/reconcile$|\/webhook\/tron$/i.test(item.route);
      const expectation = secretGated
        ? (s) => s === 401 || s === 403 || s === 404 ? "pass" : "fail"
        : anyUnder500;
      await checkHttp(method, `${MERIDIAN_URL}/api${route}`, expectation, `Meridian ${method} /api${item.route}`, body);
    }
  }
}

function runPlaywright() {
  section("E2E: Playwright browser suite");
  if (!existsSync(path.join(FRONTEND, "node_modules"))) {
    warn("Playwright E2E", "frontend/node_modules is missing; install frontend dependencies first.");
    return;
  }
  // The Playwright config owns its own local dev server. This is only run for
  // --all/--e2e, never accidentally against the public server in static mode.
  tryCommand(
    "Playwright E2E",
    "npx playwright test --reporter=line",
    FRONTEND,
    (output) => !/failed\s*\d+|\b[1-9]\d* failed\b/i.test(output) && /passed|expected/i.test(output)
  );
}

function checkDeclarations() {
  section("Static: declarations and unsafe wording");
  const forbidden = [
    /invest in unit a/i,
    /price of (?:unit )?a\b/i,
    /guaranteed returns?/i,
    /\bhigh yield\b/i,
    /\bbuy low\b/i,
    /\bget rich\b/i,
    /инвестируйте в (?:единиц|a)/i,
    /гарантированн\w* доход/i,
    /цена единиц/i,
    /高收益|保证收益|投资单位\s*a/i,
  ];
  const files = [
    ...walk(path.join(FRONTEND, "lib", "i18n", "messages"), (p) => /\.(ts|tsx)$/.test(p)),
    ...walk(path.join(MERIDIAN, "lib"), (p) => /\.(ts|tsx|mjs)$/.test(p) && /messages/i.test(p)),
  ];
  let hits = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        fail("forbidden user-facing wording", `${pattern} in ${path.relative(ROOT, file)}`);
        hits++;
      }
    }
  }
  if (hits === 0) pass("no forbidden user-facing wording");
}

function checkCertificate(file, label) {
  if (!existsSync(file)) return;
  if (!commandExists("openssl")) {
    warn(`${label} trust`, "openssl is not installed; certificate issuer, expiry and SAN were not inspected.");
    return;
  }
  try {
    const output = shell(`openssl x509 -in "${file}" -noout -subject -issuer -dates -ext subjectAltName`, ROOT);
    const subject = (output.match(/^subject=(.*)$/m) || [])[1] || "";
    const issuer = (output.match(/^issuer=(.*)$/m) || [])[1] || "";
    const notAfter = (output.match(/^notAfter=(.*)$/m) || [])[1] || "unknown";
    if (subject && issuer && subject === issuer) {
      warn(`${label} trust`, `${file}\nself-signed certificate (subject equals issuer); acceptable for local development only, not production TLS.\nexpires: ${notAfter}`);
    } else if (!/Subject Alternative Name|DNS:|IP Address:/i.test(output)) {
      fail(`${label} SAN`, `${file}\ncertificate has no detectable Subject Alternative Name extension.\n--- openssl ---\n${limited(output)}`);
    } else {
      pass(`${label} certificate metadata`, `SAN/issuer inspected; expires: ${notAfter}`);
    }
  } catch (e) {
    fail(`${label} certificate parse`, `file: ${file}\n${commandFailure(e, `openssl x509 -in "${file}" -noout -subject -issuer -dates -ext subjectAltName`, ROOT)}`);
  }
}

function checkInfrastructure() {
  section("Static: infrastructure, compose and operations");
  checkFile("Core Dockerfile", path.join(CORE, "Dockerfile"), ["HEALTHCHECK"]);
  checkFile("GRM Dockerfile", path.join(GRM, "Dockerfile"), ["HEALTHCHECK"]);
  checkFile("Meridian Dockerfile", path.join(MERIDIAN, "Dockerfile"), ["HEALTHCHECK"]);
  checkFile("System A compose", path.join(CORE, "docker-compose.yml"), ["services:", "core:", "grm:", "frontend:", "nginx:"]);
  checkFile("Meridian compose", path.join(MERIDIAN, "docker-compose.yml"), ["services:", "meridian:", "reconcile-worker:", "meridian-db:"]);
  checkFile("System A nginx", path.join(ROOT, "infrastructure", "nginx", "nginx.conf"), ["ssl_certificate", "proxy_pass http://frontend"]);
  checkFile("System A Prometheus alerts", path.join(ROOT, "infrastructure", "prometheus", "alerts.yml"), ["GrmOracleSourcesDown", "CoreDown"]);
  checkFile("Meridian Prometheus alerts", path.join(MERIDIAN, "monitoring", "alerts.yml"), ["MeridianPayoutTrxLow", "MeridianPayoutTrxCritical"]);
  checkFile("System A Prometheus wiring", path.join(ROOT, "infrastructure", "prometheus", "prometheus.yml"), ["alerts.yml"]);
  checkFile("Meridian Prometheus wiring", path.join(MERIDIAN, "monitoring", "prometheus.yml"), ["alerts.yml"]);
  checkFile("backup.sh", path.join(ROOT, "scripts", "backup.sh"), ["#!/usr/bin/env bash", "pg_dump"]);
  checkFile("restore.sh", path.join(ROOT, "scripts", "restore.sh"), ["#!/usr/bin/env bash", "psql"]);
  checkFile("restore-drill.sh", path.join(ROOT, "scripts", "restore-drill.sh"), ["#!/usr/bin/env bash"]);
  // Reference Markdown files were consolidated into the repository-level
  // PROJECT_REVIEW_DOSSIER.md. The dossier is reviewed separately; this static
  // infrastructure pass must not depend on deleted convenience notes.
  checkFile("CI workflow", path.join(ROOT, ".github", "workflows", "ci.yml"), ["healthcheck"]);
  checkFile("Meridian .dockerignore", path.join(MERIDIAN, ".dockerignore"), [".env"]);

  for (const script of ["backup.sh", "restore.sh", "restore-drill.sh"]) {
    if (commandExists("bash")) tryCommand(`${script} shell syntax`, `bash -n scripts/${script}`, ROOT);
    else warn(`${script} shell syntax`, "bash is not installed; shell syntax was not checked on this machine.");
  }

  if (commandExists("docker")) {
    tryCommand("System A docker compose config", "docker compose config --quiet", CORE);
    tryCommand("Meridian docker compose config", "docker compose config --quiet", MERIDIAN);
  } else {
    warn("Docker Compose validation", "docker is not installed or not on PATH; compose syntax was not executed.");
  }

  // Certificate files are checked for existence here. A SAN/CA trust check
  // belongs to the deployment host; the shipped certs are intentionally local
  // self-signed development certificates, not production TLS.
  const systemCertificate = path.join(ROOT, "infrastructure", "nginx", "certs", "cert.pem");
  const meridianCertificate = path.join(MERIDIAN, "nginx", "certs", "cert.pem");
  checkFile("System A TLS certificate", systemCertificate);
  checkFile("System A TLS key", path.join(ROOT, "infrastructure", "nginx", "certs", "key.pem"));
  checkFile("Meridian TLS certificate", meridianCertificate);
  checkFile("Meridian TLS key", path.join(MERIDIAN, "nginx", "certs", "key.pem"));
  checkCertificate(systemCertificate, "System A TLS");
  checkCertificate(meridianCertificate, "Meridian TLS");
}

function checkPython(py) {
  section("Static: Python source and backend logic");
  tryCommand("Core Python compilation", `${py} -m compileall -q core`, CORE);
  tryCommand("GRM Python compilation", `${py} -m compileall -q .`, GRM);
  tryCommand("Core import smoke", `${py} -c "import core.main, core.db, core.ledger, core.challenges, core.models, core.keys"`, CORE);
  tryCommand("GRM import smoke", `${py} -c "import main, scheduler, oracles, storage, baseline, baskets, grm_math"`, GRM);

  const dbEnv = detectCoreDb(py);
  const coreTest = tryCommand(
    "Core pytest — all suites",
    `${py} -m pytest tests -q`,
    CORE,
    (output) => /passed/.test(output) && !/\b[1-9]\d* failed\b/.test(output),
    dbEnv || {}
  );
  if (coreTest) {
    if (dbEnv) pass("Core DB-backed invariants executed", "PostgreSQL reachable: ledger, idempotency, concurrency and hash-chain tests ran.");
    else warn("Core DB-backed invariants skipped", [
      "No reachable PostgreSQL was found, so money-critical DB tests were not executed.",
      "Set DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD, then rerun the same command.",
    ].join("\n"));
  }

  const grmTests = walk(GRM, (p) => /^test_.*\.py$/.test(path.basename(p)))
    .map((p) => path.basename(p))
    .sort();
  if (!grmTests.length) {
    fail("GRM pytest discovery", `No test_*.py files found in ${GRM}`);
  } else {
    tryCommand(
      "GRM pytest — all suites",
      `${py} -m pytest ${grmTests.join(" ")} -q`,
      GRM,
      (output) => /passed/.test(output) && !/\b[1-9]\d* failed\b/.test(output)
    );
  }
}

function checkFrontend() {
  section("Static: System A Frontend");
  if (!existsSync(path.join(FRONTEND, "node_modules"))) {
    warn("Frontend dependencies", "frontend/node_modules is missing; run npm install --legacy-peer-deps.");
    return;
  }
  if (!NO_BUILD && !STATIC_ONLY) {
    tryCommand(
      "Frontend production build",
      "npm run build",
      FRONTEND,
      (output) => /Compiled successfully/.test(output) || /Generating static pages/.test(output),
      { DATABASE_URL: "postgresql://healthcheck:x@127.0.0.1:5433/healthcheck" }
    );
  } else {
    warn("Frontend production build", "skipped by --no-build or --static-only.");
  }
  tryCommand("Frontend ESLint", "npm run lint", FRONTEND, (output) => !/\b[1-9]\d* error/.test(output));
  tryCommand("Frontend unit tests", "npm test", FRONTEND, (output) => /# fail 0\b/.test(output));
  tryCommand("Frontend Prisma validation", "npx prisma validate", FRONTEND, (output) => /valid/i.test(output));
}

function checkMeridian() {
  section("Static: Meridian external app");
  if (!existsSync(MERIDIAN)) {
    fail("Meridian project", `missing directory: ${MERIDIAN}`);
    return;
  }
  if (!existsSync(path.join(MERIDIAN, "node_modules"))) {
    warn("Meridian dependencies", "external-app/node_modules is missing; run npm install.");
  } else {
    if (!NO_BUILD && !STATIC_ONLY) {
      tryCommand(
        "Meridian production build",
        "npm run build",
        MERIDIAN,
        (output) => /Compiled successfully/.test(output) || /Generating static pages/.test(output),
        { DATABASE_URL: "postgresql://healthcheck:x@127.0.0.1:5433/healthcheck" }
      );
    } else {
      warn("Meridian production build", "skipped by --no-build or --static-only.");
    }
    tryCommand("Meridian ESLint", "npm run lint", MERIDIAN, (output) => !/\b[1-9]\d* error/.test(output));
    tryCommand("Meridian unit tests", "npm test", MERIDIAN, (output) => /# fail 0\b/.test(output) || /tests \d+[\s\S]*fail 0/.test(output));
  }
  checkMeridianI18n();
}

function writeReport() {
  if (NO_REPORT) return null;
  const report = {
    generated_at: new Date().toISOString(),
    command: process.argv.join(" "),
    root: ROOT,
    mode: {
      requested_all: ALL,
      selected_mode: MODE,
      interactive: INTERACTIVE,
      live: RUN_LIVE,
      e2e: RUN_E2E,
      stubs: USE_STUBS,
      insecure_tls: INSECURE_TLS,
      strict: STRICT,
      checks: CHECKS,
      static_only: STATIC_ONLY,
      no_build: NO_BUILD,
    },
    endpoints: {
      system_a: SYSTEM_A_URL,
      core: CORE_URL,
      grm: GRM_URL,
      meridian: MERIDIAN_URL,
    },
    summary: {
      passed: results.filter((r) => r.status === "pass").length,
      failed: failures,
      warnings,
      exit_code: failures || (STRICT && warnings) ? 1 : 0,
    },
    results,
  };
  try {
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`\n${C.cyan("Detailed report:")} ${REPORT_PATH}`);
    return REPORT_PATH;
  } catch (e) {
    // A report write failure is itself a failed check; this is deliberately not
    // hidden because the user requested detailed diagnostics.
    fail("healthcheck report write", `path: ${REPORT_PATH}\n${e.message}`);
    return null;
  }
}

async function main() {
  await chooseInteractiveMode();
  console.log(C.bold("\nSystem A + Meridian — universal health check"));
  console.log(C.dim(`root: ${ROOT}`));
  console.log(C.dim(`mode: ${MODE}${USE_STUBS ? " · local stubs" : ""}${STRICT ? " · STRICT" : ""}`));
  console.log(C.dim(`System A: ${SYSTEM_A_URL} · Core: ${CORE_URL} · GRM: ${GRM_URL} · Meridian: ${MERIDIAN_URL}\n`));
  if (INSECURE_TLS) {
    warn("TLS verification", "--insecure-tls is enabled for local self-signed certificates; this run is not valid as a production TLS proof.");
  }

  const pages = discoverPages(FRONTEND);
  const systemRoutes = discoverApiRoutes(FRONTEND);
  const meridianRoutes = discoverApiRoutes(MERIDIAN);

  if (CHECKS.frontend) checkFrontend();
  else note("System A Frontend", "not selected");
  if (CHECKS.i18n) checkI18n();
  else note("System A i18n", "not selected");

  if (CHECKS.backend) {
    const py = findPython();
    if (py) checkPython(py);
    else warn("Python backend suites", "No python executable with pytest was found; Core/GRM logic was not executed.");
  } else {
    note("Core + GRM backend", "not selected");
  }

  if (CHECKS.meridian) checkMeridian();
  else note("Meridian", "not selected");
  if (CHECKS.infrastructure) checkInfrastructure();
  else note("Infrastructure", "not selected");
  if (CHECKS.declarations) checkDeclarations();
  else note("Declaration wording scan", "not selected");

  if (CHECKS.coverage) {
    section("Static: route and page coverage");
    pass("System A pages discovered", `${pages.length} pages`);
    checkRouteCoverage(systemRoutes, AUTH, "System A API");
    pass("Meridian API routes discovered", `${meridianRoutes.length} routes`);
    for (const item of meridianRoutes) {
      if (!item.methods.length) fail("Meridian route has no exported HTTP method", `${item.file}`);
    }
  } else {
    note("Route and page coverage", "not selected");
  }

  let closeStubs = null;
  if (CHECKS.live && RUN_LIVE) {
    if (USE_STUBS) {
      try {
        closeStubs = await startStubSuite(systemRoutes, meridianRoutes);
      } catch (e) {
        fail("local stub integration environment", e?.stack || e?.message || String(e));
      }
    }
    // In real-live mode these are hard endpoint checks. In stub mode the same
    // requests are made against disposable local HTTP implementations, so every
    // route/method/auth contract executes even when Docker and databases are off.
    await checkSystemALive(pages, systemRoutes);
    await checkServiceLive();
    await checkMeridianLive();
    if (closeStubs) await closeStubs();
  } else if (MODE === "static" || MODE === "all") {
    section("Live checks");
    warn("Live integration layer", [
      "not executed in static mode",
      "run: node scripts/healthcheck.mjs --all --strict",
      "live checks are required to prove the running Core/GRM/frontend/Meridian stack, not just source compilation.",
    ].join("\n"));
  } else {
    note("Live integration layer", "not selected");
  }

  if (CHECKS.e2e && RUN_E2E) runPlaywright();
  else if (MODE === "static" || MODE === "all") {
    section("E2E checks");
    warn("Playwright E2E", "not executed; use --all or --e2e in a disposable staging environment.");
  } else {
    note("Playwright E2E", "not selected");
  }

  section("Summary");
  const passed = results.filter((r) => r.status === "pass").length;
  const exitCode = failures || (STRICT && warnings) ? 1 : 0;
  console.log(`  ${C.green(`${passed} passed`)}, ${failures ? C.red(`${failures} failed`) : "0 failed"}, ${warnings ? C.yellow(`${warnings} warnings`) : "0 warnings"}`);
  if (STRICT && warnings) console.log(C.yellow("  strict mode: warnings are release-blocking"));
  writeReport();
  process.exit(exitCode);
}

main().catch((e) => {
  const detail = e?.stack || e?.message || String(e);
  printDiagnostic("FAIL", "healthcheck crashed", detail);
  process.exit(1);
});
