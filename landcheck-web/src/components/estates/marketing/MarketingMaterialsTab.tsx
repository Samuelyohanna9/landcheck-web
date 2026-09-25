import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../../api/client";
import { AD_STYLES, adFormatsFor, copyText, downloadFile, fetchBlobUrl, naira, whatsappShareHref, type AdFormat, type AdStyle, type ShareLinks } from "../../../utils/estateMarketing";
import EstateIcon from "../EstateIcon";

type Campaign = { id: number; code: string; name: string; channel: string; assigned_agent_subject_id?: string | null };

function AdPreview({ path, params, alt, className = "edash-mk-preview" }: { path: string; params?: Record<string, unknown>; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify([path, params]);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setUrl(null);
    setFailed(false);
    fetchBlobUrl(path, params).then((value) => {
      if (cancelled) { URL.revokeObjectURL(value); return; }
      created = value;
      setUrl(value);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className={className}>{url ? <img src={url} alt={alt} /> : failed ? <span style={{ fontSize: ".74rem", padding: 12, textAlign: "center" }}>Preview unavailable</span> : <span style={{ fontSize: ".74rem" }}>Preparing preview...</span>}</div>;
}

export default function MarketingMaterialsTab({ estateId, estateName, published }: { estateId: string; estateName: string; published: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [share, setShare] = useState<ShareLinks | null>(null);
  const [plotId, setPlotId] = useState<number | null>(null);
  const [plotFormat, setPlotFormat] = useState<AdFormat>("post");
  const [style, setStyle] = useState<AdStyle>("promo");
  const [plotSearch, setPlotSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [linkName, setLinkName] = useState("");
  const [linkChannel, setLinkChannel] = useState("whatsapp");
  const [creating, setCreating] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      const response = await api.get<Campaign[]>(`/estates/${estateId}/qr-campaigns`);
      setCampaigns(response.data || []);
    } catch { setCampaigns([]); }
  }, [estateId]);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    if (!published) return;
    let cancelled = false;
    api.get<ShareLinks>(`/estates/${estateId}/marketing/share-links`, { params: campaignId ? { campaign_id: campaignId } : undefined })
      .then((response) => {
        if (cancelled) return;
        setShare(response.data);
        setPlotId((current) => (current && response.data.plots.some((plot) => plot.id === current) ? current : response.data.plots[0]?.id ?? null));
      })
      .catch(() => { if (!cancelled) setShare(null); });
    return () => { cancelled = true; };
  }, [estateId, campaignId, published]);

  const params = useMemo(() => (campaignId ? { campaign_id: campaignId } : undefined), [campaignId]);
  const formats = adFormatsFor(style);
  const activePlotFormat: AdFormat = formats.some((format) => format.key === plotFormat) ? plotFormat : "post";
  const filteredPlots = useMemo(() => {
    const q = plotSearch.trim().toLowerCase();
    return (share?.plots || []).filter((plot) => !q || plot.plot_number.toLowerCase().includes(q));
  }, [share, plotSearch]);
  const selectedPlot = share?.plots.find((plot) => plot.id === plotId) || null;
  const safeName = estateName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "estate";

  const download = async (key: string, path: string, filename: string, extra?: Record<string, unknown>) => {
    setBusy(key);
    try {
      await downloadFile(path, filename, { ...(params || {}), ...(extra || {}) });
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The file could not be prepared."));
    } finally {
      setBusy(null);
    }
  };

  const createLink = async () => {
    if (!linkName.trim()) return;
    setCreating(true);
    try {
      const response = await api.post<Campaign>(`/estates/${estateId}/qr-campaigns`, { name: linkName.trim(), channel: linkChannel });
      setLinkName("");
      await loadCampaigns();
      setCampaignId(String(response.data.id));
      toast.success("Tracked link created. Materials below now carry it.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The link could not be created."));
    } finally {
      setCreating(false);
    }
  };

  const copy = async (value: string, label: string) => {
    if (await copyText(value)) toast.success(`${label} copied.`);
    else toast.error("Copy failed - select the link and copy it manually.");
  };

  if (!published) {
    return <div className="edash-card"><div className="edash-card-inner"><p className="edash-mk-empty">Publish your Estate page in Settings to generate flyers, ads and share links. They point buyers to that page.</p></div></div>;
  }

  return (
    <div className="edash-mk-stack">
      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head"><h3 className="edash-card-title">1. Choose the link your materials carry</h3></div>
        <div className="edash-mk-form-grid">
          <label className="edash-field is-wide"><span>Tracked link</span>
            <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
              <option value="">Company page (no tracking)</option>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.channel.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="edash-field"><span>New link name</span><input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="e.g. Instagram bio" maxLength={80} /></label>
          <label className="edash-field"><span>Channel</span>
            <select value={linkChannel} onChange={(event) => setLinkChannel(event.target.value)}>
              <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option><option value="brochure">Brochure / flyer</option><option value="billboard">Billboard</option><option value="other">Other</option>
            </select>
          </label>
          <div className="is-full" style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="edash-btn-outline" disabled={creating || !linkName.trim()} onClick={() => void createLink()}>{creating ? "Creating..." : "Create tracked link"}</button>
          </div>
        </div>
        <p className="edash-mk-hint">Every flyer, ad and link below carries the link you pick, so Overview shows which channel really produces reservations.</p>
      </div></div>

      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head">
          <h3 className="edash-card-title">2. Estate marketing kit</h3>
          <div className="edash-mk-segment" role="group" aria-label="Design style">
            {AD_STYLES.map((item) => <button key={item.key} type="button" title={item.hint} className={style === item.key ? "is-active" : ""} onClick={() => setStyle(item.key)}>{item.label}</button>)}
          </div>
        </div>
        <p className="edash-mk-hint" style={{ margin: "0 0 12px" }}>{style === "promo" ? "Bright poster with your logo colours, a price ribbon, plot sizes and prices, and a satellite view of the estate." : "Dark premium design with the live plot map."} Always shows today's availability.</p>
        <div className="edash-mk-materials">
          <div className="edash-mk-material">
            <div className="edash-mk-preview is-doc"><EstateIcon name="documents" /></div>
            <div className="edash-mk-material-body"><strong>One-page flyer</strong><span>A4 PDF with map, prices and QR code - print or send on WhatsApp.</span>
              <button type="button" className="edash-btn-outline" disabled={busy === "flyer"} onClick={() => void download("flyer", `/estates/${estateId}/marketing/materials/flyer.pdf`, `${safeName}-flyer.pdf`)}><EstateIcon name="download" />{busy === "flyer" ? "Preparing..." : "Download PDF"}</button></div>
          </div>
          <div className="edash-mk-material">
            <div className="edash-mk-preview is-doc"><EstateIcon name="reports" /></div>
            <div className="edash-mk-material-body"><strong>Estate brochure</strong><span>Multi-page PDF: about, area outlook, layout, price list and how to buy.</span>
              <button type="button" className="edash-btn-outline" disabled={busy === "brochure"} onClick={() => void download("brochure", `/estates/${estateId}/marketing/materials/brochure.pdf`, `${safeName}-brochure.pdf`)}><EstateIcon name="download" />{busy === "brochure" ? "Preparing..." : "Download PDF"}</button></div>
          </div>
          {formats.map((format) => (
            <div className="edash-mk-material" key={`${style}-${format.key}`}>
              <AdPreview path={`/estates/${estateId}/marketing/materials/ad.png`} params={{ ...(params || {}), format: format.key, style }} alt={`${format.label} preview`} />
              <div className="edash-mk-material-body"><strong>{format.label}</strong><span>{format.hint}</span>
                <button type="button" className="edash-btn-outline" disabled={busy === `ad-${format.key}`} onClick={() => void download(`ad-${format.key}`, `/estates/${estateId}/marketing/materials/ad.png`, `${safeName}-${style}-${format.key}.png`, { format: format.key, style })}><EstateIcon name="download" />{busy === `ad-${format.key}` ? "Preparing..." : "Download image"}</button></div>
            </div>
          ))}
        </div>
      </div></div>

      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head"><h3 className="edash-card-title">3. Share a single plot</h3><span className="edash-field-note">Rich WhatsApp preview with satellite crop, price and status</span></div>
        {!share || share.plots.length === 0 ? <p className="edash-mk-empty">No plots are available to advertise right now.</p> : (
          <div className="edash-mk-plot-picker">
            <div>
              <label className="edash-field" style={{ marginBottom: 8 }}><span>Find plot</span><input value={plotSearch} onChange={(event) => setPlotSearch(event.target.value)} placeholder="Plot number" /></label>
              <div className="edash-mk-plot-list">
                {filteredPlots.map((plot) => (
                  <button key={plot.id} type="button" className={`edash-mk-plot-row${plot.id === plotId ? " is-selected" : ""}`} onClick={() => setPlotId(plot.id)}>
                    <strong>Plot {plot.plot_number}</strong><span>{plot.area_sqm ? `${Math.round(plot.area_sqm).toLocaleString()} m²` : ""}{plot.price ? ` · ${naira(plot.price)}` : ""}</span>
                  </button>
                ))}
                {filteredPlots.length === 0 && <p className="edash-mk-empty">No match.</p>}
              </div>
            </div>
            {selectedPlot && (
              <div className="edash-mk-plot-preview">
                <div className="edash-mk-segment" role="group" aria-label="Format" style={{ alignSelf: "flex-start" }}>
                  {formats.map((format) => <button key={format.key} type="button" className={activePlotFormat === format.key ? "is-active" : ""} onClick={() => setPlotFormat(format.key)}>{format.short}</button>)}
                </div>
                <AdPreview path={`/estates/${estateId}/marketing/materials/plots/${selectedPlot.id}/ad.png`} params={{ ...(params || {}), format: activePlotFormat, style }} alt={`Plot ${selectedPlot.plot_number} ad`} />
                <div className="edash-mk-actions" style={{ justifyContent: "flex-start" }}>
                  <button type="button" className="edash-btn-primary" disabled={busy === "plot-ad"} onClick={() => void download("plot-ad", `/estates/${estateId}/marketing/materials/plots/${selectedPlot.id}/ad.png`, `${safeName}-plot-${selectedPlot.plot_number}-${style}-${activePlotFormat}.png`, { format: activePlotFormat, style })}><EstateIcon name="download" />{busy === "plot-ad" ? "Preparing..." : "Download image"}</button>
                  <a className="edash-mk-chip-btn is-wa" href={whatsappShareHref(`Plot ${selectedPlot.plot_number} at ${estateName}${selectedPlot.price ? ` - ${naira(selectedPlot.price)}` : ""}. See it on the live map: ${selectedPlot.share_url}`)} target="_blank" rel="noreferrer"><EstateIcon name="whatsapp" />Share on WhatsApp</a>
                  <button type="button" className="edash-mk-chip-btn" onClick={() => void copy(selectedPlot.share_url, "Share link")}><EstateIcon name="share" />Copy share link</button>
                </div>
                <div className="edash-mk-link-box"><EstateIcon name="qr" /><span>{selectedPlot.share_url}</span></div>
              </div>
            )}
          </div>
        )}
      </div></div>

      {share && (
        <div className="edash-card"><div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Share the whole estate</h3></div>
          <div className="edash-mk-link-box" style={{ marginBottom: 10 }}><EstateIcon name="share" /><span>{share.share_url}</span></div>
          <div className="edash-mk-actions" style={{ justifyContent: "flex-start" }}>
            <a className="edash-mk-chip-btn is-wa" href={whatsappShareHref(share.whatsapp_text)} target="_blank" rel="noreferrer"><EstateIcon name="whatsapp" />Share on WhatsApp</a>
            <button type="button" className="edash-mk-chip-btn" onClick={() => void copy(share.share_url, "Share link")}>Copy share link</button>
            <button type="button" className="edash-mk-chip-btn" onClick={() => void copy(share.page_url, "Page link")}>Copy direct page link</button>
          </div>
          <p className="edash-mk-hint">The share link shows a preview card (estate map, availability) in WhatsApp, Facebook and X before anyone taps it. The direct page link opens the page without a preview card.</p>
        </div></div>
      )}
    </div>
  );
}
