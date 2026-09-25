import { useEffect, useState } from "react";
import { API_URL, api } from "../../../api/client";
import { formatDate } from "../../../utils/estateMarketing";

type Update = {
  id: string; kind: string; title: string; body: string | null; plot_number: string | null;
  media_type: "none" | "image" | "video" | "link"; media_url: string | null; captured_at: string;
  verification: "on_plot" | "on_estate" | "near_estate" | "outside" | "unverified"; verification_label: string;
};

const KIND_LABEL: Record<string, string> = { photo: "Photo", video: "Video", drone: "Drone", milestone: "Milestone", note: "Update" };

export default function PublicProgressSection({ slug, onLoaded }: { slug: string; onLoaded?: (count: number) => void }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [open, setOpen] = useState<Update | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/estates/public/${slug}/progress`).then((response) => { if (!cancelled) { setUpdates(response.data.updates || []); onLoaded?.((response.data.updates || []).length); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (!updates.length) return null;
  const mediaSrc = (item: Update) => (item.media_type === "link" ? item.media_url || "" : `${API_URL}${item.media_url}`);

  return (
    <section id="progress" className="estate-public-progress" aria-labelledby="estate-public-progress-title">
      <div className="estate-public-section-head"><div><p className="estate-public-kicker">Straight from the site</p><h2 id="estate-public-progress-title">Site updates</h2></div></div>
      <div className="estate-public-progress-grid">
        {updates.map((item) => (
          <article key={item.id} className="estate-public-progress-card">
            <button type="button" className="estate-public-progress-media" onClick={() => item.media_type !== "none" && setOpen(item)} aria-label={`Open ${item.title}`}>
              {item.media_type === "image" && <img src={mediaSrc(item)} alt={item.title} loading="lazy" />}
              {item.media_type === "video" && <><video src={mediaSrc(item)} preload="metadata" muted playsInline /><span className="estate-public-progress-play">&#9654;</span></>}
              {item.media_type === "link" && <span className="estate-public-progress-link">&#9654; Watch video</span>}
              {item.media_type === "none" && <span className="estate-public-progress-link">{KIND_LABEL[item.kind] || "Update"}</span>}
              <i className={`estate-public-verify is-${item.verification}`}>{item.verification === "on_plot" || item.verification === "on_estate" ? "✓ " : ""}{item.verification_label}</i>
            </button>
            <div className="estate-public-progress-body">
              <span>{KIND_LABEL[item.kind] || "Update"} &middot; {formatDate(item.captured_at)}{item.plot_number ? ` · Plot ${item.plot_number}` : ""}</span>
              <h3>{item.title}</h3>
              {item.body && <p>{item.body}</p>}
            </div>
          </article>
        ))}
      </div>
      <p className="estate-public-progress-note">&quot;Captured on the plot / inside the estate&quot; means the photo or video's GPS position was checked against the plot or estate boundary when it was uploaded.</p>
      {open && (
        <div className="estate-public-lightbox" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpen(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            {open.media_type === "image" && <img src={mediaSrc(open)} alt={open.title} />}
            {open.media_type === "video" && <video src={mediaSrc(open)} controls autoPlay playsInline />}
            {open.media_type === "link" && <a className="estate-public-primary" href={mediaSrc(open)} target="_blank" rel="noreferrer">Open video</a>}
            <p><strong>{open.title}</strong> &middot; {open.verification_label}</p>
            <button type="button" className="estate-public-ghost" onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}
