// ─── Credential Proxy ─────────────────────────────────────────────────────────
// HTTP reverse proxy that injects per-session API keys.
//
// Security design:
//   CC inside the container has ANTHROPIC_API_KEY=session-<sessionId> (a placeholder).
//   The CC SDK sends that placeholder in the x-api-key (standard) or api-key (Azure)
//   header. This proxy intercepts the request, extracts the session ID from the
//   placeholder, looks up the real API key, and injects it before forwarding to the
//   actual API endpoint.
//
//   Raw API keys NEVER enter the container. The container only ever sees the
//   placeholder key.
//
// Azure Foundry compatibility note:
//   Azure Foundry SDK sends requests using the `api-key` header (Azure convention)
//   rather than `x-api-key`. The proxy detects this from `isAzureFoundry` option.
//   If `CLAUDE_CODE_USE_FOUNDRY=1` in the backend environment, the proxy constructor
//   defaults to Azure mode (or pass `isAzureFoundry: true` explicitly for testing).

import http from "node:http";
import httpProxy from "http-proxy";

export interface CredentialProxyOptions {
  /** Override target URL (for testing). Defaults to api.anthropic.com or Azure endpoint. */
  targetUrl?: string;
  /** Override Azure mode detection (for testing). Defaults to CLAUDE_CODE_USE_FOUNDRY === "1". */
  isAzureFoundry?: boolean;
}

export class CredentialProxy {
  private proxy: httpProxy;
  private server: http.Server;
  private sessionKeys = new Map<string, string>();
  private port = 0;
  private readonly isAzureFoundry: boolean;
  private readonly targetUrl: string;
  private readonly headerName: string;

  constructor(opts: CredentialProxyOptions = {}) {
    this.isAzureFoundry =
      opts.isAzureFoundry ?? process.env.CLAUDE_CODE_USE_FOUNDRY === "1";

    if (opts.targetUrl) {
      this.targetUrl = opts.targetUrl;
    } else if (this.isAzureFoundry) {
      const resource = process.env.ANTHROPIC_FOUNDRY_RESOURCE ?? "";
      this.targetUrl = `https://${resource}.services.ai.azure.com`;
    } else {
      this.targetUrl = "https://api.anthropic.com";
    }

    // Azure Foundry SDK uses `api-key` header; standard Anthropic SDK uses `x-api-key`
    this.headerName = this.isAzureFoundry ? "api-key" : "x-api-key";

    this.proxy = httpProxy.createProxyServer({
      target: this.targetUrl,
      changeOrigin: true,
      // Only use secure TLS for real upstream targets (not localhost test upstreams)
      secure: !this.targetUrl.startsWith("http://"),
      selfHandleResponse: false,
    });

    // Inject real API key before forwarding
    this.proxy.on("proxyReq", (proxyReq, req) => {
      const placeholderKey = req.headers[this.headerName] as string | undefined;
      let realKey: string | undefined;

      if (placeholderKey?.startsWith("session-")) {
        const sessionId = placeholderKey.slice("session-".length);
        realKey = this.sessionKeys.get(sessionId);
      }

      if (!realKey) {
        // Destroy the proxy request — the server handler already validated and
        // would only reach here on a race condition. The 403 was already sent.
        proxyReq.destroy(new Error("No API key for session"));
        return;
      }

      proxyReq.setHeader(this.headerName, realKey);
    });

    // Handle proxy errors (e.g. upstream unreachable)
    this.proxy.on("error", (err, _req, res) => {
      if (res && "writeHead" in res) {
        const serverRes = res as http.ServerResponse;
        if (!serverRes.headersSent) {
          serverRes.writeHead(502, { "Content-Type": "application/json" });
          serverRes.end(JSON.stringify({ error: "proxy error", message: err.message }));
        }
      }
    });

    // Main request handler: validate session key before proxying
    this.server = http.createServer((req, res) => {
      const placeholderKey = req.headers[this.headerName] as string | undefined;

      if (!placeholderKey?.startsWith("session-")) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing session key" }));
        return;
      }

      const sessionId = placeholderKey.slice("session-".length);
      if (!this.sessionKeys.has(sessionId)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unknown session" }));
        return;
      }

      this.proxy.web(req, res, {});
    });
  }

  /** Start the proxy server on the given port (use 0 for OS-assigned free port). */
  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "0.0.0.0", () => {
        this.port = (this.server.address() as { port: number }).port;
        resolve();
      });
    });
  }

  /** Stop the proxy server and clean up the underlying proxy. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.proxy.close();
      this.server.close(() => resolve());
    });
  }

  /** Register a session ID → real API key mapping. */
  registerSession(sessionId: string, apiKey: string): void {
    this.sessionKeys.set(sessionId, apiKey);
  }

  /** Unregister a session. Subsequent requests for this session will get 403. */
  unregisterSession(sessionId: string): void {
    this.sessionKeys.delete(sessionId);
  }

  /** Return the actual port the server is listening on. */
  getPort(): number {
    return this.port;
  }
}
