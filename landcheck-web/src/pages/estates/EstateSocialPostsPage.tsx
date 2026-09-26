import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import { fetchBlobUrl, formatLagos, fromLagosInput, lagosDayKey, toLagosInput } from "../../utils/estateMarketing";
import "../../styles/estate-marketing.css";

type Result = { status: "ok" | "failed" | "pending" | "skipped"; error?: string; url?: string };
type Post = {
  id: number; plan_id?: number | null; plan_name?: string | null; auto_caption: boolean; strategy?: string | null; template_label?: string | null; template_key: string;
  caption: string; channels: string[]; image_style: string; status: string; scheduled_at?: string | null; published_at?: string | null; reminder_sent_at?: string | null;
  results: Record<string, Result>; plot_id?: number | null; source_code?: string | null; created_at: string;
};
type PlanOption = { id: number; name: string; status: string };
type Scope = "upcoming" | "posted" | "attention" | "drafts" | "cancelled" | "all";

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: "upcoming", label: "Upcoming" }, { key: "posted", label: "Posted" }, { key: "attention", label: "Needs attention" },
  { key: "drafts", label: "Drafts" }, { key: "cancelled", label: "Cancelled" }, { key: "all", label: "All" },
];
const CHANNELS: Array<{ key: string; label: string; automatic: boolean }> = [
  { key: "facebook", label: "Facebook Page", automatic: true }, { key: "instagram", label: "Instagram post", automatic: true }, { key: "instagram_story", label: "Instagram story", automatic: true },
  { key: "whatsapp_status", label: "WhatsApp Status", automatic: false }, { key: "other", label: "Other", automatic: false },
];
const CHANNEL_SHORT: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", instagram_story: "Story", whatsapp_status: "WhatsApp Status", other: "Other" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", publishing: "Posting...", published: "Posted", partial: "Partly posted", failed: "Failed", cancelled: "Cancelled", skipped: "Skipped" };
const STATUS_TONE: Record<string, string> = { draft: "neutral", scheduled: "info", publishing: "info", published: "good", partial: "warn", failed: "danger", cancelled: "neutral", skipped: "neutral" };
const EDITABLE = ["draft", "scheduled", "failed", "partial"];

