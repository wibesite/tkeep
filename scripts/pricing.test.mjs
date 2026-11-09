import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CURRENCY, USD_TO_BYN, prices, roundPrice, usdToByn, calculatePrice, formatMoney } from "../public/pricing.js";

const normalizeSpaces = (value) => value.replace(/\s+/g, " ");

test("USD prices use the fixed rate of 3 and nearest 10 BYN", () => {
  assert.equal(CURRENCY, "BYN");
  assert.equal(USD_TO_BYN, 3);
  for (const [usd, byn] of [[33, 100], [67, 200], [117, 350], [150, 450], [333, 1000], [20_000, 60_000]]) {
    assert.equal(usdToByn(usd), byn);
  }
  assert.equal(roundPrice(104), 100);
  assert.equal(roundPrice(105), 110);
});

test("only landing pages get the new 100 BYN override", () => {
  assert.deepEqual(prices, {
    landing: 100, business: 1000, shop: 1000, mini: 100, bot: 100,
    ai: 200, rag: 450, voice: 350, vpn: 100, support: 300, cloud: 60_000, crm: 150
  });
});

test("calculator totals include BYN options and urgency", () => {
  const bases = { landing: 100, ai: 200, business: 1000, rag: 450, voice: 350, bot: 100 };
  for (const [projectType, base] of Object.entries(bases)) {
    for (let mask = 0; mask < 8; mask += 1) {
      const extras = ["crm", "support", "urgent"].filter((_, index) => mask & (1 << index));
      const subtotal = base + (extras.includes("crm") ? 150 : 0) + (extras.includes("support") ? 300 : 0);
      const expected = roundPrice(subtotal * (extras.includes("urgent") ? 1.2 : 1));
      const total = calculatePrice(projectType, extras);
      assert.equal(total, expected, `${projectType}: ${extras.join(", ")}`);
      assert.equal(total % 10, 0);
    }
  }
  assert.equal(calculatePrice("landing", ["crm", "support", "urgent"]), 660);
  assert.equal(calculatePrice("custom", ["crm"]), null);
  assert.equal(calculatePrice("unknown"), null);
});

test("money labels distinguish BYN, legacy USD and custom estimates", () => {
  assert.equal(normalizeSpaces(formatMoney(1000)), "1 000 BYN");
  assert.equal(formatMoney(333, "USD"), "$333");
  assert.equal(formatMoney(20_000, "USD"), "$20,000");
  for (const value of [null, undefined, "", NaN, Infinity]) assert.equal(formatMoney(value), null);
});

test("HTML fallback prices agree with the shared price list", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\$\d|data-(?:reference-price|calc-reference|extra-reference)/);
  const labels = [...html.matchAll(/<(strong|b|small|span)\b([^>]*)\bdata-price="([^"]+)"([^>]*)>([^<]+)<\/\1>/g)];
  assert.equal(labels.length, 25);
  for (const [, , before, key, after, label] of labels) {
    assert.ok(Object.hasOwn(prices, key), `Unknown price: ${key}`);
    const attributes = before + after;
    const prefix = attributes.match(/data-prefix="([^"]*)"/)?.[1] ?? "от ";
    const suffix = attributes.match(/data-suffix="([^"]*)"/)?.[1] || "";
    assert.equal(normalizeSpaces(label), normalizeSpaces(`${prefix}${formatMoney(prices[key])}${suffix}`), key);
  }
  assert.match(html, /value="landing" checked/);
  assert.match(html, /id="calc-total">от 100 BYN/);
});
