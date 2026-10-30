// 로컬 stdio MCP 서버 (개발·오프라인용). 운영은 Worker의 원격 커넥터(/mcp/<KEW_SECRET>)를 사용한다.
// 상태는 로컬 JSON 파일(KEW_DATA, 기본 data/state.json)에 저장한다.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openFileStore } from "../core/store.js";
import { envFromProcess } from "../core/nodeenv.js";
import { registerTools } from "./tools.js";

const server = new McpServer({ name: "korea-early-warning", version: "0.2.0" });
registerTools(server, { env: envFromProcess(), store: await openFileStore(process.env.KEW_DATA ?? "data/state.json") });
await server.connect(new StdioServerTransport());
