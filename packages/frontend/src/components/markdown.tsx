"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

const components: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded bg-bg-elevated px-1.5 py-0.5 text-[0.85em] font-mono text-accent"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={cn("block text-[0.85em] font-mono leading-relaxed", className)} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-2 rounded-lg border border-border bg-bg-elevated p-3 overflow-x-auto text-text-secondary">
        {children}
      </pre>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:text-accent-hover underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="list-disc pl-5 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal pl-5 space-y-1">{children}</ol>;
  },
  li({ children }) {
    return <li className="text-sm leading-relaxed">{children}</li>;
  },
  p({ children }) {
    return <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>;
  },
  h1({ children }) {
    return <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-sm font-bold mb-1.5 mt-2.5 first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-accent/40 pl-3 my-2 text-text-secondary italic">
        {children}
      </blockquote>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="min-w-full text-sm border border-border">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-border bg-bg-elevated px-2 py-1 text-left text-xs font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-border px-2 py-1 text-xs">{children}</td>;
  },
  strong({ children }) {
    return <strong className="font-semibold">{children}</strong>;
  },
};

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
