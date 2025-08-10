import { startHTTPServer, InMemoryEventStore } from "mcp-proxy";
import { createWishForgeServer } from "./index.js";

const port = Number(process.env.PORT || 8080);

async function main() {
  const { close } = await startHTTPServer({
    createServer: async () => createWishForgeServer(),
    eventStore: new InMemoryEventStore(),
    port,
    sseEndpoint: null,
    streamEndpoint: "/mcp",
    stateless: true,
    onUnhandledRequest: async (req, res) => {
      if (req.method === "GET" && (req.url === "/" || req.url === "/healthz")) {
        res.statusCode = 200;
        res.setHeader("content-type", "text/plain");
        res.end("OK");
        return;
      }
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end("Not Found");
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[wishforge] streamable HTTP MCP listening on http://localhost:${port}/mcp`);

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  signals.forEach((sig) => {
    process.on(sig, async () => {
      await close();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start HTTP server:", err);
  process.exit(1);
}); 