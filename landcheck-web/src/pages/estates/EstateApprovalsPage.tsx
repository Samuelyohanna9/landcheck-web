import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateModal from "../../components/estates/EstateModal";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";

type MilestoneType = "survey_plan_approval" | "layout_approval" | "governors_consent" | "certificate_of_occupancy";
type MilestoneStatus = "not_started" | "submitted" | "under_review" | "approved" | "rejected";

type Milestone = {
  id: number;
  milestone_type: MilestoneType;
  milestone_label: string;
  status: MilestoneStatus;
  plot_id: number | null;
  plot_number: string | null;
  reference_number: string | null;
  note: string | null;
  is_public: boolean;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
};

type Plot = { id: number; plot_number: string };

const MILESTONE_TYPES: Array<{ value: MilestoneType; label: string }> = [
  { value: "survey_plan_approval", label: "Survey plan approval" },
  { value: "layout_approval", label: "Layout approval" },
  { value: "governors_consent", label: "Governor's Consent" },
  { value: "certificate_of_occupancy", label: "Certificate of Occupancy" },
];

const STATUS_OPTIONS: Array<{ value: MilestoneStatus; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_LABEL: Record<MilestoneStatus, string> = { not_started: "Not started", submitted: "Submitted", under_review: "Under review", approved: "Approved", rejected: "Rejected" };
const STATUS_TONE: Record<MilestoneStatus, string> = { not_started: "neutral", submitted: "info", under_review: "info", approved: "good", rejected: "danger" };

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function EstateApprovalsPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [activity, setActivity] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<MilestoneType>("survey_plan_approval");
  const [newPlotId, setNewPlotId] = useState("");
  const [newStatus, setNewStatus] = useState<MilestoneStatus>("not_started");
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { status: MilestoneStatus; reference_number: string; note: string; is_public: boolean }>>({});

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => setPlots((response.data?.features || []).map((feature: any) => ({ id: feature.properties.id, plot_number: feature.properties.plot_number })))).catch(() => setPlots([]));
    api.get(`/estates/${estateId}/marketing/approvals`).then((response) => {
      const rows: Milestone[] = response.data || [];
      setMilestones(rows);
      const next: Record<number, { status: MilestoneStatus; reference_number: string; note: string; is_public: boolean }> = {};
      rows.forEach((row) => { next[row.id] = { status: row.status, reference_number: row.reference_number || "", note: row.note || "", is_public: row.is_public }; });
      setDrafts(next);
    }).catch(() => setMilestones([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const openAdd = () => {
    setNewType("survey_plan_approval"); setNewPlotId(""); setNewStatus("not_started");
    setShowAdd(true);
  };

  const addMilestone = async () => {
    if (!estateId) return;
    setAdding(true);
    try {
      await api.post(`/estates/${estateId}/marketing/approvals`, {
        milestone_type: newType,
        plot_id: newPlotId ? Number(newPlotId) : null,
        status: newStatus,
      });
      toast.success("Milestone added.");
      setShowAdd(false);
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The milestone could not be added."));
    } finally {
      setAdding(false);
    }
  };

  const updateDraft = (id: number, patch: Partial<{ status: MilestoneStatus; reference_number: string; note: string; is_public: boolean }>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const saveMilestone = async (milestone: Milestone) => {
    const draft = drafts[milestone.id];
    if (!draft) return;
    setSavingId(milestone.id);
    try {
      const response = await api.patch(`/estates/marketing/approvals/${milestone.id}`, {
        status: draft.status,
        reference_number: draft.reference_number.trim() || null,
        note: draft.note.trim() || null,
        is_public: draft.is_public,
      });
      setMilestones((current) => current.map((row) => (row.id === milestone.id ? response.data : row)));
      toast.success(draft.is_public ? "Saved - this milestone now shows on the public page." : "Saved.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not save this milestone."));
    } finally {
      setSavingId(null);
    }
  };

  const deleteMilestone = async (milestone: Milestone) => {
    if (!window.confirm(`Delete this ${milestone.milestone_label} milestone?`)) return;
    try {
      await api.delete(`/estates/marketing/approvals/${milestone.id}`);
      toast.success("Milestone deleted.");
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not delete this milestone."));
    }
  };

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [
        { key: "create", label: "Create", buttons: [{ key: "add", label: "Add Milestone", icon: "certificate", onClick: openAdd }] },
        { key: "data", label: "Data", buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: load }] },
      ],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="approvals" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <p className="edash-status-row-desc" style={{ marginBottom: 16 }}>
        Track the government approvals a Nigerian estate needs - survey plan approval, layout approval, Governor's Consent and
        Certificate of Occupancy - either for the whole estate or for one plot. Turn on "Show on public page" once a milestone
        is ready for buyers to see, so approval progress doesn't feel like a black box.
      </p>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Approval milestones ({milestones.length})</h3></div>
          {milestones.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {milestones.map((milestone) => {
                const draft = drafts[milestone.id] || { status: milestone.status, reference_number: milestone.reference_number || "", note: milestone.note || "", is_public: milestone.is_public };
                return (
                  <div key={milestone.id} className="edash-info-card" style={{ margin: 0 }}>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">{milestone.milestone_label}{milestone.plot_number ? ` - Plot ${milestone.plot_number}` : " - Whole estate"}</span>
                        <span className={`edash-status-pill tone-${STATUS_TONE[milestone.status]}`}>{STATUS_LABEL[milestone.status]}</span>
                      </div>
                      {milestone.approved_at && <p className="edash-status-row-desc">Approved {formatDate(milestone.approved_at)}</p>}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                        <label className="edash-field" style={{ minWidth: 150 }}>
                          <span>Status</span>
                          <select value={draft.status} onChange={(event) => updateDraft(milestone.id, { status: event.target.value as MilestoneStatus })}>
                            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <label className="edash-field" style={{ minWidth: 180 }}>
                          <span>Reference number</span>
                          <input value={draft.reference_number} onChange={(event) => updateDraft(milestone.id, { reference_number: event.target.value })} placeholder="Optional" />
                        </label>
                        <label className="edash-field" style={{ flex: 1, minWidth: 200 }}>
                          <span>Internal note</span>
                          <input value={draft.note} onChange={(event) => updateDraft(milestone.id, { note: event.target.value })} placeholder="Staff-only context" />
                        </label>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".82rem" }}>
                          <input type="checkbox" checked={draft.is_public} onChange={(event) => updateDraft(milestone.id, { is_public: event.target.checked })} />
                          Show on public page
                        </label>
                        <button type="button" className="edash-btn-primary" disabled={savingId === milestone.id} onClick={() => void saveMilestone(milestone)}>
                          {savingId === milestone.id ? "Saving..." : "Save"}
                        </button>
                        <button type="button" className="edash-btn-outline" onClick={() => void deleteMilestone(milestone)}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="edash-tab-empty">No approval milestones yet. Use "Add Milestone" above.</p>}
        </div>
      </div>

      {showAdd && (
        <EstateModal title="Add an approval milestone" subtitle="Track a government approval for this estate or one of its plots." onClose={() => setShowAdd(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Milestone</span>
            <select value={newType} onChange={(event) => setNewType(event.target.value as MilestoneType)}>
              {MILESTONE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Plot (optional - leave blank for a whole-estate milestone)</span>
            <select value={newPlotId} onChange={(event) => setNewPlotId(event.target.value)}>
              <option value="">Whole estate</option>
              {plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.plot_number}</option>)}
            </select>
          </label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Initial status</span>
            <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as MilestoneStatus)}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="button" className="edash-btn-primary" disabled={adding} onClick={() => void addMilestone()}>
            {adding ? "Adding..." : "Add milestone"}
          </button>
        </EstateModal>
      )}
    </EstateShell>
  );
}
