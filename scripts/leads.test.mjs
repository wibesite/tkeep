import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const payload = {
  name: "Currency Test", contact: "currency@example.test", task: "Pricing test",
  projectType: "landing", extras: ["crm"], estimate: 250, currency: "BYN"
};

async function submit(body, extraEnv = {}) {
  let inserted;
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            inserted = { sql, values };
            return { run: async () => ({ success: true }) };
          }
        };
      }
    },
    ...extraEnv
  };
  const request = new Request("https://tkeep.ru/api/leads", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const response = await worker.fetch(request, env);
  return { response, result: await response.json(), inserted };
}

test("new leads store the numeric estimate and BYN currency separately", async () => {
  const { response, result, inserted } = await submit(payload);
  assert.equal(response.status, 201);
  assert.equal(result.delivery, "stored");
  assert.match(inserted.sql, /estimate, currency, source/);
  assert.equal(inserted.values[8], 250);
  assert.equal(inserted.values[9], "BYN");
});

test("cached forms without a currency retain their USD amounts", async () => {
  const { currency, ...legacy } = payload;
  const { response, inserted } = await submit({ ...legacy, projectType: "start", estimate: 67 });
  assert.equal(response.status, 201);
  assert.equal(inserted.values[8], 67);
  assert.equal(inserted.values[9], "USD");
});

test("custom estimates remain null rather than becoming zero", async () => {
  const { response, inserted } = await submit({ ...payload, projectType: "custom", estimate: null });
  assert.equal(response.status, 201);
  assert.equal(inserted.values[8], null);
  assert.equal(inserted.values[9], "BYN");
});

test("unsupported currencies and malformed payloads are rejected", async () => {
  const invalid = await submit({ ...payload, currency: "EUR" });
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.inserted, undefined);
  const malformed = await submit(null);
  assert.equal(malformed.response.status, 400);
});

test("Telegram and webhook delivery carry the BYN estimate", async () => {
  const originalFetch = globalThis.fetch;
  const messages = [];
  globalThis.fetch = async (url, options) => {
    messages.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response("{}", { status: 200 });
  };
  try {
    const { response, result } = await submit(payload, {
      TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "test-chat",
      LEAD_WEBHOOK_URL: "https://example.test/leads"
    });
    assert.equal(response.status, 201);
    assert.equal(result.delivery, "stored_and_sent");
    const telegram = messages.find((message) => message.url.includes("api.telegram.org"));
    assert.match(telegram.body.text, /от 250 BYN/);
    assert.doesNotMatch(telegram.body.text, /\$250/);
    const webhook = messages.find((message) => message.url === "https://example.test/leads");
    assert.equal(webhook.body.estimate, 250);
    assert.equal(webhook.body.currency, "BYN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
