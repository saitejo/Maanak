"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlaskConical,
  Languages,
  Loader2,
  LogOut,
  Moon,
  Sun,
  PanelLeft,
  Mic,
  SendHorizonal,
  Square,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatArchive } from "@/components/chat/chat-archive";
import { ThinkingAnimation } from "@/components/chat/thinking-animation";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { MetricsDrawer } from "@/components/chat/metrics-drawer";
import { SourceInspector } from "@/components/chat/source-inspector";
import { AudioPlayerButton } from "@/components/chat/audio-player-button";
import { BrandMark } from "@/components/brand-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { loadArchives, saveArchives, titleFromQuery } from "@/lib/archive";
import { useAuth } from "@/hooks/use-auth";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  getLanguageName,
  type LanguageCode,
} from "@/lib/languages";
import { roleLabel } from "@/lib/roles";
import { LOCALIZED_WELCOME_TEXT } from "@/lib/translations";
import { streamChat } from "@/lib/sse";
import { createClient } from "@/lib/supabase/client";
import {
  USER_ROLES,
  type ChatMessage,
  type ChatSession,
  type Citation,
  type UserRole,
} from "@/lib/types";

function newSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "New consultation",
    messages: [],
    updatedAt: Date.now(),
  };
}

const LOCALIZED_PLACEHOLDERS: Record<string, string> = {
  en: "Ask about BIS clauses in English...",
  hi: "BIS मानकों के बारे में पूछें...",
  te: "BIS ప్రమాణాల గురించి అడగండి...",
  ta: "BIS தரநிலைகளைப் பற்றி கேளுங்கள்...",
  mr: "BIS मानकांबद्दल विचारा...",
  bn: "BIS মান সম্পর্কে জিজ্ঞাসা করুন...",
  gu: "BIS ધોરણો વિશે પૂછો...",
  kn: "BIS ಮಾನದಂಡಗಳ ಬಗ್ಗೆ ಕೇಳಿ...",
  ml: "BIS മാനദണ്ഡങ്ങളെക്കുറിച്ച് ചോദിക്കുക...",
  pa: "BIS ਮਿਆਰਾਂ ਬਾਰੇ ਪੁੱਛੋ...",
  or: "BIS ମାନକ ବିଷୟରେ ପଚାରନ୍ତୁ...",
  as: "BIS মানকসমূহৰ বিষয়ে সোধক...",
};

const LOCALIZED_TITLE: Record<string, string> = {
  en: "Ask an Indian Standard",
  hi: "भारतीय मानक पूछें",
  te: "భారతీయ ప్రమాణాన్ని అడగండి",
  ta: "இந்தியத் தரத்தைக் கேளுங்கள்",
  mr: "भारतीय मानक विचारा",
  bn: "একটি ভারতীয় মান জিজ্ঞাসা করুন",
  gu: "ભારતીય ધોરણ પૂછો",
  kn: "ಭಾರತೀಯ ಮಾನದಂಡವನ್ನು ಕೇಳಿ",
  ml: "ഒരു ഇന്ത്യൻ സ്റ്റാൻഡേർഡ് ചോദിക്കുക",
  pa: "ਇੱਕ ਭਾਰਤੀ ਮਿਆਰ ਪੁੱਛੋ",
  or: "ଏକ ଭାରତୀୟ ମାନକ ପଚାରନ୍ତୁ",
  as: "এটা ভাৰতীয় মানক সোধক",
};

