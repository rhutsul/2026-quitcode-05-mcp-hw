// LeadDesk MCP server over Streamable HTTP, for local use only: the same factory as server.mjs.
//
//   node src/http.mjs        http://127.0.0.1:3333/mcp
//
// The Host and Origin guards are CALLED here, in the request handler, before the MCP handler.
// Passed as an option to toNodeHandler they would be silently ignored, and a forged Host would get 200.
import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createLeadDeskServer } from "./leaddesk.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.LEADDESK_HTTP_PORT ?? 3333);

const mcp = toNodeHandler(createMcpHandler(createLeadDeskServer));
const checkHost = localhostHostValidation();
const checkOrigin = localhostOriginValidation();

createServer(async (req, res) => {
  if (!checkHost(req, res)) return; // the guard has already answered 403
  if (!checkOrigin(req, res)) return;
  if (new URL(req.url ?? "/", `http://${HOST}`).pathname !== "/mcp") {
    res.writeHead(404).end();
    return;
  }
  await mcp(req, res);
}).listen(PORT, HOST, () => console.error(`leaddesk: MCP over HTTP on http://${HOST}:${PORT}/mcp`));
