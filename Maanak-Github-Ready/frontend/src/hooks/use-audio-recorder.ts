"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BCP47_MAP: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  te: "te-IN",
  ta: "ta-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  or: "or-IN",
  as: "as-IN",
};

export type RecordingResult = {
  audioBase64: string | null;
  transcript: string;
};

export function useAudioRecorder(selectedLang: string = "en") {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>("");

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors if already stopped
      }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      cleanupStream();
      stopRecognition();
    };
  }, [clearTimer, cleanupStream, stopRecognition]);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    transcriptRef.current = "";

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Microphone access is not supported in this browser.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType =
        [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg",
        ].find((type) => MediaRecorder.isTypeSupported(type)) || "";

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Initialize Web Speech API for zero-latency in-browser recognition
      try {
        const SpeechRecognition =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.lang = BCP47_MAP[selectedLang] || "en-IN";
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => {
            let fullText = "";
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + " ";
            }
            const clean = fullText.trim();
            if (clean) {
              setTranscript(clean);
              transcriptRef.current = clean;
            }
          };

          recognition.onerror = (e: any) => {
            console.log("[WebSpeech error]", e);
          };

          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch (err) {
        console.log("[WebSpeech setup failed, fallback to backend]", err);
      }

      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      clearTimer();
      timerRef.current = setInterval(() => {
        setRecordingDuration(
          Math.floor((Date.now() - startTimeRef.current) / 1000),
        );
      }, 250);

      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not access microphone. Please grant permission.";
      setError(message);
      setIsRecording(false);
      clearTimer();
      cleanupStream();
      stopRecognition();
      return false;
    }
  }, [clearTimer, cleanupStream, stopRecognition, selectedLang]);

  const stopRecording = useCallback(
    async (): Promise<RecordingResult | null> => {
      clearTimer();
      stopRecognition();

      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        setIsRecording(false);
        cleanupStream();
        return null;
      }

      setIsProcessing(true);
      setIsRecording(false);

      return new Promise((resolve) => {
        mediaRecorder.onstop = () => {
          try {
            const capturedTranscript = transcriptRef.current.trim();
            if (audioChunksRef.current.length === 0 && !capturedTranscript) {
              cleanupStream();
              setIsProcessing(false);
              resolve(null);
              return;
            }

            const blobType = mediaRecorder.mimeType || "audio/webm";
            const audioBlob = new Blob(audioChunksRef.current, {
              type: blobType,
            });
            const reader = new FileReader();

            reader.onloadend = () => {
              const result = reader.result as string;
              const rawBase64 = result.includes(",")
                ? result.split(",")[1]
                : result;
              cleanupStream();
              setIsProcessing(false);
              resolve({
                audioBase64: rawBase64,
                transcript: capturedTranscript,
              });
            };

            reader.onerror = () => {
              cleanupStream();
              setIsProcessing(false);
              resolve({
                audioBase64: null,
                transcript: capturedTranscript,
              });
            };

            reader.readAsDataURL(audioBlob);
          } catch {
            cleanupStream();
            setIsProcessing(false);
            resolve(null);
          }
        };

        mediaRecorder.stop();
      });
    },
    [clearTimer, cleanupStream, stopRecognition],
  );

  const cancelRecording = useCallback(() => {
    clearTimer();
    stopRecognition();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsProcessing(false);
    setTranscript("");
    transcriptRef.current = "";
    cleanupStream();
  }, [clearTimer, cleanupStream, stopRecognition]);

  return {
    isRecording,
    recordingDuration,
    isProcessing,
    transcript,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
