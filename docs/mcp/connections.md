# Підключення MCP-серверів LeadDesk (Task B)

- **Акаунти** (особисті, без клієнтських організацій і команд): Supabase — особистий акаунт, окремий
  одноразовий проєкт лише під цю домашку (`project_ref=pxygtvqheervtnbhafdw`), на екрані згоди OAuth обрано
  лише організацію цього проєкту · Vercel — особистий акаунт на безплатному плані Hobby, лише власна команда
  акаунта, один проєкт — форк цього репозиторію · Figma — не використовували.
- **Третій сервер:** Playwright — чому саме він: акаунт не потрібен, тож нема чого прив'язувати до робочого
  логіну, і нема квоти Figma Starter (20 викликів на місяць на все); а для LeadDesk перевірка форми заявки в
  браузері — те, що агенція справді робить перед кожним релізом.
- **Vercel CLI на цій машині:** не встановлено (`vercel` немає ні в `PATH`, ні в глобальних пакетах npm), тож
  `use_vercel_cli` нікуди скерувати модель не може — локального токена з `env`, `rollback`, `promote`, `rm`
  немає.
- **Як вмикаються сервери:** у `.claude/settings.json` усі три записи `.mcp.json` вимкнено
  (`disabledMcpjsonServers`): ні інтерактивна сесія, ні `claude -p` у теці не піднімуть їх разом. Кожен крок
  — окрема сесія з одним сервером:
  `ENABLE_CLAUDEAI_MCP_SERVERS=false claude --permission-mode default --strict-mcp-config --mcp-config <профіль>`,
  де профіль — файл поза репозиторієм із рівно одним записом, скопійованим із `.mcp.json` (ключ той самий,
  тож правила `mcp__<ключ>__…` діють). `ENABLE_CLAUDEAI_MCP_SERVERS=false` прибирає конектори claude.ai
  (у цьому акаунті є свої Vercel і Supabase — з іменами `mcp__claude_ai_…`, на які наші правила не діють).

## Сервери

| Сервер | Який доступ | Навіщо нам | Що станеться при компрометації | Чим саме звужено |
|---|---|---|---|---|
| `supabase` | Один проєкт: 9 інструментів (`/mcp`). Читання схеми й документації, `apply_migration` і `execute_sql` — довільний SQL роллю `postgres` (перевірено: `current_user = postgres`, `is_superuser = off`, але власник таблиць, тож RLS його не обмежує) | Створити схему `leads` і залити ті самі 20 лідів, що у фікстурі сервера LeadDesk, — база для прогону A в Task C | Хто має токен — читає й змінює всі дані проєкту, включно з іменами, email і текстами заявок; може видалити таблиці. Інших проєктів і організацій акаунта токен через цей URL не бачить | `project_ref=` — інструменти прив'язані до одного проєкту, `project_id` зник зі схем. `features=database,development,docs`: немає `account` (жодного `list_organizations`, `list_projects`, `create_project`), немає `functions` (канал назовні), немає `branching` (платне). `read_only=true` свідомо не ставили — він прибрав би `apply_migration`. `execute_sql` і `apply_migration` — у `ask`, ніколи не в `allow` |
| `vercel` | Увесь користувач Vercel: OAuth-скоуп один, звузити в URL нічим. Сервер віддає 244 інструменти, зокрема реальні покупки (`buy_*`), деплой, видалення проєкту, запис змінних оточення, команди в пісочниці | Знайти останній деплой і прочитати лог його білду (`docs/mcp/evidence/vercel-build-log.txt`) | Хто має токен — купує домени й кредити з картки, деплоїть і видаляє проєкти, читає секрети зі змінних оточення, видає посилання в обхід Deployment Protection, пише в коментарі toolbar, які бачить клієнт | Лише на боці Claude Code: `deny` на 11 інструментів із walkthrough точними іменами, плюс глоби за дієсловами, що змінюють стан (`buy_*`, `create_*`, `update_*`, `delete_*`, `run_*`, … — 39 глобів), плюс точні імена інструментів, що повертають секрети (`get_project_env`, `filter_project_envs`, `get_shared_env_var`, `get_auth_token`, `get_project_token`, `get_edge_config_token`, `list_feature_flag_sdk_keys`, `read_session_file`, `web_fetch_vercel_url`). Агенту лишилось 126 інструментів, усі — читання. `allow` — лише `list_deployments`, `get_deployment`, `list_deployment_events`. Vercel CLI не встановлено |
| `playwright` | Видимий Chrome на цій машині, керований агентом: навігація, кліки, введення, знімки сторінки, консоль, мережа. 25 інструментів, зокрема `browser_run_code_unsafe` (JavaScript у процесі сервера — RCE-еквівалент) і завантаження локальних файлів | Перевірити форму заявки на `http://localhost:3000` (`docs/mcp/evidence/playwright-form-check.md`) | Токена немає, але скомпрометована сторінка (prompt injection у тексті сторінки) може скерувати агента: відкрити адресу з даними в query, ввести дані в чужу форму, а без deny — виконати код на машині чи завантажити `.env.local` | `@playwright/mcp@0.0.82` — точна версія, без `@latest`. `--isolated` — профіль браузера лише в пам'яті, без логінів. `--no-webmcp` — сторінка не додає інструментів. `--allowed-origins http://localhost:3000` — зручність, не межа безпеки. `deny`: `browser_run_code_unsafe`, `webmcp_*`, `browser_file_upload`, `browser_drop`, `browser_evaluate`. `browser_navigate` і `browser_network_request` — свідомо ні в `allow`, ні в `deny`: кожну адресу й кожен перегляд заголовків людина схвалює окремо. Жодних `--extension`, `--cdp-endpoint`, `--user-data-dir` |

