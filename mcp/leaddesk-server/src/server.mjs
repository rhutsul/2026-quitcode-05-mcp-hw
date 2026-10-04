// LeadDesk MCP server over stdio: what Claude Code starts with `claude mcp add leaddesk -- node …/server.mjs`.
// stdout is the protocol channel, so nothing here prints to it; logs go to stderr only.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createLeadDeskServer } from "./leaddesk.mjs";

await serveStdio(createLeadDeskServer);
