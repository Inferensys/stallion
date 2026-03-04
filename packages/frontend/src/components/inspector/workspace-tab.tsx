"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useMissionStore } from "@/store/mission-store";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/api";

// ─── Tree data structure ────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  for (const filePath of files) {
    const parts = filePath.split("/");
    let current = root;
    let accumulated = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.push({
          name: part,
          path: accumulated,
          isDir: false,
          children: [],
        });
      } else {
        let existing = dirMap.get(accumulated);
        if (!existing) {
          existing = {
            name: part,
            path: accumulated,
            isDir: true,
            children: [],
          };
          dirMap.set(accumulated, existing);
          current.push(existing);
        }
        current = existing.children;
      }
    }
  }

  // Sort: directories first, then files, both alphabetical
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.isDir) sortNodes(node.children);
    }
  };
  sortNodes(root);

  return root;
}

// ─── Tree item component ────────────────────────────────────────────────────

function TreeItem({
  node,
  depth,
  expandedDirs,
  selectedFile,
  onToggleDir,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  expandedDirs: Set<string>;
  selectedFile: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = !node.isDir && selectedFile === node.path;

  return (
    <>
      <button
        onClick={() =>
          node.isDir ? onToggleDir(node.path) : onSelectFile(node.path)
        }
        className={cn(
          "w-full flex items-center gap-1 py-0.5 text-[11px] font-mono transition-colors cursor-pointer",
          isSelected
            ? "bg-accent/10 text-accent"
            : "text-text-secondary hover:bg-bg-hover"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.isDir ? (
          <>
            <ChevronRight
              size={12}
              className={cn(
                "shrink-0 transition-transform",
                isExpanded && "rotate-90"
              )}
            />
            {isExpanded ? (
              <FolderOpen size={14} className="shrink-0 text-text-muted" />
            ) : (
              <Folder size={14} className="shrink-0 text-text-muted" />
            )}
          </>
        ) : (
          <>
            {/* Offset to align with folder names (chevron + folder icon space) */}
            <span className="w-3 shrink-0" />
            <File size={14} className="shrink-0 text-text-muted" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.isDir &&
        isExpanded &&
        node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedDirs={expandedDirs}
            selectedFile={selectedFile}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
          />
        ))}
    </>
  );
}

// ─── Syntax highlighting ────────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  ts: "js",
  tsx: "js",
  js: "js",
  jsx: "js",
  json: "json",
  css: "css",
  html: "html",
  md: "md",
  py: "py",
};

const JS_KEYWORDS = new Set([
  "import",
  "export",
  "from",
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "class",
  "extends",
  "new",
  "this",
  "typeof",
  "instanceof",
  "async",
  "await",
  "try",
  "catch",
  "throw",
  "switch",
  "case",
  "break",
  "default",
  "interface",
  "type",
  "enum",
  "as",
  "null",
  "undefined",
  "true",
  "false",
  "void",
  "of",
  "in",
]);

const PY_KEYWORDS = new Set([
  "import",
  "from",
  "def",
  "class",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "try",
  "except",
  "raise",
  "with",
  "as",
  "lambda",
  "yield",
  "pass",
  "break",
  "continue",
  "and",
  "or",
  "not",
  "in",
  "is",
  "None",
  "True",
  "False",
  "async",
  "await",
  "self",
]);

const CSS_KEYWORDS = new Set([
  "import",
  "media",
  "keyframes",
  "from",
  "to",
]);

interface Token {
  text: string;
  cls: string;
}

function tokenizeLine(line: string, lang: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const keywords =
    lang === "py"
      ? PY_KEYWORDS
      : lang === "css"
        ? CSS_KEYWORDS
        : JS_KEYWORDS;

  const ch = (idx: number) => line.charAt(idx);

  while (i < line.length) {
    const c = ch(i);

    // Comments
    if (lang === "js" && line.slice(i, i + 2) === "//") {
      tokens.push({ text: line.slice(i), cls: "tok-comment" });
      break;
    }
    if (lang === "py" && c === "#") {
      tokens.push({ text: line.slice(i), cls: "tok-comment" });
      break;
    }
    if (lang === "css" && line.slice(i, i + 2) === "/*") {
      const end = line.indexOf("*/", i + 2);
      if (end >= 0) {
        tokens.push({ text: line.slice(i, end + 2), cls: "tok-comment" });
        i = end + 2;
        continue;
      }
      tokens.push({ text: line.slice(i), cls: "tok-comment" });
      break;
    }
    if (lang === "html" && line.slice(i, i + 4) === "<!--") {
      const end = line.indexOf("-->", i + 4);
      if (end >= 0) {
        tokens.push({ text: line.slice(i, end + 3), cls: "tok-comment" });
        i = end + 3;
        continue;
      }
      tokens.push({ text: line.slice(i), cls: "tok-comment" });
      break;
    }

    // Strings
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < line.length && ch(j) !== c) {
        if (ch(j) === "\\") j++; // skip escaped
        j++;
      }
      tokens.push({ text: line.slice(i, j + 1), cls: "tok-string" });
      i = j + 1;
      continue;
    }

    // Numbers
    if (/\d/.test(c) && (i === 0 || /[\s,(\[{:=+\-*/]/.test(ch(i - 1)))) {
      let j = i;
      while (j < line.length && /[\d.xXa-fA-F_]/.test(ch(j))) j++;
      tokens.push({ text: line.slice(i, j), cls: "tok-number" });
      i = j;
      continue;
    }

    // Words (keywords or identifiers)
    if (/[a-zA-Z_$@]/.test(c)) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(ch(j))) j++;
      const word = line.slice(i, j);
      if (keywords.has(word)) {
        tokens.push({ text: word, cls: "tok-keyword" });
      } else {
        tokens.push({ text: word, cls: "" });
      }
      i = j;
      continue;
    }

    // Other characters
    tokens.push({ text: c, cls: "" });
    i++;
  }

  return tokens;
}

function getLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? "";
}

// ─── Code viewer ────────────────────────────────────────────────────────────

function CodeViewer({
  content,
  filePath,
}: {
  content: string;
  filePath: string;
}) {
  const lang = getLang(filePath);
  const lines = content.split("\n");

  // Width of line number gutter based on max line count
  const gutterWidth = `${Math.max(String(lines.length).length * 0.6 + 0.8, 2.4)}em`;

  return (
    <div className="flex text-[11px] font-mono leading-[1.6]">
      {/* Line numbers */}
      <div
        className="shrink-0 select-none text-right pr-3 border-r border-border text-text-muted"
        style={{ width: gutterWidth }}
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {/* Code */}
      <pre className="flex-1 pl-3 overflow-x-auto">
        {lines.map((line, i) => {
          if (!lang) {
            return (
              <div key={i} className="text-text-primary">
                {line || "\n"}
              </div>
            );
          }
          const tokens = tokenizeLine(line, lang);
          return (
            <div key={i}>
              {tokens.length === 0 ? (
                "\n"
              ) : (
                tokens.map((tok, j) => (
                  <span key={j} className={tok.cls || "text-text-primary"}>
                    {tok.text}
                  </span>
                ))
              )}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function WorkspaceTab({ missionId }: { missionId: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const missionStatus = useMissionStore((s) => s.mission?.status);

  const workspaceGone =
    missionStatus === "completed" || missionStatus === "failed";

  const tree = useMemo(() => buildTree(files), [files]);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await authFetch(
        `/api/missions/${missionId}/files`
      );
      if (!res.ok) {
        setFiles([]);
        return;
      }
      const data = await res.json();
      setFiles(data.files ?? []);
      setError(null);
    } catch {
      setFiles([]);
    }
  }, [missionId]);

  // Auto-refresh file list every 5 seconds
  useEffect(() => {
    fetchFiles();
    const interval = setInterval(fetchFiles, 5000);
    return () => clearInterval(interval);
  }, [fetchFiles]);

  const handleSelectFile = async (filePath: string) => {
    setSelectedFile(filePath);
    setLoading(true);
    setFileContent(null);
    setError(null);

    try {
      const res = await authFetch(
        `/api/missions/${missionId}/files/read?path=${encodeURIComponent(filePath)}`
      );
      if (!res.ok) {
        setError("Failed to read file");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setFileContent(data.content);
    } catch {
      setError("Failed to read file");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  if (workspaceGone && files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-text-muted">Workspace unavailable</p>
          <p className="text-[10px] text-text-muted">
            {missionStatus === "failed"
              ? "The workspace was cleaned up after the mission failed."
              : "The workspace was cleaned up after mission completion."}
          </p>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">No files yet</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Tree view (35%) */}
      <div className="w-[35%] border-r border-border flex flex-col">
        <div className="border-b border-border px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Explorer
          </span>
          <button
            onClick={fetchFiles}
            className="text-[10px] text-accent hover:text-accent/80 transition-colors"
          >
            Refresh
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              expandedDirs={expandedDirs}
              selectedFile={selectedFile}
              onToggleDir={handleToggleDir}
              onSelectFile={handleSelectFile}
            />
          ))}
        </div>
      </div>

      {/* Code viewer (65%) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile && (
          <div className="border-b border-border px-3 py-2">
            <span className="text-[10px] font-mono text-text-muted truncate block">
              {selectedFile}
            </span>
          </div>
        )}
        <div className="flex-1 overflow-auto p-3">
          {!selectedFile && (
            <p className="text-text-muted text-xs text-center py-8">
              Select a file to view
            </p>
          )}
          {loading && (
            <p className="text-text-muted text-xs text-center py-8">
              Loading...
            </p>
          )}
          {error && (
            <p className="text-error text-xs text-center py-8">{error}</p>
          )}
          {fileContent !== null && !loading && (
            <CodeViewer content={fileContent} filePath={selectedFile!} />
          )}
        </div>
      </div>
    </div>
  );
}
