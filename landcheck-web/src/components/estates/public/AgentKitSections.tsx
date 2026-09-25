import { useCallback, useEffect, useMemo, useState } from "react";
import { api, extractApiErrorMessage } from "../../../api/client";
import { AD_STYLES, adFormatsFor, ageLabel, copyText, downloadFile, fetchBlobUrl, formatDateTime, naira, whatsappShareHref, type AdFormat, type AdStyle } from "../../../utils/estateMarketing";
import EstateIcon from "../EstateIcon";

type Followup = { id: number; name: string; phone: string; status: "new" | "contacted"; estate_name: string; plot: string | null; age_hours: number; whatsapp_url: string | null };
type KitEstate = {
  id: number; name: string; published: boolean; page_url?: string; share_url?: string; whatsapp_text?: string; available?: number; reserved?: number; min_price?: number | null;
  campaign?: { id: number; code: string; link_opens: number };
  plots?: Array<{ id: number; plot_number: string; area_sqm: number | null; price: string | null; share_url: string }>;
  materials?: { flyer: string; brochure: string; ad: string; plot_ad: string };
};
type Inspection = { id: number; starts_at: string; full_name: string; phone: string; party_size: number; plot_number: string | null; status: "booked" | "cancelled" | "attended" | "no_show"; whatsapp_url: string | null };
type Commission = { earned: string; paid: string; due: string; sales_volume: string; tier: { label: string; rate_percent: string }; next_tier: { label: string; rate_percent: string; needed: string } | null; pipeline_value: string; pipeline_estimate: string };
type BoardRow = { rank: number; name: string; leads: number; inspections: number; reservations: number; sales: number; is_you: boolean };
type Kit = { agent: { name: string }; estates: KitEstate[]; followups: Followup[]; inspections: Inspection[]; commission: Commission; leaderboard: { period_days: number; rows: BoardRow[] } };

function Preview({ path, params }: { path: string; params: Record<string, unknown> }) {
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify([path, params]);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setUrl(null);
    fetchBlobUrl(path, params).then((value) => { if (cancelled) URL.revokeObjectURL(value); else { created = value; setUrl(value); } }).catch(() => undefined);
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className="agent-kit-preview">{url ? <img src={url} alt="Preview" /> : <span>Preparing preview...</span>}</div>;
}

