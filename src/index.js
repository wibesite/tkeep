import { formatMoney } from "../public/pricing.js";

const ADMIN_STATUSES = new Set(["new", "in_progress", "won", "closed"]);
const loginAttempts = new Map();

const json = (payload, init = {}) =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });

const clean = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodeBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function readCookie(request, name) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function safePasswordEqual(provided, expected) {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(provided)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected))
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    mismatch |= (left[index] || 0) ^ (right[index] || 0);
  }
  return mismatch === 0;
}

async function createSession(env) {
  const secret = clean(env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD, 512);
  const payload = encodeBase64Url(JSON.stringify({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
    nonce: crypto.randomUUID()
  }));
  const signature = encodeBase64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

async function authenticateAdmin(request, env) {
  const password = clean(env.ADMIN_PASSWORD, 512);
  if (!password) {
    return { ok: false, status: 503, code: "password_not_configured", message: "Пароль администратора ещё не настроен" };
  }

  const token = readCookie(request, "tkeep_admin");
  if (!token) return { ok: false, status: 401, code: "login_required", message: "Введите пароль администратора" };

  try {
    const [payloadPart, signaturePart] = token.split(".");
    if (!payloadPart || !signaturePart) throw new Error("bad session");
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("expired session");
    const expectedSignature = await hmac(payloadPart, clean(env.ADMIN_SESSION_SECRET || password, 512));
    const providedSignature = decodeBase64Url(signaturePart);
    if (expectedSignature.length !== providedSignature.length) throw new Error("bad signature");
    let mismatch = 0;
    for (let index = 0; index < expectedSignature.length; index += 1) mismatch |= expectedSignature[index] ^ providedSignature[index];
    if (mismatch !== 0) throw new Error("bad signature");
    return { ok: true, email: "admin@tkeep.ru", name: "Администратор", local: new URL(request.url).hostname === "localhost" };
  } catch {
    return { ok: false, status: 401, code: "invalid_session", message: "Сессия истекла — войдите снова" };
  }
}

function loginAttemptKey(request) {
  return clean(request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "local", 80);
}

async function handleAdminLogin(request, env) {
  const expectedPassword = clean(env.ADMIN_PASSWORD, 512);
  if (!expectedPassword) {
    return json({ ok: false, code: "password_not_configured", message: "Добавьте секрет ADMIN_PASSWORD в настройках Worker" }, { status: 503 });
  }

  const key = loginAttemptKey(request);
  const attempt = loginAttempts.get(key);
  if (attempt?.blockedUntil > Date.now()) {
    return json({ ok: false, message: "Слишком много попыток. Повторите через 15 минут." }, {
      status: 429,
      headers: { "retry-after": String(Math.ceil((attempt.blockedUntil - Date.now()) / 1000)) }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Неверный формат запроса" }, { status: 400 });
  }
  const valid = await safePasswordEqual(clean(body.password, 512), expectedPassword);
  if (!valid) {
    const failures = (attempt?.failures || 0) + 1;
    loginAttempts.set(key, {
      failures,
      blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0
    });
    return json({ ok: false, message: failures >= 5 ? "Слишком много попыток. Вход временно заблокирован." : "Неверный пароль" }, { status: 401 });
  }

  loginAttempts.delete(key);
  const session = await createSession(env);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true, message: "Вход выполнен" }, {
    headers: {
      "set-cookie": `tkeep_admin=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`
    }
  });
}

function handleAdminLogout(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true, message: "Вы вышли из админки" }, {
    headers: {
      "set-cookie": `tkeep_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
    }
  });
}

function requireDatabase(env) {
  if (!env.DB) {
    return json({
      ok: false,
      code: "database_not_configured",
      message: "D1 ещё не подключена. Добавьте binding DB и примените миграции."
    }, { status: 503 });
  }
  return null;
}

async function sendToTelegram(env, lead) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const extras = lead.extras.length ? lead.extras.join(", ") : "нет";
  const amount = formatMoney(lead.estimate, lead.currency);
  const estimate = amount === null ? "по смете" : `от ${amount}`;
  const text = [
    "<b>Новая заявка TKEEP</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(lead.name)}`,
    `<b>Контакт:</b> ${escapeHtml(lead.contact)}`,
    `<b>Задача:</b> ${escapeHtml(lead.task || "не указана")}`,
    `<b>Тип:</b> ${escapeHtml(lead.projectType)}`,
    `<b>Опции:</b> ${escapeHtml(extras)}`,
    `<b>Оценка:</b> ${escapeHtml(estimate)}`
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  return response.ok;
}

async function sendToWebhook(env, lead) {
  if (!env.LEAD_WEBHOOK_URL) return false;
  const response = await fetch(env.LEAD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "TKEEP-Worker/1.0" },
    body: JSON.stringify(lead)
  });
  return response.ok;
}

