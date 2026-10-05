import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../../api/client";
import { AD_STYLES, copyText, fetchBlobUrl, formatDateTime, type AdStyle } from "../../../utils/estateMarketing";
import EstateIcon from "../EstateIcon";
import MarketingAutoPlan from "./MarketingAutoPlan";
import UpgradeNotice from "../UpgradeNotice";

type Channel = { key: string; label: string; automatic: boolean; format: string };
type Account = { id: number; provider: "facebook" | "instagram"; name: string; username?: string | null; status: string; is_default?: boolean };
type Overview = { meta_available: boolean; whatsapp_available: boolean; accounts: Account[]; channels: Channel[]; published: boolean; auto_posting?: boolean };
type Template = { key: string; label: string; hint: string; caption: string };
type Optins = {
  whatsapp_available: boolean; active: number; revoked: number; template_images?: boolean;
  presets: Array<{ key: string; label: string; template_name: string; sample: string }>;
  batches: Array<{ batch: string; created_at: string; sent: number; failed: number; queued: number; skipped: number }>;
  items: Array<{ id: number; name?: string | null; phone: string; status: string; consented_at: string; source?: string | null }>;
};
type Campaign = { id: number; name: string; channel: string };
type PlotOption = { id: number; plot_number: string };


function PreviewImage({ estateId, params, alt }: { estateId: string; params: Record<string, unknown>; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const key = JSON.stringify(params);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setUrl(null);
    setFailedReason(null);
    fetchBlobUrl(`/estates/${estateId}/marketing/social/image.png`, params).then((value) => {
      if (cancelled) { URL.revokeObjectURL(value); return; }
      created = value;
      setUrl(value);
    }).catch(async (error) => { if (!cancelled) setFailedReason(await extractApiErrorMessage(error, "Preview unavailable.")); });
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estateId, key]);
  return <div className="edash-mk-preview edash-sp-preview">{url ? <img src={url} alt={alt} /> : failedReason ? <span>{failedReason}</span> : <span>Preparing preview...</span>}</div>;
}

