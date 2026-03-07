import fs from "node:fs/promises";
import path from "node:path";

// ─── File API ─────────────────────────────────────────────────────────────────
// Workspace file browsing for GET /files and GET /files/read.
// Includes path traversal protection.

const SKIP_DIRS = new Set([".claude", "node_modules", ".git"]);

async function walkDir(dir: string, base: string): Promise<string[]> {
  const results: string[] = [];

  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true, encoding: "utf-8" });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      const nested = await walkDir(fullPath, base);
      results.push(...nested);
    } else {
      results.push(relPath);
    }
  }

  return results;
}

/**
 * Recursively list files in the workspace directory.
 * Skips .claude, node_modules, and .git directories.
 * Returns relative paths from workspaceDir.
 */
export async function handleFileList(workspaceDir: string): Promise<string[]> {
  return walkDir(workspaceDir, workspaceDir);
}

/**
 * Read a file from the workspace directory.
 * Includes path traversal protection — resolved path must start with workspaceDir.
 */
export async function handleFileRead(
  workspaceDir: string,
  filePath: string,
): Promise<{ content: string } | { error: string }> {
  if (!filePath) {
    return { error: "Missing path parameter" };
  }

  // Resolve the target path
  const targetPath = path.resolve(workspaceDir, filePath);

  // Path traversal check — resolved path must stay within workspaceDir
  const resolvedWorkspace = path.resolve(workspaceDir);
  if (!targetPath.startsWith(resolvedWorkspace + path.sep) && targetPath !== resolvedWorkspace) {
    return { error: "Path traversal attempt detected" };
  }

  try {
    const content = await fs.readFile(targetPath, "utf-8");
    return { content };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: errorMsg };
  }
}