async function storeLead(env, lead, request) {
  if (!env.DB) return false;
  await env.DB.prepare(`
    INSERT INTO leads (
      id, created_at, updated_at, name, contact, task, project_type,
      extras, estimate, currency, source, status, notes, country, user_agent, referrer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', '', ?, ?, ?)
  `).bind(
    lead.id,
    lead.createdAt,
    lead.createdAt,
    lead.name,
    lead.contact,
    lead.task,
    lead.projectType,
    JSON.stringify(lead.extras),
    lead.estimate,
    lead.currency,
    lead.source,
    clean(request.cf?.country || request.headers.get("cf-ipcountry"), 8),
    clean(request.headers.get("user-agent"), 500),
    clean(request.headers.get("referer"), 500)
  ).run();
  return true;
}

async function handleLead(request, env) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000) return json({ ok: false, message: "Запрос слишком большой" }, { status: 413 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Неверный формат данных" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, message: "Неверный формат данных" }, { status: 400 });
  }
  if (clean(body.company_website, 200)) return json({ ok: true, message: "Заявка отправлена" }, { status: 202 });

  // Requests from the previously cached USD form did not include a currency.
  const currency = body.currency === undefined ? "USD" : clean(body.currency, 8);
  if (currency !== "USD" && currency !== "BYN") {
    return json({ ok: false, message: "Неподдерживаемая валюта оценки" }, { status: 422 });
  }
  const estimate = body.estimate === null || body.estimate === undefined || body.estimate === ""
    ? null
    : Number(body.estimate);

  const lead = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: clean(body.name, 80),
    contact: clean(body.contact, 160),
    task: clean(body.task, 2_000),
    projectType: clean(body.projectType, 40),
    extras: Array.isArray(body.extras) ? body.extras.map((item) => clean(item, 30)).slice(0, 8) : [],
    estimate: Number.isFinite(estimate) && estimate >= 0 ? estimate : null,
    currency,
    source: clean(body.source, 80) || "tkeep.ru"
  };

  if (lead.name.length < 2 || lead.contact.length < 3) {
    return json({ ok: false, message: "Укажите имя и способ связи" }, { status: 422 });
  }

  let stored = false;
  try {
    stored = await storeLead(env, lead, request);
  } catch (error) {
    console.error("D1 lead storage failed", error instanceof Error ? error.message : error);
  }

  const deliveries = await Promise.allSettled([sendToTelegram(env, lead), sendToWebhook(env, lead)]);
  const delivered = deliveries.some((result) => result.status === "fulfilled" && result.value === true);

  if (!stored && !delivered) {
    console.log("TKEEP lead preview", JSON.stringify(lead));
    return json({
      ok: true,
      delivery: "preview",
      leadId: lead.id,
      message: "Форма работает. Подключите D1, Telegram или webhook для боевого приёма заявок."
    }, { status: 202 });
  }

  return json({
    ok: true,
    delivery: stored ? (delivered ? "stored_and_sent" : "stored") : "sent",
    leadId: lead.id,
    message: "Спасибо! Заявка сохранена — свяжемся с вами в рабочее время."
  }, { status: 201 });
}