function dayHeading(key: string): string {
  const today = lagosDayKey(new Date().toISOString());
  const tomorrow = lagosDayKey(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  const label = formatLagos(`${key}T12:00:00+01:00`, { weekday: "long", day: "numeric", month: "long" });
  return key === today ? `Today - ${label}` : key === tomorrow ? `Tomorrow - ${label}` : label;
}

function Thumb({ estateId, post, channels }: { estateId: string; post: Post; channels: string[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const channel = channels.find((key) => key === "instagram_story" || key === "whatsapp_status") ? "whatsapp_status" : "facebook";
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    fetchBlobUrl(`/estates/${estateId}/marketing/social/image.png`, { channel, style: post.image_style, plot_id: post.plot_id || undefined, source: post.source_code || undefined }).then((value) => {
      if (cancelled) { URL.revokeObjectURL(value); return; }
      created = value; setUrl(value);
    }).catch(() => undefined);
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [estateId, channel, post.image_style, post.plot_id, post.source_code]);
  return <div className="edash-sp-thumb">{url ? <img src={url} alt="Post image" /> : <span>Preparing image...</span>}</div>;
}

export default function EstateSocialPostsPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getEstateAuthSession();
  const role = String(session?.user.role_key || "").toLowerCase();
  const canManage = ["owner", "manager", "marketer"].includes(role);

  const [estateName, setEstateName] = useState("");
  const [scope, setScope] = useState<Scope>((searchParams.get("scope") as Scope) || "upcoming");
  const [planId, setPlanId] = useState(searchParams.get("plan") || "");
  const [posts, setPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(Number(searchParams.get("post")) || null);
  const [draft, setDraft] = useState<{ caption: string; when: string; channels: string[]; style: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!estateId) return;
    try {
      const response = await api.get<{ items: Post[]; counts: Record<string, number>; plans: PlanOption[] }>(`/estates/${estateId}/marketing/social/posts`, { params: { scope, plan_id: planId || undefined, limit: 200 } });
      setPosts(response.data.items || []); setCounts(response.data.counts || {}); setPlans(response.data.plans || []);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "The posts could not be loaded.")); } finally { setLoading(false); }
  }, [estateId, scope, planId]);

  useEffect(() => { if (estateId) api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data?.name || "")).catch(() => undefined); }, [estateId]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  // A post opened from Message delivery may sit in another tab - find it.
  useEffect(() => {
    const wanted = Number(searchParams.get("post"));
    if (!wanted || !estateId || posts.some((post) => post.id === wanted) || loading) return;
    setScope("all");
  }, [searchParams, posts, loading, estateId]);

  const open = useMemo(() => posts.find((post) => post.id === openId) || null, [posts, openId]);
  const openPost = (post: Post) => {
    if (openId === post.id) { setOpenId(null); setDraft(null); return; }
    setOpenId(post.id);
    setDraft({ caption: post.caption, when: toLagosInput(post.scheduled_at), channels: post.channels, style: post.image_style });
  };
  useEffect(() => { if (open && !draft) setDraft({ caption: open.caption, when: toLagosInput(open.scheduled_at), channels: open.channels, style: open.image_style }); }, [open, draft]);

  const groups = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      const key = post.scheduled_at ? lagosDayKey(post.scheduled_at) : "unscheduled";
      map.set(key, [...(map.get(key) || []), post]);
    }
    return [...map.entries()];
  }, [posts]);

  const run = async (key: string, work: () => Promise<void>, fallback: string) => {
    setBusy(key);
    try { await work(); await load(); } catch (error) { toast.error(await extractApiErrorMessage(error, fallback)); await load(); } finally { setBusy(null); }
  };
  const save = (post: Post) => draft && run(`save-${post.id}`, async () => {
    const payload: Record<string, unknown> = {};
    if (draft.caption.trim() !== post.caption.trim()) payload.caption = draft.caption;
    if (JSON.stringify(draft.channels) !== JSON.stringify(post.channels)) payload.channels = draft.channels;
    if (draft.style !== post.image_style) payload.image_style = draft.style;
    if (draft.when && draft.when !== toLagosInput(post.scheduled_at)) payload.scheduled_at = fromLagosInput(draft.when);
    if (!Object.keys(payload).length) { toast("Nothing changed."); return; }
    await api.patch(`/estates/marketing/social/posts/${post.id}`, payload);
    toast.success("Saved.");
    setDraft(null);
  }, "The changes could not be saved.");
  const rewrite = (post: Post) => run(`rewrite-${post.id}`, async () => {
    const response = await api.post<Post>(`/estates/marketing/social/posts/${post.id}/rewrite`);
    setDraft((current) => (current ? { ...current, caption: response.data.caption } : current));
    toast.success("Another wording, written from today's plot data.");
  }, "There is no other wording for this post.");
  const postNow = (post: Post) => run(`now-${post.id}`, async () => { await api.post(`/estates/marketing/social/posts/${post.id}/publish`); toast.success("Sent."); }, "The post could not be sent.");
  const cancel = (post: Post) => window.confirm("Cancel this post? It will not be sent.") && run(`cancel-${post.id}`, async () => { await api.patch(`/estates/marketing/social/posts/${post.id}`, { cancel: true }); setOpenId(null); setDraft(null); }, "Could not cancel.");
  const markPosted = (post: Post, channel: string) => run(`mark-${post.id}`, async () => { await api.post(`/estates/marketing/social/posts/${post.id}/mark-posted`, { channel }); }, "Could not update the post.");

  if (!estateId) return null;
  const setFilter = (next: Scope) => { setScope(next); setOpenId(null); setDraft(null); const params = new URLSearchParams(searchParams); params.set("scope", next); params.delete("post"); setSearchParams(params, { replace: true }); };

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="marketing">
      <div className="edash-page-head">
        <div>
          <span className="edash-section-kicker">Marketing</span>
          <h1>Scheduled &amp; posted</h1>
          <p>Every post for this estate, day by day. Open any post to change its wording, time, channels or design, send it now, or cancel it. Times are Lagos time.</p>
        </div>
        <button type="button" className="edash-btn-outline" onClick={() => navigate(`/estates/${estateId}/marketing?tab=social`)}><EstateIcon name="megaphone" /> Create posts or a plan</button>
      </div>

      <div className="edash-sp-tabs" role="tablist">
        {SCOPES.map((item) => <button key={item.key} type="button" role="tab" aria-selected={scope === item.key} className={scope === item.key ? "is-active" : ""} onClick={() => setFilter(item.key)}>{item.label}<b>{counts[item.key] ?? 0}</b></button>)}
        {plans.length > 0 && (
          <select value={planId} onChange={(event) => { setPlanId(event.target.value); setOpenId(null); setDraft(null); }} aria-label="Filter by plan">
            <option value="">All plans</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}{plan.status === "paused" ? " (paused)" : ""}</option>)}
          </select>
        )}
      </div>

      {loading ? <div className="edash-card"><div className="edash-card-inner"><p className="edash-mk-empty">Loading posts...</p></div></div> : posts.length === 0 ? (
        <div className="edash-card"><div className="edash-card-inner"><p className="edash-mk-empty">{scope === "upcoming" ? "Nothing is scheduled. " : "No posts in this view. "}<Link to={`/estates/${estateId}/marketing?tab=social`}>Set up an automatic posting plan</Link></p></div></div>
      ) : groups.map(([day, dayPosts]) => (
        <section key={day} className="edash-sp-day">
          <h2>{day === "unscheduled" ? "No time set" : dayHeading(day)}</h2>
          {dayPosts.map((post) => {
            const isOpen = openId === post.id;
            const editable = EDITABLE.includes(post.status) || (["skipped", "cancelled"].includes(post.status));
            const failedResult = Object.values(post.results || {}).find((result) => result.status === "failed" || result.status === "skipped");
            return (
              <article key={post.id} className={`edash-sp-item${isOpen ? " is-open" : ""}`}>
                <button type="button" className="edash-sp-item-head" onClick={() => openPost(post)} aria-expanded={isOpen}>
                  <span className="edash-sp-item-time">{post.scheduled_at ? formatLagos(post.scheduled_at, { hour: "numeric", minute: "2-digit" }) : "-"}</span>
                  <span className="edash-sp-item-main">
                    <span className="edash-sp-item-tags">
                      <span className={`edash-status-pill tone-${STATUS_TONE[post.status] || "neutral"}`}>{STATUS_LABEL[post.status] || post.status}</span>
                      {post.template_label && <span className="edash-sp-tag">{post.strategy ? `${post.strategy} · ` : ""}{post.template_label}</span>}
                      {post.plan_name && <span className="edash-sp-tag">{post.plan_name}</span>}
                      {post.channels.map((key) => { const result = post.results?.[key]; return <span key={key} className={`edash-sp-result is-${result?.status || "waiting"}`}>{CHANNEL_SHORT[key] || key}{result?.status === "ok" ? " ✓" : result?.status === "failed" ? " ✗" : ""}</span>; })}
                    </span>
                    <span className="edash-sp-item-caption">{post.caption}</span>
                    {failedResult?.error && <span className="edash-sp-item-error">{failedResult.error}</span>}
                  </span>
                </button>
                {isOpen && draft && (
                  <div className="edash-sp-editor">
                    <div className="edash-sp-editor-grid">
                      <div className="edash-sp-editor-fields">
                        <label className="edash-field"><span>Caption {post.auto_caption && <em className="edash-sp-count">refreshed from live data before posting</em>}</span>
                          <textarea rows={9} value={draft.caption} maxLength={2200} disabled={!editable || !canManage} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} style={{ fontFamily: "inherit" }} />
                        </label>
                        <div className="edash-mk-form-grid">
                          <label className="edash-field"><span>Goes out (Lagos time)</span><input type="datetime-local" value={draft.when} disabled={!editable || !canManage} onChange={(event) => setDraft({ ...draft, when: event.target.value })} /></label>
                          <label className="edash-field"><span>Design</span>
                            <select value={draft.style} disabled={!editable || !canManage} onChange={(event) => setDraft({ ...draft, style: event.target.value })}><option value="promo">Bright promo</option><option value="luxury">Classic dark</option></select>
                          </label>
                        </div>
                        <div className="edash-field"><span>Post to</span>
                          <div className="edash-sp-when">
                            {CHANNELS.map((channel) => <label key={channel.key}><input type="checkbox" checked={draft.channels.includes(channel.key)} disabled={!editable || !canManage} onChange={() => setDraft({ ...draft, channels: draft.channels.includes(channel.key) ? draft.channels.filter((entry) => entry !== channel.key) : [...draft.channels, channel.key] })} /> {channel.label}</label>)}
                          </div>
                        </div>
                        {Object.entries(post.results || {}).length > 0 && (
                          <div className="edash-sp-post-channels">
                            {Object.entries(post.results).map(([key, result]) => <span key={key} className={`edash-sp-result is-${result.status}`} title={result.error || ""}>{CHANNEL_SHORT[key] || key}: {result.status === "ok" ? "posted" : result.status === "pending" ? "post it yourself" : result.status}{result.url ? <a href={result.url} target="_blank" rel="noreferrer"> view</a> : null}</span>)}
                          </div>
                        )}
                        {canManage && (
                          <div className="edash-sp-actions">
                            {editable && <button type="button" className="edash-btn-primary" disabled={busy === `save-${post.id}`} onClick={() => void save(post)}>{["skipped", "cancelled"].includes(post.status) ? "Reschedule" : "Save changes"}</button>}
                            {EDITABLE.includes(post.status) && post.template_key !== "custom" && <button type="button" className="edash-btn-outline" disabled={busy === `rewrite-${post.id}`} onClick={() => void rewrite(post)}>Try another wording</button>}
                            {EDITABLE.includes(post.status) && post.channels.some((key) => CHANNELS.find((item) => item.key === key)?.automatic) && <button type="button" className="edash-btn-outline" disabled={busy === `now-${post.id}`} onClick={() => void postNow(post)}>{post.status === "failed" || post.status === "partial" ? "Retry now" : "Post now"}</button>}
                            {post.channels.filter((key) => !CHANNELS.find((item) => item.key === key)?.automatic && post.results?.[key]?.status !== "ok").map((key) => <button key={key} type="button" className="edash-btn-outline" onClick={() => void markPosted(post, key)}>Mark {CHANNEL_SHORT[key]} as posted</button>)}
                            {["draft", "scheduled"].includes(post.status) && <button type="button" className="edash-btn-outline" disabled={busy === `cancel-${post.id}`} onClick={() => void cancel(post)}>Cancel post</button>}
                          </div>
                        )}
                      </div>
                      <Thumb estateId={estateId} post={{ ...post, image_style: draft.style }} channels={draft.channels} />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </EstateShell>
  );
}
