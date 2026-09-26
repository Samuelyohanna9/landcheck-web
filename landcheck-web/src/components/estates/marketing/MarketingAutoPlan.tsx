import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../../api/client";
import { AD_STYLES, adStyleLabel, formatDateTime } from "../../../utils/estateMarketing";

type Channel = { key: string; label: string; automatic: boolean };
type Account = { provider: "facebook" | "instagram"; status: string };
type Campaign = { id: number; name: string };
type PreviewItem = { scheduled_at: string; template_key: string; label: string; strategy: string; caption: string; image_style: string };
type Plan = {
  id: number; name: string; status: "active" | "paused" | "ended"; per_day: number | null; per_week: number | null; channels: string[]; auto_renew: boolean;
  counts: Record<string, number>; next_post_at: string | null; tone: string; style: string; duration_days: number;
};

const FREQUENCIES = [
  { key: "d1", label: "Every day", per_day: 1 },
  { key: "d2", label: "Twice a day", per_day: 2 },
  { key: "d3", label: "3 times a day", per_day: 3 },
  { key: "w5", label: "Weekdays (5 a week)", per_week: 5 },
  { key: "w3", label: "3 times a week", per_week: 3 },
  { key: "w2", label: "2 times a week", per_week: 2 },
  { key: "w1", label: "Once a week", per_week: 1 },
] as const;
const TONES = [{ key: "friendly", label: "Friendly" }, { key: "professional", label: "Professional" }, { key: "urgent", label: "Urgent" }];
const DESIGNS = [{ key: "mixed", label: "Mixed" }, ...AD_STYLES.map((item) => ({ key: item.key as string, label: item.label }))];
const STRATEGY_TONE: Record<string, string> = { Announcement: "info", Choice: "info", Affordability: "good", Feature: "neutral", Trust: "good", Progress: "info", Location: "info", Scarcity: "warn", Proof: "good", Invitation: "info", Objections: "neutral", Education: "neutral", Conversation: "neutral" };

