import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import Spinner from "../../components/estates/EstateSpinner";
import "../../styles/estate-integrations.css";

type EstateOption = { id: number; name: string };
type SheetSummary = { headers: string[]; row_count: number; sample_rows: Record<string, string>[]; suggested_mappings: Record<string, Record<string, string | null>> };
type DetectResult = { filename: string; sheets: Record<string, SheetSummary> };
const ENTITY_TYPES = ["customer", "plot", "sale", "payment"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];
const ENTITY_LABELS: Record<EntityType, string> = { customer: "Customer", plot: "Plot", sale: "Sale / Allocation", payment: "Payment" };
const ENTITY_FIELDS: Record<EntityType, { field: string; label: string }[]> = {
  customer: [
    { field: "external_id", label: "External/customer ID" },
    { field: "full_name", label: "Full name" },
    { field: "phone", label: "Phone" },
    { field: "email", label: "Email" },
    { field: "address", label: "Address" },
    { field: "notes", label: "Notes" },
  ],
  plot: [
    { field: "block", label: "Block / phase" },
    { field: "plot_number", label: "Plot number" },
  ],
  sale: [
    { field: "external_reference", label: "Contract / sale reference" },
    { field: "agreed_price", label: "Agreed price" },
    { field: "currency", label: "Currency" },
    { field: "sale_date", label: "Sale date" },
    { field: "agent", label: "Agent" },
    { field: "status", label: "Status" },
    { field: "outstanding", label: "Outstanding balance (as supplied)" },
  ],
  payment: [
    { field: "reference_no", label: "Reference / transaction ID" },
    { field: "amount", label: "Amount" },
    { field: "payment_date", label: "Payment date" },
    { field: "method", label: "Method" },
    { field: "total_paid", label: "Total paid (opening balance)" },
    { field: "outstanding", label: "Outstanding balance (as supplied)" },
  ],
};

type SheetConfig = { entityTypes: EntityType[]; mapping: Record<string, string | null>; openingBalance: boolean };
type PreviewRow = { id: number; row_index: number; source_data: any; match_status: string; resolution: string; issues: string[]; manual_plot_id: number | null; manual_plot_number: string | null };
type PlotOption = { id: number; plot_number: string; commercial_status: string; geometry_status: string };
type CommitResult = { created: number; updated: number; skipped: number; errors: { row: number; reason: string }[] };
type BatchHistoryRow = { id: number; estate_name: string; source_filename: string; status: string; row_counts: Record<string, number> | null; created_at: string; committed_at: string | null };

export default function EstateIntegrationsPage() {
  const [view, setView] = useState<"home" | "wizard" | "history">("home");
  const [estates, setEstates] = useState<EstateOption[]>([]);
  const [sidebarEstateId, setSidebarEstateId] = useState("");
  const [sidebarEstateName, setSidebarEstateName] = useState("");

  useEffect(() => {
    api.get("/estates").then((response) => {
      const list = response.data || [];
      setEstates(list);
      if (list[0]) { setSidebarEstateId(String(list[0].id)); setSidebarEstateName(list[0].name); }
    }).catch(() => undefined);
  }, []);

  const ribbonTabs: EstateRibbonTab[] = [
    { key: "home", label: "Home", groups: [{ key: "nav", label: "View", buttons: [
      { key: "overview", label: "Overview", icon: "dashboard", onClick: () => setView("home") },
      { key: "history", label: "Import history", icon: "audit", onClick: () => setView("history") },
    ] }] },
  ];

  if (!sidebarEstateId) {
    return (
      <div className="edash-onboard">
        <div className="edash-onboard-body">
          <div className="edash-onboard-head"><h1>Loading...</h1><p>Getting your estates ready.</p></div>
        </div>
      </div>
    );
  }

  return (
    <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="integrations" pageTitle="Data Connect">
      <EstateRibbon tabs={ribbonTabs} />
      {view === "home" && <IntegrationsHome onStartImport={() => setView("wizard")} />}
      {view === "wizard" && <ImportWizard estates={estates} onDone={() => setView("history")} onCancel={() => setView("home")} />}
      {view === "history" && <ImportHistory onStartImport={() => setView("wizard")} />}
    </EstateShell>
  );
}

