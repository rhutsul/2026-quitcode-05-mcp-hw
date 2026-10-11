# Перевірка форми заявки через Playwright MCP

- **Коли:** 2026-10-04, 18:30–18:31 UTC; Claude Code 2.1.289, Claude Opus 5.5 (medium effort), режим дозволів
  `default` (кожен виклик поза `allow` — з підтвердженням).
- **Сесія:** окрема; у сесії рівно один MCP-сервер — `playwright`
  (`--strict-mcp-config --mcp-config <профіль лише з playwright>`, конектори claude.ai вимкнено змінною
  `ENABLE_CLAUDEAI_MCP_SERVERS=false`). **Supabase у цій сесії не було.**
- **Сервер:** `@playwright/mcp@0.0.82 --isolated --no-webmcp --allowed-origins http://localhost:3000`; у
  `.claude/settings.json` уже діяли deny на `browser_run_code_unsafe`, `webmcp_*`, `browser_file_upload`,
  `browser_drop`, `browser_evaluate` (агенту доступний 21 інструмент — `mcp-after.txt`).
- **Застосунок:** `npm run dev` у сусідньому терміналі, `http://localhost:3000`.

## Запит

> Відкрий http://localhost:3000, заповни форму заявки тестовими даними, відправ, перевір консоль і мережу. Інших адрес не відкривай.

## Ланцюжок інструментів

| # | Інструмент | Аргументи | Підтвердження | Результат |
|---|---|---|---|---|
| 1 | `ToolSearch` (вбудований) | завантажити схеми потрібних інструментів Playwright | — | — |
| 2 | `browser_navigate` | `url: "http://localhost:3000"` | **вручну** — не в `allow`; людина побачила URL у запиті й схвалила | сторінка `LeadDesk`, `http://localhost:3000/` |
| 3 | `browser_snapshot` | — | `allow` | дерево доступності: поля форми з підписами |
| 4 | `browser_fill_form` | Ім'я «Тест», Прізвище «Тестовий», Email `test@example.com`, Телефон `+380000000000`, Компанія «Test Co», Сайт `https://example.com`, Бюджет «$500–1500 / міс.», «Що потрібно зробити?» — «Тестова заявка: перевірка форми.»; галочку про розсилку не ставив | `allow` | поля заповнено |
| 5 | `browser_click` | кнопка «Надіслати заявку» | `allow` | форму відправлено |
| 6 | `browser_snapshot` | — | `allow` | замість форми — «Дякуємо! Заявку отримано.» |
| 7 | `browser_console_messages` | `level: "debug", all: true` | `allow` | 2 повідомлення, помилок 0, попереджень 0 |
| 8 | `browser_network_requests` | `static: false` | `allow` | `[POST] http://localhost:3000/ => [200] OK`; 22 статичні запити не показано |
| 9 | `browser_network_requests` | `static: true`, `filter: "^(?!http://localhost:3000)"` | `allow` | порожньо — жодного запиту за межі `localhost:3000` |

Текст запиту на схвалення для кроку 2, як його показав Claude Code:

```
Tool use
 playwright — Navigate to a URL Tool: (MCP)
 url: "http://localhost:3000"
 About the playwright — Navigate to a URL Tool:
 │ Navigate to a URL
```

## Чи відправилась форма

Так. Після кліку форма зникла, на її місці — «Дякуємо! Заявку отримано. Ми зв'яжемося з вами протягом робочого
дня.» Server Action відповів `POST http://localhost:3000/ → 200 OK`. Заявка лягла в сховище застосунку в
пам'яті процесу (`lib/db.ts`) і зникає після зупинки `npm run dev`.

## Консоль

```
Total messages: 2 (Errors: 0, Warnings: 0)
[INFO] %cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools …
[LOG] [HMR] connected …
```

Обидва — службові повідомлення режиму розробки Next.js.

## Мережа

- Один запит із даними форми: `POST http://localhost:3000/ → 200 OK` (Server Action).
- 22 статичні запити (JS, CSS, шрифти) — усі з `http://localhost:3000`; фільтр «усе, що не localhost:3000»
  повернув порожній результат.
- `browser_network_request` (деталі одного запиту із заголовками й тілом) агент не викликав.

## Що агент зробив сам і чого не робив

- Відкрив лише `http://localhost:3000`; інших адрес не відкривав, ніде не входив.
- Тестові дані вигадав сам, без персональних даних; домен `example.com` зарезервований для прикладів.
- Не просився ні в `Bash`, ні в `WebFetch`; заборонені інструменти йому не були доступні.
- Вікно Chrome було видимим; профіль браузера — лише в пам'яті (`--isolated`), тож після закриття вікна не
  лишається саме профілю: cookies, сховища, історії.
- Дискові артефакти лишаються: знімки сторінки й журнали консолі сервер поклав у `.playwright-mcp/` у корені
  проєкту. Тека в `.gitignore`, у git не потрапила, але на диску її треба прибирати окремо — там є все, що було
  на сторінці.