function mapLead(row) {
  let extras = [];
  try {
    extras = JSON.parse(row.extras || "[]");
  } catch {
    extras = [];
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    contact: row.contact,
    task: row.task || "",
    projectType: row.project_type || "",
    extras,
    estimate: row.estimate,
    currency: row.currency || "USD",
    source: row.source || "",
    status: row.status,
    notes: row.notes || "",
    country: row.country || "",
    updatedBy: row.updated_by || ""
  };
}

async function listLeads(request, env) {
  const url = new URL(request.url);
  const status = clean(url.searchParams.get("status"), 30);
  const query = clean(url.searchParams.get("q"), 120);
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get("page")) || 1));
  const limit = Math.max(10, Math.min(100, Number(url.searchParams.get("limit")) || 50));
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  if (ADMIN_STATUSES.has(status)) {
    where.push("status = ?");
    params.push(status);
  }
  if (query) {
    where.push("(name LIKE ? OR contact LIKE ? OR task LIKE ? OR project_type LIKE ?)");
    const pattern = `%${query}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rowsStatement = env.DB.prepare(`
    SELECT id, created_at, updated_at, name, contact, task, project_type, extras,
           estimate, currency, source, status, notes, country, updated_by
    FROM leads ${whereSql}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(...params, limit, offset);
  const countStatement = env.DB.prepare(`SELECT COUNT(*) AS count FROM leads ${whereSql}`).bind(...params);
  const statsStatement = env.DB.prepare("SELECT status, COUNT(*) AS count FROM leads GROUP BY status");
  const todayStatement = env.DB.prepare("SELECT COUNT(*) AS count FROM leads WHERE substr(created_at, 1, 10) = date('now')");
  const [rowsResult, countResult, statsResult, todayResult] = await env.DB.batch([
    rowsStatement,
    countStatement,
    statsStatement,
    todayStatement
  ]);

  const stats = { total: 0, new: 0, in_progress: 0, won: 0, closed: 0, today: Number(todayResult.results?.[0]?.count || 0) };
  for (const row of statsResult.results || []) {
    if (row.status in stats) stats[row.status] = Number(row.count || 0);
    stats.total += Number(row.count || 0);
  }

  const total = Number(countResult.results?.[0]?.count || 0);
  return json({
    ok: true,
    leads: (rowsResult.results || []).map(mapLead),
    stats,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  });
}

async function getLead(env, id) {
  return env.DB.prepare(`
    SELECT id, created_at, updated_at, name, contact, task, project_type, extras,
           estimate, currency, source, status, notes, country, updated_by
    FROM leads WHERE id = ?
  `).bind(id).first();
}

