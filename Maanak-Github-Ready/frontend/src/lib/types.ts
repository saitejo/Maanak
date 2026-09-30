export const USER_ROLES = ["citizen", "manufacturer"] as const;
export type UserRole = (typeof USER_ROLES)[number] | "auditor";

export type ChatTurnRole = "user" | "assistant";

export type ChatHistoryItem = {
  role: ChatTurnRole;
  content: string;
};

export type Citation = {
  citation_id?: string;
  is_number: string;
  clause: string;
  page?: number;
  snippet?: string;
  score?: number;
  exact_pdf_name?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatTurnRole;
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  error?: string;
  inputType?: "text" | "audio";
  sourceLang?: string;
  audioBase64?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

export type LabRecord = {
  lab_name: string;
  location: string;
  scope: string[];
};

export type RagMetrics = {
  faithfulness: number;
  context_precision: number;
  latency_ms: number;
  [key: string]: number;
};
