import { useEffect, useRef, useState } from "react";
import {
  askSponsorAssistant,
  escalateSponsorAssistantQuestion,
  fetchSponsorAssistantSuggestedQuestions,
  type SponsorAssistantSuggestedQuestion,
} from "../api/greenSponsor";
import GpsIcon from "./GpsIcon";
import "../styles/planty-assistant.css";

type ChatMessage = { role: "bot" | "user"; text: string; source?: "faq" | "llm" | null };

const SESSION_STORAGE_KEY = "lc_planty_session_id";
const HISTORY_STORAGE_KEY = "lc_planty_history";
const HINT_DISMISSED_STORAGE_KEY = "lc_planty_hint_dismissed";
const GREETING =
  "Hi, I'm Planty! I'm happy to answer your questions about our trees, reforestation projects, and our commitment to climate protection and biodiversity. How can I help you?";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return `sid-${Date.now()}`;
  }
}

export default function PlantyAssistant() {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sessionId] = useState(getOrCreateSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [{ role: "bot", text: GREETING }];
    try {
      const raw = window.sessionStorage.getItem(HISTORY_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : null;
      if (parsed && Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through to default greeting */
    }
    return [{ role: "bot", text: GREETING }];
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingEscalationQuestion, setPendingEscalationQuestion] = useState<string | null>(null);
  const [escalationFormOpen, setEscalationFormOpen] = useState(false);
  const [escalationName, setEscalationName] = useState("");
  const [escalationEmail, setEscalationEmail] = useState("");
  const [escalationSending, setEscalationSending] = useState(false);
  const [escalationError, setEscalationError] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState<SponsorAssistantSuggestedQuestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchSponsorAssistantSuggestedQuestions()
      .then(setSuggestedQuestions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(HINT_DISMISSED_STORAGE_KEY) === "1";
    } catch {
      /* sessionStorage unavailable — just show the hint */
    }
    if (dismissed) return;
    const timer = window.setTimeout(() => setShowHint(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    try {
      window.sessionStorage.setItem(HINT_DISMISSED_STORAGE_KEY, "1");
    } catch {
      /* sessionStorage unavailable — hint may reappear on next render, harmless */
    }
  };

  const handleOpen = () => {
    setOpen(true);
    dismissHint();
  };

  useEffect(() => {
    try {
      window.sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* sessionStorage unavailable — history just won't persist across reloads */
    }
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const pushMessage = (msg: ChatMessage) => setMessages((current) => [...current, msg]);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setShowSuggestions(false);
    pushMessage({ role: "user", text });
    setSending(true);
    setPendingEscalationQuestion(null);
    setEscalationFormOpen(false);
    try {
      const result = await askSponsorAssistant(text, sessionId);
      pushMessage({ role: "bot", text: result.answer, source: result.source });
      if (!result.matched) {
        setPendingEscalationQuestion(text);
      }
    } catch {
      pushMessage({
        role: "bot",
        text: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
      });
    } finally {
      setSending(false);
    }
  };

  const openEscalationForm = (question: string) => {
    setPendingEscalationQuestion(question);
    setEscalationFormOpen(true);
    setEscalationError("");
  };

  const handleEscalationSubmit = async () => {
    const question = pendingEscalationQuestion || "";
    const name = escalationName.trim();
    const email = escalationEmail.trim();
    if (!email || !question) {
      setEscalationError("Please enter your email so our team can reply.");
      return;
    }
    setEscalationSending(true);
    setEscalationError("");
    try {
      const transcript = messages
        .slice(-10)
        .map((m) => `${m.role === "bot" ? "Planty" : "Visitor"}: ${m.text}`)
        .join("\n");
      await escalateSponsorAssistantQuestion({ sessionId, name, email, question, transcript });
      pushMessage({
        role: "bot",
        text: "Thanks! I've sent your question to our support team — they'll follow up by email soon.",
      });
      setEscalationFormOpen(false);
      setPendingEscalationQuestion(null);
      setEscalationName("");
      setEscalationEmail("");
    } catch {
      setEscalationError("Couldn't send that just now — please try again.");
    } finally {
      setEscalationSending(false);
    }
  };

  return (
    <div className={`planty-widget${open ? " planty-widget--open" : ""}`}>
      {open && (
        <div className="planty-panel" role="dialog" aria-label="Planty sponsor assistant">
          <header className="planty-panel-header">
            <span className="planty-avatar"><GpsIcon name="leaf" className="gps-icon" /></span>
            <span className="planty-panel-title">Planty</span>
            <button type="button" className="planty-collapse-btn" onClick={() => setOpen(false)} aria-label="Minimize chat">
              <GpsIcon name="close" className="gps-icon-inline" />
            </button>
          </header>

          <div className="planty-body" ref={bodyRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`planty-bubble planty-bubble--${msg.role}`}>
                {msg.text}
                {msg.source === "llm" && <span className="planty-ai-tag">AI-assisted answer</span>}
              </div>
            ))}
            {sending && <div className="planty-bubble planty-bubble--bot planty-bubble--typing">Planty is typing…</div>}

            {showSuggestions && !pendingEscalationQuestion && !escalationFormOpen && suggestedQuestions.length > 0 && (
              <div className="planty-suggestions">
                <span className="planty-suggestions-label">Suggested questions</span>
                <div className="planty-suggestions-chips">
                  {suggestedQuestions.map((q) => (
                    <button key={q.key} type="button" className="planty-chip" onClick={() => void handleSend(q.question)}>
                      {q.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pendingEscalationQuestion && !escalationFormOpen && (
              <div className="planty-escalate-cta">
                <span>Want me to send this to our support team? They'll reply by email.</span>
                <div className="planty-escalate-cta-actions">
                  <button type="button" onClick={() => openEscalationForm(pendingEscalationQuestion)}>Yes, contact support</button>
                  <button type="button" className="ghost" onClick={() => setPendingEscalationQuestion(null)}>No thanks</button>
                </div>
              </div>
            )}

            {escalationFormOpen && (
              <div className="planty-escalate-form">
                <strong>We'll email you the answer</strong>
                <input type="text" placeholder="Your name" value={escalationName} onChange={(e) => setEscalationName(e.target.value)} />
                <input type="email" placeholder="Your email" value={escalationEmail} onChange={(e) => setEscalationEmail(e.target.value)} />
                {escalationError && <span className="planty-escalate-error">{escalationError}</span>}
                <div className="planty-escalate-form-actions">
                  <button type="button" onClick={handleEscalationSubmit} disabled={escalationSending}>
                    {escalationSending ? "Sending…" : "Send to Support"}
                  </button>
                  <button type="button" className="ghost" onClick={() => { setEscalationFormOpen(false); setPendingEscalationQuestion(null); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="planty-footer">
            {!pendingEscalationQuestion && !escalationFormOpen && (
              <div className="planty-footer-links">
                <button type="button" className="planty-human-link" onClick={() => openEscalationForm(input.trim() || "General question from the sponsor page")}>
                  <GpsIcon name="user" className="gps-icon-inline" /> Talk to a human
                </button>
                {!showSuggestions && suggestedQuestions.length > 0 && (
                  <button type="button" className="planty-human-link" onClick={() => setShowSuggestions(true)}>
                    <GpsIcon name="sparkle" className="gps-icon-inline" /> Suggested questions
                  </button>
                )}
              </div>
            )}
            <div className="planty-input-row">
              <input
                type="text"
                placeholder="Write a message"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSend(); }}
              />
              <button type="button" className="planty-send-btn" onClick={() => void handleSend()} disabled={sending || !input.trim()} aria-label="Send message">
                <GpsIcon name="arrow-right" className="gps-icon-inline" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!open && showHint && (
        <div className="planty-hint" role="button" tabIndex={0} onClick={handleOpen} onKeyDown={(e) => { if (e.key === "Enter") handleOpen(); }}>
          <span>Need Assistant?</span>
          <button
            type="button"
            className="planty-hint-dismiss"
            aria-label="Dismiss"
            onClick={(e) => { e.stopPropagation(); dismissHint(); }}
          >
            <GpsIcon name="close" className="gps-icon-inline" />
          </button>
        </div>
      )}

      <button
        type="button"
        className="planty-fab"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label={open ? "Close Planty chat" : "Open Planty chat"}
      >
        {open ? <GpsIcon name="close" className="gps-icon" /> : <GpsIcon name="leaf" className="gps-icon" />}
      </button>
    </div>
  );
}
