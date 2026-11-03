import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import EstateShell from "../../components/estates/EstateShell";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import EstateModal from "../../components/estates/EstateModal";
import DrawingMeasureTool from "../../components/estates/DrawingMeasureTool";
import { money } from "../../components/estates/FinancialComponents";
import { getEstateQueryScope, useEstatePlotsQuery } from "../../query/estateQueries";

type Contractor = { id: number; name: string; trade: string | null; contact_phone: string | null; contact_email: string | null; payment_terms: string | null };
type BudgetLine = { id: number | null; category: string; budgeted_amount: number; actual_amount?: number; notes?: string | null };
type Budget = { id: number | null; plot_id: number; total_budget: number | null; currency: string; lines: BudgetLine[] };
type DrawRequest = {
  id: number; request_uid: string; budget_line_id: number; contractor_id: number; amount_requested: number;
  percent_complete_claimed: number | null; retention_amount: number | null; note: string | null; status: string;
  created_at: string; reviewed_at: string | null; paid_at: string | null;
};
type BOQLine = { id: number | null; category: string | null; description: string; unit: string | null; quantity: number; rate: number; amount?: number };
type BOQ = { id: number | null; plot_id: number; title: string | null; lines: BOQLine[]; total: number };
type Drawing = { document_id: number; filename: string; document_type: string; supersedes_document_id: number | null; created_at: string; approval_status: string | null; approval_note: string | null; reviewed_at: string | null };
type RFI = { id: number; plot_id: number; question: string; status: string; created_at: string; answer: string | null; answered_at: string | null; closed_at: string | null };
type SiteInspection = { id: number; plot_id: number; visit_date: string; notes: string | null; phase_at_inspection: string | null; signed_off: boolean; created_at: string };
type SnagItem = { id: number; plot_id: number; description: string; status: string; assigned_to_contractor_id: number | null; created_at: string; fixed_at: string | null; verified_at: string | null };

const STATUS_TONE: Record<string, string> = { requested: "warn", in_review: "info", declined: "danger", paid: "good", open: "warn", answered: "info", closed: "good", fixed: "info", verified: "good", submitted: "warn", approved: "good", revision_requested: "danger" };
const DRAWING_TYPES = [
  { value: "building_plan", label: "Building plan" },
  { value: "structural_drawing", label: "Structural drawing" },
  { value: "mep_drawing", label: "MEP drawing" },
  { value: "site_plan", label: "Site plan" },
];
const PHASES = [
  { value: "not_started", label: "Not started" }, { value: "site_cleared", label: "Site cleared" }, { value: "foundation", label: "Foundation" },
  { value: "under_construction", label: "Under construction" }, { value: "developed", label: "Developed" },
];

