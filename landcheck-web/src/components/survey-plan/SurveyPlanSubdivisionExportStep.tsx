import { memo, type Dispatch, type ReactNode, type SetStateAction } from "react";

type PlotMeta = {
  scale_text: string;
  paper_size: string;
  template_name: "general" | "site_plan" | "adamawa_osg" | "akwa_ibom_osg" | "rivers_osg" | "cross_river_osg" | "fct_abuja_osg";
};

type SubdivisionBatchRow = {
  id: number;
  method: string;
  generated_count: number;
  total_area_m2: number;
};

type SubdivisionBatchItem = {
  id: number;
  batch_id: number;
  child_plot_id: number;
  lot_no: string;
  area_m2: number;
};

type SubdivisionPreviewPlot = {
  lot_no: string;
  area_m2: number;
  area_hectares: number;
};

type SubdivisionPreviewData = {
  resolved_count: number;
  total_area_m2: number;
  area_imbalance_m2: number;
  plots: SubdivisionPreviewPlot[];
};

type Props = {
  sidebar: ReactNode;
  meta: PlotMeta;
  latestSubdivisionBatchId: number | null;
  subdivisionBatches: SubdivisionBatchRow[];
  subdivisionDownloadBatchId: number | null;
  downloadSubdivisionBatch: (batchId: number) => void | Promise<void>;
  subdivisionCleanCopyBatchId: number | null;
  setSubdivisionCleanCopyBatchId: Dispatch<SetStateAction<number | null>>;
  loadSubdivisionCleanCopyBatchDetails: (batchId: number) => void | Promise<void>;
  setSubdivisionCleanCopyItems: Dispatch<SetStateAction<SubdivisionBatchItem[]>>;
  subdivisionCleanCopyTitle: string;
  setSubdivisionCleanCopyTitle: Dispatch<SetStateAction<string>>;
  subdivisionCleanCopyItems: SubdivisionBatchItem[];
  subdivisionCleanCopyLoadingBatchId: number | null;
  getSubdivisionCleanCopyAreaDraftValue: (item: SubdivisionBatchItem) => string;
  updateSubdivisionCleanCopyAreaDraft: (item: SubdivisionBatchItem, value: string) => void;
  subdivisionCleanCopyDownloadBatchId: number | null;
  downloadSubdivisionCleanCopyPdf: () => void | Promise<void>;
  plotId: number | null;
  subdivisionBatchLoading: boolean;
  loadSubdivisionBatches: () => void | Promise<void>;
  onBack: () => void;
  onComplete: () => void;
  subdivisionPreview: SubdivisionPreviewData | null;
};

