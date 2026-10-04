# LeadDesk MCP server

Доменний stdio-сервер LeadDesk: два бізнес-дієслова замість SQL на всю базу і довідник статусів.

| Що | Тип | Що робить |
|---|---|---|
| `leaddesk_find_leads` | інструмент, `readOnlyHint: true` | ліди за статусом (`any` — усі), найновіші першими; лише `id`, `company`, `status`, `source`, `budget`, `createdAt` |
| `leaddesk_set_lead_status` | інструмент, `readOnlyHint: false` | змінює статус ліда в пам'яті й повертає запис аудиту `{ action, leadId, at, from, to, reason }`; невідомий лід і той самий статус — `isError: true` |
| `leaddesk://reference/statuses` | ресурс, `text/markdown` | п'ять статусів: що кожен означає, коли його ставлять і хто переводить |

Дані — `fixtures/leads.json` (незмінна копія `materials/leads.json`, 20 лідів `lead_0001`–`lead_0020`).
Сервер читає файл один раз і тримає зміни в пам'яті процесу; файл не переписує ніколи, тож після
перезапуску стан знову вихідний.

| Файл | Що в ньому |
|---|---|
| `src/server.mjs` | точка входу stdio: `serveStdio(createLeadDeskServer)` |
| `src/leaddesk.mjs` | фабрика сервера: інструменти, їхні описи, ресурс |
| `src/store.mjs` | словник застосунку (`LEAD_STATUSES`, `^lead_\d{4}$`), фікстура, пошук і зміна статусу |
| `src/http.mjs` | той самий сервер по HTTP на `127.0.0.1:3333` з гвардами Host/Origin |

## Запуск

Node.js ≥ 22.19. Команди — з кореня репозиторію (на Windows — Git Bash).

```bash
(cd mcp/leaddesk-server && npm ci)
node mcp/leaddesk-server/src/server.mjs     # чекає клієнта на stdin; зупинка — Ctrl+C
```

| Змінна | За замовчуванням | Що робить |
|---|---|---|
| `LEADDESK_FIXTURE` | `fixtures/leads.json` поруч із сервером (шлях від модуля, а не від поточної теки) | інший файл із лідами того самого формату |

Журнал — лише stderr, по рядку на зміну статусу (`leaddesk: lead_0017 won -> lost`), без
персональних даних. stdout — канал протоколу.

## Перевірка Inspector'ом

```bash
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs --method tools/list
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_find_leads --tool-arg status=qualified
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method resources/read --uri leaddesk://reference/statuses
```

Кожен виклик Inspector'а запускає сервер заново. Збережені виводи лежать у `docs/mcp/*.json`; як їх
отримано, описано в `docs/mcp/verification.md`.

## Підключення до Claude Code

Зі скоупом `local`: шлях до сервера лишається у `~/.claude.json` цієї теки, у git нічого не потрапляє.

```bash
claude mcp add leaddesk -- node "<абсолютний шлях до репозиторію>/mcp/leaddesk-server/src/server.mjs"
```

`--` обов'язковий: усе після нього передається серверу без змін. Перевірка — `/mcp` у сесії:
`leaddesk`, 2 інструменти. Видалити — `claude mcp remove leaddesk`.

## HTTP-варіант

```bash
node mcp/leaddesk-server/src/http.mjs       # http://127.0.0.1:3333/mcp
```

Слухає лише `127.0.0.1`; запити з чужим `Host` чи `Origin` отримують 403 ще до MCP-обробника.
Перевірка `curl` — у `docs/mcp/verification.md`, розділ «Task E».
