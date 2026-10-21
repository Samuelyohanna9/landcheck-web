import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import { AD_STYLES, fetchBlobUrl, formatLagos, fromLagosInput, lagosDayKey, toLagosInput } from "../../utils/estateMarketing";
import "../../styles/estate-marketing.css";

type Engagement = { id?: string; name: string; message?: string; created_time?: string; likes?: number };
type Stats = { likes: number; comments: number; shares?: number; comment_list?: Engagement[]; reaction_list?: { name: string; type: string }[]; unavailable?: string | null };
type Result = { status: "ok" | "failed" | "pending" | "skipped" | "deleted"; error?: string; url?: string; stats?: Stats; stats_fetched_at?: string; deleted_at?: string };
type Post = {
  id: number; plan_id?: number | null; plan_name?: string | null; auto_caption: boolean; strategy?: string | null; template_label?: string | null; template_key: string;
  caption: string; channels: string[]; image_style: string; include_media: boolean; status: string; scheduled_at?: string | null; published_at?: string | null; reminder_sent_at?: string | null;
  results: Record<string, Result>; plot_id?: number | null; source_code?: string | null; created_at: string; custom_image_proxy_url?: string | null;
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
// Instagram's publish is create-container -> poll-until-processed -> publish, which can run past the
// api client's default 30s timeout on a cold image render - the post still goes through on Meta's
// side even after the client times out, which would otherwise look like a failure when it wasn't.
const PUBLISH_TIMEOUT_MS = 90000;
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
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const channel = channels.find((key) => key === "instagram_story" || key === "whatsapp_status") ? "whatsapp_status" : "facebook";
  const customUrl = post.custom_image_proxy_url || null;
  useEffect(() => {
    if (!post.include_media || customUrl) { setUrl(null); setErrorReason(null); return undefined; }
    let cancelled = false;
    let created: string | null = null;
    setUrl(null);
    setErrorReason(null);
    fetchBlobUrl(`/estates/${estateId}/marketing/social/image.png`, { channel, style: post.image_style, plot_id: post.plot_id || undefined, source: post.source_code || undefined }).then((value) => {
      if (cancelled) { URL.revokeObjectURL(value); return; }
      created = value; setUrl(value);
    }).catch(async (error) => { if (!cancelled) setErrorReason(await extractApiErrorMessage(error, "Image could not be generated.")); });
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [estateId, channel, post.image_style, post.plot_id, post.source_code, post.include_media, customUrl]);
  if (!post.include_media) return <div className="edash-sp-thumb"><span>Text-only post - no image</span></div>;
  if (customUrl) return <div className="edash-sp-thumb"><img src={customUrl} alt="Post image" /></div>;
  return <div className="edash-sp-thumb">{url ? <img src={url} alt="Post image" /> : errorReason ? <span className="edash-sp-thumb-error">{errorReason}</span> : <span>Preparing image...</span>}</div>;
}

export default function EstateSocialPostsPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getEstateAuthSession();
  const role = String(session?.user.role_key || "").toLowerCase();
  const canManage = ["owner", "manager", "marketer"].includes(role);

  const [estateName, setEstateName] = useState("");
  const [scope, setScope] = useState<Scope>((searchParams.get("scope") as Scope) || (searchParams.get("view") === "feed" ? "posted" : "upcoming"));
  const [planId, setPlanId] = useState(searchParams.get("plan") || "");
  const [posts, setPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(Number(searchParams.get("post")) || null);
  const [draft, setDraft] = useState<{ caption: string; when: string; channels: string[]; style: string; includeMedia: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"manage" | "feed">((searchParams.get("view") as "manage" | "feed") || "manage");
  const previousScopeRef = useRef<Scope>(scope);
  const [clearingAll, setClearingAll] = useState(false);
  const [clearProgress, setClearProgress] = useState<{ done: number; total: number } | null>(null);

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
    setDraft({ caption: post.caption, when: toLagosInput(post.scheduled_at), channels: post.channels, style: post.image_style, includeMedia: post.include_media });
  };
  useEffect(() => { if (open && !draft) setDraft({ caption: open.caption, when: toLagosInput(open.scheduled_at), channels: open.channels, style: open.image_style, includeMedia: open.include_media }); }, [open, draft]);

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
    if (draft.includeMedia !== post.include_media) payload.include_media = draft.includeMedia;
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
  const postNow = (post: Post) => run(`now-${post.id}`, async () => { await api.post(`/estates/marketing/social/posts/${post.id}/publish`, undefined, { timeout: PUBLISH_TIMEOUT_MS }); toast.success("Sent."); }, "The post could not be sent.");
  const cancel = (post: Post) => window.confirm("Cancel this post? It will not be sent.") && run(`cancel-${post.id}`, async () => { await api.patch(`/estates/marketing/social/posts/${post.id}`, { cancel: true }); setOpenId(null); setDraft(null); }, "Could not cancel.");
  const markPosted = (post: Post, channel: string) => run(`mark-${post.id}`, async () => { await api.post(`/estates/marketing/social/posts/${post.id}/mark-posted`, { channel }); }, "Could not update the post.");
  const deleteFromChannel = (post: Post, channel: string) => window.confirm(`Delete this post from ${CHANNEL_SHORT[channel] || channel}? This removes it from the live Page/account - it can't be undone.`) && run(`delete-${post.id}-${channel}`, async () => {
    try {
      await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/delete`);
      toast.success(`Removed from ${CHANNEL_SHORT[channel] || channel}.`);
    } catch (error) {
      const reason = await extractApiErrorMessage(error, "The post could not be deleted.");
      if (window.confirm(`${reason}\n\nRemove it from LandCheck's dashboard anyway? The live post may still exist on ${CHANNEL_SHORT[channel] || channel} - this only clears LandCheck's own record of it.`)) {
        await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/remove-from-dashboard`);
        toast.success("Removed from LandCheck's dashboard.");
      }
    }
  }, "The post could not be deleted.");
  const removeFromDashboardOnly = (post: Post, channel: string) => window.confirm(`Remove this from LandCheck's dashboard? The live post is NOT deleted from ${CHANNEL_SHORT[channel] || channel} - this only clears LandCheck's own record.`) && run(`remove-${post.id}-${channel}`, async () => { await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/remove-from-dashboard`); toast.success("Removed from LandCheck's dashboard."); }, "Could not remove this from the dashboard.");
  const likeTarget = (post: Post, channel: string, targetId?: string) => run(`like-${post.id}-${channel}-${targetId || "post"}`, async () => {
    await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/like`, targetId ? { target_id: targetId } : {});
    toast.success(targetId ? "Comment liked." : "Post liked.");
  }, "The like could not be added.");
  const postComment = (post: Post, channel: string, message: string, replyToId?: string) => run(`comment-${post.id}-${channel}-${replyToId || "post"}`, async () => {
    await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/comment`, { message, reply_to_id: replyToId || null });
    toast.success(replyToId ? "Reply posted." : "Comment posted.");
    setCommentDraft((current) => ({ ...current, [`${post.id}-${channel}-${replyToId || "post"}`]: "" }));
    setReplyingTo(null);
    await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/refresh-stats`);
  }, "The comment could not be posted.");
  const refreshStats = (post: Post, channel: string) => run(`stats-${post.id}-${channel}`, async () => { await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/refresh-stats`); }, "Engagement stats could not be loaded.");

  if (!estateId) return null;
  const setFilter = (next: Scope) => { setScope(next); setOpenId(null); setDraft(null); const params = new URLSearchParams(searchParams); params.set("scope", next); params.delete("post"); setSearchParams(params, { replace: true }); };

  // Published posts on Facebook/Instagram, one feed card per platform per post - the "Posted"
  // scope's own data, just surfaced as its own prominent tab instead of being one filter chip
  // among drafts/scheduled/cancelled, and laid out like a real social feed rather than an
  // administrative row list.
  const feedItems = useMemo(() => {
    const items: Array<{ post: Post; channel: string; result: Result }> = [];
    for (const post of posts) {
      for (const channel of post.channels) {
        const result = post.results?.[channel];
        if ((channel === "facebook" || channel === "instagram") && result?.status === "ok") items.push({ post, channel, result });
      }
    }
    return items.sort((a, b) => new Date(b.post.published_at || b.post.created_at).getTime() - new Date(a.post.published_at || a.post.created_at).getTime());
  }, [posts]);

  const clearAllFeedPosts = async () => {
    if (!feedItems.length || clearingAll) return;
    const typed = window.prompt(`This deletes all ${feedItems.length} post${feedItems.length === 1 ? "" : "s"} shown here from your live Facebook Page and Instagram account where possible. Any that can't be deleted live (e.g. an expired connection) are removed from LandCheck's dashboard anyway, so this view ends up empty either way. This cannot be undone.\n\nType DELETE to confirm.`);
    if (typed !== "DELETE") return;
    setClearingAll(true);
    setClearProgress({ done: 0, total: feedItems.length });
    let removedLocally = 0;
    for (let index = 0; index < feedItems.length; index += 1) {
      const { post, channel } = feedItems[index];
      try {
        await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/delete`);
      } catch {
        // Live deletion failed (stale token, already removed on the platform, etc.) - guarantee
        // the dashboard still ends up clear, which is the whole point of "Clear all".
        try {
          await api.post(`/estates/marketing/social/posts/${post.id}/channels/${channel}/remove-from-dashboard`);
          removedLocally += 1;
        } catch {
          // If even this fails, leave the item - load() below will show it still present.
        }
      }
      setClearProgress({ done: index + 1, total: feedItems.length });
    }
    setClearingAll(false);
    setClearProgress(null);
    await load();
    if (removedLocally) toast.success(`Cleared. ${removedLocally} post${removedLocally === 1 ? "" : "s"} could not be confirmed deleted live, so ${removedLocally === 1 ? "it was" : "they were"} removed from LandCheck's dashboard only.`);
    else toast.success("All posts cleared.");
  };

  const setView = (mode: "manage" | "feed") => {
    if (mode === "feed" && viewMode !== "feed") { previousScopeRef.current = scope; setFilter("posted"); }
    else if (mode === "manage" && viewMode !== "manage") setFilter(previousScopeRef.current === "posted" ? "upcoming" : previousScopeRef.current);
    setViewMode(mode);
    const params = new URLSearchParams(searchParams);
    params.set("view", mode);
    setSearchParams(params, { replace: true });
  };

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [
        {
          key: "create",
          label: "Create",
          buttons: [{ key: "create-posts", label: "Create Posts or Plan", icon: "megaphone", onClick: () => navigate(`/estates/${estateId}/marketing?tab=social`) }],
        },
        { key: "data", label: "Data", buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: () => void load() }] },
      ],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="marketing">
      <EstateRibbon tabs={ribbonTabs} />
      <div className="edash-page-head">
        <div>
          <button type="button" className="edash-sp-back" onClick={() => navigate(`/estates/${estateId}/marketing?tab=social`)}><EstateIcon name="chevron-left" /> Back to Marketing</button>
          <span className="edash-section-kicker">Marketing</span>
          <h1>Scheduled &amp; posted</h1>
          <p>Every post for this estate, day by day. Open any post to change its wording, time, channels or design, send it now, or cancel it. Times are Lagos time.</p>
        </div>
      </div>

      <div className="edash-view-toggle" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "0 0 14px" }}>
        <button type="button" className={viewMode === "manage" ? "edash-btn-primary" : "edash-btn-outline"} onClick={() => setView("manage")}>Manage posts</button>
        <button type="button" className={viewMode === "feed" ? "edash-btn-primary" : "edash-btn-outline"} onClick={() => setView("feed")}>Facebook &amp; Instagram Feed</button>
        {viewMode === "feed" && canManage && feedItems.length > 0 && (
          <button type="button" className="edash-btn-outline" style={{ marginLeft: "auto", color: "var(--edash-danger)" }} disabled={clearingAll} onClick={() => void clearAllFeedPosts()}>
            {clearingAll ? `Clearing ${clearProgress?.done ?? 0} of ${clearProgress?.total ?? feedItems.length}...` : `Clear all (${feedItems.length})`}
          </button>
        )}
      </div>

      {viewMode === "manage" && (
        <div className="edash-sp-tabs" role="tablist">
          {SCOPES.map((item) => <button key={item.key} type="button" role="tab" aria-selected={scope === item.key} className={scope === item.key ? "is-active" : ""} onClick={() => setFilter(item.key)}>{item.label}<b>{counts[item.key] ?? 0}</b></button>)}
          {plans.length > 0 && (
            <select value={planId} onChange={(event) => { setPlanId(event.target.value); setOpenId(null); setDraft(null); }} aria-label="Filter by plan">
              <option value="">All plans</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}{plan.status === "paused" ? " (paused)" : ""}</option>)}
            </select>
          )}
        </div>
      )}

      {viewMode === "feed" ? (
        loading ? (
          <div className="edash-card"><div className="edash-card-inner"><p className="edash-mk-empty">Loading feed...</p></div></div>
        ) : feedItems.length === 0 ? (
          <div className="edash-card"><div className="edash-card-inner"><p className="edash-mk-empty">Nothing published yet. Posts you send to Facebook or Instagram will appear here like a real feed.</p></div></div>
        ) : (
          <div className="edash-sp-feed">
            {feedItems.map(({ post, channel, result }) => {
              const stats = result.stats;
              const draftKey = `${post.id}-${channel}-post`;
              return (
                <article key={`${post.id}-${channel}`} className="edash-sp-feed-card">
                  <header className="edash-sp-feed-head">
                    <span className={`edash-sp-feed-avatar is-${channel}`}>{channel === "facebook" ? "f" : "IG"}</span>
                    <div>
                      <strong>{CHANNEL_SHORT[channel]}</strong>
                      <small>{post.published_at ? formatLagos(post.published_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}</small>
                    </div>
                  </header>
                  <Thumb estateId={estateId} post={post} channels={[channel]} />
                  <p className="edash-sp-feed-caption">{post.caption}</p>
                  <div className="edash-sp-feed-statline">
                    <button type="button" className="edash-card-link" title={`Fetch the latest likes, comments and shares for this post from your live ${CHANNEL_SHORT[channel]} account`} disabled={busy === `stats-${post.id}-${channel}`} onClick={() => void refreshStats(post, channel)}>
                      {busy === `stats-${post.id}-${channel}` ? "Loading..." : stats ? "Refresh" : "Load stats"}
                    </button>
                    {stats && <span>{stats.likes ?? 0} likes · {stats.comments ?? 0} comments{stats.shares !== undefined ? ` · ${stats.shares} shares` : ""}</span>}
                  </div>
                  {canManage && (
                    <div className="edash-sp-feed-actions">
                      {channel === "facebook" && <button type="button" className="edash-btn-outline" title="Like this post on your live Facebook Page" disabled={busy === `like-${post.id}-${channel}-post`} onClick={() => void likeTarget(post, channel)}>Like</button>}
                      <button type="button" className="edash-btn-outline is-danger" title={`Remove this post from your live ${CHANNEL_SHORT[channel]} account - this can't be undone`} disabled={busy === `delete-${post.id}-${channel}`} onClick={() => void deleteFromChannel(post, channel)}>{busy === `delete-${post.id}-${channel}` ? "Deleting..." : "Delete"}</button>
                      <button type="button" className="edash-card-link" title={`Remove this from LandCheck's dashboard only - the live post on ${CHANNEL_SHORT[channel]} is NOT deleted`} disabled={busy === `remove-${post.id}-${channel}`} onClick={() => void removeFromDashboardOnly(post, channel)}>{busy === `remove-${post.id}-${channel}` ? "Removing..." : "Hide from dashboard"}</button>
                    </div>
                  )}
                  {stats?.comment_list && stats.comment_list.length > 0 && (
                    <div className="edash-sp-feed-comments">
                      {stats.comment_list.map((comment, index) => {
                        const replyKey = `${post.id}-${channel}-${comment.id}`;
                        return (
                          <div key={index} className="edash-sp-feed-comment">
                            <strong>{comment.name}</strong> <span>{comment.message}</span>
                            {comment.id && canManage && (
                              <div className="edash-sp-feed-comment-actions">
                                {channel === "facebook" && <button type="button" className="edash-sp-link-btn" title="Like this commenter's comment on your live Facebook Page" onClick={() => void likeTarget(post, channel, comment.id)}>Like</button>}
                                <button type="button" className="edash-sp-link-btn" title={`Write and publish a reply to ${comment.name}'s comment on your live ${CHANNEL_SHORT[channel]} post`} onClick={() => setReplyingTo(replyingTo === replyKey ? null : replyKey)}>Reply</button>
                              </div>
                            )}
                            {comment.id && replyingTo === replyKey && (
                              <div className="edash-sp-comment-box edash-sp-reply-box">
                                <textarea rows={2} maxLength={2200} placeholder={`Reply to ${comment.name}...`} value={commentDraft[replyKey] || ""} onChange={(event) => setCommentDraft((current) => ({ ...current, [replyKey]: event.target.value }))} />
                                <button type="button" className="edash-btn-outline" title={`Publish this reply to ${comment.name}'s comment on your live ${CHANNEL_SHORT[channel]} account`} disabled={!(commentDraft[replyKey] || "").trim()} onClick={() => void postComment(post, channel, (commentDraft[replyKey] || "").trim(), comment.id)}>Send reply</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {canManage && (
                    <div className="edash-sp-comment-box">
                      <textarea rows={2} maxLength={2200} placeholder="Write a comment on this post..." value={commentDraft[draftKey] || ""} onChange={(event) => setCommentDraft((current) => ({ ...current, [draftKey]: event.target.value }))} />
                      <button type="button" className="edash-btn-outline" title={`Publish this comment on your live ${CHANNEL_SHORT[channel]} post`} disabled={busy === `comment-${post.id}-${channel}-post` || !(commentDraft[draftKey] || "").trim()} onClick={() => void postComment(post, channel, (commentDraft[draftKey] || "").trim())}>Post comment</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )
      ) : loading ? <div className="edash-card"><div className="edash-card-inner"><p className="edash-mk-empty">Loading posts...</p></div></div> : posts.length === 0 ? (
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
                          <label className="edash-field"><span>Image</span>
                            <select value={draft.includeMedia ? "1" : "0"} disabled={!editable || !canManage} onChange={(event) => { const includeMedia = event.target.value === "1"; setDraft({ ...draft, includeMedia, channels: includeMedia ? draft.channels : draft.channels.filter((key) => key !== "instagram" && key !== "instagram_story") }); }}>
                              <option value="1">With image</option>
                              <option value="0">Text only</option>
                            </select>
                          </label>
                          {draft.includeMedia && <label className="edash-field"><span>Design</span>
                            <select value={draft.style} disabled={!editable || !canManage} onChange={(event) => setDraft({ ...draft, style: event.target.value })}>{AD_STYLES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
                          </label>}
                        </div>
                        <div className="edash-field"><span>Post to</span>
                          <div className="edash-sp-when">
                            {CHANNELS.map((channel) => {
                              const imageOnlyChannel = !draft.includeMedia && (channel.key === "instagram" || channel.key === "instagram_story");
                              return <label key={channel.key} className={imageOnlyChannel ? "is-disabled" : undefined}><input type="checkbox" checked={draft.channels.includes(channel.key)} disabled={!editable || !canManage || imageOnlyChannel} onChange={() => setDraft({ ...draft, channels: draft.channels.includes(channel.key) ? draft.channels.filter((entry) => entry !== channel.key) : [...draft.channels, channel.key] })} /> {channel.label}{imageOnlyChannel ? " (needs an image)" : ""}</label>;
                            })}
                          </div>
                        </div>
                        {Object.entries(post.results || {}).length > 0 && (
                          <div className="edash-sp-post-channels">
                            {Object.entries(post.results).map(([key, result]) => {
                              const automatic = CHANNELS.find((item) => item.key === key)?.automatic;
                              return (
                                <div key={key} className="edash-sp-result-row">
                                  <span className={`edash-sp-result is-${result.status}`} title={result.error || ""}>
                                    {CHANNEL_SHORT[key] || key}: {result.status === "ok" ? "posted" : result.status === "pending" ? "post it yourself" : result.status === "deleted" ? "removed" : result.status}
                                    {result.url ? <a href={result.url} target="_blank" rel="noreferrer"> view</a> : null}
                                  </span>
                                  {result.stats && (
                                    <div className="edash-sp-engagement">
                                      <span className="edash-sp-stats">{result.stats.likes} likes · {result.stats.comments} comments{typeof result.stats.shares === "number" ? ` · ${result.stats.shares} shares` : ""}</span>
                                      {result.stats.unavailable && <small className="edash-sp-stats">{result.stats.unavailable}</small>}
                                      {(result.stats.comment_list || []).length > 0 && (
                                        <details className="edash-sp-details-list">
                                          <summary>Comments ({result.stats.comment_list?.length})</summary>
                                          {result.stats.comment_list?.map((comment, index) => (
                                            <div key={index}>
                                              <div className="edash-sp-engagement-row"><strong>{comment.name}</strong><span>{comment.message}</span>{comment.created_time && <small>{formatLagos(comment.created_time, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small>}{comment.id && (key === "facebook" || key === "instagram") && (<>
{key === "facebook" && <button type="button" className="edash-sp-link-btn" title="Like this commenter's comment on your live Facebook Page" onClick={() => void likeTarget(post, key, comment.id)}>Like</button>}<button type="button" className="edash-sp-link-btn" title={`Write and publish a reply to ${comment.name}'s comment, visible on your live ${CHANNEL_SHORT[key] || key} post`} onClick={() => setReplyingTo(replyingTo === `${post.id}-${key}-${comment.id}` ? null : `${post.id}-${key}-${comment.id}`)}>Reply</button>
</>)}</div>
                                              {comment.id && replyingTo === `${post.id}-${key}-${comment.id}` && (
                                                <div className="edash-sp-comment-box edash-sp-reply-box">
                                                  <textarea rows={2} maxLength={2200} placeholder={`Reply to ${comment.name}...`} value={commentDraft[`${post.id}-${key}-${comment.id}`] || ""} onChange={(event) => setCommentDraft((current) => ({ ...current, [`${post.id}-${key}-${comment.id}`]: event.target.value }))} />
                                                  <button type="button" className="edash-btn-outline" title={`Publish this reply to ${comment.name}'s comment on your live ${CHANNEL_SHORT[key] || key} account`} disabled={!(commentDraft[`${post.id}-${key}-${comment.id}`] || "").trim()} onClick={() => void postComment(post, key, (commentDraft[`${post.id}-${key}-${comment.id}`] || "").trim(), comment.id)}>Send reply</button>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </details>
                                      )}
                                      {(result.stats.reaction_list || []).length > 0 && (
                                        <details className="edash-sp-details-list">
                                          <summary>Reactions ({result.stats.reaction_list?.length})</summary>
                                          {result.stats.reaction_list?.map((reaction, index) => (
                                            <div key={index} className="edash-sp-engagement-row"><strong>{reaction.name}</strong><span>{reaction.type.toLowerCase()}</span></div>
                                          ))}
                                        </details>
                                      )}
                                    </div>
                                  )}
                            {(key === "facebook" || key === "instagram") && result.status === "ok" && canManage && (
                                  <div className="edash-sp-comment-box">
                                    <textarea rows={2} maxLength={2200} placeholder="Write a comment on this post..." value={commentDraft[`${post.id}-${key}-post`] || ""} onChange={(event) => setCommentDraft((current) => ({ ...current, [`${post.id}-${key}-post`]: event.target.value }))} />
                                    <button type="button" className="edash-btn-outline" title={`Publish this comment on your live ${CHANNEL_SHORT[key] || key} post`} disabled={busy === `comment-${post.id}-${key}-post` || !(commentDraft[`${post.id}-${key}-post`] || "").trim()} onClick={() => void postComment(post, key, (commentDraft[`${post.id}-${key}-post`] || "").trim())}>Post comment</button>
                                  </div>
                                )}
                                  {automatic && result.status === "ok" && canManage && (
                                    <span className="edash-sp-result-actions">
                                      <button type="button" className="edash-sp-link-btn" title={`Fetch the latest likes, comments and shares for this post from your live ${CHANNEL_SHORT[key] || key} account`} disabled={busy === `stats-${post.id}-${key}`} onClick={() => void refreshStats(post, key)}>{busy === `stats-${post.id}-${key}` ? "Loading..." : result.stats ? "Refresh stats" : "Load stats"}</button>
                                      {key === "facebook" && <button type="button" className="edash-sp-link-btn" title="Like this post on your live Facebook Page" disabled={busy === `like-${post.id}-${key}-post`} onClick={() => void likeTarget(post, key)}>Like post</button>}
                                  <button type="button" className="edash-sp-link-btn is-danger" title={`Remove this post from your live ${CHANNEL_SHORT[key] || key} account - this can't be undone`} disabled={busy === `delete-${post.id}-${key}`} onClick={() => void deleteFromChannel(post, key)}>{busy === `delete-${post.id}-${key}` ? "Deleting..." : "Delete"}</button>
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {canManage && (
                          <div className="edash-sp-actions">
                            {editable && <button type="button" className="edash-btn-primary" disabled={busy === `save-${post.id}`} onClick={() => void save(post)}>{["skipped", "cancelled"].includes(post.status) ? "Reschedule" : "Save changes"}</button>}
                            {EDITABLE.includes(post.status) && post.template_key !== "custom" && <button type="button" className="edash-btn-outline" disabled={busy === `rewrite-${post.id}`} onClick={() => void rewrite(post)}>Try another wording</button>}
                            {EDITABLE.includes(post.status) && post.channels.some((key) => CHANNELS.find((item) => item.key === key)?.automatic) && <button type="button" className="edash-btn-outline" title="Publish this post immediately to the connected Facebook Page and/or Instagram account, instead of waiting for its scheduled time" disabled={busy === `now-${post.id}`} onClick={() => void postNow(post)}>{post.status === "failed" || post.status === "partial" ? "Retry now" : "Post now"}</button>}
                            {post.channels.filter((key) => !CHANNELS.find((item) => item.key === key)?.automatic && post.results?.[key]?.status !== "ok").map((key) => <button key={key} type="button" className="edash-btn-outline" onClick={() => void markPosted(post, key)}>Mark {CHANNEL_SHORT[key]} as posted</button>)}
                            {["draft", "scheduled"].includes(post.status) && <button type="button" className="edash-btn-outline" disabled={busy === `cancel-${post.id}`} onClick={() => void cancel(post)}>Cancel post</button>}
                          </div>
                        )}
                      </div>
                      <Thumb estateId={estateId} post={{ ...post, image_style: draft.style, include_media: draft.includeMedia }} channels={draft.channels} />
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
