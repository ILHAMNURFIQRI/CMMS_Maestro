import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Bot,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Send,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import {
  apiDataProvider,
  type ChatTurn,
} from "../services/ApiDataProvider";
import type { Machine } from "../types/machine";

const CHAT_STORAGE_KEY = "maestro-maintenance-chat";
const ALL_MACHINES = "__ALL_MACHINES__";

interface PersistedChat {
  messages: ChatTurn[];
  error: string | null;
}

function isChatTurn(message: unknown): message is ChatTurn {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    (message.role === "user" || message.role === "assistant") &&
    "content" in message &&
    typeof message.content === "string"
  );
}

function loadPersistedChat(): PersistedChat {
  try {
    const savedChat = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!savedChat) return { messages: [], error: null };

    const parsed: unknown = JSON.parse(savedChat);
    if (!Array.isArray(parsed) || !parsed.every(isChatTurn)) {
      return {
        messages: [],
        error: "Riwayat chat tersimpan memiliki format yang tidak valid.",
      };
    }

    return { messages: parsed, error: null };
  } catch (loadError) {
    return {
      messages: [],
      error:
        loadError instanceof Error
          ? `Riwayat chat tidak dapat dibaca: ${loadError.message}`
          : "Riwayat chat tidak dapat dibaca dari penyimpanan browser.",
    };
  }
}

const SUGGESTED_QUESTIONS = [
  "Apa batas kemampuan prediksi kondisi mesin MAESTRO?",
  "Informasi apa yang perlu saya siapkan untuk konsultasi gangguan?",
  "Bagaimana sebaiknya menindaklanjuti hasil CRITICAL?",
];

