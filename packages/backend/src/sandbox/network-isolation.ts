// ─── Network Isolation ────────────────────────────────────────────────────────
// Applies iptables rules inside a container to block direct access to
// api.anthropic.com and claude.ai, forcing all API traffic through the
// credential proxy (ANTHROPIC_BASE_URL=http://host.docker.internal:<proxyPort>).
//
// Requires: container must have CapAdd: ["NET_ADMIN"] (set by ContainerManager).
//
// Limitation (Phase 1):
//   IP blocking by resolved DNS is imperfect for CDN-hosted domains — IPs can
//   change, and CDNs may serve many IPs. This is acceptable for MVP/dev isolation.
//   For production, the recommended approach is a Docker `internal` network with
//   explicit proxy routing (no public internet access from container at all).

import Docker from "dockerode";
import dns from "node:dns/promises";

/**
 * Apply iptables OUTPUT rules inside the container to block direct API access.
 * Resolves api.anthropic.com and claude.ai IPs and adds REJECT rules for each.
 */
export async function applyNetworkIsolation(
  container: Docker.Container,
): Promise<void> {
  const anthropicIps = await resolveHostIps("api.anthropic.com");
  const claudeIps = await resolveHostIps("claude.ai");
  const allIps = [...new Set([...anthropicIps, ...claudeIps])];

  for (const ip of allIps) {
    await runExec(container, [
      "iptables",
      "-A",
      "OUTPUT",
      "-d",
      ip,
      "-j",
      "REJECT",
      "--reject-with",
      "tcp-reset",
    ]);
  }

  console.log(
    `[network-isolation] Blocked ${allIps.length} IPs for container ${container.id.slice(0, 12)}: ${allIps.join(", ")}`,
  );
}

async function resolveHostIps(hostname: string): Promise<string[]> {
  try {
    const ips = await dns.resolve4(hostname);
    return ips;
  } catch (err) {
    // DNS resolution can fail in offline/test environments — skip, don't block startup
    console.warn(
      `[network-isolation] Could not resolve ${hostname} — skipping IP block:`,
      (err as Error).message,
    );
    return [];
  }
}

async function runExec(
  container: Docker.Container,
  cmd: string[],
): Promise<void> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: false, stdin: false });
  await new Promise<void>((resolve) => stream.on("end", resolve));
}
