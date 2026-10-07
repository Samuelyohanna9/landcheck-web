import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { API_URL, api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import UpgradeNotice from "../../components/estates/UpgradeNotice";
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

type Contact = { id: number; name: string; phone_digits: string; reference?: string | null };

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

type Preset = { key: string; label: string };

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
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [newChatContact, setNewChatContact] = useState<Contact | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [templateDetail, setTemplateDetail] = useState("");
  const [startingChat, setStartingChat] = useState(false);
  const [entitled, setEntitled] = useState<boolean | null>(null);
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
  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}/marketing/social/overview`)
      .then((response) => setEntitled(response.data?.whatsapp_enabled !== false))
      .catch(() => setEntitled(true)); // fail open on an unrelated network error - this isn't the security boundary, the backend still enforces it per action
  }, [estateId]);
  useEffect(() => { if (entitled === false) return; void loadConversations(); }, [loadConversations, entitled]);
  useEffect(() => { if (activePhone) void loadThread(activePhone); }, [activePhone, loadThread]);
  useEffect(() => { threadEndRef.current?.scrollIntoView({ block: "end" }); }, [messages]);
  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}/marketing/social/optins`).then((response) => {
      const list = (response.data?.presets || []) as Preset[];
      setPresets(list);
      if (list[0]) setTemplateKey((current) => current || list[0].key);
    }).catch(() => setPresets([]));
  }, [estateId]);

  useEffect(() => {
    if (!newChatOpen || !estateId) return;
    const handle = window.setTimeout(() => {
      api.get<{ items: Contact[] }>(`/estates/${estateId}/marketing/social/whatsapp/contacts`, { params: { search: contactSearch.trim() || undefined } })
        .then((response) => setContacts(response.data.items || []))
        .catch(() => setContacts([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [newChatOpen, contactSearch, estateId]);

  const openConversation = (phone: string) => {
    setNewChatContact(null);
    setActivePhone(phone);
  };

  const startNewChat = (contact: Contact) => {
    const existing = conversations.find((item) => item.phone_digits === contact.phone_digits);
    setNewChatOpen(false);
    setContactSearch("");
    setTemplateDetail("");
    if (existing) {
      openConversation(contact.phone_digits);
      return;
    }
    setNewChatContact(contact);
    setMessages([]);
    setCanReplyFreely(false);
    setActivePhone(contact.phone_digits);
  };

  const startWithTemplate = async () => {
    const target = active?.customer_id ? { id: active.customer_id } : newChatContact ? { id: newChatContact.id } : null;
    if (!estateId || !target || !templateKey) return;
    setStartingChat(true);
    try {
      await api.post(`/estates/${estateId}/marketing/social/whatsapp/conversations/new`, { customer_id: target.id, preset: templateKey, detail: templateDetail.trim() || undefined });
      toast.success("Message sent.");
      setTemplateDetail("");
      setNewChatContact(null);
      if (activePhone) await loadThread(activePhone);
      await loadConversations();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The message could not be sent."));
    } finally {
      setStartingChat(false);
    }
  };

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

  const listed = conversations.find((item) => item.phone_digits === activePhone) || null;
  const active: Conversation | null = listed || (newChatContact && newChatContact.phone_digits === activePhone
    ? { phone_digits: newChatContact.phone_digits, customer_name: newChatContact.name, customer_id: newChatContact.id, last_message: null, unread_count: 0, can_reply_freely: false }
    : null);

  if (!estateId) return null;

  if (entitled === false) {
    return (
      <EstateShell estateId={estateId} estateName={estateName} activeKey="whatsapp">
        <div className="edash-page-head">
          <div>
            <span className="edash-section-kicker">Marketing</span>
            <h1>WhatsApp</h1>
          </div>
        </div>
        <UpgradeNotice title="Chat with buyers on WhatsApp" message="WhatsApp chat, the conversation inbox and approved template messages are included in the Pro and Enterprise plans." cta="Upgrade to Pro" />
      </EstateShell>
    );
  }

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="whatsapp">
      <div className="edash-page-head">
        <div>
          <span className="edash-section-kicker">Marketing</span>
          <h1>WhatsApp</h1>
          <p>Chats with your customers on WhatsApp. Start a new chat with any customer, or reply to someone who messaged you. Free replies only send within 24 hours of the customer's last message - that's a WhatsApp rule.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="edash-btn-primary" onClick={() => setNewChatOpen((open) => !open)}><EstateIcon name="plus" /> {newChatOpen ? "Close" : "New chat"}</button>
          <button type="button" className="edash-btn-outline" onClick={() => void loadConversations()}><EstateIcon name="activity" /> Refresh</button>
        </div>
      </div>

      <div className="edash-wa-layout">
        <div className="edash-card edash-wa-list">
          <div className="edash-card-inner" style={{ padding: 0 }}>
            {newChatOpen ? (
              <>
                <div style={{ padding: 12 }}>
                  <input className="edash-sms-search" value={contactSearch} placeholder="Search customers by name or number..." onChange={(event) => setContactSearch(event.target.value)} autoFocus />
                </div>
                {contacts.length === 0 ? (
                  <p className="edash-mk-empty" style={{ padding: "0 12px 12px" }}>No customers with a phone number match.</p>
                ) : contacts.map((contact) => (
                  <button key={contact.id} type="button" className="edash-wa-convo" onClick={() => startNewChat(contact)}>
                    <span className="edash-wa-convo-main">
                      <strong>{contact.name}</strong>
                      <small>+{contact.phone_digits}{contact.reference ? ` · ${contact.reference}` : ""}</small>
                    </span>
                  </button>
                ))}
              </>
            ) : loadingList ? (
              <p className="edash-mk-empty">Loading chats...</p>
            ) : conversations.length === 0 && !newChatContact ? (
              <div className="edash-ops-empty"><EstateIcon name="whatsapp" /><strong>No chats yet</strong><span>Click "New chat" to message a customer, or wait for someone to message your number.</span></div>
            ) : (
              [...conversations].map((item) => (
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
              <div className="edash-ops-empty"><EstateIcon name="whatsapp" /><strong>Select a chat</strong><span>Pick someone on the left, or start a new chat.</span></div>
            ) : (
              <>
                <div className="edash-wa-thread-head">
                  <div><strong>{active.customer_name || `+${active.phone_digits}`}</strong><small>+{active.phone_digits}{active.customer_id ? "" : " · not a recorded customer"}</small></div>
                </div>
                <div className="edash-wa-thread-body">
                  {loadingThread ? <p className="edash-mk-empty">Loading...</p> : messages.length === 0 ? (
                    <p className="edash-mk-empty">No messages yet. Send a template below to start the conversation.</p>
                  ) : messages.map((message) => (
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
                  ) : active.customer_id ? (
                    <div className="edash-wa-template-start">
                      <p className="edash-mk-hint" style={{ margin: 0 }}>
                        {messages.length === 0 ? "To start this chat, send an approved message template. " : "It's been more than 24 hours since they last messaged, so only a template can reach them. "}
                        Free replies unlock once they reply.
                      </p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} aria-label="Message template">
                          {presets.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
                        </select>
                        <input value={templateDetail} maxLength={200} placeholder="Detail (optional), e.g. due Friday" onChange={(event) => setTemplateDetail(event.target.value)} style={{ flex: 1, minWidth: 160 }} />
                        <button type="button" className="edash-btn-primary" disabled={startingChat || !templateKey} onClick={() => void startWithTemplate()}>{startingChat ? "Sending..." : messages.length === 0 ? "Start chat" : "Send template"}</button>
                      </div>
                    </div>
                  ) : (
                    <p className="edash-mk-hint">This contact isn't a recorded customer, so a template can't be sent from here. Add them as a customer first.</p>
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
