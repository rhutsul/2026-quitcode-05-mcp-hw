# Перевірка (Task A, Task B, бонус E)

- **Інструмент і версія, модель:** Claude Code 2.1.289 (CLI для MCP-сесій; код і документи — Claude Code
  у десктоп-застосунку) · Claude Opus 5.5
- **ОС і термінал, Node:** Windows 10 Pro 22H2 (19045) · Git Bash 5.3 · Node 24.18.0

## Task A — сервер в Inspector

- **Команди**, якими зроблено чотири файли в `docs/mcp/`, — як у walkthrough, Git Bash, з кореня
  репозиторію; кожна запускає сервер заново, тож `lead_0002` щоразу стартує зі статусом `new`:

  ```bash
  I="npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs"
  $I --method tools/list > docs/mcp/tools-list.json                                   # exit=0
  $I --method tools/call --tool-name leaddesk_set_lead_status \
    --tool-arg leadId=lead_0002 --tool-arg status=contacted \
    --tool-arg "reason=перевірка в Inspector" > docs/mcp/set-status.json             # exit=0
  $I --method tools/call --tool-name leaddesk_set_lead_status \
    --tool-arg leadId=nope --tool-arg status=won --tool-arg reason=ok > docs/mcp/bad-input.json   # exit=5
  $I --method resources/read --uri leaddesk://reference/statuses > docs/mcp/resource-read.json   # exit=0
  ```

- **`tools-list.json`:** рівно два інструменти. `leaddesk_find_leads` — `"readOnlyHint": true`,
  `leaddesk_set_lead_status` — `"readOnlyHint": false` (плюс `destructiveHint: false`,
  `idempotentHint: false`: зміну статусу можна відкотити, але повторний виклик пише новий запис
  аудиту). Сім описів: два інструменти й п'ять параметрів (`status`, `limit`, `leadId`, `status`,
  `reason`) — у JSON Schema це поле `description`, і саме його модель бачить замість документації.
  Схеми підхопили обмеження Zod: `enum` статусів, `pattern: ^lead_\d{4}$`, `minimum`/`maximum` для
  `limit`, `minLength`/`maxLength` для `reason`.
- **`bad-input.json`:** зламано два аргументи одразу — `leadId=nope` (не збігається з `^lead_\d{4}$`)
  і `reason=ok` (2 символи при мінімумі 3). Сервер до обробника не дійшов: SDK відхилив вхід за
  схемою і повернув `"isError": true` з текстом
  `Input validation error: … leadId: Invalid string: must match pattern /^lead_\d{4}$/, reason: Too small: expected string to have >=3 characters`.
  Inspector завершився з кодом **5** і надрукував у stderr
  `{"error":{"code":"tool_is_error","message":"Tool 'leaddesk_set_lead_status' returned isError:true."}}`.
- **`set-status.json`:** `lead_0002` (Rynok Books), `new → contacted`. У `structuredContent` —
  новий стан ліда (лише шість дозволених полів), `previousStatus: "new"` і запис аудиту:

  ```json
  { "action": "lead.status_changed", "leadId": "lead_0002", "at": "2026-10-04T17:08:31.696Z",
    "from": "new", "to": "contacted", "reason": "перевірка в Inspector" }
  ```

  `{ action, leadId, at }` — форма `AuditEntry` з `lib/types.ts`; `action` названо в стилі
  застосунку (`lead.created` у `app/actions.ts`). Сервер надрукував у stderr один рядок
  `leaddesk: lead_0002 new -> contacted` — без імені, email і причини.
- **`resource-read.json`:** `leaddesk://reference/statuses`, `"mimeType": "text/markdown"`, п'ять
  розділів: що означає статус, коли його ставлять і хто переводить.
- **Доменні помилки** (не в артефактах, перевірено тими самими командами):
  - той самий статус (`lead_0002` → `new`) → `isError: true`,
    «Лід lead_0002 уже має статус new: нічого не змінено…»;
  - невідомий лід у правильному форматі (`lead_9999`) → `isError: true` з підказкою знайти id через
    `leaddesk_find_leads (status: "any")`.
- **Звірка з ключем A/B** (`materials/ab-prompts.md`), перш ніж віддавати сервер у Task C:
  `qualified` → 3 (`lead_0001`, `lead_0013`, `lead_0015`); `new`, `limit=5` → `lead_0002`,
  `lead_0005`, `lead_0004`, `lead_0018`, `lead_0012`, `total: 6`; `won`, `limit=50` → 5 лідів,
  сума бюджетів 9000, без бюджету — `lead_0006`. Усе збігається.