## Supabase: схема й сид

- Міграція `supabase/migrations/0001_leaddesk.sql` створює таблиці: `leads` (id `lead_NNNN`, `full_name`,
  `company`, `email`, `source`, `status`, `budget`, `message`, `created_at`); `check` на статус — рівно
  `new`, `contacted`, `qualified`, `won`, `lost`; `check` на джерело — `LEAD_SOURCES`; індекс
  `(status, created_at desc)`; RLS увімкнено без політик — таблиця закрита для ролей `anon` і `authenticated`.
- Сид `supabase/seed/leads.sql`: 20 рядків, `lead_0001`–`lead_0020`, ті самі, що в `materials/leads.json`
  (обидва SQL-файли згенеровано скриптом прямо з `materials/leads.json`, тож розбіжність виключена).
- Скільки інструментів Supabase видно в `/mcp` із вашим URL: 9 — `search_docs`, `list_tables`,
  `list_extensions`, `list_migrations`, `apply_migration`, `execute_sql`, `get_project_url`,
  `get_publishable_keys`, `generate_typescript_types`.
- Якими викликами створено схему й дані і що ви схвалювали вручну: агент прочитав обидва SQL-файли, потім
  `apply_migration` (`name: 0001_leaddesk`, текст міграції без змін) → `success: true`; `execute_sql` із
  текстом сиду → `[]`; `execute_sql` `select count(*) from leads` → `20`; `execute_sql`
  `select current_user, session_user, current_setting('is_superuser')` → `postgres`, `postgres`, `off`. Усі
  чотири виклики — через `ask`, кожен схвалено вручну; режим дозволів сесії — `default`.

## Сесії: що вмикаємо разом

У кожній сесії — щонайбільше один сервер із правом запису; браузерний сервер — ніколи разом із Supabase.

| Крок | Увімкнено в `/mcp` | Сервер із правом запису в цій сесії |
|---|---|---|
| Вхід у Supabase (без запитів агенту) | `supabase` | — (агенту нічого не писали) |
| Міграція й сид | `supabase` | `supabase` |
| Вхід у Vercel (без запитів агенту) | `vercel` | — |
| Лог білду (2 спроби, див. `verification.md`) | `vercel` | —, записуючі інструменти під deny |
| Знімок «до» | `playwright` | `playwright` (агент нічого не викликав) |
| Знімок «після» | `playwright` | `playwright` (агент нічого не викликав) |
| Перевірка форми в браузері | `playwright` | `playwright`; Supabase у сесії немає |

Ця робоча сесія з кодом і документами (Claude Code у десктоп-застосунку) жодного сервера з `.mcp.json` не
вмикала: у ній є вбудований браузер, тож Supabase туди не підключали.

## До і після звуження: третій сервер

- Як отримали перелік: нова сесія лише з `playwright`, запит «Перелічи всі інструменти сервера playwright,
  які тобі зараз доступні, по одному на рядок, лише назви. Нічого не викликай.»; у файл — відповідь агента
  (у журналі сесії — 0 викликів інструментів).
- `docs/mcp/evidence/mcp-before.txt`: 25 інструментів (`/mcp` теж показав 25).
- `docs/mcp/evidence/mcp-after.txt`: 21 інструмент; зникли: `browser_run_code_unsafe`, `browser_evaluate`,
  `browser_file_upload`, `browser_drop`. Правило `webmcp_*` на перелік не вплинуло: з `--no-webmcp` сторінка
  інструментів не додає, глоб — на випадок, якщо прапорець колись зникне.
- Те саме видно на Vercel: `/mcp` показує всі 244 інструменти сервера, а в контекст агента потрапило 234 з
  11 іменами з walkthrough (10 із них існують, `deploy_to_vercel` у сервері вже немає) і 126 — з повним
  `deny`. Тобто `deny` прибирає інструмент із контексту моделі, а панель `/mcp` показує, що віддає сервер.