const tomorrow = () => {
  const date = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export default function MarketingAutoPlan({ estateId, channels, accounts, metaAvailable, campaigns, canManage, onChanged }: { estateId: string; channels: Channel[]; accounts: Account[]; metaAvailable: boolean; campaigns: Campaign[]; canManage: boolean; onChanged: () => void }) {
  const navigate = useNavigate();
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]["key"]>("d1");
  const [days, setDays] = useState(7);
  const [start, setStart] = useState(tomorrow());
  const [chosen, setChosen] = useState<string[]>([]);
  const [tone, setTone] = useState("friendly");
  const [design, setDesign] = useState("mixed");
  const [campaignId, setCampaignId] = useState("");
  const [customTimes, setCustomTimes] = useState(false);
  const [times, setTimes] = useState<string[]>(["09:00", "19:00", "13:00"]);
  const [autoRenew, setAutoRenew] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const selected = FREQUENCIES.find((item) => item.key === frequency) || FREQUENCIES[0];
  const timeCount = "per_day" in selected ? selected.per_day : 1;
  const hasAccount = useCallback((channel: string) => accounts.some((account) => account.provider === (channel === "facebook" ? "facebook" : "instagram") && account.status === "active"), [accounts]);
  const automaticChannels = useMemo(() => channels.filter((channel) => channel.automatic), [channels]);

  useEffect(() => {
    // Start with every connected automatic channel ticked.
    setChosen((current) => (current.length ? current : automaticChannels.filter((channel) => hasAccount(channel.key) && channel.key !== "instagram_story").map((channel) => channel.key)));
  }, [automaticChannels, hasAccount]);

  const loadPlans = useCallback(async () => {
    try { setPlans((await api.get<{ items: Plan[] }>(`/estates/${estateId}/marketing/social/plans`)).data.items || []); } catch { setPlans([]); }
  }, [estateId]);
  useEffect(() => { void loadPlans(); }, [loadPlans]);

  const body = (approve: boolean) => ({
    days, start_date: start || null, channels: chosen, tone, style: design, campaign_id: campaignId ? Number(campaignId) : null, auto_renew: autoRenew, approve,
    ...("per_day" in selected ? { per_day: selected.per_day } : { per_week: selected.per_week }),
    times: customTimes ? times.slice(0, timeCount) : [],
  });
  const invalidate = () => setPreview(null);

  const runPreview = async () => {
    if (!chosen.length) { toast.error("Choose where to post."); return; }
    setBusy("preview");
    try {
      const response = await api.post<{ items: PreviewItem[] }>(`/estates/${estateId}/marketing/social/plans/preview`, body(true));
      setPreview(response.data.items);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "The posts could not be prepared.")); } finally { setBusy(null); }
  };
  const create = async (approve: boolean) => {
    setBusy(approve ? "create" : "draft");
    try {
      const response = await api.post<{ id: number; created_posts: number }>(`/estates/${estateId}/marketing/social/plans`, body(approve));
      toast.success(approve ? `${response.data.created_posts} posts scheduled. They will go out automatically.` : `${response.data.created_posts} draft posts created. Review them, then approve.`, { duration: 6000 });
      setPreview(null);
      onChanged();
      navigate(`/estates/${estateId}/marketing/posts?plan=${response.data.id}&scope=${approve ? "upcoming" : "drafts"}`);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "The plan could not be created.")); } finally { setBusy(null); }
  };
  const act = async (plan: Plan, payload: { action?: string; auto_renew?: boolean }) => {
    setBusy(`plan-${plan.id}`);
    try {
      await api.patch(`/estates/marketing/social/plans/${plan.id}`, payload);
      await loadPlans();
      onChanged();
    } catch (error) { toast.error(await extractApiErrorMessage(error, "That did not work.")); } finally { setBusy(null); }
  };

  const noAccounts = automaticChannels.every((channel) => !hasAccount(channel.key));
  const toggleChannel = (key: string) => { setChosen((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key])); invalidate(); };

  return (
    <div className="edash-card"><div className="edash-card-inner">
      <div className="edash-card-head"><h3 className="edash-card-title">Automatic posting plan</h3></div>
      <p className="edash-mk-hint" style={{ margin: "0 0 12px" }}>Choose how often to post and LandCheck writes a different post each time - plots available, sizes and prices, payment plan, a featured plot, how to buy, progress, area outlook, questions buyers ask - and posts them for you. Each caption is refreshed from your live plot data just before it goes out, and nothing is posted if no plots are available.</p>
      {(!metaAvailable || noAccounts) && <p className="edash-mk-hint" style={{ color: "var(--edash-warn)" }}>{metaAvailable ? "Connect a Facebook Page or Instagram account below to post automatically." : "Automatic posting is being switched on for this server."}</p>}
      <div className="edash-mk-form-grid">
        <label className="edash-field"><span>How often</span>
          <select value={frequency} onChange={(event) => { setFrequency(event.target.value as typeof frequency); invalidate(); }}>{FREQUENCIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
        </label>
        <label className="edash-field"><span>For how long</span>
          <select value={days} onChange={(event) => { setDays(Number(event.target.value)); invalidate(); }}>{[7, 14, 21, 30].map((value) => <option key={value} value={value}>{value === 7 ? "1 week" : `${value / 7 === Math.floor(value / 7) ? `${value / 7} weeks` : `${value} days`}`}</option>)}</select>
        </label>
        <label className="edash-field"><span>Starting</span><input type="date" value={start} min={new Date().toISOString().slice(0, 10)} onChange={(event) => { setStart(event.target.value); invalidate(); }} /></label>
        <label className="edash-field"><span>Tracked link</span>
          <select value={campaignId} onChange={(event) => { setCampaignId(event.target.value); invalidate(); }}><option value="">Company page (no tracking)</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
        </label>
      </div>
      <div className="edash-field" style={{ marginTop: 12 }}><span>Post to</span>
        <div className="edash-sp-channels">
          {automaticChannels.map((channel) => {
            const ready = metaAvailable && hasAccount(channel.key);
            return (
              <label key={channel.key} className={`edash-sp-channel${chosen.includes(channel.key) ? " is-on" : ""}${ready ? "" : " is-disabled"}`}>
                <input type="checkbox" checked={chosen.includes(channel.key)} disabled={!ready} onChange={() => toggleChannel(channel.key)} />
                <span><strong>{channel.label}</strong><small>{ready ? "Connected" : metaAvailable ? "Connect an account first" : "Coming soon"}</small></span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="edash-sp-plan-options">
        <div className="edash-field"><span>Tone</span>
          <div className="edash-mk-segment" role="group" aria-label="Tone">{TONES.map((item) => <button key={item.key} type="button" className={tone === item.key ? "is-active" : ""} onClick={() => { setTone(item.key); invalidate(); }}>{item.label}</button>)}</div>
        </div>
        <div className="edash-field"><span>Design</span>
          <div className="edash-mk-segment" role="group" aria-label="Design">{DESIGNS.map((item) => <button key={item.key} type="button" className={design === item.key ? "is-active" : ""} onClick={() => { setDesign(item.key); invalidate(); }}>{item.label}</button>)}</div>
        </div>
        <div className="edash-field"><span>Posting times (Lagos)</span>
          <div className="edash-sp-when">
            <label><input type="radio" name="ap-times" checked={!customTimes} onChange={() => { setCustomTimes(false); invalidate(); }} /> Best times</label>
            <label><input type="radio" name="ap-times" checked={customTimes} onChange={() => { setCustomTimes(true); invalidate(); }} /> Choose</label>
            {customTimes && Array.from({ length: timeCount }).map((_unused, index) => <input key={index} type="time" value={times[index] || "09:00"} onChange={(event) => { setTimes((current) => current.map((value, position) => (position === index ? event.target.value : value))); invalidate(); }} />)}
          </div>
        </div>
      </div>
      <label className="edash-sp-check"><input type="checkbox" checked={autoRenew} onChange={(event) => { setAutoRenew(event.target.checked); invalidate(); }} /><span><strong>Keep going automatically</strong><small>When this plan is about to run out, write and schedule the next one, so posting never stops until you pause it.</small></span></label>
      <div className="edash-sp-actions" style={{ marginTop: 14 }}>
        <button type="button" className="edash-btn-outline" disabled={busy === "preview" || !chosen.length} onClick={() => void runPreview()}>{busy === "preview" ? "Writing posts..." : "Preview the posts"}</button>
        {canManage && <button type="button" className="edash-btn-primary" disabled={busy === "create" || !chosen.length || !preview} onClick={() => void create(true)}>{busy === "create" ? "Scheduling..." : "Schedule automatically"}</button>}
        {canManage && <button type="button" className="edash-btn-outline" disabled={busy === "draft" || !chosen.length || !preview} onClick={() => void create(false)}>Save as drafts to review</button>}
      </div>
      {!preview && chosen.length > 0 && <p className="edash-mk-hint">Preview first to see exactly what will be posted and when.</p>}

      {preview && (
        <div className="edash-sp-preview-list" aria-label="Posts in this plan">
          <p className="edash-mk-hint"><strong>{preview.length} posts</strong> will be written and scheduled. Wording is refreshed from live data before each one is posted.</p>
          {preview.map((item, index) => (
            <div key={`${item.scheduled_at}-${index}`} className="edash-sp-preview-row">
              <div className="edash-sp-preview-when"><strong>{formatDateTime(item.scheduled_at)}</strong></div>
              <div className="edash-sp-preview-body">
                <div className="edash-sp-preview-head"><span className={`edash-status-pill tone-${STRATEGY_TONE[item.strategy] || "neutral"}`}>{item.strategy}</span><span>{item.label}</span><small>{adStyleLabel(item.image_style)}</small></div>
                <p className="edash-sp-post-caption">{open === index ? item.caption : `${item.caption.split("\n").slice(0, 3).join("\n").slice(0, 200)}${item.caption.length > 200 ? "..." : ""}`}</p>
                <button type="button" className="edash-card-link" onClick={() => setOpen(open === index ? null : index)}>{open === index ? "Show less" : "Read the full post"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {plans.length > 0 && (
        <div className="edash-sp-plans">
          <h4>Your plans</h4>
          {plans.map((plan) => {
            const scheduled = plan.counts.scheduled || 0;
            const posted = (plan.counts.published || 0) + (plan.counts.partial || 0);
            return (
              <div key={plan.id} className="edash-sp-plan">
                <div className="edash-sp-plan-main">
                  <strong>{plan.name}</strong>
                  <span className={`edash-status-pill tone-${plan.status === "active" ? "good" : "warn"}`}>{plan.status === "active" ? "Running" : "Paused"}</span>
                  <small>{posted} posted · {scheduled} scheduled{plan.counts.draft ? ` · ${plan.counts.draft} drafts` : ""}{plan.counts.skipped ? ` · ${plan.counts.skipped} skipped` : ""}{plan.counts.failed ? ` · ${plan.counts.failed} failed` : ""}{plan.next_post_at ? ` · next ${formatDateTime(plan.next_post_at)}` : ""}</small>
                </div>
                {canManage && (
                  <div className="edash-sp-post-actions">
                    <Link className="edash-btn-outline" to={`/estates/${estateId}/marketing/posts?plan=${plan.id}&scope=all`}>See all posts</Link>
                    {!!plan.counts.draft && <button type="button" className="edash-btn-primary" disabled={busy === `plan-${plan.id}`} onClick={() => void act(plan, { action: "approve" })}>Approve drafts</button>}
                    <button type="button" className="edash-btn-outline" disabled={busy === `plan-${plan.id}`} onClick={() => void act(plan, { auto_renew: !plan.auto_renew })}>{plan.auto_renew ? "Keeps going: on" : "Keeps going: off"}</button>
                    {plan.status === "active" ? <button type="button" className="edash-btn-outline" disabled={busy === `plan-${plan.id}`} onClick={() => void act(plan, { action: "pause" })}>Pause</button> : <button type="button" className="edash-btn-outline" disabled={busy === `plan-${plan.id}`} onClick={() => void act(plan, { action: "resume" })}>Resume</button>}
                    <button type="button" className="edash-btn-outline" disabled={busy === `plan-${plan.id}`} onClick={() => { if (window.confirm("Stop this plan? Posts not yet sent are cancelled.")) void act(plan, { action: "stop" }); }}>Stop</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div></div>
  );
}
