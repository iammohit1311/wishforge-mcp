import { startHTTPServer, InMemoryEventStore } from "mcp-proxy";
import { createWishForgeServer } from "./index.js";

const port = Number(process.env.PORT || 8080);

async function main() {
  const { close } = await startHTTPServer({
    createServer: async () => createWishForgeServer(),
    eventStore: new InMemoryEventStore(),
    port,
    sseEndpoint: "/sse",
    streamEndpoint: "/mcp",
    stateless: true,
    onUnhandledRequest: async (req, res) => {

         if (req.method === "GET" && req.url === "/test") {
        // const phoneNumber = process.env.OWNER_PHONE || "917977355318";
        // res.statusCode = 200;
        // res.setHeader("content-type", "application/json");
        console.log("clicked test endpoint successfully")
        res.end(JSON.stringify({ name: "test message successful" }));
        return;
      }

        if (req.method === "GET" && req.url === "/mcp") {
        const phoneNumber = process.env.OWNER_PHONE || "917977355318";
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ phoneNumber }));
        return;
      }

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