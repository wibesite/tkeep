# TKEEP

Одностраничный сайт digital/AI-агентства для домена **tkeep.ru**. Работает на Cloudflare Workers и Static Assets без отдельного сервера.

## Что внутри

- полноэкранный интерактивный hero на Canvas;
- портфолио с CSS-превью и модальными кейсами;
- фильтруемый каталог из 18 услуг;
- блок Cloudflare/edge-инфраструктуры;
- кейсы, процесс, тарифы и FAQ;
- интерактивный калькулятор;
- форма заявки с доставкой в Telegram или произвольный webhook;
- адаптивная мобильная версия;
- security headers и CSP на уровне Worker.

Фиксированные цены вычисляются по правилу `reference / 3` и округляются до целого доллара:

- `$200 → $67`;
- `$1 000 → $333`;
- `$60 000 → $20 000`.

## Локальный запуск

Требуется Node.js 20–24 (Node.js 26 пока несовместим с используемой версией esbuild).

```bash
npm install
npm run dev
```

Wrangler поднимет сайт и Worker API, обычно на `http://localhost:8787`.

Проверка сборки без публикации:

```bash
npm run check
```

## Доставка заявок

Скопируйте `.dev.vars.example` в `.dev.vars` для локальной разработки. В Cloudflare добавьте один из вариантов:

### Telegram

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

### Webhook

```bash
npx wrangler secret put LEAD_WEBHOOK_URL
```

Если канал доставки не настроен, форма работает в preview-режиме и заявка выводится в лог Worker — это явно сообщается пользователю.

## Публикация на tkeep.ru

1. Добавьте `tkeep.ru` в тот же Cloudflare-аккаунт, в котором запускается Worker.
2. Авторизуйте Wrangler: `npx wrangler login`.
3. Настройте секреты формы.
4. Выполните:

```bash
npm run deploy
```

Custom Domains уже описаны в `wrangler.toml` для `tkeep.ru` и `www.tkeep.ru`.

## Структура

```text
public/          # HTML, CSS, JS, шрифт и PWA-файлы
src/index.js     # Worker API, доставка заявок, security headers
wrangler.toml    # Cloudflare Worker + Static Assets + custom domains
```

Фото и графика исходного референса не используются: визуалы портфолио, hero и схемы собраны специально для TKEEP.