export default function AgentKitSections({ token }: { token: string }) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [error, setError] = useState("");
  const [estateId, setEstateId] = useState<number | null>(null);
  const [plotId, setPlotId] = useState<number | null>(null);
  const [format, setFormat] = useState<AdFormat>("post");
  const [style, setStyle] = useState<AdStyle>("promo");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get<Kit>(`/estates/agent-portal/${token}/kit`);
      setKit(response.data);
      setEstateId((current) => current ?? response.data.estates.find((estate) => estate.published)?.id ?? null);
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "Your marketing kit could not be loaded."));
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const estate = useMemo(() => kit?.estates.find((item) => item.id === estateId) || null, [kit, estateId]);
  useEffect(() => { setPlotId(estate?.plots?.[0]?.id ?? null); }, [estate?.id]);
  const plot = estate?.plots?.find((item) => item.id === plotId) || null;
  const formats = adFormatsFor(style);
  const activeFormat: AdFormat = formats.some((item) => item.key === format) ? format : "post";

  const flash = (message: string) => { setNote(message); window.setTimeout(() => setNote(""), 3500); };
  const run = async (key: string, task: () => Promise<void>, failure: string) => {
    setBusy(key);
    try { await task(); } catch (requestError) { flash(await extractApiErrorMessage(requestError, failure)); } finally { setBusy(null); }
  };

  if (error) return <section className="agent-public-card"><div className="agent-public-empty">{error}</div></section>;
  if (!kit) return <section className="agent-public-card"><div className="agent-public-empty">Loading your marketing kit...</div></section>;

  const commission = kit.commission;
  const needed = commission.next_tier ? Number(commission.next_tier.needed) : 0;
  const volume = Number(commission.sales_volume);
  const progress = commission.next_tier ? Math.min(100, (volume / Math.max(volume + needed, 1)) * 100) : 100;
  const setStatus = (id: number, status: "contacted" | "declined") => run(`lead-${id}`, async () => { await api.patch(`/estates/agent-portal/${token}/leads/${id}`, { status }); await load(); }, "The lead could not be updated.");
  const setBooking = (id: number, status: "attended" | "no_show") => run(`booking-${id}`, async () => { await api.patch(`/estates/agent-portal/${token}/inspection-bookings/${id}`, { status }); await load(); }, "The booking could not be updated.");
  const safeName = (estate?.name || "estate").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <>
      {note && <div className="agent-kit-toast" role="status">{note}</div>}

      <section id="followups" className="agent-public-card">
        <div className="agent-public-card-head"><div><h2>Leads to follow up</h2><p>Reply fast - enquiries answered within the hour are the ones that turn into reservations.</p></div><span className="agent-public-count">{kit.followups.length}</span></div>
        {kit.followups.length ? <div className="agent-public-list">{kit.followups.map((lead) => (
          <div className="agent-public-row" key={lead.id}>
            <div><strong>{lead.name}</strong><small>{lead.estate_name} · {lead.plot ? `Plot ${lead.plot}` : "Plot enquiry"} · {lead.status === "new" ? "enquired" : "contacted"} {ageLabel(lead.age_hours)}</small></div>
            <div className="agent-public-row-actions">
              <a href={`tel:${lead.phone}`}>Call</a>
              {lead.whatsapp_url && <a className="agent-kit-wa" href={lead.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</a>}
              {lead.status === "new" && <button type="button" disabled={busy === `lead-${lead.id}`} onClick={() => void setStatus(lead.id, "contacted")}>Mark contacted</button>}
              <button type="button" disabled={busy === `lead-${lead.id}`} onClick={() => void setStatus(lead.id, "declined")}>Not interested</button>
            </div>
          </div>
        ))}</div> : <div className="agent-public-empty">No leads waiting. Share your link below to bring more in.</div>}
      </section>

      <section id="kit" className="agent-public-card">
        <div className="agent-public-card-head">
          <div><h2>Your marketing kit</h2><p>Flyers, ads and links that carry your name and number, and credit every enquiry to you.</p></div>
          <select value={estateId || ""} onChange={(event) => setEstateId(Number(event.target.value))}>{kit.estates.filter((item) => item.published).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </div>
        {!estate ? <div className="agent-public-empty">No estate has a published page yet.</div> : (
          <>
            <div className="agent-kit-link">
              <div><small>Your personal link · {estate.campaign?.link_opens ?? 0} opens</small><strong>{estate.share_url}</strong></div>
              <div className="agent-public-row-actions">
                <button type="button" onClick={async () => flash((await copyText(estate.share_url || "")) ? "Link copied." : "Copy failed - select the link manually.")}>Copy link</button>
                <a className="agent-kit-wa" href={whatsappShareHref(estate.whatsapp_text || "")} target="_blank" rel="noreferrer">Share on WhatsApp</a>
              </div>
            </div>
            <div className="agent-kit-stats"><span><b>{estate.available}</b> available</span><span><b>{estate.reserved}</b> reserved</span>{estate.min_price ? <span>from <b>{naira(estate.min_price)}</b></span> : null}</div>
            <div className="agent-kit-downloads">
              <button type="button" disabled={busy === "flyer"} onClick={() => void run("flyer", () => downloadFile(estate.materials!.flyer, `${safeName}-${style}-flyer.pdf`, { style }), "The flyer could not be prepared.")}>Flyer (PDF)</button>
              <button type="button" disabled={busy === "brochure"} onClick={() => void run("brochure", () => downloadFile(estate.materials!.brochure, `${safeName}-${style}-brochure.pdf`, { style }), "The brochure could not be prepared.")}>Brochure (PDF)</button>
              {formats.map((item) => <button key={item.key} type="button" disabled={busy === item.key} onClick={() => void run(item.key, () => downloadFile(estate.materials!.ad, `${safeName}-${style}-${item.key}.png`, { format: item.key, style }), "The image could not be prepared.")}>{item.key === "status" ? "WhatsApp Status" : item.key === "post" ? "Social post" : item.key === "poster" ? "Print poster" : "Wide banner"}</button>)}
            </div>
            <div className="agent-kit-style" role="group" aria-label="Design style">
              {AD_STYLES.map((item) => <button key={item.key} type="button" title={item.hint} className={style === item.key ? "is-active" : ""} onClick={() => setStyle(item.key)}>{item.label}</button>)}
            </div>
            <h3 className="agent-kit-subhead">Advertise a single plot</h3>
            {!estate.plots?.length ? <div className="agent-public-empty">No plots are available to advertise.</div> : (
              <div className="agent-kit-plot">
                <div className="agent-kit-plot-controls">
                  <select value={plotId || ""} onChange={(event) => setPlotId(Number(event.target.value))}>{estate.plots.map((item) => <option key={item.id} value={item.id}>Plot {item.plot_number}{item.price ? ` · ${naira(item.price)}` : ""}</option>)}</select>
                  <select value={activeFormat} onChange={(event) => setFormat(event.target.value as AdFormat)}>{formats.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
                  {plot && <>
                    <button type="button" disabled={busy === "plot-ad"} onClick={() => void run("plot-ad", () => downloadFile(estate.materials!.plot_ad.replace("{plot_id}", String(plot.id)), `${safeName}-plot-${plot.plot_number}-${style}-${activeFormat}.png`, { format: activeFormat, style }), "The image could not be prepared.")}>Download image</button>
                    <a className="agent-kit-wa" href={whatsappShareHref(`Plot ${plot.plot_number} at ${estate.name}${plot.price ? ` - ${naira(plot.price)}` : ""}. See it on the live map: ${plot.share_url}`)} target="_blank" rel="noreferrer">Share on WhatsApp</a>
                    <button type="button" onClick={async () => flash((await copyText(plot.share_url)) ? "Plot link copied." : "Copy failed.")}>Copy plot link</button>
                  </>}
                </div>
                {plot && <Preview path={estate.materials!.plot_ad.replace("{plot_id}", String(plot.id))} params={{ format: activeFormat, style }} />}
              </div>
            )}
          </>
        )}
      </section>

      <div className="agent-public-columns">
        <section id="inspections" className="agent-public-card">
          <div className="agent-public-card-head"><div><h2>Your inspection bookings</h2><p>Visitors who booked a site visit through your link.</p></div><span className="agent-public-count">{kit.inspections.length}</span></div>
          {kit.inspections.length ? <div className="agent-public-list">{kit.inspections.map((booking) => (
            <div className="agent-public-row" key={booking.id}>
              <div><strong>{booking.full_name} <span style={{ color: "#667085", fontWeight: 600 }}>x{booking.party_size}</span></strong><small>{formatDateTime(booking.starts_at)}{booking.plot_number ? ` · Plot ${booking.plot_number}` : ""}</small></div>
              <div className="agent-public-row-actions">
                <b>{booking.status.replace("_", " ")}</b>
                <a href={`tel:${booking.phone}`}>Call</a>
                {booking.whatsapp_url && <a className="agent-kit-wa" href={booking.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</a>}
                {booking.status === "booked" && <><button type="button" disabled={busy === `booking-${booking.id}`} onClick={() => void setBooking(booking.id, "attended")}>Attended</button><button type="button" disabled={busy === `booking-${booking.id}`} onClick={() => void setBooking(booking.id, "no_show")}>No-show</button></>}
              </div>
            </div>
          ))}</div> : <div className="agent-public-empty">No bookings through your link yet.</div>}
        </section>

        <section id="commission" className="agent-public-card">
          <div className="agent-public-card-head"><div><h2>Commission tracker</h2><p>Your rate rises automatically as your fully-paid sales grow.</p></div><EstateIcon name="wallet" /></div>
          <div className="agent-kit-tier"><div><small>Current tier</small><strong>{commission.tier.label} · {commission.tier.rate_percent}%</strong></div><div><small>Fully-paid sales</small><strong>{naira(commission.sales_volume)}</strong></div></div>
          <div className="agent-kit-bar"><i style={{ width: `${progress}%` }} /></div>
          <p className="agent-kit-bar-note">{commission.next_tier ? `${naira(commission.next_tier.needed)} more in fully-paid sales to reach ${commission.next_tier.label} (${commission.next_tier.rate_percent}%).` : "You are on the top tier."}</p>
          <div className="agent-kit-money">
            <div><small>Earned</small><strong>{naira(commission.earned)}</strong></div>
            <div><small>Paid to you</small><strong>{naira(commission.paid)}</strong></div>
            <div><small>Due</small><strong>{naira(commission.due)}</strong></div>
            <div><small>Reserved, not yet paid</small><strong>~{naira(commission.pipeline_estimate)}</strong></div>
          </div>
          <p className="agent-kit-bar-note">The last figure is an estimate at your current rate on plots you reserved that are not fully paid yet.</p>
        </section>
      </div>

      <section id="leaderboard" className="agent-public-card">
        <div className="agent-public-card-head"><div><h2>Team leaderboard</h2><p>Last {kit.leaderboard.period_days} days.</p></div></div>
        {kit.leaderboard.rows.length ? <div className="agent-public-list">{kit.leaderboard.rows.map((row) => (
          <div className={`agent-public-row${row.is_you ? " is-paid" : ""}`} key={row.rank + row.name}>
            <div><strong>#{row.rank} {row.name}{row.is_you ? " (you)" : ""}</strong><small>{row.leads} leads · {row.inspections} inspections · {row.reservations} reservations</small></div>
            <div><b>{row.sales} sold</b></div>
          </div>
        ))}</div> : <div className="agent-public-empty">The leaderboard fills in as sales are made.</div>}
      </section>
    </>
  );
}
