import type { Citation, UserRole } from "@/lib/types";
import { getFastApiUrl } from "@/lib/config";

export type StreamChatOptions = {
  sessionId: string;
  inputType: "text" | "audio";
  data: string; // text string or raw base64 audio
  sourceLang: string; // "en", "hi", "te", etc.
  role?: UserRole;
  transcript?: string;
  handlers: {
    onToken: (chunk: string) => void;
    onMetadata: (citations: Citation[]) => void;
    onDone: () => void;
    onAudio?: (audioBase64: string) => void;
    onTranscription?: (transcript: string) => void;
  };
  signal?: AbortSignal;
};

type ParsedEvent = {
  event: string;
  data: string;
};

function parseSseBlock(block: string): ParsedEvent | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0 && event === "message") {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

function processSseEvent(
  parsedEvent: ParsedEvent,
  handlers: StreamChatOptions["handlers"],
): boolean {
  const { event, data } = parsedEvent;
  const trimmed = data.trim();

  if (event === "done" || trimmed === "[DONE]") {
    handlers.onDone();
    return true;
  }

  if (event === "transcription") {
    try {
      const parsed = JSON.parse(trimmed);
      const text = parsed.transcript || parsed.transcription || parsed.text;
      if (text && handlers.onTranscription) {
        handlers.onTranscription(text);
      }
    } catch {
      if (handlers.onTranscription && trimmed) {
        handlers.onTranscription(trimmed);
      }
    }
    return false;
  }

  if (event === "audio") {
    try {
      const parsed = JSON.parse(trimmed);
      const audio = parsed.audio || parsed.audio_base64;
      if (audio && handlers.onAudio) {
        handlers.onAudio(audio);
      }
    } catch {
      if (handlers.onAudio && trimmed) {
        handlers.onAudio(trimmed);
      }
    }
    return false;
  }

  if (event === "metadata") {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.citations)) {
        handlers.onMetadata(parsed.citations);
      } else if (Array.isArray(parsed)) {
        handlers.onMetadata(parsed);
      }
    } catch {
      // Ignore malformed metadata payload
    }
    return false;
  }

  if (event === "token") {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.text === "string") {
        handlers.onToken(parsed.text);
      } else if (typeof parsed.content === "string") {
        handlers.onToken(parsed.content);
      } else {
        handlers.onToken(trimmed);
      }
    } catch {
      handlers.onToken(trimmed);
    }
    return false;
  }

  if (event === "error") {
    try {
      const parsed = JSON.parse(trimmed);
      throw new Error(parsed.message || parsed.error || "Server stream error");
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error(trimmed || "Server stream error");
    }
  }

  // Fallback for default message event
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.citations && Array.isArray(parsed.citations)) {
        handlers.onMetadata(parsed.citations);
        return false;
      }
      if (typeof parsed.text === "string") {
        handlers.onToken(parsed.text);
        return false;
      }
      if (typeof parsed.content === "string") {
        handlers.onToken(parsed.content);
        return false;
      }
    } catch {
      handlers.onToken(trimmed);
    }
  }

  return false;
}

export async function streamChat(options: StreamChatOptions) {
  const base = getFastApiUrl();
  if (!base) {
    throw new Error(
      "FastAPI URL is not configured. Set NEXT_PUBLIC_FASTAPI_URL in .env.local.",
    );
  }

  const endpoint = `${base}/api/gateway/chat/stream`;
  const payload = {
    input_type: options.inputType,
    data: options.data,
    source_lang: options.sourceLang,
    session_id: options.sessionId,
    transcript: options.transcript || "",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(options.role ? { "X-User-Role": options.role } : {}),
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text || `Gateway stream request failed (${response.status})`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from gateway chat stream API.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const flushBlock = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    if (processSseEvent(parsed, options.handlers)) {
      finished = true;
    }
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      flushBlock(part);
      if (finished) break;
    }
  }

  if (!finished && buffer.trim()) {
    flushBlock(buffer);
  }

  if (!finished) {
    options.handlers.onDone();
  }
}

export async function requestTts(
  text: string,
  targetLang: string,
): Promise<string> {
  const base = getFastApiUrl();
  if (!base) {
    throw new Error(
      "FastAPI URL is not configured. Set NEXT_PUBLIC_FASTAPI_URL in .env.local.",
    );
  }

  const response = await fetch(`${base}/api/gateway/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      target_lang: targetLang,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `TTS request failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.audio_base64) {
    throw new Error("No audio_base64 received from TTS endpoint.");
  }

  return data.audio_base64;
}

export async function fetchLabs(isCode: string, role: UserRole) {
  const base = getFastApiUrl();
  if (!base) {
    throw new Error(
      "FastAPI URL is not configured. Set NEXT_PUBLIC_FASTAPI_URL in .env.local.",
    );
  }

  const url = new URL(`${base}/api/v1/labs`);
  if (isCode) url.searchParams.set("is_code", isCode);

  const response = await fetch(url.toString(), {
    headers: { "X-User-Role": role },
  });

  if (!response.ok) {
    throw new Error(`Labs request failed (${response.status})`);
  }

  return response.json();
}

export async function fetchMetrics() {
  const base = getFastApiUrl();
  if (!base) {
    throw new Error(
      "FastAPI URL is not configured. Set NEXT_PUBLIC_FASTAPI_URL in .env.local.",
    );
  }

  const response = await fetch(`${base}/api/v1/metrics`, {
    headers: { "X-User-Role": "auditor" },
  });

  if (!response.ok) {
    throw new Error(`Metrics request failed (${response.status})`);
  }

  return response.json();
}
