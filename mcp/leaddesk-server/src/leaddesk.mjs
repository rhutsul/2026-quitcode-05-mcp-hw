// LeadDesk as an MCP server: two business verbs instead of SQL over the whole database,
// plus the statuses reference the agent reads instead of guessing.
// The factory is shared by the stdio entry (server.mjs) and the HTTP entry (http.mjs).
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LEAD_ID, LEAD_STATUSES, LeadDeskError, findLeads, setLeadStatus } from "./store.mjs";

const STATUSES_URI = "leaddesk://reference/statuses";

// What each status means for the Studio Nova team. One entry per LEAD_STATUSES value.
const STATUS_GUIDE = {
  new: {
    meaning: "Заявка надійшла (форма на сайті, реклама, рекомендація), але з клієнтом ще ніхто не говорив.",
    when: "Ставиться автоматично, коли лід створено.",
    who: "Система, коли лід створено.",
  },
  contacted: {
    meaning: "Менеджер вийшов на зв'язок із клієнтом — дзвінок, зустріч або листування — і з'ясовує, що йому потрібно.",
    when: "Після першого контакту з клієнтом.",
    who: "Менеджер, який веде лід.",
  },
  qualified: {
    meaning: "Потребу, бюджет і людину, яка ухвалює рішення, підтверджено; можна готувати кошторис.",
    when: "Коли відомо, що саме робимо, на який бюджет і хто погоджує.",
    who: "Менеджер, який веде лід.",
  },
  won: {
    meaning: "Клієнт підписав договір або оплатив аванс — лід став проєктом.",
    when: "Після підписаного договору чи оплати.",
    who: "Власник воркспейсу (owner).",
  },
  lost: {
    meaning: "Угоди не буде: клієнт відмовився, обрав іншого підрядника або не відповідає 30 днів.",
    when: "Щойно стало ясно, що угоди не буде. Причину записуємо завжди.",
    who: "Менеджер, який веде лід.",
  },
};

const statusesMarkdown = () =>
  [
    "# Статуси лідів LeadDesk",
    "",
    "Зазвичай лід рухається `new → contacted → qualified → won`; `lost` — коли стало ясно, що угоди не буде.",
    "Кожна зміна статусу пише запис в аудит: коли, з якого статусу в який і чому.",
    "",
    ...LEAD_STATUSES.flatMap((s) => {
      const g = STATUS_GUIDE[s];
      return [`## \`${s}\``, "", g.meaning, "", `- **Коли:** ${g.when}`, `- **Хто переводить:** ${g.who}`, ""];
    }),
  ].join("\n");

const fail = (e) => {
  if (!(e instanceof LeadDeskError)) throw e;
  return { isError: true, content: [{ type: "text", text: e.message }] };
};

const budgetText = (b) => (b === null ? "без бюджету" : `бюджет ${b}`);

export function createLeadDeskServer() {
  const server = new McpServer({ name: "leaddesk", version: "0.1.0" });

  server.registerTool(
    "leaddesk_find_leads",
    {
      title: "Знайти ліди",
      description:
        "Повертає ліди LeadDesk за статусом, найновіші першими: ідентифікатор, компанія, статус, джерело, бюджет і дата заявки. " +
        "total — скільки лідів відповідає статусу загалом, навіть якщо повернуто менше. " +
        "Імені, контактів і тексту заявки не повертає. Тільки читає, нічого не змінює.",
      inputSchema: {
        status: z
          .enum([...LEAD_STATUSES, "any"])
          .describe("Який статус шукати: new, contacted, qualified, won або lost; any — ліди в усіх статусах"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Скільки лідів повернути, від 1 до 50; за замовчуванням 10. Найновіші заявки йдуть першими"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, limit }) => {
      const { total, leads } = findLeads({ status, limit });
      const lines = leads.map((l) => `- ${l.id} · ${l.company} · ${l.status} · ${l.source} · ${budgetText(l.budget)} · ${l.createdAt}`);
      const head = `Лідів зі статусом ${status}: ${total}; показано ${leads.length}, найновіші першими.`;
      return {
        content: [{ type: "text", text: [head, ...lines].join("\n") }],
        structuredContent: { status, order: "newest_first", total, returned: leads.length, leads },
      };
    },
  );

  server.registerTool(
    "leaddesk_set_lead_status",
    {
      title: "Змінити статус ліда",
      description:
        "ЗМІНЮЄ ДАНІ: переводить один лід LeadDesk у новий статус і пише запис в аудит (коли, з якого статусу в який, причина). " +
        "Перед викликом покажи людині, що саме зміниться — лід, поточний і новий статус, причину — і дочекайся її підтвердження. " +
        `Що означає кожен статус і хто його ставить — у ресурсі ${STATUSES_URI}. ` +
        "Невідомий лід або той самий статус, що вже є, повертають помилку, і нічого не змінюється.",
      inputSchema: {
        leadId: z
          .string()
          .regex(LEAD_ID)
          .describe("Ідентифікатор ліда у форматі lead_ і чотири цифри, напр. lead_0017; знайти його можна через leaddesk_find_leads"),
        status: z.enum(LEAD_STATUSES).describe("Новий статус ліда: new, contacted, qualified, won або lost"),
        reason: z
          .string()
          .trim()
          .min(3)
          .max(500)
          .describe("Чому змінюємо статус, 3–500 символів: що сталося з клієнтом. Потрапляє в запис аудиту"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ leadId, status, reason }) => {
      try {
        const { lead, previousStatus, audit } = setLeadStatus({ leadId, status, reason });
        // One stderr line per change, without personal data: stdout belongs to the protocol.
        console.error(`leaddesk: ${leadId} ${previousStatus} -> ${status}`);
        return {
          content: [
            {
              type: "text",
              text: `Статус ${leadId} (${lead.company}) змінено: ${previousStatus} → ${status}. Запис аудиту: ${audit.action} о ${audit.at}.`,
            },
          ],
          structuredContent: { lead, previousStatus, audit },
        };
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerResource(
    "leaddesk-statuses",
    STATUSES_URI,
    {
      title: "Статуси лідів",
      description: "П'ять статусів ліда і що кожен означає для команди: коли його ставлять і хто переводить",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: statusesMarkdown() }] }),
  );

  return server;
}