- **Самоперевірка з walkthrough:** `grep -c '"isError": true' docs/mcp/bad-input.json` → 1;
  у `set-status.json` є `"action"`, `"leadId"`, `"at"`; `console.log` у `src/` — 0 у кожному файлі;
  `cmp materials/leads.json mcp/leaddesk-server/fixtures/leads.json` — файли однакові (і після всіх
  викликів теж: сервер фікстуру не переписує).
- **Що було найважче в описах:**
  - Не пообіцяти в описі більше, ніж робить код. Перша версія казала, що аудит пише «хто, коли…»,
    а поля «хто» в записі немає — прибрав.
  - Дати моделі `total`. Без нього на «скільки лідів у статусі X» модель рахувала б лише повернуту
    сторінку (`limit` за замовчуванням 10), тож `total` і порядок `order: "newest_first"` є і в
    тексті, і в `structuredContent`.
  - Приклад ідентифікатора в описі `leadId` — нейтральний (`lead_0017`), не з тих, що змінюють запити
    A/B: опис інструмента — теж підказка моделі, і приклад зі сценарію запиту зробив би апрув
    «зрозумілим» за рахунок опису, а не дизайну.
  - Ресурс статусів описує, що відбувається, а не правила, яких сервер не перевіряє: будь-яке «так не
    можна», не підкріплене кодом, модель сприйняла б як гарантію.

## Task B — що зробили агенти з серверами

_Заповнюється після сесій S2–S6._

## Task E (бонус)

- **Варіант:** E1 — той самий сервер по HTTP, `mcp/leaddesk-server/src/http.mjs`.
- **Будова:** `toNodeHandler(createMcpHandler(createLeadDeskServer))` — та сама фабрика, що в
  `server.mjs`; `@modelcontextprotocol/node` `2.1.0` точною версією в тому самому `package.json`.
  Гварди `localhostHostValidation()` і `localhostOriginValidation()` **викликано** в обробнику запиту
  до `mcp(req, res)`; слухає лише `127.0.0.1:3333`; шлях, відмінний від `/mcp`, — 404.
- **Стан між запитами:** `createMcpHandler` викликає фабрику на кожен запит, тому сховище лідів
  живе на рівні модуля (`src/store.mjs`), а не у фабриці — інакше кожна зміна статусу губилася б
  разом із сервером одного запиту.
- **Докази.** Сервер — `node mcp/leaddesk-server/src/http.mjs`; Git Bash; `body.json` створено в
  тимчасовій теці поза репозиторієм:

  ```bash
  printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' > body.json
  H=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "MCP-Protocol-Version: 2026-07-28" -H "Mcp-Method: tools/list")
  ```

  1. Звичайний запит — **HTTP 200**, два інструменти (тіло скорочено до імен і анотацій):

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"leaddesk_find_leads","annotations":{"readOnlyHint":true,"openWorldHint":false}},{"name":"leaddesk_set_lead_status","annotations":{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}}]}}
     HTTP 200
     ```

  2. Підроблений `Host` — **HTTP 403**:

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" -H "Host: evil.example" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}
     HTTP 403
     ```

  3. Чужий `Origin` — **HTTP 403**:

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" -H "Origin: https://evil.example" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin: evil.example"},"id":null}
     HTTP 403
     ```

  4. Без заголовка `MCP-Protocol-Version` — **HTTP 400**, код **-32020**:

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Mcp-Method: tools/list" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"jsonrpc":"2.0","error":{"code":-32020,"message":"Bad Request: the request headers and body disagree: the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent","data":{"mismatch":{"header":"(missing)","body":"the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent"}}},"id":1}
     HTTP 400
     ```

- **Контрольний дослід — пастка з опцією.** Окремий процес на `127.0.0.1:3334` (поза репозиторієм,
  не закомічено) з гвардами, переданими опцією:
  `toNodeHandler(createMcpHandler(createLeadDeskServer), { hostValidation: localhostHostValidation(), originValidation: localhostOriginValidation() })`.
  Той самий запит з `-H "Host: evil.example"` → **HTTP 200**: опцію мовчки проігноровано, сервер
  віддав інструменти на підроблений `Host`. Тобто захист працює лише тоді, коли гвард викликано
  явно, — і перевірити це можна тільки запитом, а не читанням конфігурації.
- `body.json` у репозиторій не потрапив (`.gitignore` і створення поза репозиторієм).