export default function EstateConstructionPage() {
  const { estateId } = useParams();
  const estateQueryScope = getEstateQueryScope(getEstateAuthSession());
  const plotsQuery = useEstatePlotsQuery(estateQueryScope, estateId);
  const plots = (plotsQuery.data?.features || []).map((feature: any) => feature.properties) as Array<{ id: number; plot_number: string }>;

  const [estateName, setEstateName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [draws, setDraws] = useState<DrawRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [newContractor, setNewContractor] = useState({ name: "", trade: "", contact_phone: "", contact_email: "" });
  const [newDraw, setNewDraw] = useState({ budget_line_id: "", contractor_id: "", amount_requested: "", percent_complete_claimed: "", note: "" });
  const [payDraw, setPayDraw] = useState<DrawRequest | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: "", payment_method: "", reference_no: "", notes: "" });

  // The plot workspace - everything below this point is scoped to one chosen plot.
  const [workspacePlotId, setWorkspacePlotId] = useState<number | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [boq, setBoq] = useState<BOQ | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [inspections, setInspections] = useState<SiteInspection[]>([]);
  const [snags, setSnags] = useState<SnagItem[]>([]);
  const [newRfi, setNewRfi] = useState("");
  const [newSnag, setNewSnag] = useState("");
  const [newInspection, setNewInspection] = useState({ visit_date: "", phase_at_inspection: "", notes: "", signed_off: false });
  const [newDrawingType, setNewDrawingType] = useState("building_plan");
  const [newDrawingSupersedes, setNewDrawingSupersedes] = useState("");
  const drawingFileRef = useRef<HTMLInputElement | null>(null);
  const [measureDoc, setMeasureDoc] = useState<Drawing | null>(null);
  const [rfiAnswerDrafts, setRfiAnswerDrafts] = useState<Record<number, string>>({});

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => { setEstateName(response.data.name); setOrganizationId(response.data.organization_id); }).catch(() => undefined);
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const loadContractors = (orgId: number) => api.get(`/estates/organizations/${orgId}/contractors`).then((response) => setContractors(response.data || [])).catch(() => undefined);
  const loadDraws = (orgId: number) => api.get(`/estates/organizations/${orgId}/construction-draw-requests`).then((response) => setDraws(response.data || [])).catch(() => undefined);
  useEffect(() => { if (organizationId) { void loadContractors(organizationId); void loadDraws(organizationId); } }, [organizationId]);

  const addContractor = async () => {
    if (!organizationId || !newContractor.name.trim()) { toast.error("Enter a contractor name."); return; }
    setBusy("add-contractor");
    try {
      await api.post(`/estates/organizations/${organizationId}/contractors`, { ...newContractor, trade: newContractor.trade || null, contact_phone: newContractor.contact_phone || null, contact_email: newContractor.contact_email || null });
      toast.success("Contractor added.");
      setNewContractor({ name: "", trade: "", contact_phone: "", contact_email: "" });
      await loadContractors(organizationId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not add this contractor.")); } finally { setBusy(null); }
  };

  // ── Plot workspace loaders ──────────────────────────────────────────────────────────────────
  const loadWorkspace = (plotId: number) => {
    api.get(`/estates/plots/${plotId}/boq`).then((response) => setBoq(response.data)).catch(() => setBoq(null));
    api.get(`/estates/plots/${plotId}/drawings`).then((response) => setDrawings(response.data || [])).catch(() => setDrawings([]));
    api.get(`/estates/plots/${plotId}/rfis`).then((response) => setRfis(response.data || [])).catch(() => setRfis([]));
    api.get(`/estates/plots/${plotId}/site-inspections`).then((response) => setInspections(response.data || [])).catch(() => setInspections([]));
    api.get(`/estates/plots/${plotId}/snag-items`).then((response) => setSnags(response.data || [])).catch(() => setSnags([]));
  };
  const chooseWorkspacePlot = (plotId: number | null) => {
    setWorkspacePlotId(plotId); setBudgetOpen(false); setBudget(null);
    if (plotId) loadWorkspace(plotId);
  };

  // ── Budget ───────────────────────────────────────────────────────────────────────────────────
  const openBudget = async () => {
    if (!workspacePlotId) return;
    setBudgetOpen(true);
    try { setBudget((await api.get(`/estates/plots/${workspacePlotId}/construction-budget`)).data); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not load this plot's budget.")); setBudgetOpen(false); }
  };
  const saveBudget = async () => {
    if (!workspacePlotId || !budget) return;
    setBusy("save-budget");
    try {
      const response = await api.put(`/estates/plots/${workspacePlotId}/construction-budget`, {
        total_budget: budget.total_budget === null ? null : Number(budget.total_budget),
        currency: budget.currency || "NGN",
        lines: budget.lines.map((line) => ({ id: line.id, category: line.category, budgeted_amount: Number(line.budgeted_amount || 0), notes: line.notes || null })),
      });
      setBudget(response.data);
      toast.success("Budget saved.");
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not save this budget.")); } finally { setBusy(null); }
  };

  // ── BOQ ──────────────────────────────────────────────────────────────────────────────────────
  const saveBoq = async () => {
    if (!workspacePlotId || !boq) return;
    setBusy("save-boq");
    try {
      const response = await api.put(`/estates/plots/${workspacePlotId}/boq`, {
        title: boq.title,
        lines: boq.lines.map((line) => ({ id: line.id, category: line.category || null, description: line.description, unit: line.unit || null, quantity: Number(line.quantity || 0), rate: Number(line.rate || 0) })),
      });
      setBoq(response.data);
      toast.success("Bill of Quantities saved.");
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not save the BOQ.")); } finally { setBusy(null); }
  };
  const applyBoqToBudget = async () => {
    if (!workspacePlotId) return;
    setBusy("apply-boq");
    try {
      await api.post(`/estates/plots/${workspacePlotId}/boq/apply-to-budget`);
      toast.success("Budget updated from the BOQ.");
      if (budgetOpen) setBudget((await api.get(`/estates/plots/${workspacePlotId}/construction-budget`)).data);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not apply the BOQ to the budget.")); } finally { setBusy(null); }
  };

  // ── Drawings ─────────────────────────────────────────────────────────────────────────────────
  const uploadDrawing = async () => {
    const file = drawingFileRef.current?.files?.[0];
    if (!workspacePlotId || !file) { toast.error("Choose a file first."); return; }
    setBusy("upload-drawing");
    try {
      const form = new FormData();
      form.append("file", file);
      const params = new URLSearchParams({ entity_type: "plot", entity_id: String(workspacePlotId), document_type: newDrawingType });
      if (newDrawingSupersedes) params.set("supersedes_document_id", newDrawingSupersedes);
      const uploaded = await api.post(`/estates/documents?${params.toString()}`, form);
      await api.post(`/estates/documents/${uploaded.data.id}/submit-for-approval`);
      toast.success("Drawing uploaded and submitted for approval.");
      if (drawingFileRef.current) drawingFileRef.current.value = "";
      setNewDrawingSupersedes("");
      loadWorkspace(workspacePlotId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not upload this drawing.")); } finally { setBusy(null); }
  };
  const reviewDrawing = async (documentId: number, status: "approved" | "revision_requested") => {
    if (!workspacePlotId) return;
    setBusy(`review-drawing-${documentId}`);
    try {
      await api.post(`/estates/documents/${documentId}/review-approval`, { status });
      toast.success(status === "approved" ? "Drawing approved." : "Revision requested.");
      loadWorkspace(workspacePlotId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not review this drawing.")); } finally { setBusy(null); }
  };

  // ── RFIs ─────────────────────────────────────────────────────────────────────────────────────
  const createRfi = async () => {
    if (!workspacePlotId || !newRfi.trim()) return;
    setBusy("create-rfi");
    try {
      await api.post(`/estates/plots/${workspacePlotId}/rfis`, { question: newRfi.trim() });
      setNewRfi("");
      loadWorkspace(workspacePlotId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not raise this RFI.")); } finally { setBusy(null); }
  };
  const answerRfi = async (rfi: RFI) => {
    const answer = (rfiAnswerDrafts[rfi.id] || "").trim();
    if (!answer || !workspacePlotId) { toast.error("Write an answer first."); return; }
    setBusy(`answer-rfi-${rfi.id}`);
    try {
      await api.post(`/estates/rfis/${rfi.id}/answer`, { answer });
      setRfiAnswerDrafts((current) => ({ ...current, [rfi.id]: "" }));
      loadWorkspace(workspacePlotId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not save this answer.")); } finally { setBusy(null); }
  };
  const closeRfi = async (rfi: RFI) => {
    if (!workspacePlotId) return;
    setBusy(`close-rfi-${rfi.id}`);
    try { await api.post(`/estates/rfis/${rfi.id}/close`); loadWorkspace(workspacePlotId); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not close this RFI.")); } finally { setBusy(null); }
  };

  // ── Site inspections ─────────────────────────────────────────────────────────────────────────
  const createInspection = async () => {
    if (!workspacePlotId || !newInspection.visit_date) { toast.error("Choose a visit date."); return; }
    setBusy("create-inspection");
    try {
      await api.post(`/estates/plots/${workspacePlotId}/site-inspections`, {
        visit_date: new Date(newInspection.visit_date).toISOString(), notes: newInspection.notes || null,
        phase_at_inspection: newInspection.phase_at_inspection || null, signed_off: newInspection.signed_off,
      });
      setNewInspection({ visit_date: "", phase_at_inspection: "", notes: "", signed_off: false });
      loadWorkspace(workspacePlotId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not log this inspection.")); } finally { setBusy(null); }
  };

  // ── Snag items ───────────────────────────────────────────────────────────────────────────────
  const createSnag = async () => {
    if (!workspacePlotId || !newSnag.trim()) return;
    setBusy("create-snag");
    try { await api.post(`/estates/plots/${workspacePlotId}/snag-items`, { description: newSnag.trim() }); setNewSnag(""); loadWorkspace(workspacePlotId); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not log this snag item.")); } finally { setBusy(null); }
  };
  const markSnagFixed = async (snag: SnagItem) => {
    if (!workspacePlotId) return;
    setBusy(`snag-fixed-${snag.id}`);
    try { await api.post(`/estates/snag-items/${snag.id}/mark-fixed`); loadWorkspace(workspacePlotId); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not update this snag item.")); } finally { setBusy(null); }
  };
  const verifySnag = async (snag: SnagItem) => {
    if (!workspacePlotId) return;
    setBusy(`snag-verify-${snag.id}`);
    try { await api.post(`/estates/snag-items/${snag.id}/verify`); loadWorkspace(workspacePlotId); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not verify this snag item.")); } finally { setBusy(null); }
  };

  // ── Draw requests (org-wide) ─────────────────────────────────────────────────────────────────
  const createDraw = async () => {
    if (!organizationId || !newDraw.budget_line_id || !newDraw.contractor_id || !newDraw.amount_requested) { toast.error("Choose a budget line, a contractor and an amount."); return; }
    setBusy("create-draw");
    try {
      await api.post(`/estates/organizations/${organizationId}/construction-draw-requests`, {
        budget_line_id: Number(newDraw.budget_line_id), contractor_id: Number(newDraw.contractor_id), amount_requested: Number(newDraw.amount_requested),
        percent_complete_claimed: newDraw.percent_complete_claimed ? Number(newDraw.percent_complete_claimed) : null, note: newDraw.note || null,
      });
      toast.success("Draw request submitted.");
      setNewDraw({ budget_line_id: "", contractor_id: "", amount_requested: "", percent_complete_claimed: "", note: "" });
      await loadDraws(organizationId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not submit this draw request.")); } finally { setBusy(null); }
  };
  const reviewDraw = async (draw: DrawRequest, status: "in_review" | "declined") => {
    if (!organizationId) return;
    setBusy(`review-${draw.id}`);
    try {
      await api.patch(`/estates/construction-draw-requests/${draw.id}`, { status });
      toast.success(status === "declined" ? "Draw request declined." : "Draw request marked in review.");
      await loadDraws(organizationId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not update this draw request.")); } finally { setBusy(null); }
  };
  const submitPayment = async () => {
    if (!payDraw || !organizationId || !payForm.amount || !payForm.payment_date || !payForm.payment_method) { toast.error("Enter the amount, date and payment method."); return; }
    setBusy("pay-draw");
    try {
      await api.post(`/estates/construction-draw-requests/${payDraw.id}/pay`, {
        amount: Number(payForm.amount), payment_date: new Date(payForm.payment_date).toISOString(), payment_method: payForm.payment_method,
        reference_no: payForm.reference_no || null, notes: payForm.notes || null,
      });
      toast.success("Payment recorded - draw marked paid.");
      setPayDraw(null);
      setPayForm({ amount: "", payment_date: "", payment_method: "", reference_no: "", notes: "" });
      await loadDraws(organizationId);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not record this payment.")); } finally { setBusy(null); }
  };

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    { key: "home", label: "Home", groups: [{ key: "data", label: "Data", buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: load }] }] },
  ];

  const contractorName = (id: number) => contractors.find((item) => item.id === id)?.name || `Contractor #${id}`;
  const workspacePlotNumber = plots.find((plot) => plot.id === workspacePlotId)?.plot_number;
  const isMeasurable = (filename: string) => /\.(png|jpe?g|pdf)$/i.test(filename);

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="construction" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />

      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head"><h3 className="edash-card-title">Plot workspace</h3></div>
        <p className="edash-mk-hint">Pick a plot that's being built, not just sold - budget, Bill of Quantities, drawings, RFIs, site inspections and the snag list all live here, scoped to that one plot.</p>
        <div className="edash-mk-form-grid" style={{ marginTop: 10 }}>
          <label className="edash-field"><span>Plot</span>
            <select value={workspacePlotId ?? ""} onChange={(event) => chooseWorkspacePlot(event.target.value ? Number(event.target.value) : null)}>
              <option value="">Choose a plot...</option>
              {plots.map((plot) => <option key={plot.id} value={plot.id}>Plot {plot.plot_number}</option>)}
            </select>
          </label>
        </div>
      </div></div>

      {workspacePlotId && (
        <>
          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Budget - Plot {workspacePlotNumber}</h3>
              <button type="button" className="edash-btn-outline" onClick={() => void openBudget()}>Open budget</button>
            </div>
          </div></div>

          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Bill of Quantities - Plot {workspacePlotNumber}</h3></div>
            {boq && (
              <>
                <label className="edash-field" style={{ marginBottom: 10 }}><span>Title</span><input value={boq.title || ""} onChange={(event) => setBoq({ ...boq, title: event.target.value })} placeholder="e.g. Main building BOQ" /></label>
                {boq.lines.map((line, index) => (
                  <div key={line.id ?? `new-${index}`} className="edash-mk-form-grid" style={{ marginBottom: 8 }}>
                    <label className="edash-field"><span>Category</span><input value={line.category || ""} onChange={(event) => { const lines = [...boq.lines]; lines[index] = { ...line, category: event.target.value }; setBoq({ ...boq, lines }); }} /></label>
                    <label className="edash-field is-wide"><span>Description</span><input value={line.description} onChange={(event) => { const lines = [...boq.lines]; lines[index] = { ...line, description: event.target.value }; setBoq({ ...boq, lines }); }} /></label>
                    <label className="edash-field"><span>Unit</span><input value={line.unit || ""} onChange={(event) => { const lines = [...boq.lines]; lines[index] = { ...line, unit: event.target.value }; setBoq({ ...boq, lines }); }} placeholder="e.g. m2, bag" /></label>
                    <label className="edash-field"><span>Quantity</span><input type="number" min="0" value={line.quantity} onChange={(event) => { const lines = [...boq.lines]; lines[index] = { ...line, quantity: Number(event.target.value) }; setBoq({ ...boq, lines }); }} /></label>
                    <label className="edash-field"><span>Rate (NGN)</span><input type="number" min="0" value={line.rate} onChange={(event) => { const lines = [...boq.lines]; lines[index] = { ...line, rate: Number(event.target.value) }; setBoq({ ...boq, lines }); }} /></label>
                    {line.id != null && <span className="edash-mk-hint" style={{ alignSelf: "center" }}>{money(line.amount || 0)}</span>}
                    <button type="button" className="edash-card-link" onClick={() => setBoq({ ...boq, lines: boq.lines.filter((_, lineIndex) => lineIndex !== index) })}>Remove</button>
                  </div>
                ))}
                <button type="button" className="edash-btn-outline" onClick={() => setBoq({ ...boq, lines: [...boq.lines, { id: null, category: "", description: "", unit: "", quantity: 0, rate: 0 }] })}>+ Add line</button>
                <div className="edash-sp-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="edash-btn-primary" disabled={busy === "save-boq"} onClick={() => void saveBoq()}>{busy === "save-boq" ? "Saving..." : "Save BOQ"}</button>
                  <button type="button" className="edash-btn-outline" disabled={busy === "apply-boq" || !boq.lines.length} title="Seeds the plot's budget categories from this BOQ's totals" onClick={() => void applyBoqToBudget()}>{busy === "apply-boq" ? "Applying..." : "Apply to budget"}</button>
                  <span className="edash-mk-hint" style={{ alignSelf: "center" }}>Total: {money(boq.total || 0)}</span>
                </div>
              </>
            )}
          </div></div>

          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Drawings - Plot {workspacePlotNumber}</h3></div>
            <p className="edash-mk-hint">Upload a building plan, structural or MEP drawing, or a site plan - PDF, JPG, PNG, DWG or DXF. Every upload is submitted for approval automatically. The live measure tool opens for PNG/JPEG drawings.</p>
            <div className="edash-mk-form-grid" style={{ marginTop: 10 }}>
              <label className="edash-field"><span>Type</span>
                <select value={newDrawingType} onChange={(event) => setNewDrawingType(event.target.value)}>
                  {DRAWING_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="edash-field"><span>New version of (optional)</span>
                <select value={newDrawingSupersedes} onChange={(event) => setNewDrawingSupersedes(event.target.value)}>
                  <option value="">Not a new version</option>
                  {drawings.map((drawing) => <option key={drawing.document_id} value={drawing.document_id}>{drawing.filename}</option>)}
                </select>
              </label>
              <div className="edash-field is-full"><span>File</span><input ref={drawingFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf" /></div>
            </div>
            <div className="edash-sp-actions"><button type="button" className="edash-btn-primary" disabled={busy === "upload-drawing"} onClick={() => void uploadDrawing()}>{busy === "upload-drawing" ? "Uploading..." : "Upload drawing"}</button></div>
            {drawings.length ? (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="edash-mini-table">
                  <thead><tr><th>File</th><th>Type</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {drawings.map((drawing) => (
                      <tr key={drawing.document_id}>
                        <td>{drawing.filename}{drawing.supersedes_document_id ? <span className="edash-mk-hint"> (new version)</span> : null}</td>
                        <td>{DRAWING_TYPES.find((item) => item.value === drawing.document_type)?.label || drawing.document_type}</td>
                        <td>{drawing.approval_status ? <span className={`edash-status-pill tone-${STATUS_TONE[drawing.approval_status] || "neutral"}`}>{drawing.approval_status.replaceAll("_", " ")}</span> : <span className="edash-mk-hint">Not submitted</span>}</td>
                        <td>
                          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {isMeasurable(drawing.filename) && <button type="button" className="edash-btn-outline" title="Open the live measure and markup tool" onClick={() => setMeasureDoc(drawing)}>Measure</button>}
                            {drawing.approval_status === "submitted" && (
                              <>
                                <button type="button" className="edash-card-link" disabled={busy === `review-drawing-${drawing.document_id}`} onClick={() => void reviewDrawing(drawing.document_id, "approved")}>Approve</button>
                                <button type="button" className="edash-card-link" disabled={busy === `review-drawing-${drawing.document_id}`} onClick={() => void reviewDrawing(drawing.document_id, "revision_requested")}>Request revision</button>
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="edash-tab-empty">No drawings uploaded yet.</p>}
          </div></div>

          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">RFIs - Plot {workspacePlotNumber}</h3></div>
            <div className="edash-mk-form-grid">
              <label className="edash-field is-full"><span>New question</span><input value={newRfi} onChange={(event) => setNewRfi(event.target.value)} placeholder="e.g. What's the beam spec at the north wall?" /></label>
            </div>
            <div className="edash-sp-actions"><button type="button" className="edash-btn-primary" disabled={busy === "create-rfi"} onClick={() => void createRfi()}>{busy === "create-rfi" ? "Raising..." : "Raise RFI"}</button></div>
            {rfis.length ? (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {rfis.map((rfi) => (
                  <div key={rfi.id} className="edash-wa-bubble">
                    <p style={{ margin: 0 }}><strong>{rfi.question}</strong> <span className={`edash-status-pill tone-${STATUS_TONE[rfi.status] || "neutral"}`}>{rfi.status}</span></p>
                    {rfi.answer && <p style={{ margin: "6px 0 0" }}>{rfi.answer}</p>}
                    {rfi.status === "open" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input style={{ flex: 1 }} value={rfiAnswerDrafts[rfi.id] || ""} onChange={(event) => setRfiAnswerDrafts((current) => ({ ...current, [rfi.id]: event.target.value }))} placeholder="Write an answer..." />
                        <button type="button" className="edash-btn-outline" disabled={busy === `answer-rfi-${rfi.id}`} onClick={() => void answerRfi(rfi)}>Answer</button>
                      </div>
                    )}
                    {rfi.status === "answered" && <button type="button" className="edash-card-link" style={{ marginTop: 6 }} disabled={busy === `close-rfi-${rfi.id}`} onClick={() => void closeRfi(rfi)}>Close RFI</button>}
                  </div>
                ))}
              </div>
            ) : <p className="edash-tab-empty">No RFIs raised yet.</p>}
          </div></div>

          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Site inspections - Plot {workspacePlotNumber}</h3></div>
            <div className="edash-mk-form-grid">
              <label className="edash-field"><span>Visit date</span><input type="date" value={newInspection.visit_date} onChange={(event) => setNewInspection({ ...newInspection, visit_date: event.target.value })} /></label>
              <label className="edash-field"><span>Phase at inspection</span>
                <select value={newInspection.phase_at_inspection} onChange={(event) => setNewInspection({ ...newInspection, phase_at_inspection: event.target.value })}>
                  <option value="">Not set</option>
                  {PHASES.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}
                </select>
              </label>
              <label className="edash-field is-wide"><span>Notes</span><input value={newInspection.notes} onChange={(event) => setNewInspection({ ...newInspection, notes: event.target.value })} /></label>
              <label className="edash-checkbox-row"><input type="checkbox" checked={newInspection.signed_off} onChange={(event) => setNewInspection({ ...newInspection, signed_off: event.target.checked })} /><span>Signed off</span></label>
            </div>
            <div className="edash-sp-actions"><button type="button" className="edash-btn-primary" disabled={busy === "create-inspection"} onClick={() => void createInspection()}>{busy === "create-inspection" ? "Logging..." : "Log inspection"}</button></div>
            {inspections.length ? (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="edash-mini-table">
                  <thead><tr><th>Date</th><th>Phase</th><th>Notes</th><th>Signed off</th></tr></thead>
                  <tbody>{inspections.map((inspection) => <tr key={inspection.id}><td>{new Date(inspection.visit_date).toLocaleDateString()}</td><td>{PHASES.find((phase) => phase.value === inspection.phase_at_inspection)?.label || "-"}</td><td>{inspection.notes || "-"}</td><td>{inspection.signed_off ? "Yes" : "No"}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="edash-tab-empty">No inspections logged yet.</p>}
          </div></div>

          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Snag list - Plot {workspacePlotNumber}</h3></div>
            <div className="edash-mk-form-grid">
              <label className="edash-field is-full"><span>New snag item</span><input value={newSnag} onChange={(event) => setNewSnag(event.target.value)} placeholder="e.g. Paint touch-up needed in master bedroom" /></label>
            </div>
            <div className="edash-sp-actions"><button type="button" className="edash-btn-primary" disabled={busy === "create-snag"} onClick={() => void createSnag()}>{busy === "create-snag" ? "Logging..." : "Log snag item"}</button></div>
            {snags.length ? (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="edash-mini-table">
                  <thead><tr><th>Description</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {snags.map((snag) => (
                      <tr key={snag.id}>
                        <td>{snag.description}</td>
                        <td><span className={`edash-status-pill tone-${STATUS_TONE[snag.status] || "neutral"}`}>{snag.status}</span></td>
                        <td>
                          {snag.status === "open" && <button type="button" className="edash-card-link" disabled={busy === `snag-fixed-${snag.id}`} onClick={() => void markSnagFixed(snag)}>Mark fixed</button>}
                          {snag.status === "fixed" && <button type="button" className="edash-card-link" disabled={busy === `snag-verify-${snag.id}`} onClick={() => void verifySnag(snag)}>Verify</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="edash-tab-empty">No snag items logged yet.</p>}
          </div></div>
        </>
      )}

      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head"><h3 className="edash-card-title">Contractors</h3></div>
        <div className="edash-mk-form-grid">
          <label className="edash-field"><span>Name</span><input value={newContractor.name} onChange={(event) => setNewContractor({ ...newContractor, name: event.target.value })} placeholder="e.g. Femi Adebayo Electrical" /></label>
          <label className="edash-field"><span>Trade</span><input value={newContractor.trade} onChange={(event) => setNewContractor({ ...newContractor, trade: event.target.value })} placeholder="e.g. Electrical, Roofing" /></label>
          <label className="edash-field"><span>Phone</span><input value={newContractor.contact_phone} onChange={(event) => setNewContractor({ ...newContractor, contact_phone: event.target.value })} /></label>
          <label className="edash-field"><span>Email</span><input value={newContractor.contact_email} onChange={(event) => setNewContractor({ ...newContractor, contact_email: event.target.value })} /></label>
        </div>
        <div className="edash-sp-actions"><button type="button" className="edash-btn-primary" disabled={busy === "add-contractor"} onClick={() => void addContractor()}>{busy === "add-contractor" ? "Adding..." : "Add contractor"}</button></div>
        {contractors.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="edash-mini-table">
              <thead><tr><th>Name</th><th>Trade</th><th>Phone</th><th>Email</th></tr></thead>
              <tbody>{contractors.map((contractor) => <tr key={contractor.id}><td>{contractor.name}</td><td>{contractor.trade || "-"}</td><td>{contractor.contact_phone || "-"}</td><td>{contractor.contact_email || "-"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div></div>

      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head"><h3 className="edash-card-title">Contractor draw requests</h3></div>
        <p className="edash-mk-hint">Request a milestone payment against a plot's budget line (open that plot's workspace above to find its budget line IDs). Review approves or declines it; recording a payment is what actually marks it paid.</p>
        <div className="edash-mk-form-grid" style={{ marginTop: 10 }}>
          <label className="edash-field"><span>Budget line ID</span><input value={newDraw.budget_line_id} onChange={(event) => setNewDraw({ ...newDraw, budget_line_id: event.target.value })} placeholder="From the plot's budget above" /></label>
          <label className="edash-field"><span>Contractor</span>
            <select value={newDraw.contractor_id} onChange={(event) => setNewDraw({ ...newDraw, contractor_id: event.target.value })}>
              <option value="">Choose...</option>
              {contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name}</option>)}
            </select>
          </label>
          <label className="edash-field"><span>Amount requested (NGN)</span><input type="number" min="0" value={newDraw.amount_requested} onChange={(event) => setNewDraw({ ...newDraw, amount_requested: event.target.value })} /></label>
          <label className="edash-field"><span>% complete claimed</span><input type="number" min="0" max="100" value={newDraw.percent_complete_claimed} onChange={(event) => setNewDraw({ ...newDraw, percent_complete_claimed: event.target.value })} /></label>
          <label className="edash-field is-wide"><span>Note</span><input value={newDraw.note} onChange={(event) => setNewDraw({ ...newDraw, note: event.target.value })} /></label>
        </div>
        <div className="edash-sp-actions"><button type="button" className="edash-btn-primary" disabled={busy === "create-draw"} onClick={() => void createDraw()}>{busy === "create-draw" ? "Submitting..." : "Submit draw request"}</button></div>

        {draws.length ? (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="edash-mini-table">
              <thead><tr><th>Contractor</th><th>Amount</th><th>% claimed</th><th>Status</th><th /></tr></thead>
              <tbody>
                {draws.map((draw) => (
                  <tr key={draw.id}>
                    <td>{contractorName(draw.contractor_id)}</td>
                    <td>{money(draw.amount_requested)}</td>
                    <td>{draw.percent_complete_claimed ?? "-"}</td>
                    <td><span className={`edash-status-pill tone-${STATUS_TONE[draw.status] || "neutral"}`}>{draw.status.replaceAll("_", " ")}</span></td>
                    <td>
                      {(draw.status === "requested" || draw.status === "in_review") && (
                        <span style={{ display: "flex", gap: 6 }}>
                          {draw.status === "requested" && <button type="button" className="edash-card-link" disabled={busy === `review-${draw.id}`} onClick={() => void reviewDraw(draw, "in_review")}>Mark in review</button>}
                          <button type="button" className="edash-card-link" disabled={busy === `review-${draw.id}`} onClick={() => void reviewDraw(draw, "declined")}>Decline</button>
                          <button type="button" className="edash-btn-outline" onClick={() => { setPayDraw(draw); setPayForm({ amount: String(draw.amount_requested), payment_date: new Date().toISOString().slice(0, 10), payment_method: "", reference_no: "", notes: "" }); }}>Record payment</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="edash-tab-empty">No draw requests yet.</p>}
      </div></div>

      {budgetOpen && budget && (
        <EstateModal title={`Construction budget - Plot ${workspacePlotNumber}`} onClose={() => { setBudgetOpen(false); setBudget(null); }}>
          <label className="edash-field"><span>Total budget (NGN)</span>
            <input type="number" min="0" value={budget.total_budget ?? ""} onChange={(event) => setBudget({ ...budget, total_budget: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
          <div style={{ marginTop: 12 }}>
            {budget.lines.map((line, index) => (
              <div key={line.id ?? `new-${index}`} className="edash-mk-form-grid" style={{ marginBottom: 8 }}>
                <label className="edash-field"><span>Category</span><input value={line.category} onChange={(event) => { const lines = [...budget.lines]; lines[index] = { ...line, category: event.target.value }; setBudget({ ...budget, lines }); }} /></label>
                <label className="edash-field"><span>Budgeted (NGN)</span><input type="number" min="0" value={line.budgeted_amount} onChange={(event) => { const lines = [...budget.lines]; lines[index] = { ...line, budgeted_amount: Number(event.target.value) }; setBudget({ ...budget, lines }); }} /></label>
                {line.id != null && <span className="edash-mk-hint" style={{ alignSelf: "center" }}>Actual so far: {money(line.actual_amount || 0)} (budget line ID {line.id})</span>}
                <button type="button" className="edash-card-link" onClick={() => setBudget({ ...budget, lines: budget.lines.filter((_, lineIndex) => lineIndex !== index) })}>Remove</button>
              </div>
            ))}
            <button type="button" className="edash-btn-outline" onClick={() => setBudget({ ...budget, lines: [...budget.lines, { id: null, category: "", budgeted_amount: 0 }] })}>+ Add category</button>
          </div>
          <div className="edash-sp-actions" style={{ marginTop: 14 }}>
            <button type="button" className="edash-btn-primary" disabled={busy === "save-budget"} onClick={() => void saveBudget()}>{busy === "save-budget" ? "Saving..." : "Save budget"}</button>
          </div>
        </EstateModal>
      )}

      {payDraw && (
        <EstateModal title={`Record payment to ${contractorName(payDraw.contractor_id)}`} onClose={() => setPayDraw(null)}>
          <div className="edash-mk-form-grid">
            <label className="edash-field"><span>Amount (NGN)</span><input type="number" min="0" value={payForm.amount} onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })} /></label>
            <label className="edash-field"><span>Payment date</span><input type="date" value={payForm.payment_date} onChange={(event) => setPayForm({ ...payForm, payment_date: event.target.value })} /></label>
            <label className="edash-field"><span>Method</span><input value={payForm.payment_method} onChange={(event) => setPayForm({ ...payForm, payment_method: event.target.value })} placeholder="e.g. Bank transfer" /></label>
            <label className="edash-field"><span>Reference</span><input value={payForm.reference_no} onChange={(event) => setPayForm({ ...payForm, reference_no: event.target.value })} /></label>
            <label className="edash-field is-wide"><span>Notes</span><input value={payForm.notes} onChange={(event) => setPayForm({ ...payForm, notes: event.target.value })} /></label>
          </div>
          <div className="edash-sp-actions" style={{ marginTop: 14 }}>
            <button type="button" className="edash-btn-primary" disabled={busy === "pay-draw"} onClick={() => void submitPayment()}>{busy === "pay-draw" ? "Recording..." : "Record payment & mark paid"}</button>
          </div>
        </EstateModal>
      )}

      {measureDoc && <DrawingMeasureTool documentId={measureDoc.document_id} filename={measureDoc.filename} title={`Measure - ${measureDoc.filename}`} onClose={() => setMeasureDoc(null)} />}
    </EstateShell>
  );
}
