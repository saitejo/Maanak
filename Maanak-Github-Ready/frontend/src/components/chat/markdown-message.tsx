"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
  onCitationClick?: (citation: { is_number: string; clause: string }) => void;
};

// Robust multilingual BIS citation regex
// Matches: [IS 14543 -> Clause 4.1], [आईएस 14543 -> खंड 4.1], [IS 302 (Part 1) : 13.1], (IS 16102 - Clause 6), etc.
const CITATION_REGEX =
  /[\[\(]\s*(?:IS|आईएस|ఐఎస్|ஐஎஸ்|আইએસ|આઈએસ|ಐಎಸ್|ഐഎസ്|ਆਈਐਸ|IS\s*CODE)?\s*([0-9A-Z\(\)\s\-\/]+?)\s*(?:->|:|—|-|–)\s*(?:Clause\s*|Cl\.?\s*|खंड\s*|धारा\s*|క్లాజ్\s*|నిబంధన\s*|பிரிவு\s*|অনুচ্ছেদ\s*|કલમ\s*|വിಭಾಗ\s*|വകുപ്പ്\s*)?([0-9]+(?:\.[0-9]+)*(?:\s*(?:Part|Sec)\s*[0-9]+)?)\s*[\]\)]/gi;

const FALLBACK_CITATION_REGEX =
  /[\[\(]\s*(IS\s*[^\]\)\-:>—–]+?)\s*(?:->|:|—|-|–)\s*(?:Clause\s*)?([^\]\)]+?)[\]\)]/gi;

function cleanIsNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let upper = raw.toUpperCase().trim();
  upper = upper.replace(/^(?:आईएस|ఐఎస్|ஐஎஸ்|আইએસ|આઈએસ|ಐಎಸ್|ഐഎസ്|ਆਈਐਸ)\s*/i, "IS ");
  if (!upper.startsWith("IS") && digits) {
    upper = `IS ${digits}`;
  }
  return upper;
}

function cleanClauseNumber(raw: string): string {
  return raw
    .replace(/(?:Clause|Cl\.?|खंड|धारा|క్లాజ్|నిబంధన|பிரிவு|অনুচ্ছেদ|કલમ|വിಭಾಗ|വകുപ്പ്)\s*/gi, "")
    .trim();
}

function formatCitationText(
  text: string,
  onCitationClick?: (citation: { is_number: string; clause: string }) => void,
): React.ReactNode {
  if (!text || typeof text !== "string") return text;

  const regex = CITATION_REGEX.test(text) ? CITATION_REGEX : FALLBACK_CITATION_REGEX;
  regex.lastIndex = 0;

  if (!regex.test(text)) {
    return text;
  }
  regex.lastIndex = 0;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    const rawIs = match[1] ? match[1].trim() : "";
    const rawClause = match[2] ? match[2].trim() : "";
    const isNum = cleanIsNumber(rawIs);
    const clause = cleanClauseNumber(rawClause);

    elements.push(
      <button
        key={`${isNum}-${clause}-${match.index}`}
        type="button"
        onClick={() => onCitationClick?.({ is_number: isNum, clause })}
        title={`Verified BIS Standard: ${isNum} Clause ${clause}`}
        className="mx-1 inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[0.85em] font-semibold text-emerald-800 transition hover:bg-emerald-500/25 dark:border-emerald-500/40 dark:text-emerald-300"
      >
        <span className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="whitespace-nowrap">{isNum} → Clause {clause}</span>
      </button>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

function renderWithCitations(
  node: React.ReactNode,
  onCitationClick?: (citation: { is_number: string; clause: string }) => void,
): React.ReactNode {
  if (typeof node === "string") {
    return formatCitationText(node, onCitationClick);
  }
  if (Array.isArray(node)) {
    return React.Children.map(node, (child) =>
      renderWithCitations(child, onCitationClick),
    );
  }
  if (React.isValidElement(node) && (node.props as any)?.children) {
    return React.cloneElement(node, {
      ...(node.props as any),
      children: renderWithCitations((node.props as any).children, onCitationClick),
    });
  }
  return node;
}

export function MarkdownMessage({ content, onCitationClick }: MarkdownMessageProps) {
  return (
    <div className="prose-maanak text-base leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-2 leading-relaxed">
              {renderWithCitations(children, onCitationClick)}
            </p>
          ),
          li: ({ children }) => (
            <li className="my-1 leading-relaxed">
              {renderWithCitations(children, onCitationClick)}
            </li>
          ),
          td: ({ children }) => (
            <td className="border-b px-2 py-1.5 align-top">
              {renderWithCitations(children, onCitationClick)}
            </td>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {renderWithCitations(children, onCitationClick)}
            </strong>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline text-blue-600 hover:text-blue-700 dark:text-blue-400">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b bg-muted/60 px-2 py-1.5 font-medium">{children}</th>
          ),
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4">{children}</ol>,
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-md bg-muted p-2 text-xs">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
