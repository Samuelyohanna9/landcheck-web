import { memo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import SurveyPreview from "../SurveyPreview";

type PlotMeta = {
  title_text: string;
  location_text: string;
  lga_text: string;
  state_text: string;
  surveyor_name: string;
  surveyor_rank: string;
  certification_statement: string;
  scale_text: string;
  paper_size: string;
  // "" means "not chosen yet" - a brand-new plot starts here so a real template must be picked
  // before anything downstream (preview, CAD editor, export) runs against it. Never persisted as a
  // final choice - see requireTemplate below, which blocks every action that depends on it.
  template_name: "" | "general" | "site_plan" | "adamawa_osg" | "akwa_ibom_osg" | "rivers_osg" | "cross_river_osg" | "fct_abuja_osg";
  fct_file_no: string;
  fct_district: string;
  fct_cadastral_zone: string;
  fct_origin_beacon_text: string;
  fct_cadastral_map_ref: string;
  fct_title_prefix: string;
  adamawa_rof_no: string;
  adamawa_owner_name: string;
  adamawa_authority_title: string;
  adamawa_authority_date_text: string;
  adamawa_control_point_name: string;
  adamawa_northing: string;
  adamawa_easting: string;
  adamawa_elevation: string;
  adamawa_origin_text: string;
  adamawa_topo_sheet_text: string;
  adamawa_computation_no: string;
  adamawa_cadastral_sheet_no: string;
  adamawa_plan_no: string;
  adamawa_surveyed_by_text: string;
  adamawa_disclaimer_text: string;
  cadastral_plan_no: string;
  cadastral_area_name: string;
  cadastral_datum_text: string;
  cadastral_firm_block_text: string;
  technical_report_instruments: string[];
  technical_report_dgps_type: string;
  technical_report_num_surveyors: number | null;
  technical_report_num_technical_officers: number | null;
  technical_report_num_labourers: number | null;
  technical_report_recce_text: string;
  technical_report_demarcation_text: string;
  technical_report_computation_software_text: string;
  technical_report_plotting_software_text: string;
  technical_report_general_observation_text: string;
};

type PreviewType = "survey" | "orthophoto" | "topomap";
type TopoSource = "opentopomap" | "userdata";
type NorthArrowStyle = "one_side_stem" | "stacked_4n" | "classic" | "triangle" | "compass" | "chevron" | "orienteering" | "star" | "un_marker" | "nn_arrow";
type NorthArrowColor = "black" | "blue";
type BeaconStyle = "circle" | "square" | "triangle" | "diamond" | "cross";
type RoadWidthOption = "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30";

const CADASTRAL_STATE_TEMPLATES: PlotMeta["template_name"][] = ["akwa_ibom_osg", "rivers_osg", "cross_river_osg"];
const CADASTRAL_STATE_HINTS: Record<string, string> = {
  akwa_ibom_osg: "Akwa Ibom State cadastral template",
  rivers_osg: "Rivers State cadastral template",
  cross_river_osg: "Cross River State cadastral template",
};
const CADASTRAL_STATE_LABELS: Record<string, string> = {
  akwa_ibom_osg: "AKWA IBOM STATE",
  rivers_osg: "RIVERS STATE",
  cross_river_osg: "CROSS RIVER STATE",
};
const FCT_TEMPLATES: PlotMeta["template_name"][] = ["fct_abuja_osg"];
const SITE_PLAN_TEMPLATES: PlotMeta["template_name"][] = ["site_plan"];

type Props = {
  sidebar: ReactNode;
  featureCounts: { building: number; road: number; river: number } | null;
  meta: PlotMeta;
  setMeta: Dispatch<SetStateAction<PlotMeta>>;
  defaultCertificationStatement: string;
  defaultAdamawaAuthorityTitle: string;
  defaultAdamawaAuthorityDate: string;
  defaultAdamawaTopoSheetText: string;
  defaultAdamawaDisclaimerText: string;
  scaleDraft: string;
  setScaleDraft: Dispatch<SetStateAction<string>>;
  commitScaleDraft: () => void;
  applyScalePreset: (scale: number) => void;
  currentScaleText: string;
  scalePresets: number[];
  parseScaleDenominator: (scaleText: string) => number;
  isAutoScaleText: (scaleText: string) => boolean;
  previewActionLabel: string;
  refreshCurrentPreview: () => void | Promise<void>;
  previewLoading: boolean;
  orthophotoLoading: boolean;
  topoMapLoading: boolean;
  serverSyncing: boolean;
  previewNeedsRender: boolean;
  hasRenderedCurrentPreview: boolean;
  onOpenFeatureCadEditor: () => void | Promise<void>;
  onPrefetchFeatureEditor: () => void;
  plotId: number | null;
  onSaveFeatureOverride: (payload: {
    feature_type: "road" | "river";
    action: "add" | "delete" | "update";
    name?: string;
    width_m?: number;
    geojson: any;
  }) => Promise<boolean>;
  onRoadNamesSaved?: () => void;
  isOnline: boolean;
  onBack: () => void;
  onContinue: () => void;
  previewType: PreviewType;
  onPreviewTypeChange: (type: PreviewType) => void;
  topoSource: TopoSource;
  onTopoSourceChange: (source: TopoSource) => void;
  contourInterval: number | null;
  onContourIntervalChange: (interval: number | null) => void;
  topoBuildingHatch: string;
  onTopoBuildingHatchChange: (value: string) => void;
  northArrowStyle: NorthArrowStyle;
  northArrowColor: NorthArrowColor;
  beaconStyle: BeaconStyle;
  roadWidth: RoadWidthOption;
  boundaryColor: string;
  gridColor: string;
  textColor: string;
  roadColor: string;
  riverColor: string;
  buildingColor: string;
  buildingHatchType: string;
  roadStyle: string;
  onNorthArrowStyleChange: (value: string) => void;
  onNorthArrowColorChange: (value: string) => void;
  onBeaconStyleChange: (value: string) => void;
  onRoadWidthChange: (value: string) => void;
  onBoundaryColorChange: (value: string) => void;
  onGridColorChange: (value: string) => void;
  onTextColorChange: (value: string) => void;
  onRoadColorChange: (value: string) => void;
  onRiverColorChange: (value: string) => void;
  onBuildingColorChange: (value: string) => void;
  onBuildingHatchTypeChange: (value: string) => void;
  onRoadStyleChange: (value: string) => void;
  titleFont: string;
  titleSize: string;
  gridFont: string;
  gridSize: string;
  stationFont: string;
  stationSize: string;
  bearingFont: string;
  bearingSize: string;
  areaFont: string;
  areaSize: string;
  onTitleFontChange: (value: string) => void;
  onTitleSizeChange: (value: string) => void;
  onGridFontChange: (value: string) => void;
  onGridSizeChange: (value: string) => void;
  onStationFontChange: (value: string) => void;
  onStationSizeChange: (value: string) => void;
  onBearingFontChange: (value: string) => void;
  onBearingSizeChange: (value: string) => void;
  onAreaFontChange: (value: string) => void;
  onAreaSizeChange: (value: string) => void;
  surveyPreviewUrl: string | null;
  orthophotoPreviewUrl: string | null;
  topoMapPreviewUrl: string | null;
  hasHeightData: boolean;
};

function SurveyPlanSurveyPreviewStep({
  sidebar,
  featureCounts,
  meta,
  setMeta,
  defaultCertificationStatement,
  defaultAdamawaAuthorityTitle,
  defaultAdamawaAuthorityDate,
  defaultAdamawaTopoSheetText,
  defaultAdamawaDisclaimerText,
  scaleDraft,
  setScaleDraft,
  commitScaleDraft,
  applyScalePreset,
  currentScaleText,
  scalePresets,
  parseScaleDenominator,
  isAutoScaleText,
  previewActionLabel,
  refreshCurrentPreview,
  previewLoading,
  orthophotoLoading,
  topoMapLoading,
  serverSyncing,
  previewNeedsRender,
  hasRenderedCurrentPreview,
  onOpenFeatureCadEditor,
  onPrefetchFeatureEditor,
  plotId,
  onSaveFeatureOverride,
  onRoadNamesSaved,
  isOnline,
  onBack,
  onContinue,
  previewType,
  onPreviewTypeChange,
  topoSource,
  onTopoSourceChange,
  contourInterval,
  onContourIntervalChange,
  topoBuildingHatch,
  onTopoBuildingHatchChange,
  northArrowStyle,
  northArrowColor,
  beaconStyle,
  roadWidth,
  boundaryColor,
  gridColor,
  textColor,
  roadColor,
  riverColor,
  buildingColor,
  buildingHatchType,
  roadStyle,
  onNorthArrowStyleChange,
  onNorthArrowColorChange,
  onBeaconStyleChange,
  onRoadWidthChange,
  onBoundaryColorChange,
  onGridColorChange,
  onTextColorChange,
  onRoadColorChange,
  onRiverColorChange,
  onBuildingColorChange,
  onBuildingHatchTypeChange,
  onRoadStyleChange,
  titleFont,
  titleSize,
  gridFont,
  gridSize,
  stationFont,
  stationSize,
  bearingFont,
  bearingSize,
  areaFont,
  areaSize,
  onTitleFontChange,
  onTitleSizeChange,
  onGridFontChange,
  onGridSizeChange,
  onStationFontChange,
  onStationSizeChange,
  onBearingFontChange,
  onBearingSizeChange,
  onAreaFontChange,
  onAreaSizeChange,
  surveyPreviewUrl,
  orthophotoPreviewUrl,
  topoMapPreviewUrl,
  hasHeightData,
}: Props) {
  const rendering = previewLoading || orthophotoLoading || topoMapLoading || serverSyncing;
  const templateSelectRef = useRef<HTMLSelectElement>(null);
  const [templateError, setTemplateError] = useState(false);

  // Every action on this step that actually depends on which template is in use (rendering a
  // preview, opening the CAD editor, moving on to export) runs through this first - instead of
  // letting a click through and only discovering later that "general" was never a real choice.
  const requireTemplate = (action: () => void | Promise<void>) => {
    if (!meta.template_name) {
      setTemplateError(true);
      templateSelectRef.current?.focus();
      templateSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    void action();
  };

  return (
    <div className="step-panel preview-panel">
      <div className="panel-left">
        {sidebar}
        {featureCounts && (
          <div className="features-bar">
            <span className="features-bar-label">Detected:</span>
            <div className="features-bar-items">
              <div className="feature-chip building">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 3v15M9 9v.01M9 12v.01M9 15v.01M17 9v.01M17 12v.01M17 15v.01" />
                </svg>
                <span className="chip-count">{featureCounts.building}</span>
                <span className="chip-label">Buildings</span>
              </div>
              <div className="feature-chip road">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19L8 5M16 19L20 5M12 19V5M8 10H6M18 10h-2M8 14H6M18 14h-2" />
                </svg>
                <span className="chip-count">{featureCounts.road}</span>
                <span className="chip-label">Roads</span>
              </div>
              <div className="feature-chip river">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7c3-2 6-2 9 0s6 2 9 0M3 12c3-2 6-2 9 0s6 2 9 0M3 17c3-2 6-2 9 0s6 2 9 0" />
                </svg>
                <span className="chip-count">{featureCounts.river}</span>
                <span className="chip-label">Rivers</span>
              </div>
            </div>
          </div>
        )}

        <div className="form-section">
          <h3 className="section-title">Survey Details</h3>
          <div className="form-grid">
            <div className="form-group full-width template-selector-group">
              <div className="template-label-row">
                <label>Template</label>
                <button
                  type="button"
                  className="template-picker-badge"
                  onClick={() => templateSelectRef.current?.focus()}
                >
                  7 templates available — click here to choose
                </button>
              </div>
              <select
                ref={templateSelectRef}
                className={!meta.template_name && templateError ? "field-error" : ""}
                value={meta.template_name}
                onChange={(e) => {
                  setTemplateError(false);
                  const nextTemplate = e.target.value as PlotMeta["template_name"];
                  const wasCadastral = CADASTRAL_STATE_TEMPLATES.includes(meta.template_name);
                  const nowCadastral = CADASTRAL_STATE_TEMPLATES.includes(nextTemplate);
                  const wasFct = FCT_TEMPLATES.includes(meta.template_name);
                  const nowFct = FCT_TEMPLATES.includes(nextTemplate);
                  const wasSitePlan = SITE_PLAN_TEMPLATES.includes(meta.template_name);
                  const nowSitePlan = SITE_PLAN_TEMPLATES.includes(nextTemplate);
                  const enteringApplicantNameStyle =
                    (nowCadastral || nowFct || nowSitePlan) && !wasCadastral && !wasFct && !wasSitePlan;
                  setMeta((m) => ({
                    ...m,
                    template_name: nextTemplate,
                    // Cadastral/FCT templates use this same field as "Applicant Name" (a
                    // person), not the generic plan "Title" the general template shows - don't
                    // carry over the untouched generic default so the person-name placeholder
                    // actually guides the user instead of hiding behind stale text.
                    title_text:
                      enteringApplicantNameStyle && m.title_text.trim().toUpperCase() === "SURVEY PLAN" ? "" : m.title_text,
                  }));
                  if (nowCadastral && !wasCadastral) {
                    onNorthArrowStyleChange("un_marker");
                    onNorthArrowColorChange("blue");
                  } else if (nowFct && !wasFct) {
                    onNorthArrowStyleChange("nn_arrow");
                    onNorthArrowColorChange("black");
                  } else if (nowSitePlan && !wasSitePlan) {
                    onNorthArrowStyleChange("one_side_stem");
                    onNorthArrowColorChange("blue");
                  }
                }}
              >
                <option value="" disabled>Select a template...</option>
                <option value="general">General</option>
                <option value="site_plan">Site Plan</option>
                <option value="adamawa_osg">Adamawa OSG</option>
                <option value="akwa_ibom_osg">Akwa Ibom State (Cadastral)</option>
                <option value="rivers_osg">Rivers State (Cadastral)</option>
                <option value="cross_river_osg">Cross River State (Cadastral)</option>
                <option value="fct_abuja_osg">FCT Abuja (Cadastral)</option>
              </select>
              {!meta.template_name && templateError && (
                <span className="template-error">Select a template first — it changes which fields and layout your plan uses.</span>
              )}
              {meta.template_name === "site_plan" && <span className="template-hint">Site Plan template</span>}
              {meta.template_name === "adamawa_osg" && <span className="template-hint">Adamawa OSG template</span>}
              {CADASTRAL_STATE_TEMPLATES.includes(meta.template_name) && (
                <span className="template-hint">{CADASTRAL_STATE_HINTS[meta.template_name]}</span>
              )}
              {meta.template_name === "fct_abuja_osg" && <span className="template-hint">FCT Abuja cadastral template</span>}
            </div>
            {meta.template_name === "general" ? (
              <>
                <div className="form-group">
                  <label>Title</label>
                  <input value={meta.title_text} onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="SURVEY PLAN" />
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input value={meta.location_text} onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="Enter location" />
                </div>
                <div className="form-group">
                  <label>LGA</label>
                  <input value={meta.lga_text} onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="Local Government Area" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input value={meta.state_text} onChange={(e) => setMeta((m) => ({ ...m, state_text: e.target.value }))} placeholder="Enter state" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={meta.surveyor_name} onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Enter surveyor name" />
                </div>
                <div className="form-group">
                  <label>Rank</label>
                  <input value={meta.surveyor_rank} onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="Surveyor rank" />
                </div>
                <div className="form-group full-width">
                  <label>Certification Statement (Editable)</label>
                  <textarea
                    value={meta.certification_statement}
                    onChange={(e) => setMeta((m) => ({ ...m, certification_statement: e.target.value }))}
                    placeholder={defaultCertificationStatement}
                    rows={3}
                  />
                </div>
              </>
            ) : meta.template_name === "site_plan" ? (
              <>
                <div className="form-group">
                  <label>Applicant Name</label>
                  <input value={meta.title_text} onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="MUSA AUDU" />
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input value={meta.location_text} onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="Enter location" />
                </div>
                <div className="form-group">
                  <label>LGA</label>
                  <input value={meta.lga_text} onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="Local Government Area" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input value={meta.state_text} onChange={(e) => setMeta((m) => ({ ...m, state_text: e.target.value }))} placeholder="Enter state" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={meta.surveyor_name} onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Enter surveyor name" />
                </div>
                <div className="form-group">
                  <label>Rank</label>
                  <input value={meta.surveyor_rank} onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="Surveyor rank" />
                </div>
                <div className="form-group full-width">
                  <span className="template-hint">
                    The photo panel reuses your plot's orthophoto imagery automatically - no separate upload needed.
                  </span>
                </div>
              </>
            ) : CADASTRAL_STATE_TEMPLATES.includes(meta.template_name) ? (
              <>
                <div className="form-group">
                  <label>Applicant Name</label>
                  <input value={meta.title_text} onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="LINUS EFFIONG UDOH" />
                </div>
                <div className="form-group">
                  <label>Road / Street Name</label>
                  <input value={meta.location_text} onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="OLD ORON ROAD" />
                </div>
                <div className="form-group">
                  <label>Locality / Area Name</label>
                  <input value={meta.cadastral_area_name} onChange={(e) => setMeta((m) => ({ ...m, cadastral_area_name: e.target.value }))} placeholder="NDON EBOM" />
                </div>
                <div className="form-group">
                  <label>LGA</label>
                  <input value={meta.lga_text} onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="URUAN LOCAL GOVT. AREA" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input
                    value={meta.state_text}
                    onChange={(e) => setMeta((m) => ({ ...m, state_text: e.target.value }))}
                    placeholder={CADASTRAL_STATE_LABELS[meta.template_name]}
                  />
                </div>
                <div className="form-group">
                  <label>Plan Number</label>
                  <input value={meta.cadastral_plan_no} onChange={(e) => setMeta((m) => ({ ...m, cadastral_plan_no: e.target.value }))} placeholder="AK 12345" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={meta.surveyor_name} onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Enter surveyor name" />
                </div>
                <div className="form-group">
                  <label>Surveyor Credential</label>
                  <input value={meta.surveyor_rank} onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="MNIS" />
                </div>
                <div className="form-group">
                  <label>Datum</label>
                  <input value={meta.cadastral_datum_text} onChange={(e) => setMeta((m) => ({ ...m, cadastral_datum_text: e.target.value }))} placeholder="MINNA DATUM" />
                </div>
                <div className="form-group full-width">
                  <label>Surveyor's Firm (name, address, email, phone)</label>
                  <textarea
                    value={meta.cadastral_firm_block_text}
                    onChange={(e) => setMeta((m) => ({ ...m, cadastral_firm_block_text: e.target.value }))}
                    rows={3}
                    placeholder={"SURVEYOR NAME & CO.\nNo. 1 Example Street, Uyo, Akwa Ibom State\nemail@example.com | 0800 000 0000"}
                  />
                </div>
                <div className="form-group full-width">
                  <span className="template-hint">
                    Enter each beacon's reference number (e.g. SC/AK/L 72723) into the "Station" field for its coordinate point in the list above.
                  </span>
                </div>
              </>
            ) : meta.template_name === "fct_abuja_osg" ? (
              <>
                <div className="form-group">
                  <label>Title</label>
                  <input
                    value={meta.fct_title_prefix}
                    onChange={(e) => setMeta((m) => ({ ...m, fct_title_prefix: e.target.value }))}
                    placeholder="SURVEY PLAN FOR"
                  />
                </div>
                <div className="form-group">
                  <label>Applicant Name</label>
                  <input value={meta.title_text} onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="NUHU LABBO ALIYU" />
                </div>
                <div className="form-group">
                  <label>File No</label>
                  <input value={meta.fct_file_no} onChange={(e) => setMeta((m) => ({ ...m, fct_file_no: e.target.value }))} placeholder="NG 10222" />
                </div>
                <div className="form-group">
                  <label>District</label>
                  <input value={meta.fct_district} onChange={(e) => setMeta((m) => ({ ...m, fct_district: e.target.value }))} placeholder="WUSE II" />
                </div>
                <div className="form-group">
                  <label>Cadastral Zone</label>
                  <input value={meta.fct_cadastral_zone} onChange={(e) => setMeta((m) => ({ ...m, fct_cadastral_zone: e.target.value }))} placeholder="A07" />
                </div>
                <div className="form-group">
                  <label>Plot No</label>
                  <input value={meta.cadastral_plan_no} onChange={(e) => setMeta((m) => ({ ...m, cadastral_plan_no: e.target.value }))} placeholder="976" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={meta.surveyor_name} onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Geodata Ltd." />
                </div>
                <div className="form-group">
                  <label>Surveyor Credential</label>
                  <input value={meta.surveyor_rank} onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="Registered Surveyors" />
                </div>
                <div className="form-group full-width">
                  <label>Cadastral Map Reference</label>
                  <input
                    value={meta.fct_cadastral_map_ref}
                    onChange={(e) => setMeta((m) => ({ ...m, fct_cadastral_map_ref: e.target.value }))}
                    placeholder="330/1002/SE2"
                  />
                </div>
                <div className="form-group full-width">
                  <span className="template-hint">
                    Enter each beacon's number (e.g. PB 2854) into the "Station" field for its coordinate point in the list above.
                    The first point's beacon number and coordinates are used automatically as the plan's reference beacon in the NOTE box.
                  </span>
                </div>
              </>
            ) : meta.template_name === "adamawa_osg" ? (
              <>
                <div className="form-group">
                  <label>R of O Number</label>
                  <input value={meta.adamawa_rof_no} onChange={(e) => setMeta((m) => ({ ...m, adamawa_rof_no: e.target.value }))} placeholder="E.G ADS50530" />
                </div>
                <div className="form-group">
                  <label>Owner Name</label>
                  <input value={meta.adamawa_owner_name} onChange={(e) => setMeta((m) => ({ ...m, adamawa_owner_name: e.target.value }))} placeholder="LAND OWNER NAME" />
                </div>
                <div className="form-group">
                  <label>Location (AT)</label>
                  <input value={meta.location_text} onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="LOCATION" />
                </div>
                <div className="form-group">
                  <label>Local Government</label>
                  <input value={meta.lga_text} onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="LOCAL GOVERNMENT" />
                </div>
                <div className="form-group">
                  <label>Authority Title</label>
                  <input
                    value={meta.adamawa_authority_title}
                    onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_title: e.target.value }))}
                    placeholder={defaultAdamawaAuthorityTitle}
                  />
                </div>
                <div className="form-group">
                  <label>Authority Date</label>
                  <input
                    value={meta.adamawa_authority_date_text}
                    onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_date_text: e.target.value }))}
                    placeholder={defaultAdamawaAuthorityDate}
                  />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={meta.surveyor_name} onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Survor Name" />
                </div>
                <div className="form-group full-width">
                  <label>Control Data Source</label>
                  <input value="Auto from plotted coordinates/stations (read-only)" readOnly />
                </div>
                <div className="form-group">
                  <label>Cadastral Sheet No</label>
                  <input
                    value={meta.adamawa_cadastral_sheet_no}
                    onChange={(e) => setMeta((m) => ({ ...m, adamawa_cadastral_sheet_no: e.target.value }))}
                    placeholder="07"
                  />
                </div>
                <div className="form-group full-width">
                  <label>Topo Sheet Text</label>
                  <input
                    value={meta.adamawa_topo_sheet_text}
                    onChange={(e) => setMeta((m) => ({ ...m, adamawa_topo_sheet_text: e.target.value }))}
                    placeholder={defaultAdamawaTopoSheetText}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Disclaimer Text</label>
                  <textarea
                    value={meta.adamawa_disclaimer_text}
                    onChange={(e) => setMeta((m) => ({ ...m, adamawa_disclaimer_text: e.target.value }))}
                    rows={3}
                    placeholder={defaultAdamawaDisclaimerText}
                  />
                </div>
              </>
            ) : (
              <div className="form-group full-width">
                <span className="template-hint">Choose a template above to fill in this plan's details.</span>
              </div>
            )}
            {meta.template_name && (
              <>
                <div className="form-group scale-group">
                  <label>Scale</label>
                  <div className="scale-input-wrapper">
                    <span className="scale-prefix">1 :</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={scaleDraft}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setScaleDraft(val);
                      }}
                      onBlur={commitScaleDraft}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitScaleDraft();
                        }
                      }}
                      className="scale-number-input"
                      placeholder="1000"
                      aria-label="Scale denominator"
                    />
                  </div>
                  <span className="scale-helper">
                    Leave blank for auto-fit on first render, or type only the number after `1 :` (example: `1000`).
                  </span>
                  <div className="scale-presets">
                    {scalePresets.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`scale-preset-btn ${!isAutoScaleText(currentScaleText) && parseScaleDenominator(currentScaleText) === s ? "active" : ""}`}
                        onClick={() => applyScalePreset(s)}
                      >
                        1:{s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group paper-size-group">
                  <label>Paper Size</label>
                  <div className="paper-size-presets">
                    {["A4", "A3", "A2", "A1", "A0"].map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={`paper-size-btn ${meta.paper_size === size ? "active" : ""}`}
                        onClick={() => setMeta((m) => ({ ...m, paper_size: size }))}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <span className="paper-size-hint">
                    {meta.paper_size === "A4" && "Standard (210 x 297 mm)"}
                    {meta.paper_size === "A3" && "Large (297 x 420 mm)"}
                    {meta.paper_size === "A2" && "Extra Large (420 x 594 mm)"}
                    {meta.paper_size === "A1" && "Poster (594 x 841 mm)"}
                    {meta.paper_size === "A0" && "Maximum (841 x 1189 mm)"}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="edit-feature-bar">
            <button
              className={`btn-secondary${previewNeedsRender && !rendering ? " needs-render" : ""}`}
              onClick={() => requireTemplate(refreshCurrentPreview)}
              disabled={rendering}
            >
              {previewNeedsRender && !rendering && <span className="needs-render-dot" aria-hidden="true" />}
              {rendering ? "Rendering..." : previewActionLabel}
            </button>
            <button
              className="btn-outline"
              onClick={() => requireTemplate(onOpenFeatureCadEditor)}
              onMouseEnter={onPrefetchFeatureEditor}
              onFocus={onPrefetchFeatureEditor}
              disabled={!plotId && (serverSyncing || !isOnline)}
            >
              Open Feature CAD Editor
            </button>
          </div>
          {previewNeedsRender && !rendering && (
            <p className="needs-render-hint">
              {hasRenderedCurrentPreview ? (
                <>You've made changes that aren't in the preview yet — click <strong>{previewActionLabel}</strong> to update it.</>
              ) : (
                <>No preview has been generated yet — click <strong>{previewActionLabel}</strong> to see your survey plan.</>
              )}
            </p>
          )}
        </div>

        <div className="action-bar">
          <button className="btn-outline" onClick={onBack}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
            Back to Coordinates
          </button>
          <button className="btn-primary" onClick={() => requireTemplate(onContinue)}>
            Continue to Export
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="panel-right preview-container">
        {previewNeedsRender && !rendering && (
          <div className="preview-stale-banner">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.743 2.987H3.72c-1.53 0-2.493-1.653-1.743-2.987l6.28-11.18zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span>
              {hasRenderedCurrentPreview ? (
                <>Preview is out of date — click <strong>{previewActionLabel}</strong> to see your latest changes.</>
              ) : (
                <>No preview yet — click <strong>{previewActionLabel}</strong> to generate your survey plan.</>
              )}
            </span>
          </div>
        )}
        <SurveyPreview
          previewType={previewType}
          onPreviewTypeChange={onPreviewTypeChange}
          topoSource={topoSource}
          onTopoSourceChange={onTopoSourceChange}
          contourInterval={contourInterval}
          onContourIntervalChange={onContourIntervalChange}
          topoBuildingHatch={topoBuildingHatch}
          onTopoBuildingHatchChange={onTopoBuildingHatchChange}
          northArrowStyle={northArrowStyle}
          northArrowColor={northArrowColor}
          beaconStyle={beaconStyle}
          roadWidth={roadWidth}
          boundaryColor={boundaryColor}
          gridColor={gridColor}
          textColor={textColor}
          roadColor={roadColor}
          riverColor={riverColor}
          buildingColor={buildingColor}
          buildingHatchType={buildingHatchType}
          roadStyle={roadStyle}
          onNorthArrowStyleChange={onNorthArrowStyleChange}
          onNorthArrowColorChange={onNorthArrowColorChange}
          onBeaconStyleChange={onBeaconStyleChange}
          onRoadWidthChange={onRoadWidthChange}
          onBoundaryColorChange={onBoundaryColorChange}
          onGridColorChange={onGridColorChange}
          onTextColorChange={onTextColorChange}
          onRoadColorChange={onRoadColorChange}
          onRiverColorChange={onRiverColorChange}
          onBuildingColorChange={onBuildingColorChange}
          onBuildingHatchTypeChange={onBuildingHatchTypeChange}
          onRoadStyleChange={onRoadStyleChange}
          titleFont={titleFont}
          titleSize={titleSize}
          gridFont={gridFont}
          gridSize={gridSize}
          stationFont={stationFont}
          stationSize={stationSize}
          bearingFont={bearingFont}
          bearingSize={bearingSize}
          areaFont={areaFont}
          areaSize={areaSize}
          onTitleFontChange={onTitleFontChange}
          onTitleSizeChange={onTitleSizeChange}
          onGridFontChange={onGridFontChange}
          onGridSizeChange={onGridSizeChange}
          onStationFontChange={onStationFontChange}
          onStationSizeChange={onStationSizeChange}
          onBearingFontChange={onBearingFontChange}
          onBearingSizeChange={onBearingSizeChange}
          onAreaFontChange={onAreaFontChange}
          onAreaSizeChange={onAreaSizeChange}
          paperSize={meta.paper_size}
          surveyPreviewUrl={surveyPreviewUrl}
          orthophotoPreviewUrl={orthophotoPreviewUrl}
          topoMapPreviewUrl={topoMapPreviewUrl}
          loading={previewLoading}
          orthophotoLoading={orthophotoLoading}
          topoMapLoading={topoMapLoading}
          hasHeightData={hasHeightData}
          plotId={plotId}
          onSaveFeatureOverride={onSaveFeatureOverride}
          onRoadNamesSaved={onRoadNamesSaved}
          scaleText={meta.scale_text}
          templateName={meta.template_name}
        />
      </div>
    </div>
  );
}

export default memo(SurveyPlanSurveyPreviewStep);