function IntegrationsHome({ onStartImport }: { onStartImport: () => void }) {
  return (
    <div className="edash-integrations-tiles">
      <div className="edash-integrations-tile">
        <div className="edash-integrations-tile-icon"><EstateIcon name="upload" /></div>
        <h3>Import spreadsheet</h3>
        <p>Bring in customers, plots, sales and payments from an Excel (.xlsx) or CSV file - map your own columns, review every match before anything is created.</p>
        <button type="button" className="edash-btn-primary" onClick={onStartImport}>Start import</button>
      </div>
      <div className="edash-integrations-tile is-disabled">
        <div className="edash-integrations-tile-icon"><EstateIcon name="layers" /></div>
        <h3>Connect Google Sheets</h3>
        <p>An ongoing, scheduled sync straight from a live Google Sheet.</p>
        <span className="edash-integrations-badge">Coming soon</span>
      </div>
    </div>
  );
}

function ImportHistory({ onStartImport }: { onStartImport: () => void }) {
  const [rows, setRows] = useState<BatchHistoryRow[] | null>(null);

  const load = () => { api.get<{ rows: BatchHistoryRow[] }>("/estates/import-batches").then((r) => setRows(r.data.rows || [])).catch(() => setRows([])); };
  useEffect(() => { load(); }, []);

  const downloadErrors = async (id: number) => {
    const response = await api.get(`/estates/import-batches/${id}/errors.csv`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `import-batch-${id}-errors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reverse = async (id: number) => {
    if (!window.confirm("Reverse this import? This only works if nothing created by it has since been changed.")) return;
    try {
      await api.post(`/estates/import-batches/${id}/reverse`);
      toast.success("Batch reversed.");
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "This batch could not be reversed."));
    }
  };

  return (
    <div className="edash-card">
      <div className="edash-card-inner">
        <div className="edash-card-head" style={{ justifyContent: "space-between" }}>
          <h3 className="edash-card-title">Import history</h3>
          <button type="button" className="edash-btn-primary" onClick={onStartImport}>New import</button>
        </div>
        {rows ? (
          rows.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="edash-mini-table">
                <thead><tr><th>Date</th><th>Estate</th><th>File</th><th>Status</th><th>Created</th><th>Updated</th><th>Skipped</th><th /></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Date">{new Date(row.created_at).toLocaleString()}</td>
                      <td data-label="Estate">{row.estate_name}</td>
                      <td data-label="File">{row.source_filename}</td>
                      <td data-label="Status"><span className={`edash-status-pill tone-${row.status === "committed" ? "good" : row.status === "reversed" ? "danger" : "neutral"}`}>{row.status}</span></td>
                      <td data-label="Created">{row.row_counts?.create ?? "-"}</td>
                      <td data-label="Updated">{row.row_counts?.update ?? "-"}</td>
                      <td data-label="Skipped">{row.row_counts?.skip ?? "-"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="edash-btn-outline" onClick={() => void downloadErrors(row.id)}>Error file</button>
                          {row.status === "committed" && <button type="button" className="edash-btn-outline" onClick={() => void reverse(row.id)}>Reverse</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="edash-tab-empty">No imports yet.</p>
        ) : <p className="edash-tab-empty"><Spinner size={13} /> Loading...</p>}
      </div>
    </div>
  );
}

function ImportWizard({ estates, onDone, onCancel }: { estates: EstateOption[]; onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [estateId, setEstateId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [sheetConfigs, setSheetConfigs] = useState<Record<string, SheetConfig>>({});
  const [dayFirst, setDayFirst] = useState(true);
  const [openingCutoff, setOpeningCutoff] = useState("");
  const [savePresetName, setSavePresetName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [rowCounts, setRowCounts] = useState<Record<string, number> | null>(null);
  const [previewTab, setPreviewTab] = useState<"review" | "create" | "update" | "skip">("review");
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [plotPickerRowId, setPlotPickerRowId] = useState<number | null>(null);
  const [plotQuery, setPlotQuery] = useState("");
  const [plotOptions, setPlotOptions] = useState<PlotOption[]>([]);
  const [searchingPlots, setSearchingPlots] = useState(false);

  const downloadTemplate = async () => {
    const response = await api.get("/estates/import-batches/field-templates", { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "landcheck-import-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  };

  const detect = async () => {
    if (!estateId || !file) { toast.error("Choose an estate and a file."); return; }
    setDetecting(true);
    try {
      const body = new FormData();
      body.append("estate_id", estateId);
      body.append("file", file);
      const response = await api.post<DetectResult>("/estates/import-batches/detect", body);
      setDetectResult(response.data);
      const configs: Record<string, SheetConfig> = {};
      for (const [sheetName, summary] of Object.entries(response.data.sheets)) {
        const mapping: Record<string, string | null> = {};
        const entityTypes: EntityType[] = [];
        for (const entity of ENTITY_TYPES) {
          const suggestion = summary.suggested_mappings[entity] || {};
          const hasAny = Object.values(suggestion).some((v) => v);
          if (hasAny) entityTypes.push(entity);
          for (const [header, field] of Object.entries(suggestion)) {
            if (field) mapping[header] = `${entity}.${field}`;
          }
        }
        configs[sheetName] = { entityTypes: entityTypes.length ? entityTypes : ["customer"], mapping, openingBalance: false };
      }
      setSheetConfigs(configs);
      setStep(2);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "This file could not be read."));
    } finally {
      setDetecting(false);
    }
  };

  const toggleEntity = (sheetName: string, entity: EntityType) => {
    setSheetConfigs((prev) => {
      const current = prev[sheetName];
      const has = current.entityTypes.includes(entity);
      return { ...prev, [sheetName]: { ...current, entityTypes: has ? current.entityTypes.filter((e) => e !== entity) : [...current.entityTypes, entity] } };
    });
  };

  const setHeaderMapping = (sheetName: string, header: string, value: string) => {
    setSheetConfigs((prev) => ({ ...prev, [sheetName]: { ...prev[sheetName], mapping: { ...prev[sheetName].mapping, [header]: value || null } } }));
  };

  const submitMapping = async () => {
    if (!estateId || !file) return;
    setSubmitting(true);
    try {
      const sheets: Record<string, any> = {};
      for (const [sheetName, config] of Object.entries(sheetConfigs)) {
        if (!config.entityTypes.length) continue;
        sheets[sheetName] = { entity_types: config.entityTypes, mapping: config.mapping, opening_balance: config.openingBalance };
      }
      const body = new FormData();
      body.append("estate_id", estateId);
      body.append("file", file);
      body.append("mapping_json", JSON.stringify({
        sheets,
        day_first: dayFirst,
        opening_balance_cutoff: openingCutoff || null,
        save_preset_name: savePresetName || null,
      }));
      const response = await api.post<{ id: number; row_counts: Record<string, number> }>("/estates/import-batches", body);
      setBatchId(response.data.id);
      setRowCounts(response.data.row_counts);
      setStep(3);
      await loadPreview(response.data.id, "review");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "This mapping could not be processed."));
    } finally {
      setSubmitting(false);
    }
  };

  const loadPreview = async (id: number, status: "review" | "create" | "update" | "skip") => {
    setPreviewTab(status);
    setPreviewRows(null);
    try {
      const response = await api.get<{ items: PreviewRow[] }>(`/estates/import-batches/${id}/preview`, { params: { status, page_size: 100 } });
      setPreviewRows(response.data.items || []);
    } catch {
      setPreviewRows([]);
    }
  };

  const overrideRow = async (rowId: number, resolution: string) => {
    if (!batchId) return;
    try {
      await api.patch(`/estates/import-batches/${batchId}/rows/${rowId}`, { resolution });
      await loadPreview(batchId, previewTab);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not update this row."));
    }
  };

  const searchPlots = async (query: string) => {
    if (!batchId) return;
    setSearchingPlots(true);
    try {
      const response = await api.get<{ rows: PlotOption[] }>(`/estates/import-batches/${batchId}/plot-options`, { params: { q: query } });
      setPlotOptions(response.data.rows || []);
    } catch {
      setPlotOptions([]);
    } finally {
      setSearchingPlots(false);
    }
  };

  const openPlotPicker = (rowId: number) => {
    setPlotPickerRowId(rowId);
    setPlotQuery("");
    void searchPlots("");
  };

  const linkPlot = async (rowId: number, plotId: number) => {
    if (!batchId) return;
    try {
      await api.patch(`/estates/import-batches/${batchId}/rows/${rowId}`, { plot_id: plotId, resolution: "create" });
      setPlotPickerRowId(null);
      await loadPreview(batchId, previewTab);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not link this plot."));
    }
  };

  const commit = async () => {
    if (!batchId) return;
    setCommitting(true);
    try {
      const response = await api.post<CommitResult>(`/estates/import-batches/${batchId}/commit`, {});
      setResult(response.data);
      setStep(4);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "This import could not be committed."));
    } finally {
      setCommitting(false);
    }
  };

  const hasOpeningBalanceWithoutDated = Object.values(sheetConfigs).some((c) => c.openingBalance) && Object.values(sheetConfigs).some((c) => !c.openingBalance && c.entityTypes.includes("payment"));

  return (
    <div className="edash-card">
      <div className="edash-card-inner">
        <div className="edash-integrations-wizard-steps">
          {["Select file", "Map columns", "Review & confirm", "Results"].map((label, index) => (
            <div key={label} className={`edash-integrations-wizard-step ${step === index + 1 ? "is-active" : step > index + 1 ? "is-done" : ""}`}>
              <span>{index + 1}</span>{label}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="edash-integrations-step">
            <label className="edash-field" style={{ marginBottom: 12 }}>
              <span>Estate</span>
              <select value={estateId} onChange={(event) => setEstateId(event.target.value)}>
                <option value="">Select estate</option>
                {estates.map((estate) => <option key={estate.id} value={estate.id}>{estate.name}</option>)}
              </select>
            </label>
            <label className="edash-field" style={{ marginBottom: 12 }}>
              <span>File (.xlsx or .csv)</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <p className="edash-field-note" style={{ marginBottom: 16 }}>
              Don't have a file ready?{" "}
              <button type="button" className="edash-card-link" onClick={() => void downloadTemplate()}>Download a starting template</button>{" "}
              (optional - your own column names work fine).
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="edash-btn-outline" onClick={onCancel}>Cancel</button>
              <button type="button" className="edash-btn-primary" disabled={!estateId || !file || detecting} onClick={() => void detect()}>{detecting ? <><Spinner size={14} /> Reading file...</> : "Next: map columns"}</button>
            </div>
          </div>
        )}

        {step === 2 && detectResult && (
          <div className="edash-integrations-step">
            {Object.entries(detectResult.sheets).map(([sheetName, summary]) => (
              <div key={sheetName} className="edash-integrations-sheet-card">
                <h4>{sheetName} <span className="edash-field-note">({summary.row_count} rows)</span></h4>
                <div className="edash-chip-row" style={{ marginBottom: 10 }}>
                  {ENTITY_TYPES.map((entity) => (
                    <button
                      type="button"
                      key={entity}
                      className={`edash-chip ${sheetConfigs[sheetName]?.entityTypes.includes(entity) ? "is-active" : ""}`}
                      onClick={() => toggleEntity(sheetName, entity)}
                    >{ENTITY_LABELS[entity]}</button>
                  ))}
                </div>
                {sheetConfigs[sheetName]?.entityTypes.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="edash-mini-table">
                      <thead><tr><th>Column in your file</th><th>Maps to</th></tr></thead>
                      <tbody>
                        {summary.headers.map((header) => (
                          <tr key={header}>
                            <td data-label="Column">{header}</td>
                            <td data-label="Maps to">
                              <select value={sheetConfigs[sheetName]?.mapping[header] || ""} onChange={(event) => setHeaderMapping(sheetName, header, event.target.value)}>
                                <option value="">Don't import this column</option>
                                {sheetConfigs[sheetName].entityTypes.map((entity) => (
                                  <optgroup label={ENTITY_LABELS[entity]} key={entity}>
                                    {ENTITY_FIELDS[entity].map((f) => <option key={`${entity}.${f.field}`} value={`${entity}.${f.field}`}>{f.label}</option>)}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {sheetConfigs[sheetName]?.entityTypes.includes("payment") && (
                  <label className="edash-integrations-checkbox">
                    <input type="checkbox" checked={sheetConfigs[sheetName]?.openingBalance || false} onChange={(event) => setSheetConfigs((prev) => ({ ...prev, [sheetName]: { ...prev[sheetName], openingBalance: event.target.checked } }))} />
                    <span>This is a historical "total paid so far" figure, not individual transactions</span>
                  </label>
                )}
              </div>
            ))}

            <div className="edash-form-row" style={{ marginTop: 10 }}>
              <label className="edash-field">
                <span>Date format</span>
                <select value={dayFirst ? "day" : "month"} onChange={(event) => setDayFirst(event.target.value === "day")}>
                  <option value="day">Day first (31/03/2026)</option>
                  <option value="month">Month first (03/31/2026)</option>
                </select>
              </label>
              {hasOpeningBalanceWithoutDated && (
                <label className="edash-field">
                  <span>Opening-balance cutoff date (required)</span>
                  <input type="date" value={openingCutoff} onChange={(event) => setOpeningCutoff(event.target.value)} />
                </label>
              )}
              <label className="edash-field">
                <span>Save this mapping as (optional)</span>
                <input value={savePresetName} onChange={(event) => setSavePresetName(event.target.value)} placeholder="e.g. My CRM export" />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" className="edash-btn-outline" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="edash-btn-primary" disabled={submitting || (hasOpeningBalanceWithoutDated && !openingCutoff)} onClick={() => void submitMapping()}>{submitting ? <><Spinner size={14} /> Matching records...</> : "Next: review"}</button>
            </div>
          </div>
        )}

        {step === 3 && rowCounts && (
          <div className="edash-integrations-step">
            <div className="edash-overview-grid edash-overview-grid--3" style={{ marginBottom: 14 }}>
              <div className="edash-overview-field"><span>To create</span><strong>{rowCounts.create ?? 0}</strong></div>
              <div className="edash-overview-field"><span>To update</span><strong>{rowCounts.update ?? 0}</strong></div>
              <div className="edash-overview-field"><span>Needs review</span><strong style={{ color: (rowCounts.review ?? 0) > 0 ? "var(--edash-danger, #b3261e)" : undefined }}>{rowCounts.review ?? 0}</strong></div>
            </div>
            <div className="edash-chip-row" style={{ marginBottom: 12 }}>
              {(["review", "create", "update", "skip"] as const).map((tab) => (
                <button type="button" key={tab} className={`edash-chip ${previewTab === tab ? "is-active" : ""}`} onClick={() => batchId && void loadPreview(batchId, tab)}>{tab === "review" ? "Needs review" : tab[0].toUpperCase() + tab.slice(1)}</button>
              ))}
            </div>
            {previewRows ? (
              previewRows.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="edash-mini-table">
                    <thead><tr><th>Row</th><th>Summary</th><th>Plot</th><th>Issues</th><th>Resolution</th></tr></thead>
                    <tbody>
                      {previewRows.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Row">{row.row_index + 1}</td>
                          <td data-label="Summary">{row.source_data?.customer?.full_name || row.source_data?.plot?.plot_number || row.source_data?.payment?.reference_no || "-"}</td>
                          <td data-label="Plot" style={{ position: "relative" }}>
                            {row.manual_plot_number ? (
                              <>
                                <span className="edash-integrations-plot-linked">{row.manual_plot_number}</span>{" "}
                                <button type="button" className="edash-card-link" onClick={() => openPlotPicker(row.id)}>Change</button>
                              </>
                            ) : row.source_data?.plot?.plot_number ? (
                              <>
                                <span>{row.source_data.plot.plot_number}</span>{" "}
                                <button type="button" className="edash-card-link" onClick={() => openPlotPicker(row.id)}>Link existing plot</button>
                              </>
                            ) : "-"}
                            {plotPickerRowId === row.id && (
                              <div className="edash-integrations-plot-picker">
                                <input
                                  autoFocus
                                  placeholder="Search plot number..."
                                  value={plotQuery}
                                  onChange={(event) => { setPlotQuery(event.target.value); void searchPlots(event.target.value); }}
                                />
                                <div className="edash-integrations-plot-picker-results">
                                  {searchingPlots ? (
                                    <span className="edash-field-note"><Spinner size={12} /> Searching...</span>
                                  ) : plotOptions.length ? (
                                    plotOptions.map((plot) => (
                                      <button type="button" key={plot.id} className="edash-integrations-plot-option" onClick={() => void linkPlot(row.id, plot.id)}>
                                        {plot.plot_number} <span className="edash-field-note">({plot.commercial_status})</span>
                                      </button>
                                    ))
                                  ) : (
                                    <span className="edash-field-note">No matching plots in this estate</span>
                                  )}
                                </div>
                                <button type="button" className="edash-card-link" onClick={() => setPlotPickerRowId(null)}>Cancel</button>
                              </div>
                            )}
                          </td>
                          <td data-label="Issues">{row.issues?.length ? row.issues.join("; ") : "-"}</td>
                          <td data-label="Resolution">
                            <select value={row.resolution} onChange={(event) => void overrideRow(row.id, event.target.value)}>
                              <option value="create">Create</option>
                              <option value="update">Update</option>
                              <option value="skip">Skip</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="edash-tab-empty">Nothing in this view.</p>
            ) : <p className="edash-tab-empty"><Spinner size={13} /> Loading...</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" className="edash-btn-outline" onClick={() => setStep(2)}>Back</button>
              <button type="button" className="edash-btn-primary" disabled={committing} onClick={() => void commit()}>{committing ? <><Spinner size={14} /> Importing...</> : "Confirm import"}</button>
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div className="edash-integrations-step">
            <div className="edash-overview-grid edash-overview-grid--3" style={{ marginBottom: 14 }}>
              <div className="edash-overview-field"><span>Created</span><strong>{result.created}</strong></div>
              <div className="edash-overview-field"><span>Updated</span><strong>{result.updated}</strong></div>
              <div className="edash-overview-field"><span>Skipped</span><strong>{result.skipped}</strong></div>
            </div>
            {result.errors.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <h4>Rows that could not be imported</h4>
                <ul>{result.errors.map((e, i) => <li key={i} className="edash-field-note">Row {e.row + 1}: {e.reason}</li>)}</ul>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {batchId && <button type="button" className="edash-btn-outline" onClick={() => void api.get(`/estates/import-batches/${batchId}/errors.csv`, { responseType: "blob" }).then((r) => { const url = URL.createObjectURL(r.data as Blob); const link = document.createElement("a"); link.href = url; link.download = `import-batch-${batchId}-errors.csv`; link.click(); URL.revokeObjectURL(url); })}>Download error file</button>}
              <button type="button" className="edash-btn-primary" onClick={onDone}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
