import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { API_URL, api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import { formatLagos } from "../../utils/estateMarketing";
import "../../styles/estate-marketing.css";

type Conversation = {
  phone_digits: string;
  customer_name?: string | null;
  customer_id?: number | null;
  last_message: { direction: "in" | "out"; type: string; body?: string | null; created_at: string } | null;
  unread_count: number;
  can_reply_freely: boolean;
};

type Message = {
  id: number;
  direction: "in" | "out";
  type: string;
  body?: string | null;
  has_media: boolean;
  media_url?: string | null;
  status: string;
  created_at: string;
  read_by_staff_at?: string | null;
};

function MessageTicks({ status }: { status: string }) {
  if (status === "failed") return null;
  const double = status === "delivered" || status === "read";
  const color = status === "read" ? "#53bdeb" : "currentColor";
  return (
    <svg className="edash-wa-tick" width={double ? "17" : "12"} height="11" viewBox={double ? "0 0 17 11" : "0 0 12 11"} fill="none" aria-hidden="true">
      <path d="M1 5.5 4 8.5 9.5 1.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      {double && <path d="M6 5.5 9 8.5 14.5 1.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function MessageMedia({ message }: { message: Message }) {
  if (!message.has_media || !message.media_url) return null;
  const src = `${API_URL}${message.media_url}`;
  if (message.type === "image") return <img className="edash-wa-media-image" src={src} alt="Attachment" />;
  return <a className="edash-wa-media-file" href={src} target="_blank" rel="noreferrer"><EstateIcon name="documents" /> {message.type === "document" ? "Open document" : message.type === "audio" ? "Play audio" : message.type === "video" ? "Play video" : "Open attachment"}</a>;
}

export default function EstateWhatsappInboxPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("Estate");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canReplyFreely, setCanReplyFreely] = useState(false);
  const [reply, setReply] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadConversations = useCallback(async () => {
    if (!estateId) return;
    try {
      const response = await api.get<{ items: Conversation[] }>(`/estates/${estateId}/marketing/social/whatsapp/conversations`);
      setConversations(response.data.items || []);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Conversations could not be loaded."));
    } finally {
      setLoadingList(false);
    }
  }, [estateId]);

  const loadThread = useCallback(async (phone: string) => {
    if (!estateId) return;
    setLoadingThread(true);
    try {
      const response = await api.get<{ items: Message[]; can_reply_freely: boolean }>(`/estates/${estateId}/marketing/social/whatsapp/conversations/${phone}/messages`);
      setMessages(response.data.items || []);
      setCanReplyFreely(Boolean(response.data.can_reply_freely));
      setConversations((current) => current.map((item) => (item.phone_digits === phone ? { ...item, unread_count: 0 } : item)));
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "This conversation could not be loaded."));
    } finally {
      setLoadingThread(false);
    }
  }, [estateId]);

  useEffect(() => { if (estateId) api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data?.name || "Estate")).catch(() => undefined); }, [estateId]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { if (activePhone) void loadThread(activePhone); }, [activePhone, loadThread]);
  useEffect(() => { threadEndRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const openConversation = (phone: string) => setActivePhone(phone);

  const sendReply = async () => {
    if (!estateId || !activePhone) return;
    if (attachedFile) { await sendMediaReply(); return; }
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/estates/${estateId}/marketing/social/whatsapp/conversations/${activePhone}/reply`, { body: reply.trim() });
      setReply("");
      await loadThread(activePhone);
      await loadConversations();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The reply could not be sent."));
    } finally {
      setSending(false);
    }
  };

  const sendMediaReply = async () => {
    if (!estateId || !activePhone || !attachedFile) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("file", attachedFile);
      form.append("caption", reply.trim());
      await api.post(`/estates/${estateId}/marketing/social/whatsapp/conversations/${activePhone}/reply-media`, form);
      setReply("");
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadThread(activePhone);
      await loadConversations();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The file could not be sent."));
    } finally {
      setSending(false);
    }
  };

  const onFilePicked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > 16 * 1024 * 1024) { toast.error("This file is too large to send over WhatsApp."); return; }
    setAttachedFile(file);
  };

  const active = conversations.find((item) => item.phone_digits === activePhone) || null;

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="whatsapp">
      <div className="edash-page-head">
        <div>
          <span className="edash-section-kicker">Marketing</span>
          <h1>WhatsApp Inbox</h1>
          <p>Conversations from customers and opted-in contacts who messaged this estate's WhatsApp number. Replies only send within 24 hours of their last message - that's a WhatsApp rule, not ours.</p>
        </div>
        <button type="button" className="edash-btn-outline" onClick={() => void loadConversations()}><EstateIcon name="activity" /> Refresh</button>
      </div>

      <div className="edash-wa-layout">
        <div className="edash-card edash-wa-list">
          <div className="edash-card-inner" style={{ padding: 0 }}>
            {loadingList ? (
              <p className="edash-mk-empty">Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <div className="edash-ops-empty"><EstateIcon name="whatsapp" /><strong>No conversations yet</strong><span>Messages from customers who text this estate's WhatsApp number will appear here.</span></div>
            ) : (
              conversations.map((item) => (
                <button key={item.phone_digits} type="button" className={`edash-wa-convo${activePhone === item.phone_digits ? " is-active" : ""}`} onClick={() => openConversation(item.phone_digits)}>
                  <span className="edash-wa-convo-main">
                    <strong>{item.customer_name || `+${item.phone_digits}`}</strong>
                    <small>{item.last_message ? `${item.last_message.direction === "out" ? "You: " : ""}${item.last_message.body || (item.last_message.type !== "text" ? `[${item.last_message.type}]` : "")}` : ""}</small>
                  </span>
                  <span className="edash-wa-convo-meta">
                    {item.last_message && <small>{formatLagos(item.last_message.created_at, { hour: "numeric", minute: "2-digit" })}</small>}
                    {item.unread_count > 0 && <span className="edash-nav-badge">{item.unread_count}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="edash-card edash-wa-thread">
          <div className="edash-card-inner" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {!active ? (
              <div className="edash-ops-empty"><EstateIcon name="whatsapp" /><strong>Select a conversation</strong><span>Pick someone on the left to read and reply.</span></div>
            ) : (
              <>
                <div className="edash-wa-thread-head">
                  <div><strong>{active.customer_name || `+${active.phone_digits}`}</strong><small>+{active.phone_digits}{active.customer_id ? "" : " · not a recorded customer"}</small></div>
                </div>
                <div className="edash-wa-thread-body">
                  {loadingThread ? <p className="edash-mk-empty">Loading...</p> : messages.map((message) => (
                    <div key={message.id} className={`edash-wa-bubble is-${message.direction}`}>
                      {message.body && <p>{message.body}</p>}
                      <MessageMedia message={message} />
                      <small className="edash-wa-bubble-meta">
                        {formatLagos(message.created_at, { hour: "numeric", minute: "2-digit" })}{message.status === "failed" ? " · failed to send" : ""}
                        {message.direction === "out" && <MessageTicks status={message.status} />}
                      </small>
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>
                <div className="edash-wa-reply">
                  {canReplyFreely ? (
                    <>
                      <input ref={fileInputRef} type="file" hidden onChange={onFilePicked} accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" />
                      <button type="button" className="edash-wa-attach-btn" disabled={sending} onClick={() => fileInputRef.current?.click()} aria-label="Attach a photo or document" title="Attach a photo or document">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.5 7.5 9 16a3 3 0 1 1-4.2-4.2l8.5-8.5a2 2 0 1 1 2.8 2.8L7.6 14.6a1 1 0 1 1-1.4-1.4l7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <div className="edash-wa-reply-input">
                        {attachedFile && (
                          <div className="edash-wa-attachment-chip">
                            <span>{attachedFile.name}</span>
                            <button type="button" onClick={() => { setAttachedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} aria-label="Remove attachment">×</button>
                          </div>
                        )}
                        <textarea rows={2} value={reply} placeholder={attachedFile ? "Add a caption (optional)..." : "Type a reply..."} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendReply(); } }} />
                      </div>
                      <button type="button" className="edash-btn-primary" disabled={sending || (!reply.trim() && !attachedFile)} onClick={() => void sendReply()}>{sending ? "Sending..." : "Send"}</button>
                    </>
                  ) : (
                    <p className="edash-mk-hint">It's been more than 24 hours since {active.customer_name || "this contact"} last messaged - a free reply can't reach them now. Send a template message instead from their customer record, or wait for them to message again.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </EstateShell>
  );
}
