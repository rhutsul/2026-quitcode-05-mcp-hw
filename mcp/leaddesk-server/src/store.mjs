// Leads store of the LeadDesk MCP server: the fixture is read once, changes live only in the
// memory of this process. The fixture file is never written, so a restart brings back the same data.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Vocabulary of the app: LEAD_STATUSES in lib/types.ts and leadId() in lib/db.ts.
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];
export const LEAD_ID = /^lead_\d{4}$/;

// The only fields the two verbs need. Name, e-mail and the request text stay on the server.
const PUBLIC_FIELDS = ["id", "company", "status", "source", "budget", "createdAt"];

const FIXTURE = process.env.LEADDESK_FIXTURE ?? fileURLToPath(new URL("../fixtures/leads.json", import.meta.url));

// A failure the agent can act on: returned to the client as isError, not thrown.
export class LeadDeskError extends Error {}

function load(rows) {
  if (!Array.isArray(rows)) throw new Error("fixture: expected an array of leads");
  for (const row of rows) {
    if (!LEAD_ID.test(row?.id ?? "")) throw new Error(`fixture: bad lead id ${JSON.stringify(row?.id)}`);
    if (!LEAD_STATUSES.includes(row.status)) throw new Error(`fixture: ${row.id} has unknown status ${row.status}`);
    if (Number.isNaN(Date.parse(row.createdAt))) throw new Error(`fixture: ${row.id} has no valid createdAt`);
  }
  return new Map(rows.map((row) => [row.id, { ...row }]));
}

// Module level on purpose: the HTTP transport calls the server factory once per request,
// and the state has to outlive a single request.
const leads = load(JSON.parse(await readFile(FIXTURE, "utf8")));
const auditLog = [];

const pick = (lead) => Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, lead[f]]));
const newestFirst = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);

export function findLeads({ status, limit }) {
  const matched = [...leads.values()].filter((l) => status === "any" || l.status === status).sort(newestFirst);
  return { total: matched.length, leads: matched.slice(0, limit).map(pick) };
}

export function setLeadStatus({ leadId, status, reason }) {
  const lead = leads.get(leadId);
  if (!lead) {
    throw new LeadDeskError(
      `Ліда ${leadId} немає в LeadDesk. Знайди правильний ідентифікатор через leaddesk_find_leads (status: "any") і повтори виклик.`,
    );
  }
  if (lead.status === status) {
    throw new LeadDeskError(`Лід ${leadId} уже має статус ${status}: нічого не змінено. Актуальний статус — у leaddesk_find_leads.`);
  }
  const from = lead.status;
  lead.status = status;
  // Same shape as AuditEntry in lib/types.ts ({ action, leadId, at }) plus what changed and why.
  const audit = { action: "lead.status_changed", leadId, at: new Date().toISOString(), from, to: status, reason };
  auditLog.push(audit);
  return { lead: pick(lead), previousStatus: from, audit };
}
