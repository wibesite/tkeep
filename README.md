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
- защищённая админка заявок на `/admin`;
- хранение заявок в Cloudflare D1, статусы, заметки и CSV-экспорт;
- адаптивная мобильная версия;
- security headers и CSP на уровне Worker.

Цены на сайте указаны в **белорусских рублях (BYN)**:

- лендинг — от **100 BYN**;
- остальные прежние цены в USD умножаются на **3** и округляются до ближайших **10 BYN**;
- например: `$33 → 100 BYN`, `$67 → 200 BYN`, `$117 → 350 BYN`, `$333 → 1 000 BYN`;
- каталог, тарифы, FAQ и калькулятор используют общий прайс в `public/pricing.js`;
- итог с опциями и надбавкой за срочность также округляется до 10 BYN; индивидуальные проекты остаются «по смете».

Проверка цен и калькулятора:

```bash
npm run test:pricing
```

## Локальный запуск

Требуется Node.js 20–24 (Node.js 26 пока несовместим с используемой версией esbuild).

```bash
npm install
npm run dev
```

Wrangler поднимет сайт и Worker API, обычно на `http://localhost:8787`.

Перед первым локальным запуском примените D1-миграции:

```bash
cp .dev.vars.example .dev.vars
# Заполните ADMIN_PASSWORD и ADMIN_SESSION_SECRET в .dev.vars
npm run db:local
npm run dev
```

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

## Админка заявок

Панель открывается по адресу:

```text
https://tkeep.ru/admin
```

Пароль не хранится в GitHub. Добавьте его как зашифрованный Worker Secret:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
```

`ADMIN_SESSION_SECRET` — случайная строка длиной от 32 символов. Она используется для подписи HttpOnly-сессии. После пяти неверных попыток вход временно блокируется.

### Подключение D1

Production-база `tkeep-leads` уже подключена к Worker через binding `DB` в `wrangler.toml`.

Для ручного применения схемы:

```bash
npm run db:remote
```

Обычный деплой сам применяет все новые миграции перед публикацией Worker:

```bash
npm run deploy
```

После подключения D1 каждая заявка сохраняется независимо от Telegram/webhook. В `/admin` доступны поиск, фильтры, статусы «Новая / В работе / Успешная / Закрыта», заметки, удаление и CSV-экспорт.

Миграция `0002_add_lead_currency.sql` добавляет валюту оценки. Старые заявки остаются в USD без изменения суммы, новые формы отправляют BYN. Админка и Telegram показывают валюту каждой заявки, CSV содержит отдельную колонку «Валюта». Запросы старой закешированной формы без поля `currency` по-прежнему считаются USD.

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