async function updateLead(request, env, id, admin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Неверный формат данных" }, { status: 400 });
  }

  const existing = await getLead(env, id);
  if (!existing) return json({ ok: false, message: "Заявка не найдена" }, { status: 404 });

  const status = body.status === undefined ? existing.status : clean(body.status, 30);
  if (!ADMIN_STATUSES.has(status)) return json({ ok: false, message: "Неизвестный статус" }, { status: 422 });
  const notes = body.notes === undefined ? existing.notes : clean(body.notes, 4_000);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE leads SET status = ?, notes = ?, updated_at = ?, updated_by = ? WHERE id = ?
  `).bind(status, notes, updatedAt, admin.email, id).run();

  const updated = await getLead(env, id);
  return json({ ok: true, lead: mapLead(updated), message: "Изменения сохранены" });
}

async function deleteLead(env, id) {
  const result = await env.DB.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
  if (!result.meta?.changes) return json({ ok: false, message: "Заявка не найдена" }, { status: 404 });
  return json({ ok: true, message: "Заявка удалена" });
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportLeads(env) {
  const result = await env.DB.prepare(`
    SELECT created_at, name, contact, task, project_type, extras, estimate, currency,
           status, notes, source, country, updated_at, updated_by
    FROM leads ORDER BY created_at DESC LIMIT 10000
  `).all();
  const headers = ["Дата", "Имя", "Контакт", "Задача", "Тип", "Опции", "Оценка", "Валюта", "Статус", "Заметки", "Источник", "Страна", "Обновлено", "Кем обновлено"];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of result.results || []) {
    let extras = row.extras || "";
    try { extras = JSON.parse(extras).join("; "); } catch { /* keep raw value */ }
    lines.push([
      row.created_at, row.name, row.contact, row.task, row.project_type, extras,
      row.estimate, row.currency || "USD", row.status, row.notes, row.source, row.country, row.updated_at, row.updated_by
    ].map(csvCell).join(","));
  }
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tkeep-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store"
    }
  });
}

async function handleAdminApi(request, env, admin) {
  const missingDatabase = requireDatabase(env);
  if (missingDatabase) return missingDatabase;
  const url = new URL(request.url);

  try {
    if (url.pathname === "/api/admin/leads" && request.method === "GET") return listLeads(request, env);
    if (url.pathname === "/api/admin/export" && request.method === "GET") return exportLeads(env);

    const match = url.pathname.match(/^\/api\/admin\/leads\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if ((request.method === "PATCH" || request.method === "DELETE") && request.headers.get("x-tkeep-admin") !== "1") {
        return json({ ok: false, message: "Защитный заголовок отсутствует" }, { status: 403 });
      }
      if (request.method === "GET") {
        const lead = await getLead(env, id);
        return lead ? json({ ok: true, lead: mapLead(lead) }) : json({ ok: false, message: "Заявка не найдена" }, { status: 404 });
      }
      if (request.method === "PATCH") return updateLead(request, env, id, admin);
      if (request.method === "DELETE") return deleteLead(env, id);
    }
  } catch (error) {
    console.error("Admin D1 operation failed", error instanceof Error ? error.message : error);
    const notMigrated = String(error?.message || "").toLowerCase().includes("no such table");
    return json({
      ok: false,
      code: notMigrated ? "database_not_migrated" : "database_error",
      message: notMigrated ? "Примените D1-миграции перед открытием админки" : "Ошибка работы с базой данных"
    }, { status: 503 });
  }

  return json({ ok: false, message: "Маршрут не найден" }, { status: 404 });
}

function secureAssetResponse(response, request) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set(
    "content-security-policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
  );

  const url = new URL(request.url);
  if (url.protocol === "https:") headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  if (url.pathname.startsWith("/admin")) headers.set("x-robots-tag", "noindex, nofollow");

  if (url.pathname === "/" || response.headers.get("content-type")?.includes("text/html")) {
    headers.set("cache-control", "public, max-age=0, must-revalidate");
  } else if (/\.(?:css|js|svg|ttf|webmanifest)$/.test(url.pathname)) {
    headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "tkeep",
        runtime: "cloudflare-workers",
        database: Boolean(env.DB),
        time: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/leads" && request.method === "POST") return handleLead(request, env);

    if (url.pathname === "/api/admin/login" && request.method === "POST") return handleAdminLogin(request, env);
    if (url.pathname === "/api/admin/logout" && request.method === "POST") return handleAdminLogout(request);

    if (url.pathname.startsWith("/api/admin/") || url.pathname === "/api/admin") {
      const admin = await authenticateAdmin(request, env);
      if (!admin.ok) return json({ ok: false, code: admin.code, message: admin.message }, { status: admin.status });
      if (url.pathname === "/api/admin/session" && request.method === "GET") {
        return json({ ok: true, admin: { email: admin.email, name: admin.name || "", local: admin.local }, database: Boolean(env.DB) });
      }
      return handleAdminApi(request, env, admin);
    }

    if (url.pathname.startsWith("/api/")) return json({ ok: false, message: "Маршрут не найден" }, { status: 404 });

    const assetResponse = await env.ASSETS.fetch(request);
    return secureAssetResponse(assetResponse, request);
  }
};
