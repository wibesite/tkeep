export const CURRENCY = "BYN";
export const USD_TO_BYN = 3;
export const roundPrice = (value) => Math.round(Number(value) / 10) * 10;
export const usdToByn = (value) => roundPrice(Number(value) * USD_TO_BYN);

// Convert the previous displayed USD prices; landing pages have a fixed new price.
export const prices = Object.freeze({
  landing: 100,
  business: usdToByn(333),
  shop: usdToByn(333),
  mini: usdToByn(33),
  bot: usdToByn(33),
  ai: usdToByn(67),
  rag: usdToByn(150),
  voice: usdToByn(117),
  vpn: usdToByn(33),
  support: usdToByn(100),
  cloud: usdToByn(20_000),
  crm: usdToByn(50)
});

const projectPrices = {
  landing: prices.landing,
  ai: prices.ai,
  business: prices.business,
  rag: prices.rag,
  voice: prices.voice,
  bot: prices.bot
};
const extraPrices = { crm: prices.crm, support: prices.support };

export function calculatePrice(projectType, extras = []) {
  const base = projectPrices[projectType];
  if (!Number.isFinite(base)) return null;
  const total = extras.reduce((sum, extra) => sum + (extraPrices[extra] || 0), base);
  return roundPrice(total * (extras.includes("urgent") ? 1.2 : 1));
}

export function formatMoney(value, currency = CURRENCY) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return null;
  const amount = new Intl.NumberFormat(currency === "USD" ? "en-US" : "ru-RU", {
    maximumFractionDigits: 0
  }).format(Number(value));
  return currency === "USD" ? `$${amount}` : `${amount} BYN`;
}