function SurveyPlanSubdivisionExportStep(props: Props) {
  const latestBatchId = props.latestSubdivisionBatchId ?? props.subdivisionBatches[0]?.id ?? null;

  return (
    <div className="step-panel export-panel">
      <div className="panel-left">
        {props.sidebar}
        <div className="export-section">
          <h3 className="section-title">Subdivision Batch Export</h3>
          <p className="section-desc">Export generated subdivision plans as one ZIP package. Preview the split before downloading.</p>
          <p className="section-desc">
            Output settings: Template <strong>{props.meta.template_name === "adamawa_osg" ? "Adamawa OSG" : "General"}</strong>,
            Scale <strong>{props.meta.scale_text}</strong>, Paper <strong>{props.meta.paper_size}</strong>.
          </p>

          <div className="export-grid">
            {latestBatchId && (
              <div className="export-card">
                <div className="export-icon calc">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4h16v4H4zM4 10h16v10H4z" />
                    <path d="M8 14h8M8 18h5" />
                  </svg>
                </div>
                <div className="export-info">
                  <h4>Latest Batch ZIP</h4>
                  <p>Download all generated lots from the latest subdivision batch</p>
                </div>
                <button className="download-btn" disabled={props.subdivisionDownloadBatchId !== null} onClick={() => props.downloadSubdivisionBatch(latestBatchId)}>
                  {props.subdivisionDownloadBatchId === latestBatchId ? (
                    <>
                      <span className="spinner download-spinner" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      <span>Download ZIP</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="export-card export-card--clean-copy">
              <div className="export-icon pdf">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2h9l5 5v15H6z" />
                  <path d="M15 2v5h5M9 13h6M9 17h6" />
                </svg>
              </div>
              <div className="export-info">
                <h4>Clean Copy Plan PDF</h4>
                <p>Single-sheet clean copy of all split lots on one plot with editable displayed area labels.</p>
                <div className="subdivision-clean-copy-controls">
                  <div className="subdivision-clean-copy-row">
                    <label>Batch</label>
                    <select
                      value={props.subdivisionCleanCopyBatchId ?? ""}
                      onChange={(event) => {
                        const nextBatchId = Number(event.target.value || 0) || null;
                        props.setSubdivisionCleanCopyBatchId(nextBatchId);
                        if (nextBatchId) {
                          props.loadSubdivisionCleanCopyBatchDetails(nextBatchId);
                        } else {
                          props.setSubdivisionCleanCopyItems([]);
                        }
                      }}
                    >
                      <option value="">Select batch</option>
                      {props.subdivisionBatches.map((batch) => (
                        <option key={`clean_copy_batch_${batch.id}`} value={batch.id}>
                          Batch #{batch.id} - {batch.generated_count} lots
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="subdivision-clean-copy-row">
                    <label>Plan title</label>
                    <input type="text" value={props.subdivisionCleanCopyTitle} onChange={(event) => props.setSubdivisionCleanCopyTitle(event.target.value)} placeholder="Enter clean copy title" />
                  </div>

                  <div className="subdivision-clean-copy-areas">
                    <div className="subdivision-clean-copy-areas-head">
                      <strong>Displayed area labels (editable)</strong>
                      <span>{props.subdivisionCleanCopyLoadingBatchId ? "Loading lots..." : `${props.subdivisionCleanCopyItems.length} lots`}</span>
                    </div>
                    {props.subdivisionCleanCopyItems.length === 0 ? (
                      <p className="subdivision-note">Select a batch to edit displayed area text for each lot.</p>
                    ) : (
                      <div className="subdivision-clean-copy-table-wrap">
                        <table className="subdivision-table subdivision-clean-copy-table">
                          <thead>
                            <tr>
                              <th>Lot</th>
                              <th>Computed area</th>
                              <th>Displayed on plan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {props.subdivisionCleanCopyItems.map((item) => (
                              <tr key={`clean_copy_item_${item.id}_${item.child_plot_id}`}>
                                <td>{item.lot_no}</td>
                                <td>{Number(item.area_m2 || 0).toFixed(2)} sqm</td>
                                <td>
                                  <input
                                    className="subdivision-lot-name-input"
                                    value={props.getSubdivisionCleanCopyAreaDraftValue(item)}
                                    onChange={(event) => props.updateSubdivisionCleanCopyAreaDraft(item, event.target.value)}
                                    placeholder="e.g. 0.125 Hectares"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="download-btn subdivision-clean-copy-download"
                  disabled={props.subdivisionCleanCopyDownloadBatchId !== null || !props.subdivisionCleanCopyBatchId || props.subdivisionCleanCopyLoadingBatchId !== null}
                  onClick={props.downloadSubdivisionCleanCopyPdf}
                >
                  {props.subdivisionCleanCopyDownloadBatchId ? (
                    <>
                      <span className="spinner download-spinner" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      <span>Download Clean Copy PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="form-section subdivision-section">
              <div className="subdivision-batch-header">
                <h4>All Batches</h4>
                <button className="btn-outline btn-mini" onClick={() => props.loadSubdivisionBatches()} disabled={!props.plotId || props.subdivisionBatchLoading}>
                  {props.subdivisionBatchLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {props.subdivisionBatches.length === 0 ? (
                <p className="subdivision-note">No batch generated yet. Go back and generate subdivision first.</p>
              ) : (
                <div className="subdivision-batch-list">
                  {props.subdivisionBatches.map((batch) => (
                    <div key={batch.id} className="subdivision-batch-item">
                      <div>
                        <strong>Batch #{batch.id}</strong>
                        <div className="subdivision-note">
                          {batch.method} - {batch.generated_count} plots - {(batch.total_area_m2 ?? 0).toFixed(2)} sqm
                        </div>
                      </div>
                      <button className="download-btn" disabled={props.subdivisionDownloadBatchId !== null} onClick={() => props.downloadSubdivisionBatch(batch.id)}>
                        {props.subdivisionDownloadBatchId === batch.id ? "Downloading..." : "Export ZIP"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="action-bar">
          <button className="btn-outline" onClick={props.onBack}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Subdivision Preview
          </button>
          <button className="btn-primary" onClick={props.onComplete}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Complete & Return Home
          </button>
        </div>
      </div>

      <div className="panel-right preview-container">
        {props.subdivisionPreview ? (
          <div className="subdivision-preview-wrap subdivision-preview-right">
            <h4 className="section-title">Subdivision Preview</h4>
            <div className="subdivision-kpis">
              <div className="subdivision-kpi">
                <span className="subdivision-kpi-label">Derived plots</span>
                <strong>{props.subdivisionPreview.resolved_count}</strong>
              </div>
              <div className="subdivision-kpi">
                <span className="subdivision-kpi-label">Mother parcel area</span>
                <strong>{props.subdivisionPreview.total_area_m2.toFixed(2)} sqm</strong>
              </div>
              <div className="subdivision-kpi">
                <span className="subdivision-kpi-label">Area imbalance</span>
                <strong>{Math.abs(props.subdivisionPreview.area_imbalance_m2).toFixed(4)} sqm</strong>
              </div>
            </div>
            <div className="subdivision-table-wrap">
              <table className="subdivision-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Area (sqm)</th>
                    <th>Area (ha)</th>
                  </tr>
                </thead>
                <tbody>
                  {props.subdivisionPreview.plots.slice(0, 18).map((item) => (
                    <tr key={item.lot_no}>
                      <td>{item.lot_no}</td>
                      <td>{item.area_m2.toFixed(2)}</td>
                      <td>{item.area_hectares.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="preview-empty">
            <p>No subdivision preview yet. Go back and click Preview Split.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(SurveyPlanSubdivisionExportStep);