export function ChatShell() {
  const router = useRouter();
  const { user, role: authRole, loading, configured } = useAuth();
  const archiveKey = "admin-user";
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = loadArchives("admin-user");
    if (stored && stored.length > 0) return stored;
    return [{ id: crypto.randomUUID(), title: "New Chat", messages: [], updatedAt: Date.now() }];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const stored = loadArchives("admin-user");
    if (stored && stored.length > 0) return stored[0].id;
    return "";
  });
  const [input, setInput] = useState("");
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [roleOverride, setRoleOverride] = useState<UserRole | "auth">("citizen");
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [sending, setSending] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("maanak_dark_mode");
    if (saved === "true") setIsDarkMode(true);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("maanak_dark_mode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("maanak_dark_mode", "false");
    }
  }, [isDarkMode]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    isRecording,
    recordingDuration,
    isProcessing: isAudioProcessing,
    transcript: liveTranscript,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder(selectedLang);

  const effectiveRole: UserRole = roleOverride === "auth" ? authRole : roleOverride as UserRole;
  const active = sessions.find((session) => session.id === activeId) ?? sessions[0];

  useEffect(() => {
    if (!activeId && sessions.length > 0) setActiveId(sessions[0].id);
  }, [activeId, sessions]);

  useEffect(() => {
    saveArchives(archiveKey, sessions);
  }, [archiveKey, sessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages]);

  function patchActive(updater: (session: ChatSession) => ChatSession) {
    setSessions((current) =>
      current.map((session) => (session.id === activeId ? updater(session) : session)),
    );
  }

  const abortControllerRef = useRef<AbortController | null>(null);

  function stopStream() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSending(false);
  }

  async function executeStream(params: {
    inputType: "text" | "audio";
    data: string;
    displayText: string;
    transcript?: string;
  }) {
    if (!active || sending) return;

    setSending(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: params.displayText,
      inputType: params.inputType,
      sourceLang: selectedLang,
    };

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
      isStreaming: true,
      sourceLang: selectedLang,
    };

    patchActive((session) => ({
      ...session,
      title:
        session.messages.length === 0
          ? titleFromQuery(params.displayText)
          : session.title,
      updatedAt: Date.now(),
      messages: [...session.messages, userMessage, assistantMessage],
    }));

    let citations: Citation[] = [];

    abortControllerRef.current = new AbortController();

    try {
      await streamChat({
        sessionId: active.id,
        inputType: params.inputType,
        data: params.data,
        sourceLang: selectedLang,
        role: effectiveRole,
        transcript: params.transcript,
        signal: abortControllerRef.current.signal,
        handlers: {
          onTranscription: (serverTranscript) => {
            if (serverTranscript) {
              patchActive((session) => ({
                ...session,
                messages: session.messages.map((m) =>
                  m.id === userMessage.id
                    ? { ...m, content: serverTranscript }
                    : m,
                ),
              }));
            }
          },
          onAudio: (audioBase64) => {
            patchActive((session) => ({
              ...session,
              messages: session.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, audioBase64 }
                  : m,
              ),
            }));
            if (params.inputType === "audio" && audioBase64) {
              try {
                const snd = new Audio(`data:audio/mp3;base64,${audioBase64}`);
                snd.play().catch((err) => console.log("[Autoplay blocked]", err));
              } catch (e) {
                console.log("[Audio playback error]", e);
              }
            }
          },
          onToken: (chunk) => {
            patchActive((session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            }));
          },
          onMetadata: (next) => {
            citations = next;
            patchActive((session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? { ...message, citations: next }
                  : message,
              ),
            }));
          },
          onDone: () => {
            patchActive((session) => ({
              ...session,
              updatedAt: Date.now(),
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? { ...message, isStreaming: false, citations }
                  : message,
              ),
            }));
          },
        },
      });
    } catch (err: any) {
      const isAbort = err.name === "AbortError" || (err.message && err.message.includes("aborted"));
      if (isAbort) {
        patchActive((session) => ({
          ...session,
          messages: session.messages.filter(
            (m) => m.id !== userMessage.id && m.id !== assistantId
          ),
        }));
      } else {
        patchActive((session) => ({
          ...session,
          messages: session.messages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  isStreaming: false,
                  error: err instanceof Error ? err.message : "Gateway chat stream failed.",
                }
              : message,
          ),
        }));
      }
    } finally {
      abortControllerRef.current = null;
      setSending(false);
    }
  }

  async function onSendText() {
    const query = input.trim();
    if (!query || sending || !active) return;
    setInput("");
    await executeStream({
      inputType: "text",
      data: query,
      displayText: query,
    });
  }

  const micDownTimeRef = useRef<number>(0);

  async function handleToggleRecording() {
    if (sending || isAudioProcessing) return;
    if (isRecording) {
      const res = await stopRecording();
      if (res && (res.audioBase64 || res.transcript)) {
        await executeStream({
          inputType: "audio",
          data: res.audioBase64 || "",
          transcript: res.transcript || "",
          displayText: res.transcript || `Voice consultation in ${getLanguageName(selectedLang)}`,
        });
      }
    } else {
      await startRecording();
    }
  }

  async function handleMicMouseDown() {
    if (sending || isAudioProcessing) return;
    micDownTimeRef.current = Date.now();
    if (!isRecording) {
      await startRecording();
    }
  }

  async function handleMicMouseUp() {
    if (!isRecording) return;
    const duration = Date.now() - micDownTimeRef.current;
    if (duration > 500) {
      const res = await stopRecording();
      if (res && (res.audioBase64 || res.transcript)) {
        await executeStream({
          inputType: "audio",
          data: res.audioBase64 || "",
          transcript: res.transcript || "",
          displayText: res.transcript || `Voice consultation in ${getLanguageName(selectedLang)}`,
        });
      }
    }
  }

  async function onSignOut() {
    if (configured) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.replace("/login");
    router.refresh();
  }

  function onCreate() {
    const fresh = newSession();
    setSessions((current) => [fresh, ...current]);
    setActiveId(fresh.id);
    setActiveCitation(null);
  }

  function onDelete(id: string) {
    setSessions((current) => {
      const next = current.filter((session) => session.id !== id);
      if (next.length === 0) {
        const fresh = newSession();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function onRename(id: string, newTitle: string) {
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, title: newTitle } : session))
    );
  }

  if (!mounted) return null;

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden md:flex text-muted-foreground hover:text-foreground"
          >
            <PanelLeft className="size-5" />
          </Button>
          <BrandMark compact />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              I am a
            </span>
            <Select
              value={roleOverride}
              onValueChange={(value) => {
                if (value) setRoleOverride(value as UserRole | "auth");
              }}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {roleLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Link
            href="/labs"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FlaskConical />
            Labs
          </Link>
          {effectiveRole === "auditor" ? (
            <Link
              href="/auditor-dashboard"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Auditor
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 border-r">
          <div className={`hidden shrink-0 md:block transition-all duration-300 ${isSidebarOpen ? "w-60" : "w-0 overflow-hidden opacity-0"}`}>
            <ChatArchive
              sessions={sessions}
              activeId={activeId}
              onSelect={(id) => {
                setActiveId(id);
                setActiveCitation(null);
              }}
              onCreate={onCreate}
              onDelete={onDelete}
              onRename={onRename}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
                {loading ? (
                  <p className="text-sm text-muted-foreground">
                    Restoring session…
                  </p>
                ) : null}
                {(active?.messages.length ?? 0) === 0 ? (
                  <div className="rounded-2xl border bg-card p-6 shadow-xs">
                    <p className="font-heading text-2xl">{LOCALIZED_TITLE[selectedLang] || "Ask an Indian Standard"}</p>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {LOCALIZED_WELCOME_TEXT[selectedLang]?.subtitle || LOCALIZED_WELCOME_TEXT["en"].subtitle}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {LOCALIZED_WELCOME_TEXT[selectedLang]?.inputsLabel || LOCALIZED_WELCOME_TEXT["en"].inputsLabel}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-1">⌨️ {LOCALIZED_WELCOME_TEXT[selectedLang]?.query || LOCALIZED_WELCOME_TEXT["en"].query}</span>
                      <span className="rounded-md bg-muted px-2 py-1">🎙️ {LOCALIZED_WELCOME_TEXT[selectedLang]?.voice || LOCALIZED_WELCOME_TEXT["en"].voice}</span>
                      <span className="rounded-md bg-muted px-2 py-1">🌐 {LOCALIZED_WELCOME_TEXT[selectedLang]?.langs || LOCALIZED_WELCOME_TEXT["en"].langs}</span>
                      <span className="rounded-md bg-muted px-2 py-1">🔊 {LOCALIZED_WELCOME_TEXT[selectedLang]?.tts || LOCALIZED_WELCOME_TEXT["en"].tts}</span>
                    </div>
                  </div>
                ) : null}

                {active?.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`w-full max-w-full ${
                        message.role === "user"
                          ? "rounded-2xl px-4 py-3 shadow-xs bg-primary text-primary-foreground ml-auto w-fit max-w-[92%]"
                          : "py-2 text-foreground"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <>
                          {message.error ? (
                            <p className="text-sm text-destructive">{message.error}</p>
                          ) : (
                            <>
                              {message.isStreaming && !message.content ? (
                                <ThinkingAnimation lang={message.sourceLang || selectedLang} />
                              ) : (
                                <MarkdownMessage
                                  content={
                                    message.content ||
                                    (message.isStreaming
                                      ? "▍"
                                      : "No response tokens received.")
                                  }
                                  onCitationClick={(inlineCitation) => {
                                    const inlineDigits = inlineCitation.is_number.replace(/\D/g, "");
                                    const inlineClClean = (inlineCitation.clause || "").toLowerCase().replace(/[^0-9.]/g, "");
                                    
                                    const matched = message.citations?.find(c => {
                                      const cDigits = c.is_number.replace(/\D/g, "");
                                      const cCl = (c.clause || (c as any).clause_no || "").toLowerCase().replace(/[^0-9.]/g, "");
                                      return (cDigits && cDigits === inlineDigits) && (!inlineClClean || cCl.includes(inlineClClean) || inlineClClean.includes(cCl));
                                    }) || message.citations?.find(c => {
                                      const cDigits = c.is_number.replace(/\D/g, "");
                                      return cDigits && cDigits === inlineDigits;
                                    }) || message.citations?.[0];

                                    setActiveCitation({
                                      is_number: inlineCitation.is_number,
                                      clause: inlineCitation.clause,
                                      page: matched?.page || 1,
                                      exact_pdf_name: matched?.exact_pdf_name
                                    });
                                  }}
                                />
                              )}
                            </>
                          )}

                          {/* Citation Badges */}
                          {message.citations && message.citations.length > 0 ? (
                            <div className="mt-4 space-y-2">
                              <p className="text-[10px] font-bold tracking-wider text-emerald-800 uppercase dark:text-emerald-400">
                                Verified BIS Legal Citations
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {message.citations.map((citation, index) => {
                                  const displayClause = citation.clause || (citation as any).clause_no || "";
                                  const isSelected =
                                    activeCitation?.is_number === citation.is_number &&
                                    (activeCitation?.clause === citation.clause || activeCitation?.clause === displayClause);
                                  return (
                                    <button
                                      key={`${citation.is_number}-${displayClause}-${index}`}
                                      type="button"
                                      onClick={() => setActiveCitation({
                                        ...citation,
                                        clause: displayClause
                                      })}
                                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                                        isSelected
                                          ? "border-red-600 bg-red-600 text-white shadow-xs"
                                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300"
                                      }`}
                                    >
                                      <ShieldCheck className={`size-3.5 shrink-0 ${isSelected ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`} />
                                      <span className="whitespace-nowrap">
                                        {citation.is_number} · Clause {displayClause}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}

                          {/* On-Demand Audio Button (TTS) */}
                          {!message.isStreaming && message.content ? (
                            <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2">
                              <AudioPlayerButton
                                text={message.content}
                                targetLang={message.sourceLang || selectedLang}
                                cachedAudio={message.audioBase64}
                                onAudioFetched={(base64) => {
                                  patchActive((session) => ({
                                    ...session,
                                    messages: session.messages.map((m) =>
                                      m.id === message.id
                                        ? { ...m, audioBase64: base64 }
                                        : m,
                                    ),
                                  }));
                                }}
                              />
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {getLanguageName(message.sourceLang || selectedLang)}
                              </span>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div>
                          {message.inputType === "audio" ? (
                            <div className="mb-1 inline-flex items-center gap-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                              <Mic className="size-3" /> Voice Query (
                              {message.sourceLang?.toUpperCase()})
                            </div>
                          ) : null}
                          <p className="text-base leading-relaxed whitespace-pre-wrap">
                            {message.content}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Input Controls Area */}
            <div className="border-t bg-background p-3">
              <div className="mx-auto max-w-3xl space-y-2 pb-4">
                {/* Recording / Processing / Error Banners */}
                {isRecording ? (
                  <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs text-destructive animate-pulse">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
                    </span>
                    <span className="font-semibold">Recording voice…</span>
                    <span>Release to send in {getLanguageName(selectedLang)}</span>
                    <span className="ml-auto font-mono tabular-nums font-bold">
                      {recordingDuration}s
                    </span>
                  </div>
                ) : null}

                {isAudioProcessing ? (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3.5 py-2 text-xs text-primary">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="font-medium">
                      Translating & Processing audio query…
                    </span>
                  </div>
                ) : null}

                {recorderError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                    {recorderError}
                  </div>
                ) : null}

                {/* ChatGPT-style Input Bar */}
                <form
                  className="relative flex flex-col w-full rounded-2xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-primary/50 transition-shadow"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onSendText();
                  }}
                >
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={LOCALIZED_PLACEHOLDERS[selectedLang] || "Ask about BIS clauses..."}
                    rows={1}
                    className="min-h-[44px] max-h-[200px] w-full min-w-0 resize-none px-4 py-3 text-base leading-relaxed bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none placeholder:text-muted-foreground/60"
                    disabled={isRecording || isAudioProcessing || sending}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void onSendText();
                      }
                    }}
                  />
                  
                  {/* Bottom Toolbar inside the input */}
                  <div className="flex items-center justify-between gap-2 px-3 pb-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedLang}
                        onValueChange={(val) => {
                          if (val) setSelectedLang(val as LanguageCode);
                        }}
                      >
                        <SelectTrigger className="h-8 w-32 sm:w-36 gap-1 text-xs font-medium border-none shadow-none hover:bg-muted/50 rounded-full bg-muted/20">
                          <Languages className="size-3.5 text-muted-foreground shrink-0" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <SelectItem
                              key={lang.code}
                              value={lang.code}
                              className="text-xs"
                            >
                              {lang.name} ({lang.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="hidden sm:inline text-[10px] text-muted-foreground font-medium">
                        {isRecording
                          ? `Listening (${recordingDuration}s)... ${liveTranscript ? `"${liveTranscript.slice(0, 22)}..."` : "Tap to send"}`
                          : "Hold or tap mic to speak"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant={isRecording ? "destructive" : "outline"}
                        size="icon"
                        className={`size-10 rounded-full transition-all select-none touch-none ${
                          isRecording
                            ? "bg-destructive text-destructive-foreground ring-4 ring-destructive/30 animate-pulse"
                            : "border-none shadow-none bg-muted/30 hover:bg-muted"
                        }`}
                        onClick={handleToggleRecording}
                        onMouseDown={handleMicMouseDown}
                        onMouseUp={handleMicMouseUp}
                        onTouchStart={handleMicMouseDown}
                        onTouchEnd={handleMicMouseUp}
                        disabled={sending || isAudioProcessing}
                        title={isRecording ? "Click to send voice message" : "Hold or tap to speak in selected language"}
                      >
                        <Mic className="size-5" />
                      </Button>

                      {sending ? (
                        <Button
                          type="button"
                          size="icon"
                          onClick={stopStream}
                          className="size-10 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm"
                        >
                          <Square className="size-4 fill-current" />
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          size="icon"
                          className="size-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
                          disabled={!input.trim() || isRecording || isAudioProcessing}
                        >
                          <SendHorizonal className="size-5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* Source Inspector on the right */}
        <aside className={`min-w-0 bg-muted/20 shrink-0 transition-all ${activeCitation ? "block basis-[100%] md:basis-[50%] lg:basis-[45%]" : "hidden lg:block lg:basis-[40%]"}`}>
          <SourceInspector citation={activeCitation} onClose={() => setActiveCitation(null)} />
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t px-4 py-1.5 text-[11px] text-muted-foreground">
        <span>
          Streaming to <code>/api/gateway/chat/stream</code> · Language:{" "}
          <strong>{getLanguageName(selectedLang)} ({selectedLang})</strong> · Role:{" "}
          <code>{effectiveRole}</code>
        </span>
        {effectiveRole === "auditor" ? (
          <MetricsDrawer />
        ) : (
          <span>Citizen / manufacturer view</span>
        )}
      </footer>
    </div>
  );
}