export default function MarketingSocialTab({ estateId, estateName, canManage, published }: { estateId: string; estateName: string; canManage: boolean; published: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [optins, setOptins] = useState<Optins | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [plots, setPlots] = useState<PlotOption[]>([]);

  const [templateKey, setTemplateKey] = useState("new_plots");
  const [caption, setCaption] = useState("");
  const [channels, setChannels] = useState<string[]>(["whatsapp_status"]);
  const [style, setStyle] = useState<AdStyle>("promo");
  const [includeMedia, setIncludeMedia] = useState(true);
  const [plotId, setPlotId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [when, setWhen] = useState<"draft" | "now" | "later">("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [previewShape, setPreviewShape] = useState<"post" | "status">("status");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [broadcastPreset, setBroadcastPreset] = useState("new_plots");
  const [broadcastDetail, setBroadcastDetail] = useState("");
  const [broadcastStyle, setBroadcastStyle] = useState<AdStyle>("promo");
  const composerRef = useRef<HTMLDivElement | null>(null);

  const imageParams = useMemo(() => ({ channel: previewShape === "status" ? "whatsapp_status" : "facebook", style, plot_id: plotId || undefined, campaign_id: campaignId || undefined }), [previewShape, style, plotId, campaignId]);

  const loadOverview = useCallback(async () => {
    try { setOverview((await api.get<Overview>(`/estates/${estateId}/marketing/social/overview`)).data); } catch { setOverview(null); }
  }, [estateId]);
  const loadOptins = useCallback(async () => {
    try { setOptins((await api.get<Optins>(`/estates/${estateId}/marketing/social/optins`)).data); } catch { setOptins(null); }
  }, [estateId]);

  useEffect(() => {
    void loadOverview(); void loadOptins();
    api.get<Campaign[]>(`/estates/${estateId}/qr-campaigns`).then((response) => setCampaigns(response.data || [])).catch(() => setCampaigns([]));
    api.get(`/estates/${estateId}/marketing/share-links`).then((response) => setPlots((response.data?.plots || []).map((plot: PlotOption) => ({ id: plot.id, plot_number: plot.plot_number })))).catch(() => setPlots([]));
  }, [estateId, loadOverview, loadOptins]);

  // Templates depend on the chosen plot and tracked link (they carry that link).
  useEffect(() => {
    if (!published) return;
    let cancelled = false;
    api.get<{ templates: Template[] }>(`/estates/${estateId}/marketing/social/templates`, { params: { plot_id: plotId || undefined, campaign_id: campaignId || undefined } })
      .then((response) => {
        if (cancelled) return;
        const list = response.data.templates || [];
        setTemplates(list);
        if (editingId === null) {
          const pick = list.find((item) => item.key === templateKey) || list[0];
          if (pick) { setTemplateKey(pick.key); setCaption(pick.caption); }
        }
      }).catch(() => { if (!cancelled) setTemplates([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estateId, plotId, campaignId, published]);

  // Coming back from the Facebook login page.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const problem = searchParams.get("connect_error");
    if (connected) toast.success(`Connected ${connected} account${connected === "1" ? "" : "s"}.`);
    if (problem) toast.error(problem);
    if (connected || problem) {
      const next = new URLSearchParams(searchParams);
      next.delete("connected"); next.delete("connect_error");
      setSearchParams(next, { replace: true });
      void loadOverview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const automaticSelected = channels.filter((key) => overview?.channels.find((item) => item.key === key)?.automatic);
  const hasAccount = (channel: string) => Boolean(overview?.accounts.some((account) => account.provider === (channel === "facebook" ? "facebook" : "instagram") && account.status === "active"));
  const chooseTemplate = (item: Template) => { setTemplateKey(item.key); setCaption(item.caption); };
  const toggleChannel = (key: string) => setChannels((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
  const toggleIncludeMedia = (value: boolean) => {
    setIncludeMedia(value);
    // Instagram has no text-only post type, so turning media off drops it from "Post to" rather than
    // leaving a combination that would fail when sent.
    if (!value) setChannels((current) => current.filter((key) => key !== "instagram" && key !== "instagram_story"));
  };
  const safeName = estateName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "estate";

  // ── Quick actions that need no approval or connection ──
  const copyCaption = async () => {
    if (await copyText(caption)) toast.success("Caption copied.");
    else toast.error("Copy failed - select the text and copy it manually.");
  };
  const downloadImage = async (shape: "post" | "status") => {
    setBusy(`download-${shape}`);
    try {
      const blob = (await api.get(`/estates/${estateId}/marketing/social/image.png`, { responseType: "blob", params: { ...imageParams, channel: shape === "status" ? "whatsapp_status" : "facebook", download: true } })).data as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${safeName}-${shape}.png`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "The image could not be prepared.")); } finally { setBusy(null); }
  };
  const shareToStatus = async () => {
    setBusy("share");
    try {
      const blob = (await api.get(`/estates/${estateId}/marketing/social/image.png`, { responseType: "blob", params: { ...imageParams, channel: "whatsapp_status" } })).data as Blob;
      const file = new File([blob], `${safeName}-status.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], text: caption });
        return;
      }
      // Desktop / older browsers: hand over the image and caption to paste.
      await copyText(caption);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = file.name; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success("Image saved and caption copied. Open WhatsApp > Status, add the image and paste the caption.", { duration: 7000 });
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") toast.error(await extractApiErrorMessage(error, "Sharing was not possible. Use Download image instead."));
    } finally { setBusy(null); }
  };

  const resetComposer = () => {
    setEditingId(null); setWhen("draft"); setScheduledAt(""); setIncludeMedia(true);
    const pick = templates.find((item) => item.key === templateKey) || templates[0];
    if (pick) setCaption(pick.caption);
  };

  const savePost = async () => {
    if (!caption.trim()) { toast.error("Write a caption first."); return; }
    if (!channels.length) { toast.error("Choose where to post."); return; }
    if (when === "later" && !scheduledAt) { toast.error("Choose a date and time."); return; }
    setBusy("save");
    try {
      const iso = when === "later" ? new Date(scheduledAt).toISOString() : undefined;
      if (editingId !== null) {
        await api.patch(`/estates/marketing/social/posts/${editingId}`, { caption, channels, image_style: style, include_media: includeMedia, ...(iso ? { scheduled_at: iso } : { clear_schedule: when === "draft" }) });
        if (when === "now") await api.post(`/estates/marketing/social/posts/${editingId}/publish`);
        toast.success(when === "now" ? "Posted." : "Post updated.");
      } else {
        await api.post(`/estates/${estateId}/marketing/social/posts`, { template_key: templateKey, caption, channels, image_style: style, include_media: includeMedia, plot_id: plotId ? Number(plotId) : null, campaign_id: campaignId ? Number(campaignId) : null, scheduled_at: iso, publish_now: when === "now" });
        toast.success(when === "now" ? "Posted." : when === "later" ? "Scheduled." : "Saved as a draft.");
      }
      resetComposer();
    } catch (error) { toast.error(await extractApiErrorMessage(error, "The post could not be saved.")); } finally { setBusy(null); }
  };

  const connectMeta = async () => {
    setBusy("connect");
    try {
      const response = await api.post<{ url: string }>(`/estates/${estateId}/marketing/social/meta/connect`);
      window.location.href = response.data.url;
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not start the connection.")); setBusy(null); }
  };
  const disconnect = async (account: Account) => {
    if (!window.confirm(`Disconnect ${account.name}? Scheduled posts to it will fail until you reconnect.`)) return;
    try { await api.delete(`/estates/marketing/social/accounts/${account.id}`); await loadOverview(); toast.success("Disconnected."); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not disconnect.")); }
  };
  const setDefaultAccount = async (account: Account) => {
    try { await api.post(`/estates/marketing/social/accounts/${account.id}/set-default`); await loadOverview(); toast.success(`${account.name} is now where auto-posting sends ${account.provider === "facebook" ? "Facebook" : "Instagram"} posts.`); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not set as default.")); }
  };
  const sendBroadcast = async () => {
    if (!window.confirm(`Send this WhatsApp update to ${optins?.active ?? 0} people who opted in?`)) return;
    setBusy("broadcast");
    try {
      const response = await api.post<{ queued: number }>(`/estates/${estateId}/marketing/social/whatsapp/broadcast`, { preset: broadcastPreset, detail: broadcastDetail.trim() || null, image_style: broadcastStyle });
      toast.success(`Queued for ${response.data.queued} people. They are sent within a few minutes.`);
      setBroadcastDetail("");
      await loadOptins();
    } catch (error) { toast.error(await extractApiErrorMessage(error, "The update could not be queued.")); } finally { setBusy(null); }
  };
  const removeOptin = async (id: number) => {
    try { await api.delete(`/estates/marketing/social/optins/${id}`); await loadOptins(); } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not remove that contact.")); }
  };

  if (!published) return <div className="edash-card"><div className="edash-card-inner"><p className="edash-mk-empty">Publish your Estate page in Settings first. Posts link buyers to it.</p></div></div>;

  const facebookAccounts = overview?.accounts.filter((account) => account.provider === "facebook") || [];
  const instagramAccounts = overview?.accounts.filter((account) => account.provider === "instagram") || [];

  return (
    <div className="edash-mk-stack">
      {overview && overview.auto_posting === false
        ? <UpgradeNotice title="Automatic posting is on the Pro plan" message="Pro and Enterprise write a week or a month of posts for you and publish them to Facebook and Instagram on schedule. You can still prepare posts here and share them yourself." cta="Upgrade to Pro" />
        : <MarketingAutoPlan estateId={estateId} channels={overview?.channels || []} accounts={overview?.accounts || []} metaAvailable={Boolean(overview?.meta_available)} campaigns={campaigns} canManage={canManage} onChanged={() => {}} />}
      <div className="edash-card" ref={composerRef}><div className="edash-card-inner">
        <div className="edash-card-head">
          <h3 className="edash-card-title">{editingId !== null ? "Edit post" : "Create a post"}</h3>
          {editingId !== null && <button type="button" className="edash-btn-outline" onClick={resetComposer}>Cancel editing</button>}
        </div>
        <div className="edash-sp-grid">
          <div className="edash-sp-form">
            <div className="edash-field"><span>Start from</span>
              <div className="edash-sp-chips">
                {templates.map((item) => <button key={item.key} type="button" title={item.hint} className={`edash-sp-chip${templateKey === item.key ? " is-active" : ""}`} onClick={() => chooseTemplate(item)} disabled={editingId !== null}>{item.label}</button>)}
              </div>
            </div>
            <div className="edash-mk-form-grid">
              <label className="edash-field"><span>Feature a plot (optional)</span>
                <select value={plotId} onChange={(event) => setPlotId(event.target.value)} disabled={editingId !== null}>
                  <option value="">Whole estate</option>
                  {plots.map((plot) => <option key={plot.id} value={plot.id}>Plot {plot.plot_number}</option>)}
                </select>
              </label>
              <label className="edash-field"><span>Tracked link</span>
                <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} disabled={editingId !== null}>
                  <option value="">Company page (no tracking)</option>
                  {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
              </label>
            </div>
            <label className="edash-field"><span>Caption <em className="edash-sp-count">{caption.length}/2200</em></span>
              <textarea value={caption} maxLength={2200} rows={9} onChange={(event) => setCaption(event.target.value)} style={{ fontFamily: "inherit" }} />
            </label>
            <div className="edash-field"><span>Image</span>
              <div className="edash-mk-segment" role="group" aria-label="Include an image">
                <button type="button" className={includeMedia ? "is-active" : ""} onClick={() => toggleIncludeMedia(true)}>With image</button>
                <button type="button" className={!includeMedia ? "is-active" : ""} onClick={() => toggleIncludeMedia(false)}>Text only</button>
              </div>
              {!includeMedia && <p className="edash-mk-hint" style={{ margin: "6px 0 0" }}>A plain status update, no flyer image - Instagram isn't available for text-only posts.</p>}
            </div>
            <div className="edash-field"><span>Post to</span>
              <div className="edash-sp-channels">
                {(overview?.channels || []).map((channel) => {
                  const imageOnlyChannel = !includeMedia && (channel.key === "instagram" || channel.key === "instagram_story");
                  const unavailable = channel.automatic && (overview?.auto_posting === false || !overview?.meta_available || !hasAccount(channel.key));
                  return (
                    <label key={channel.key} className={`edash-sp-channel${channels.includes(channel.key) ? " is-on" : ""}${imageOnlyChannel ? " is-disabled" : ""}`}>
                      <input type="checkbox" checked={channels.includes(channel.key)} disabled={imageOnlyChannel} onChange={() => toggleChannel(channel.key)} />
                      <span><strong>{channel.label}</strong><small>{imageOnlyChannel ? "Needs an image" : channel.automatic ? (overview?.auto_posting === false ? "Pro plan" : unavailable ? (overview?.meta_available ? "Connect an account below" : "Coming soon") : "Posts automatically") : "You post it - we prepare it and remind you"}</small></span>
                    </label>
                  );
                })}
              </div>
            </div>
            {includeMedia && <div className="edash-field"><span>Design</span>
              <div className="edash-mk-segment" role="group" aria-label="Design">
                {AD_STYLES.map((item) => <button key={item.key} type="button" title={item.hint} className={style === item.key ? "is-active" : ""} onClick={() => setStyle(item.key)}>{item.label}</button>)}
              </div>
            </div>}
            <div className="edash-field"><span>When</span>
              <div className="edash-sp-when">
                <label><input type="radio" name="sp-when" checked={when === "draft"} onChange={() => setWhen("draft")} /> Save draft</label>
                <label className={automaticSelected.length ? "" : "is-disabled"}><input type="radio" name="sp-when" checked={when === "now"} disabled={!automaticSelected.length} onChange={() => setWhen("now")} /> Post now</label>
                <label><input type="radio" name="sp-when" checked={when === "later"} onChange={() => setWhen("later")} /> Schedule</label>
                {when === "later" && <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />}
              </div>
            </div>
            <div className="edash-sp-actions">
              <button type="button" className="edash-btn-primary" disabled={busy === "save" || !canManage} onClick={() => void savePost()}>{busy === "save" ? "Saving..." : when === "now" ? "Post now" : when === "later" ? "Schedule post" : editingId !== null ? "Save changes" : "Save draft"}</button>
              <button type="button" className="edash-btn-outline" onClick={() => void copyCaption()}><EstateIcon name="documents" />Copy caption</button>
              <button type="button" className="edash-btn-outline" disabled={busy === "share"} onClick={() => void shareToStatus()}><EstateIcon name="whatsapp" />{busy === "share" ? "Preparing..." : "Share to Status"}</button>
            </div>
            {!canManage && <p className="edash-mk-hint">Only owners, managers and marketers can save or schedule posts. Copy, download and share still work.</p>}
          </div>
          <div className="edash-sp-side">
            {includeMedia ? (
              <>
                <div className="edash-mk-segment" role="group" aria-label="Preview shape">
                  <button type="button" className={previewShape === "status" ? "is-active" : ""} onClick={() => setPreviewShape("status")}>Story / Status</button>
                  <button type="button" className={previewShape === "post" ? "is-active" : ""} onClick={() => setPreviewShape("post")}>Feed post</button>
                </div>
                <PreviewImage estateId={estateId} params={imageParams} alt="Post preview" />
                <div className="edash-sp-actions">
                  <button type="button" className="edash-btn-outline" disabled={busy === "download-status"} onClick={() => void downloadImage("status")}><EstateIcon name="download" />Story image</button>
                  <button type="button" className="edash-btn-outline" disabled={busy === "download-post"} onClick={() => void downloadImage("post")}><EstateIcon name="download" />Feed image</button>
                </div>
                <p className="edash-mk-hint">Share to Status opens your phone's share sheet with this image and caption. On a computer it saves the image and copies the caption.</p>
              </>
            ) : (
              <div className="edash-mk-preview edash-sp-preview"><span>Text-only post - no image is generated or sent.</span></div>
            )}
          </div>
        </div>
      </div></div>

      <div className="edash-card edash-sp-alllink"><div className="edash-card-inner">
        <div className="edash-sp-alllink-row">
          <div>
            <h3 className="edash-card-title">All scheduled &amp; posted</h3>
            <p className="edash-mk-hint" style={{ margin: "4px 0 0" }}>Every post you create here, day by day - open one to change its wording, time, channels or design, send it now, or cancel it.</p>
          </div>
          <Link className="edash-btn-primary" to={`/estates/${estateId}/marketing/posts`}>See and edit all posts</Link>
        </div>
      </div></div>

      <div className="edash-mk-grid-2">
        <div className="edash-card"><div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Facebook &amp; Instagram</h3>
            {canManage && overview?.auto_posting !== false && <button type="button" className="edash-btn-primary" disabled={!overview?.meta_available || busy === "connect"} onClick={() => void connectMeta()}>{busy === "connect" ? "Opening Facebook..." : overview?.accounts.length ? "Connect more" : "Connect"}</button>}
          </div>
          {overview?.auto_posting === false && <UpgradeNotice title="Post to Facebook and Instagram automatically" message="Connecting your Pages and posting straight from LandCheck is included in the Pro and Enterprise plans." cta="Upgrade to Pro" />}
          {overview?.auto_posting !== false && !overview?.meta_available && <p className="edash-mk-hint">Automatic posting to Facebook and Instagram is being switched on (Meta approval is in progress). Until then, use Copy caption, Download image and Share to Status.</p>}
          {overview?.meta_available && overview.accounts.length === 0 && <p className="edash-mk-hint">Connect the Facebook Page (and the Instagram Business account linked to it) that you want to post to. You choose which Pages to share, and can disconnect any time.</p>}
          {(facebookAccounts.length > 1 || instagramAccounts.length > 1) && (
            <p className="edash-mk-hint">You've connected more than one {facebookAccounts.length > 1 ? "Facebook Page" : "Instagram account"} - auto-posting only sends to the one marked Default below.</p>
          )}
          {[...facebookAccounts, ...instagramAccounts].map((account) => {
            const siblingCount = (account.provider === "facebook" ? facebookAccounts : instagramAccounts).length;
            return (
              <div key={account.id} className="edash-sp-account">
                <span className="edash-sp-account-icon"><EstateIcon name={account.provider === "facebook" ? "share" : "camera"} /></span>
                <div><strong>{account.name}</strong><small>{account.provider === "facebook" ? "Facebook Page" : `Instagram${account.username ? ` @${account.username}` : ""}`}</small></div>
                {siblingCount > 1 && (account.is_default
                  ? <span className="edash-status-pill tone-good">Default</span>
                  : (canManage && account.status === "active" && <button type="button" className="edash-btn-outline" onClick={() => void setDefaultAccount(account)}>Set as default</button>))}
                <span className={`edash-status-pill tone-${account.status === "active" ? "good" : "warn"}`}>{account.status === "active" ? "Connected" : "Reconnect needed"}</span>
                {canManage && <button type="button" className="edash-btn-outline" onClick={() => void disconnect(account)}>Disconnect</button>}
              </div>
            );
          })}
        </div></div>

        <div className="edash-card"><div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">WhatsApp updates</h3><span className="edash-mk-hint" style={{ margin: 0 }}>{optins ? `${optins.active} subscribed` : ""}</span></div>
          {!optins?.whatsapp_available ? <p className="edash-mk-hint">Buyers can opt in on your public page and you can message them new plots, prices and site visits. This is being switched on with WhatsApp Business approval.</p> : (
            <>
              <p className="edash-mk-hint">Only people who ticked the opt-in box on your Estate page receive these. They can reply STOP at any time.</p>
              {canManage && (
                <div className="edash-mk-form-grid">
                  <label className="edash-field"><span>Message</span>
                    <select value={broadcastPreset} onChange={(event) => setBroadcastPreset(event.target.value)}>{(optins?.presets || []).map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}</select>
                  </label>
                  <label className="edash-field is-wide"><span>Detail (optional)</span><input value={broadcastDetail} maxLength={200} onChange={(event) => setBroadcastDetail(event.target.value)} placeholder="e.g. from ₦2.5M, 50% deposit" /></label>
                  {optins?.template_images && (
                    <label className="edash-field is-wide"><span>Design</span>
                      <div className="edash-mk-segment" role="group" aria-label="Design style">
                        {AD_STYLES.map((item) => <button key={item.key} type="button" title={item.hint} className={broadcastStyle === item.key ? "is-active" : ""} onClick={() => setBroadcastStyle(item.key)}>{item.label}</button>)}
                      </div>
                    </label>
                  )}
                  <div className="is-full" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" className="edash-btn-primary" disabled={busy === "broadcast" || !(optins?.active)} onClick={() => void sendBroadcast()}>{busy === "broadcast" ? "Queuing..." : "Send update"}</button>
                  </div>
                </div>
              )}
              {(optins?.batches || []).slice(0, 3).map((batch) => <p key={batch.batch} className="edash-mk-hint">{formatDateTime(batch.created_at)}: {batch.sent} sent{batch.queued ? `, ${batch.queued} waiting` : ""}{batch.failed ? `, ${batch.failed} failed` : ""}{batch.skipped ? `, ${batch.skipped} opted out` : ""}</p>)}
              <details className="edash-sp-details"><summary>Message templates to create in WhatsApp Manager</summary>
                {(optins?.presets || []).map((preset) => <p key={preset.key}><strong>{preset.template_name}</strong><br /><small>{preset.sample}</small></p>)}
              </details>
              {(optins?.items || []).length > 0 && (
                <details className="edash-sp-details"><summary>Subscribers ({optins?.active})</summary>
                  {optins?.items.map((item) => <div key={item.id} className="edash-sp-optin"><span>{item.name || "Unnamed"} · {item.phone}</span><small>{item.status === "active" ? formatDateTime(item.consented_at) : "opted out"}</small>{canManage && item.status === "active" && <button type="button" className="edash-card-link" onClick={() => void removeOptin(item.id)}>Remove</button>}</div>)}
                </details>
              )}
            </>
          )}
        </div></div>
      </div>
    </div>
  );
}