export const MaintenanceChatbot = () => {
  const { mode } = useOutletContext<{ mode: string }>();
  const [persistedChat] = useState(loadPersistedChat);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState(ALL_MACHINES);
  const [messages, setMessages] = useState<ChatTurn[]>(persistedChat.messages);
  const [chatStorageError, setChatStorageError] = useState<string | null>(
    persistedChat.error,
  );
  const [draft, setDraft] = useState("");
  const [machinesLoaded, setMachinesLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadingMachines = mode === "CONNECTED" && !machinesLoaded;

  const saveMessages = (updatedMessages: ChatTurn[]) => {
    setMessages(updatedMessages);
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(updatedMessages));
      setChatStorageError(null);
    } catch (saveError: unknown) {
      setChatStorageError(
        saveError instanceof Error
          ? `Riwayat chat tidak dapat disimpan: ${saveError.message}`
          : "Riwayat chat tidak dapat disimpan di browser ini.",
      );
    }
  };

  useEffect(() => {
    if (mode !== "CONNECTED") return;
    let active = true;
    apiDataProvider
      .getMachines()
      .then((items) => {
        if (active) setMachines(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Daftar mesin tidak dapat dimuat.",
          );
        }
      })
      .finally(() => {
        if (active) setMachinesLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending || mode !== "CONNECTED") return;

    setDraft("");
    setError(null);
    setSending(true);
    const previousMessages = messages;
    const updatedMessages: ChatTurn[] = [
      ...previousMessages,
      { role: "user", content: message },
    ];
    saveMessages(updatedMessages);

    try {
      const response = await apiDataProvider.chatWithAssistant(
        message,
        machineId === ALL_MACHINES ? undefined : machineId,
        previousMessages.slice(-8),
      );
      saveMessages([
        ...updatedMessages,
        { role: "assistant", content: response.answer },
      ]);
    } catch (chatError) {
      setError(
        chatError instanceof Error
          ? chatError.message
          : "Chatbot tidak dapat menjawab saat ini.",
      );
    } finally {
      setSending(false);
    }
  };

  const submitSuggestion = (question: string) => {
    setDraft(question);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header>
        <h2 className="inline-flex items-center gap-2 border-[3px] border-neo-black bg-neo-blue px-3 py-2 text-2xl uppercase tracking-widest text-white shadow-neo sm:text-3xl">
          <MessageSquareText size={26} />
          Maintenance Chatbot
        </h2>
        <p className="mt-3 max-w-3xl font-mono text-sm text-neo-muted">
          Konsultasi maintenance dengan konteks semua mesin secara default.
          Pilih satu mesin untuk membatasi pertanyaan; jawaban tetap harus
          diverifikasi dengan SOP fasilitas dan teknisi berwenang.
        </p>
      </header>

      {mode !== "CONNECTED" && (
        <div className="border-[3px] border-neo-black bg-neo-yellow p-4 font-mono text-sm font-bold shadow-neo-sm">
          Chatbot memerlukan backend. Ubah Mode Switcher menjadi CONNECTED,
          lalu pastikan backend dan model LLM berjalan.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-[3px] border-neo-black bg-neo-yellow px-4 py-3 font-mono text-sm font-bold shadow-neo-sm"
        >
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      )}

      {chatStorageError && (
        <div
          role="alert"
          className="border-2 border-neo-black bg-neo-yellow px-4 py-3 font-mono text-xs font-bold"
        >
          {chatStorageError} Percakapan mungkin tidak bertahan setelah halaman
          ditutup.
        </div>
      )}

      <section className="neo-card flex h-[calc(100dvh-10rem)] min-h-[480px] max-h-[1100px] min-w-0 flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-neo-black bg-neo-cyan px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot size={20} />
            <div>
              <h3 className="font-black uppercase">Konsultasi MAESTRO</h3>
              <p className="font-mono text-[10px] font-bold">
                RAG DOKUMEN + KONTEKS MESIN BACA-SAJA
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-mono text-xs font-bold">
              <span>CAKUPAN MESIN</span>
              <select
                value={machineId}
                disabled={
                  mode !== "CONNECTED" ||
                  loadingMachines ||
                  machines.length === 0
                }
                onChange={(event) => setMachineId(event.target.value)}
                className="max-w-56 border-2 border-neo-black bg-white px-2 py-1"
              >
                <option value={ALL_MACHINES}>Semua mesin</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.id} — {machine.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                saveMessages([]);
                setError(null);
              }}
              disabled={messages.length === 0 || sending}
              className="flex items-center gap-1 border-2 border-neo-black bg-white px-2 py-1 font-mono text-xs font-black shadow-neo-sm hover:bg-neo-yellow disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} />
              CHAT BARU
            </button>
          </div>
        </div>

        <div
          aria-live="polite"
          className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto bg-neo-bg p-4 sm:p-6"
        >
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl py-8">
              <div className="border-[3px] border-neo-black bg-white p-5 shadow-neo-sm">
                <div className="mb-2 flex items-center gap-2 font-black uppercase">
                  <Bot size={20} /> Asisten maintenance MAESTRO
                </div>
                <p className="font-mono text-sm">
                  Tanyakan tentang dokumen referensi atau alur konsultasi
                  gangguan. Pilih mesin untuk menyertakan pembacaan terbaru,
                  prediksi, dan work order terkait. Informasi tersebut hanya
                  diberikan sebagai konteks baca-saja.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => submitSuggestion(question)}
                      disabled={mode !== "CONNECTED"}
                      className="border-2 border-neo-black bg-neo-cyan px-3 py-2 text-left font-mono text-xs font-bold hover:bg-white disabled:opacity-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`flex min-w-0 gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center border-2 border-neo-black bg-neo-cyan">
                    <Bot size={18} />
                  </div>
                )}
                <div
                  className={`min-w-0 max-w-[85%] break-words border-[3px] border-neo-black p-4 shadow-neo-sm ${
                    message.role === "user" ? "bg-neo-blue text-white" : "bg-white"
                  }`}
                >
                  {message.role === "user" ? (
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-black uppercase">
                      <UserRound size={14} /> Anda
                    </div>
                  ) : (
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-black uppercase">
                      <Bot size={14} /> Asisten MAESTRO
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {message.content}
                  </p>
                </div>
                {message.role === "user" && (
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center border-2 border-neo-black bg-neo-blue text-white">
                    <UserRound size={18} />
                  </div>
                )}
              </article>
            ))
          )}
          {sending && (
            <div className="flex items-center gap-2 font-mono text-xs font-bold">
              <LoaderCircle className="animate-spin" size={16} />
              Mencari referensi dan menyusun jawaban...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event) => void sendMessage(event)}
          className="border-t-[3px] border-neo-black bg-white p-4"
        >
          <label htmlFor="chat-message" className="sr-only">
            Pesan untuk asisten maintenance
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="chat-message"
              rows={2}
              maxLength={2000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Jelaskan gejala, ID mesin, alarm, atau pertanyaan maintenance..."
              disabled={mode !== "CONNECTED" || sending}
              className="min-h-14 flex-1 resize-y border-[3px] border-neo-black bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-neo-blue disabled:bg-neo-silver"
            />
            <button
              type="submit"
              disabled={mode !== "CONNECTED" || sending || !draft.trim()}
              className="flex h-14 items-center justify-center gap-2 border-[3px] border-neo-black bg-neo-blue px-4 font-mono text-xs font-black text-white shadow-neo-sm hover:bg-neo-cyan hover:text-neo-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
              <span className="hidden sm:inline">KIRIM</span>
            </button>
          </div>
          <p className="mt-2 font-mono text-[10px] text-neo-muted">
            Enter untuk kirim · Shift+Enter untuk baris baru · Maksimum 2.000
            karakter
          </p>
        </form>
      </section>

      <p className="flex items-start gap-2 font-mono text-xs text-neo-muted">
        <ShieldAlert className="shrink-0" size={16} />
        Chatbot hanya untuk konsultasi dan tidak mengendalikan mesin. Verifikasi
        sumber, manual OEM, dan SOP resmi; jangan melakukan pekerjaan berbahaya
        berdasarkan jawaban AI saja.
      </p>
    </div>
  );
};
