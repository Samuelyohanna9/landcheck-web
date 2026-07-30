import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/client";
import type { Project, WorkflowProfile } from "../../pages/GreenWork";

// Next extraction candidate after this one: the inlined "overview" panel in GreenWork.tsx
// (~line 16841 as of this writing) - not attempted here, documented for a future pass.

const COPY_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

type ImpactComment = {
  id: number;
  commenter_name: string;
  commenter_rank?: string | null;
  commenter_org?: string | null;
  project_name?: string | null;
  comment_body: string;
  created_at?: string | null;
};

type GreenWorkShareImpactPanelProps = {
  orgSlug: string | null;
  orgProjects: Project[];
  shareProjectId: string;
  onProjectChange: (id: string) => void;
  workflowProfile: WorkflowProfile;
};

export default function GreenWorkShareImpactPanel({
  orgSlug,
  orgProjects,
  shareProjectId,
  onProjectChange,
  workflowProfile,
}: GreenWorkShareImpactPanelProps) {
  const [orgCopied, setOrgCopied] = useState(false);
  const [projCopied, setProjCopied] = useState(false);
  const [comments, setComments] = useState<ImpactComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  useEffect(() => {
    if (!orgSlug) return;
    setCommentsLoading(true);
    api.get<ImpactComment[]>(`/green/public/impact/${encodeURIComponent(orgSlug)}/comments`)
      .then((r) => setComments(r.data))
      .catch(() => {})
      .finally(() => { setCommentsLoading(false); setCommentsLoaded(true); });
  }, [orgSlug]);

  const orgImpactUrl = orgSlug ? `https://landcheck.online/impact/${encodeURIComponent(orgSlug)}` : null;
  const selectedProject = orgProjects.find((p) => String(p.id) === shareProjectId) || null;
  const projImpactUrl = orgSlug && shareProjectId
    ? `https://landcheck.online/impact/${encodeURIComponent(orgSlug)}?project=${encodeURIComponent(shareProjectId)}`
    : null;

  const copyToClipboard = (url: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
    setCopied(true);
    toast.success("Impact link copied to clipboard!", { duration: 3000 });
    setTimeout(() => setCopied(false), 2200);
  };

  const modeLabel =
    workflowProfile === "agric"
      ? "Agric Programme"
      : workflowProfile === "relief_recovery"
        ? "Relief Programme"
        : workflowProfile === "csr"
          ? "CSR Programme"
          : "Tree Planting Programme";
  const entityPl = workflowProfile === "agric" ? "farms" : workflowProfile === "relief_recovery" ? "sites" : "trees";

  return (
    <div className="green-work-card green-work-share-impact">
      <h3>Share Impact Page</h3>
      <p className="green-work-note">
        Share a public, donor-ready impact page showing your verified {modeLabel} data — supervisor-approved records, GPS maps, evidence photos, and field activities.
      </p>

      {!orgSlug ? (
        <div className="green-work-note danger green-work-share-warning">
          This organisation does not have a public impact page slug configured. Contact LandCheck support to set one up before sharing with donors.
        </div>
      ) : (
        <>
          <div className="green-work-share-block">
            <div className="green-work-share-block-title">Organisation-wide Impact Page</div>
            <p className="green-work-note">
              Shows all your organisation's approved {entityPl} across all projects — best for sharing with major donors who want the full picture.
            </p>
            <div className="green-work-share-link-row">
              <div className="green-work-share-link-box">{orgImpactUrl}</div>
              <button
                type="button"
                onClick={() => copyToClipboard(orgImpactUrl!, setOrgCopied)}
                className={`green-work-share-copy-btn ${orgCopied ? "is-copied" : ""}`}
              >
                {COPY_ICON} {orgCopied ? "Copied!" : "Copy Link"}
              </button>
              <a href={orgImpactUrl!} target="_blank" rel="noopener noreferrer" className="green-work-share-preview-link">
                Preview
              </a>
            </div>
          </div>

          <div className="green-work-share-block green-work-share-block-divided">
            <div className="green-work-share-block-title">Share a Specific Project</div>
            <p className="green-work-note">
              Select a project to generate a focused link that only shows that project's data — useful when you want to update a specific donor on one programme.
            </p>
            <select
              value={shareProjectId}
              onChange={(e) => onProjectChange(e.target.value)}
              className="green-work-share-select"
            >
              <option value="">Select a project</option>
              {orgProjects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}{p.location_text ? ` · ${p.location_text}` : ""}
                </option>
              ))}
            </select>

            {projImpactUrl && selectedProject ? (
              <>
                <div className="green-work-share-link-row">
                  <div className="green-work-share-link-box">{projImpactUrl}</div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(projImpactUrl, setProjCopied)}
                    className={`green-work-share-copy-btn ${projCopied ? "is-copied" : ""}`}
                  >
                    {COPY_ICON} {projCopied ? "Copied!" : "Copy Link"}
                  </button>
                  <a href={projImpactUrl} target="_blank" rel="noopener noreferrer" className="green-work-share-preview-link">
                    Preview
                  </a>
                </div>
                <p className="green-work-note">
                  Showing impact for: <strong>{selectedProject.name}</strong>
                  {selectedProject.location_text ? ` · ${selectedProject.location_text}` : ""}
                </p>
              </>
            ) : (
              orgProjects.length === 0 && (
                <p className="green-work-note">No projects available under this organisation.</p>
              )
            )}
          </div>
        </>
      )}

      {orgSlug && (
        <div className="green-work-share-block green-work-share-block-divided">
          <div className="green-work-share-block-title">Endorsements Received</div>
          <p className="green-work-note">
            Public comments and endorsements left by donors, officials, and reviewers on your impact page.
          </p>
          {commentsLoading && <p className="green-work-note">Loading endorsements...</p>}
          {commentsLoaded && comments.length === 0 && (
            <p className="green-work-note green-work-share-empty-note">No endorsements yet. They will appear here once visitors leave comments on your impact page.</p>
          )}
          {commentsLoaded && comments.length > 0 && (
            <div className="green-work-share-comments">
              {comments.map((c) => (
                <div key={c.id} className="green-work-share-comment-card">
                  <div className="green-work-share-comment-meta">
                    <div className="green-work-share-comment-avatar">
                      {c.commenter_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="green-work-share-comment-name">{c.commenter_name}</div>
                      {(c.commenter_rank || c.commenter_org) && (
                        <div className="green-work-share-comment-role">
                          {[c.commenter_rank, c.commenter_org].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {c.created_at && (
                      <div className="green-work-share-comment-date">
                        {new Date(c.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                  {c.project_name && (
                    <div className="green-work-share-comment-project-pill">{c.project_name}</div>
                  )}
                  <div className="green-work-share-comment-body">{c.comment_body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
