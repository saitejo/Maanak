import type { ChatSession } from "@/lib/types";

const PREFIX = "maanak-archive:";

function key(userId: string) {
  return `${PREFIX}${userId}`;
}

export function loadArchives(userId: string): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) 
      ? parsed.map(session => ({
          ...session,
          messages: session.messages.map(msg => ({ ...msg, isStreaming: false }))
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveArchives(userId: string, sessions: ChatSession[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(userId), JSON.stringify(sessions));
}

export function titleFromQuery(query: string) {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New consultation";
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}
