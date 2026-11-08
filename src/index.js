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
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendToTelegram(env, lead) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;

  const extras = lead.extras.length ? lead.extras.join(", ") : "нет";
  const estimate = Number.isFinite(lead.estimate) ? `от $${lead.estimate}` : "по смете";
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

async function handleLead(request, env) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000) {
    return json({ ok: false, message: "Запрос слишком большой" }, { status: 413 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Неверный формат данных" }, { status: 400 });
  }

  if (clean(body.company_website, 200)) {
    return json({ ok: true, message: "Заявка отправлена" }, { status: 202 });
  }

  const lead = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: clean(body.name, 80),
    contact: clean(body.contact, 160),
    task: clean(body.task, 2_000),
    projectType: clean(body.projectType, 40),
    extras: Array.isArray(body.extras) ? body.extras.map((item) => clean(item, 30)).slice(0, 8) : [],
    estimate: Number.isFinite(Number(body.estimate)) ? Number(body.estimate) : null,
    source: clean(body.source, 80) || "tkeep.ru"
  };

  if (lead.name.length < 2 || lead.contact.length < 3) {
    return json({ ok: false, message: "Укажите имя и способ связи" }, { status: 422 });
  }

  const deliveries = await Promise.allSettled([
    sendToTelegram(env, lead),
    sendToWebhook(env, lead)
  ]);
  const delivered = deliveries.some((result) => result.status === "fulfilled" && result.value === true);

  if (!delivered) {
    console.log("TKEEP lead preview", JSON.stringify(lead));
    return json({
      ok: true,
      delivery: "preview",
      leadId: lead.id,
      message: "Форма работает. Для боевой доставки добавьте Telegram-секреты или webhook в Worker."
    }, { status: 202 });
  }

  return json({
    ok: true,
    delivery: "sent",
    leadId: lead.id,
    message: "Спасибо! Заявка отправлена — свяжемся с вами в рабочее время."
  }, { status: 201 });
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
  if (url.protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  }

  if (url.pathname === "/" || response.headers.get("content-type")?.includes("text/html")) {
    headers.set("cache-control", "public, max-age=0, must-revalidate");
  } else if (/\.(?:css|js|svg|ttf|webmanifest)$/.test(url.pathname)) {
    headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "tkeep", runtime: "cloudflare-workers", time: new Date().toISOString() });
    }

    if (url.pathname === "/api/leads" && request.method === "POST") {
      return handleLead(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, message: "Маршрут не найден" }, { status: 404 });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return secureAssetResponse(assetResponse, request);
  }
};
