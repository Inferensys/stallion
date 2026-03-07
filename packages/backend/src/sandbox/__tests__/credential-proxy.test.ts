// ─── Credential Proxy Tests ───────────────────────────────────────────────────
// Tests for HTTP reverse proxy that injects API keys per session.
// Uses a real HTTP upstream server on a random port to test actual proxy behavior end-to-end.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { CredentialProxy } from "../credential-proxy.js";

// Helper: start a mock upstream server that echoes received headers as JSON
function createMockUpstream(): Promise<{ server: http.Server; port: number; lastHeaders: http.IncomingHttpHeaders }> {
  const state = { lastHeaders: {} as http.IncomingHttpHeaders };
  const server = http.createServer((req, res) => {
    state.lastHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ headers: req.headers }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, port, lastHeaders: state.lastHeaders });
    });
  });
}

// Helper: send HTTP request to proxy and return response
async function sendToProxy(
  proxyPort: number,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        path: "/v1/messages",
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify({ prompt: "hello" }));
    req.end();
  });
}

describe("credential proxy", () => {
  let proxy: CredentialProxy;
  let upstream: { server: http.Server; port: number; lastHeaders: http.IncomingHttpHeaders };

  beforeAll(async () => {
    upstream = await createMockUpstream();
    proxy = new CredentialProxy({
      targetUrl: `http://127.0.0.1:${upstream.port}`,
      isAzureFoundry: false,
    });
    await proxy.start(0);
  });

  afterAll(async () => {
    await proxy.stop();
    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  beforeEach(() => {
    proxy.unregisterSession("test-session");
    proxy.unregisterSession("another-session");
  });

  it("injects real API key when x-api-key header contains session-<id> placeholder and session is registered", async () => {
    proxy.registerSession("test-session", "real-api-key-123");

    const { status, body } = await sendToProxy(proxy.getPort(), {
      "x-api-key": "session-test-session",
    });

    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { headers: Record<string, string> };
    expect(parsed.headers["x-api-key"]).toBe("real-api-key-123");
  });

  it("returns 403 when session ID is not registered", async () => {
    // Do NOT register the session
    const { status } = await sendToProxy(proxy.getPort(), {
      "x-api-key": "session-unknown-session",
    });

    expect(status).toBe(403);
  });

  it("returns 403 when x-api-key header does not start with session-", async () => {
    const { status } = await sendToProxy(proxy.getPort(), {
      "x-api-key": "direct-api-key-bypass-attempt",
    });

    expect(status).toBe(403);
  });

  it("returns 403 after session is unregistered", async () => {
    proxy.registerSession("another-session", "real-key-456");
    proxy.unregisterSession("another-session");

    const { status } = await sendToProxy(proxy.getPort(), {
      "x-api-key": "session-another-session",
    });

    expect(status).toBe(403);
  });

  it("does NOT forward the placeholder key — forwarded request has real key", async () => {
    proxy.registerSession("test-session", "real-api-key-abc");

    const { status, body } = await sendToProxy(proxy.getPort(), {
      "x-api-key": "session-test-session",
    });

    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { headers: Record<string, string> };
    // Must not have the placeholder
    expect(parsed.headers["x-api-key"]).not.toBe("session-test-session");
    // Must have the real key
    expect(parsed.headers["x-api-key"]).toBe("real-api-key-abc");
  });

  it("forwards other headers unchanged alongside the real key", async () => {
    proxy.registerSession("test-session", "real-key-789");

    const { status, body } = await sendToProxy(proxy.getPort(), {
      "x-api-key": "session-test-session",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });

    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { headers: Record<string, string> };
    expect(parsed.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("returns current port from getPort()", () => {
    const port = proxy.getPort();
    expect(typeof port).toBe("number");
    expect(port).toBeGreaterThan(0);
  });
});

describe("credential proxy — Azure Foundry mode", () => {
  let azureProxy: CredentialProxy;
  let upstream: { server: http.Server; port: number; lastHeaders: http.IncomingHttpHeaders };

  beforeAll(async () => {
    upstream = await createMockUpstream();
    // Azure mode: uses api-key header instead of x-api-key
    azureProxy = new CredentialProxy({
      targetUrl: `http://127.0.0.1:${upstream.port}`,
      isAzureFoundry: true,
    });
    await azureProxy.start(0);
  });

  afterAll(async () => {
    await azureProxy.stop();
    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  beforeEach(() => {
    azureProxy.unregisterSession("az-session");
  });

  it("injects api-key header (not x-api-key) in Azure Foundry mode", async () => {
    azureProxy.registerSession("az-session", "azure-real-key");

    const { status, body } = await sendToProxy(azureProxy.getPort(), {
      "api-key": "session-az-session",
    });

    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { headers: Record<string, string> };
    expect(parsed.headers["api-key"]).toBe("azure-real-key");
  });

  it("returns 403 in Azure mode when api-key header is missing or not a session placeholder", async () => {
    azureProxy.registerSession("az-session", "azure-real-key");

    // Send with x-api-key instead of api-key (wrong header for Azure mode)
    const { status } = await sendToProxy(azureProxy.getPort(), {
      "x-api-key": "session-az-session",
    });

    expect(status).toBe(403);
  });
});
