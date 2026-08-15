import { memo, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";
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
  template_name: "general" | "site_plan" | "adamawa_osg" | "akwa_ibom_osg" | "rivers_osg" | "cross_river_osg" | "fct_abuja_osg";
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

type SubdivisionMethod = "by_count" | "by_area" | "by_fraction" | "by_custom_area";
type SubdivisionPanelTab = "survey_plan" | "subdivision_lines";
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

type SubdivisionPreviewPlot = {
  index: number;
  lot_no: string;
  area_m2: number;
  area_hectares: number;
};

type SubdivisionPreviewData = {
  resolved_count: number;
  target_area_m2?: number | null;
  orientation_deg?: number;
  derived_total_area_m2: number;
  total_area_m2: number;
  area_imbalance_m2: number;
  plots: SubdivisionPreviewPlot[];
};

type SubdivisionBatchRow = {
  id: number;
  method: string;
  generated_count: number;
  total_area_m2: number;
};

type SubdivisionSvgPreviewPlot = {
  idx: number;
  path: string;
  stroke: string;
  labelX: number;
  labelY: number;
  lotNo: string;
  areaHa: number;
};

type SubdivisionSvgPreview = {
  width: number;
  height: number;
  plots: SubdivisionSvgPreviewPlot[];
};

type Props = {
  sidebar: ReactNode;
  meta: PlotMeta;
  setMeta: Dispatch<SetStateAction<PlotMeta>>;
  scaleDraft: string;
  setScaleDraft: Dispatch<SetStateAction<string>>;
  commitScaleDraft: () => void;
  applyScalePreset: (scale: number) => void;
  currentScaleText: string;
  parseScaleDenominator: (value: string) => number;
  isAutoScaleText: (value: string) => boolean;
  scalePresets: number[];
  previewActionLabel: string;
  refreshCurrentPreview: () => void | Promise<void>;
  previewLoading: boolean;
  orthophotoLoading: boolean;
  topoMapLoading: boolean;
  serverSyncing: boolean;
  previewNeedsRender: boolean;
  hasRenderedCurrentPreview: boolean;
  onOpenFeatureCadEditor: () => void | Promise<void>;
  isOnline: boolean;
  plotId: number | null;
  onSaveFeatureOverride: (payload: {
    feature_type: "road" | "river";
    action: "add" | "delete" | "update";
    name?: string;
    width_m?: number;
    geojson: any;
  }) => Promise<boolean>;
  onRoadNamesSaved?: () => void;
  defaultCertificationStatement: string;
  defaultAdamawaAuthorityTitle: string;
  defaultAdamawaAuthorityDate: string;
  defaultAdamawaTopoSheetText: string;
  defaultAdamawaDisclaimerText: string;
  subdivisionMethod: SubdivisionMethod;
  setSubdivisionMethod: Dispatch<SetStateAction<SubdivisionMethod>>;
  subdivisionFractionWeightsEffective: number[];
  subdivisionPreview: SubdivisionPreviewData | null;
  setSubdivisionFractionBreaks: Dispatch<SetStateAction<number[]>>;
  setSubdivisionFractionDraft: Dispatch<SetStateAction<string>>;
  weightsToBreaks: (weights: number[]) => number[];
  formatWeightsDraft: (weights: number[]) => string;
  parsePositiveInt: (value: string) => number | null;
  subdivisionCountDraft: string;
  setSubdivisionCountDraft: Dispatch<SetStateAction<string>>;
  subdivisionTargetAreaDraft: string;
  setSubdivisionTargetAreaDraft: Dispatch<SetStateAction<string>>;
  subdivisionFractionDraft: string;
  commitSubdivisionFractionDraft: () => void;
  subdivisionParentAreaLoading: boolean;
  subdivisionParentAreaM2: number | null;
  subdivisionOrientationDraft: string;
  setSubdivisionOrientationDraft: Dispatch<SetStateAction<string>>;
  subdivisionLotPrefix: string;
  setSubdivisionLotPrefix: Dispatch<SetStateAction<string>>;
  subdivisionEstateName: string;
  setSubdivisionEstateName: Dispatch<SetStateAction<string>>;
  subdivisionCustomLotCount: number;
  subdivisionCustomAllocatedM2: number;
  subdivisionCustomRemainingM2: number | null;
  subdivisionLotNamesDraft: string[];
  updateSubdivisionLotName: (index: number, value: string) => void;
  subdivisionCustomAreaDrafts: string[];
  updateSubdivisionCustomAreaDraft: (index: number, value: string) => void;
  setSubdivisionPreviewPanelTab: Dispatch<SetStateAction<SubdivisionPanelTab>>;
  previewSubdivision: (silent?: boolean) => void | Promise<void>;
  subdivisionPreviewLoading: boolean;
  subdivisionApplyLoading: boolean;
  parsePositiveFloat: (value: string) => number | null;
  loadSubdivisionBatches: () => void | Promise<void>;
  subdivisionBatchLoading: boolean;
  subdivisionBatches: SubdivisionBatchRow[];
  subdivisionDownloadBatchId: number | null;
  downloadSubdivisionBatch: (batchId: number) => void | Promise<void>;
  applySubdivision: () => void | Promise<void>;
  onBack: () => void;
  onContinue: () => void;
  subdivisionPreviewPanelTab: SubdivisionPanelTab;
  previewType: PreviewType;
  onPreviewTypeChange: (type: PreviewType) => void;
  topoSource: TopoSource;
  onTopoSourceChange: (source: TopoSource) => void;
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
  subdivisionMapPreviewData: object | null;
  subdivisionSvgPreview: SubdivisionSvgPreview | null;
  onSubdivisionLineCanvasRef: (node: HTMLDivElement | null) => void;
  onSubdivisionMapContainerRef: (node: HTMLDivElement | null) => void;
  stopSubdivisionBreakDrag: () => void;
  hasMapboxToken: boolean;
  subdivisionFractionBreaksEffective: number[];
  subdivisionDraggingBreakIndex: number | null;
  startSubdivisionBreakDrag: (index: number, clientX: number) => void;
  subdivisionTargetDisplayM2: number;
  subdivisionOrientationDisplayDeg: number;
};

function SurveyPlanSubdivisionPreviewStep(props: Props) {
  const rendering = props.previewLoading || props.orthophotoLoading || props.topoMapLoading || props.serverSyncing;
  const templateSelectRef = useRef<HTMLSelectElement>(null);

  return (
    <div className="step-panel preview-panel">
      <div className="panel-left">
        {props.sidebar}
        <div className="form-section subdivision-section">
          <h3 className="section-title">Plot Subdivision & Batch Plans</h3>
          <p className="section-desc">Configure lot split for this mother parcel, preview output, then generate a batch.</p>
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
                value={props.meta.template_name}
                onChange={(e) => {
                  const nextTemplate = e.target.value as PlotMeta["template_name"];
                  const wasCadastral = CADASTRAL_STATE_TEMPLATES.includes(props.meta.template_name);
                  const nowCadastral = CADASTRAL_STATE_TEMPLATES.includes(nextTemplate);
                  const wasFct = FCT_TEMPLATES.includes(props.meta.template_name);
                  const nowFct = FCT_TEMPLATES.includes(nextTemplate);
                  const wasSitePlan = SITE_PLAN_TEMPLATES.includes(props.meta.template_name);
                  const nowSitePlan = SITE_PLAN_TEMPLATES.includes(nextTemplate);
                  const enteringApplicantNameStyle =
                    (nowCadastral || nowFct || nowSitePlan) && !wasCadastral && !wasFct && !wasSitePlan;
                  props.setMeta((m) => ({
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
                    props.onNorthArrowStyleChange("un_marker");
                    props.onNorthArrowColorChange("blue");
                  } else if (nowFct && !wasFct) {
                    props.onNorthArrowStyleChange("nn_arrow");
                    props.onNorthArrowColorChange("black");
                  } else if (nowSitePlan && !wasSitePlan) {
                    props.onNorthArrowStyleChange("one_side_stem");
                    props.onNorthArrowColorChange("blue");
                  }
                }}
              >
                <option value="general">General</option>
                <option value="site_plan">Site Plan</option>
                <option value="adamawa_osg">Adamawa OSG</option>
                <option value="akwa_ibom_osg">Akwa Ibom State (Cadastral)</option>
                <option value="rivers_osg">Rivers State (Cadastral)</option>
                <option value="cross_river_osg">Cross River State (Cadastral)</option>
                <option value="fct_abuja_osg">FCT Abuja (Cadastral)</option>
              </select>
              {props.meta.template_name === "site_plan" && <span className="template-hint">Site Plan template</span>}
              {props.meta.template_name === "adamawa_osg" && <span className="template-hint">Adamawa OSG template</span>}
              {CADASTRAL_STATE_TEMPLATES.includes(props.meta.template_name) && (
                <span className="template-hint">{CADASTRAL_STATE_HINTS[props.meta.template_name]}</span>
              )}
              {props.meta.template_name === "fct_abuja_osg" && <span className="template-hint">FCT Abuja cadastral template</span>}
            </div>
            {props.meta.template_name === "general" ? (
              <>
                <div className="form-group">
                  <label>Title</label>
                  <input value={props.meta.title_text} onChange={(e) => props.setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="SURVEY PLAN" />
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input value={props.meta.location_text} onChange={(e) => props.setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="Enter location" />
                </div>
                <div className="form-group">
                  <label>LGA</label>
                  <input value={props.meta.lga_text} onChange={(e) => props.setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="Local Government Area" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input value={props.meta.state_text} onChange={(e) => props.setMeta((m) => ({ ...m, state_text: e.target.value }))} placeholder="Enter state" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={props.meta.surveyor_name} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Enter surveyor name" />
                </div>
                <div className="form-group">
                  <label>Rank</label>
                  <input value={props.meta.surveyor_rank} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="Surveyor rank" />
                </div>
                <div className="form-group full-width">
                  <label>Certification Statement (Editable)</label>
                  <textarea
                    value={props.meta.certification_statement}
                    onChange={(e) => props.setMeta((m) => ({ ...m, certification_statement: e.target.value }))}
                    placeholder={props.defaultCertificationStatement}
                    rows={3}
                  />
                </div>
              </>
            ) : props.meta.template_name === "site_plan" ? (
              <>
                <div className="form-group">
                  <label>Applicant Name</label>
                  <input value={props.meta.title_text} onChange={(e) => props.setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="CHINEDU TIMOTHY OKEY" />
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input value={props.meta.location_text} onChange={(e) => props.setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="Enter location" />
                </div>
                <div className="form-group">
                  <label>LGA</label>
                  <input value={props.meta.lga_text} onChange={(e) => props.setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="Local Government Area" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input value={props.meta.state_text} onChange={(e) => props.setMeta((m) => ({ ...m, state_text: e.target.value }))} placeholder="Enter state" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={props.meta.surveyor_name} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Enter surveyor name" />
                </div>
                <div className="form-group">
                  <label>Rank</label>
                  <input value={props.meta.surveyor_rank} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="Surveyor rank" />
                </div>
                <div className="form-group full-width">
                  <span className="template-hint">
                    The photo panel reuses your plot's orthophoto imagery automatically - no separate upload needed.
                  </span>
                </div>
              </>
            ) : CADASTRAL_STATE_TEMPLATES.includes(props.meta.template_name) ? (
              <>
                <div className="form-group">
                  <label>Applicant Name</label>
                  <input value={props.meta.title_text} onChange={(e) => props.setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="LINUS EFFIONG UDOH" />
                </div>
                <div className="form-group">
                  <label>Road / Street Name</label>
                  <input value={props.meta.location_text} onChange={(e) => props.setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="OLD ORON ROAD" />
                </div>
                <div className="form-group">
                  <label>Locality / Area Name</label>
                  <input value={props.meta.cadastral_area_name} onChange={(e) => props.setMeta((m) => ({ ...m, cadastral_area_name: e.target.value }))} placeholder="NDON EBOM" />
                </div>
                <div className="form-group">
                  <label>LGA</label>
                  <input value={props.meta.lga_text} onChange={(e) => props.setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="URUAN LOCAL GOVT. AREA" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input
                    value={props.meta.state_text}
                    onChange={(e) => props.setMeta((m) => ({ ...m, state_text: e.target.value }))}
                    placeholder={CADASTRAL_STATE_LABELS[props.meta.template_name]}
                  />
                </div>
                <div className="form-group">
                  <label>Plan Number</label>
                  <input value={props.meta.cadastral_plan_no} onChange={(e) => props.setMeta((m) => ({ ...m, cadastral_plan_no: e.target.value }))} placeholder="AK 12345" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={props.meta.surveyor_name} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Enter surveyor name" />
                </div>
                <div className="form-group">
                  <label>Surveyor Credential</label>
                  <input value={props.meta.surveyor_rank} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="MNIS" />
                </div>
                <div className="form-group">
                  <label>Datum</label>
                  <input value={props.meta.cadastral_datum_text} onChange={(e) => props.setMeta((m) => ({ ...m, cadastral_datum_text: e.target.value }))} placeholder="MINNA DATUM" />
                </div>
                <div className="form-group full-width">
                  <label>Surveyor's Firm (name, address, email, phone)</label>
                  <textarea
                    value={props.meta.cadastral_firm_block_text}
                    onChange={(e) => props.setMeta((m) => ({ ...m, cadastral_firm_block_text: e.target.value }))}
                    rows={2}
                    placeholder={"SURVEYOR NAME & CO.\nNo. 1 Example Street, Uyo, Akwa Ibom State\nemail@example.com | 0800 000 0000"}
                  />
                </div>
                <div className="form-group full-width">
                  <span className="template-hint">
                    Enter each beacon's reference number (e.g. SC/AK/L 72723) into the lot's "Station" field for each coordinate point.
                  </span>
                </div>
              </>
            ) : props.meta.template_name === "fct_abuja_osg" ? (
              <>
                <div className="form-group">
                  <label>Title</label>
                  <input
                    value={props.meta.fct_title_prefix}
                    onChange={(e) => props.setMeta((m) => ({ ...m, fct_title_prefix: e.target.value }))}
                    placeholder="SURVEY PLAN FOR"
                  />
                </div>
                <div className="form-group">
                  <label>Applicant Name</label>
                  <input value={props.meta.title_text} onChange={(e) => props.setMeta((m) => ({ ...m, title_text: e.target.value }))} placeholder="NUHU LABBO ALIYU" />
                </div>
                <div className="form-group">
                  <label>File No</label>
                  <input value={props.meta.fct_file_no} onChange={(e) => props.setMeta((m) => ({ ...m, fct_file_no: e.target.value }))} placeholder="NG 10222" />
                </div>
                <div className="form-group">
                  <label>District</label>
                  <input value={props.meta.fct_district} onChange={(e) => props.setMeta((m) => ({ ...m, fct_district: e.target.value }))} placeholder="WUSE II" />
                </div>
                <div className="form-group">
                  <label>Cadastral Zone</label>
                  <input value={props.meta.fct_cadastral_zone} onChange={(e) => props.setMeta((m) => ({ ...m, fct_cadastral_zone: e.target.value }))} placeholder="A07" />
                </div>
                <div className="form-group">
                  <label>Plot No</label>
                  <input value={props.meta.cadastral_plan_no} onChange={(e) => props.setMeta((m) => ({ ...m, cadastral_plan_no: e.target.value }))} placeholder="976" />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={props.meta.surveyor_name} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Geodata Ltd." />
                </div>
                <div className="form-group">
                  <label>Surveyor Credential</label>
                  <input value={props.meta.surveyor_rank} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))} placeholder="Registered Surveyors" />
                </div>
                <div className="form-group full-width">
                  <label>Cadastral Map Reference</label>
                  <input
                    value={props.meta.fct_cadastral_map_ref}
                    onChange={(e) => props.setMeta((m) => ({ ...m, fct_cadastral_map_ref: e.target.value }))}
                    placeholder="330/1002/SE2"
                  />
                </div>
                <div className="form-group full-width">
                  <span className="template-hint">
                    Enter each beacon's number (e.g. PB 2854) into the lot's "Station" field for each coordinate point.
                    The first point's beacon number and coordinates are used automatically as the plan's reference beacon in the NOTE box.
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>R of O Number</label>
                  <input value={props.meta.adamawa_rof_no} onChange={(e) => props.setMeta((m) => ({ ...m, adamawa_rof_no: e.target.value }))} placeholder="E.G ADS50530" />
                </div>
                <div className="form-group">
                  <label>Owner Name</label>
                  <input readOnly value="Auto from lot names in this subdivision batch" />
                </div>
                <div className="form-group">
                  <label>Location (AT)</label>
                  <input value={props.meta.location_text} onChange={(e) => props.setMeta((m) => ({ ...m, location_text: e.target.value }))} placeholder="LOCATION" />
                </div>
                <div className="form-group">
                  <label>Local Government</label>
                  <input value={props.meta.lga_text} onChange={(e) => props.setMeta((m) => ({ ...m, lga_text: e.target.value }))} placeholder="LOCAL GOVERNMENT" />
                </div>
                <div className="form-group">
                  <label>Authority Title</label>
                  <input
                    value={props.meta.adamawa_authority_title}
                    onChange={(e) => props.setMeta((m) => ({ ...m, adamawa_authority_title: e.target.value }))}
                    placeholder={props.defaultAdamawaAuthorityTitle}
                  />
                </div>
                <div className="form-group">
                  <label>Authority Date</label>
                  <input
                    value={props.meta.adamawa_authority_date_text}
                    onChange={(e) => props.setMeta((m) => ({ ...m, adamawa_authority_date_text: e.target.value }))}
                    placeholder={props.defaultAdamawaAuthorityDate}
                  />
                </div>
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input value={props.meta.surveyor_name} onChange={(e) => props.setMeta((m) => ({ ...m, surveyor_name: e.target.value }))} placeholder="Surveyor Name" />
                </div>
                <div className="form-group full-width">
                  <label>Control Data Source</label>
                  <input value="Auto from plotted coordinates/stations (read-only)" readOnly />
                </div>
                <div className="form-group">
                  <label>Cadastral Sheet No</label>
                  <input
                    value={props.meta.adamawa_cadastral_sheet_no}
                    onChange={(e) => props.setMeta((m) => ({ ...m, adamawa_cadastral_sheet_no: e.target.value }))}
                    placeholder="07"
                  />
                </div>
                <div className="form-group full-width">
                  <label>Topo Sheet Text</label>
                  <input
                    value={props.meta.adamawa_topo_sheet_text}
                    onChange={(e) => props.setMeta((m) => ({ ...m, adamawa_topo_sheet_text: e.target.value }))}
                    placeholder={props.defaultAdamawaTopoSheetText}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Disclaimer Text</label>
                  <textarea
                    value={props.meta.adamawa_disclaimer_text}
                    onChange={(e) => props.setMeta((m) => ({ ...m, adamawa_disclaimer_text: e.target.value }))}
                    rows={2}
                    placeholder={props.defaultAdamawaDisclaimerText}
                  />
                </div>
              </>
            )}
            <div className="form-group scale-group">
              <label>Scale</label>
              <div className="scale-input-wrapper">
                <span className="scale-prefix">1 :</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={props.scaleDraft}
                  onChange={(e) => props.setScaleDraft(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={props.commitScaleDraft}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      props.commitScaleDraft();
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
                {props.scalePresets.map((s) => (
                  <button
                    key={`sub_scale_${s}`}
                    type="button"
                    className={`scale-preset-btn ${!props.isAutoScaleText(props.currentScaleText) && props.parseScaleDenominator(props.currentScaleText) === s ? "active" : ""}`}
                    onClick={() => props.applyScalePreset(s)}
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
                    key={`sub_size_${size}`}
                    type="button"
                    className={`paper-size-btn ${props.meta.paper_size === size ? "active" : ""}`}
                    onClick={() => props.setMeta((m) => ({ ...m, paper_size: size }))}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <span className="paper-size-hint">
                {props.meta.paper_size === "A4" && "Standard (210 x 297 mm)"}
                {props.meta.paper_size === "A3" && "Large (297 x 420 mm)"}
                {props.meta.paper_size === "A2" && "Extra Large (420 x 594 mm)"}
                {props.meta.paper_size === "A1" && "Poster (594 x 841 mm)"}
                {props.meta.paper_size === "A0" && "Maximum (841 x 1189 mm)"}
              </span>
            </div>
          </div>

          <div className="edit-feature-bar">
            <button
              className={`btn-secondary${props.previewNeedsRender && !rendering ? " needs-render" : ""}`}
              onClick={props.refreshCurrentPreview}
              disabled={rendering}
            >
              {props.previewNeedsRender && !rendering && <span className="needs-render-dot" aria-hidden="true" />}
              {rendering ? "Rendering..." : props.previewActionLabel}
            </button>
            <button className="btn-outline" onClick={props.onOpenFeatureCadEditor} disabled={props.serverSyncing || !props.isOnline}>
              Open Feature CAD Editor
            </button>
          </div>
          {props.previewNeedsRender && !rendering && (
            <p className="needs-render-hint">
              {props.hasRenderedCurrentPreview ? (
                <>You've made changes that aren't in the preview yet — click <strong>{props.previewActionLabel}</strong> to update it.</>
              ) : (
                <>No preview has been generated yet — click <strong>{props.previewActionLabel}</strong> to see your survey plan.</>
              )}
            </p>
          )}

          <hr className="subdivision-divider" />
          <div className="form-grid">
            <div className="form-group">
              <label>Subdivision Method</label>
              <select
                value={props.subdivisionMethod}
                onChange={(e) => {
                  const nextMethod = e.target.value as SubdivisionMethod;
                  props.setSubdivisionMethod(nextMethod);
                  if (nextMethod === "by_fraction") {
                    let weights = props.subdivisionFractionWeightsEffective;
                    if (weights.length < 2) {
                      const fallbackCount = Math.max(2, Number(props.subdivisionPreview?.resolved_count || 0) || 2);
                      weights = Array.from({ length: fallbackCount }, () => 1);
                    }
                    const breaks = props.weightsToBreaks(weights);
                    if (breaks.length) {
                      props.setSubdivisionFractionBreaks(breaks);
                    }
                    props.setSubdivisionFractionDraft(props.formatWeightsDraft(weights));
                  }
                  if (nextMethod === "by_custom_area") {
                    const fallbackCount = Math.max(2, props.parsePositiveInt(props.subdivisionCountDraft) ?? props.subdivisionPreview?.resolved_count ?? 2);
                    props.setSubdivisionCountDraft(String(fallbackCount));
                  }
                }}
              >
                <option value="by_count">Split by number of plots</option>
                <option value="by_area">Split by target plot area (sqm)</option>
                <option value="by_fraction">Split by fractions</option>
                <option value="by_custom_area">Split by custom lot areas</option>
              </select>
            </div>
            {props.subdivisionMethod === "by_count" ? (
              <div className="form-group">
                <label>Derived Plot Count</label>
                <input type="number" min={2} max={500} value={props.subdivisionCountDraft} onChange={(e) => props.setSubdivisionCountDraft(e.target.value)} placeholder="e.g. 20" />
              </div>
            ) : props.subdivisionMethod === "by_area" ? (
              <div className="form-group">
                <label>Target Plot Area (sqm)</label>
                <input type="number" min={1} value={props.subdivisionTargetAreaDraft} onChange={(e) => props.setSubdivisionTargetAreaDraft(e.target.value)} placeholder="e.g. 450" />
              </div>
            ) : props.subdivisionMethod === "by_fraction" ? (
              <div className="form-group full-width">
                <label>Fractions (comma separated)</label>
                <input
                  value={props.subdivisionFractionDraft}
                  onChange={(e) => props.setSubdivisionFractionDraft(e.target.value)}
                  onBlur={props.commitSubdivisionFractionDraft}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      props.commitSubdivisionFractionDraft();
                    }
                  }}
                  placeholder="e.g. 2, 3, 5"
                />
                <span className="scale-helper">Example `2,3,5` means 20%, 30%, 50%. Drag division lines directly in Subdivision Line Preview.</span>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Number of Lots</label>
                  <input type="number" min={2} max={500} value={props.subdivisionCountDraft} onChange={(e) => props.setSubdivisionCountDraft(e.target.value)} placeholder="e.g. 5" />
                </div>
                <div className="form-group">
                  <label>Mother Parcel Area (sqm)</label>
                  <input
                    readOnly
                    value={
                      props.subdivisionParentAreaLoading
                        ? "Loading area..."
                        : props.subdivisionParentAreaM2
                        ? props.subdivisionParentAreaM2.toFixed(2)
                        : "Area unavailable"
                    }
                  />
                </div>
                <div className="form-group full-width">
                  <span className="scale-helper">Allocate area for each lot below. Total allocated area must not exceed the mother parcel area.</span>
                </div>
              </>
            )}
            <div className="form-group">
              <label>Orientation (degrees)</label>
              <input type="number" value={props.subdivisionOrientationDraft} onChange={(e) => props.setSubdivisionOrientationDraft(e.target.value)} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Lot Prefix</label>
              <input value={props.subdivisionLotPrefix} onChange={(e) => props.setSubdivisionLotPrefix(e.target.value.toUpperCase())} placeholder="LOT" maxLength={16} />
            </div>
            <div className="form-group full-width">
              <label>Estate / Layout Name (Optional)</label>
              <input value={props.subdivisionEstateName} onChange={(e) => props.setSubdivisionEstateName(e.target.value)} placeholder="e.g. Think Green Estate Phase 1" />
            </div>
          </div>

          {props.subdivisionMethod === "by_fraction" && (
            <p className="subdivision-note subdivision-break-hint">
              Division-line editing is now on-canvas: open <strong>Subdivision Line Preview</strong> and drag the vertical guides.
            </p>
          )}

          {props.subdivisionMethod === "by_custom_area" && props.subdivisionCustomLotCount >= 2 && (
            <div className="subdivision-custom-areas-wrap">
              <div className="subdivision-custom-areas-head">
                <h5>Custom Lot Area Allocation</h5>
                <span>
                  Allocated: {props.subdivisionCustomAllocatedM2.toFixed(2)} sqm
                  {props.subdivisionCustomRemainingM2 !== null && <> | Remaining: {props.subdivisionCustomRemainingM2.toFixed(2)} sqm</>}
                </span>
              </div>
              <div className="subdivision-table-wrap">
                <table className="subdivision-table">
                  <thead>
                    <tr>
                      <th>Lot / Owner Name</th>
                      <th>Custom Area (sqm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: props.subdivisionCustomLotCount }).map((_, idx) => (
                      <tr key={`custom_area_row_${idx}`}>
                        <td>
                          <input
                            className="subdivision-lot-name-input"
                            value={props.subdivisionLotNamesDraft[idx] ?? ""}
                            onChange={(e) => props.updateSubdivisionLotName(idx, e.target.value)}
                            placeholder={`Lot ${idx + 1} name`}
                          />
                        </td>
                        <td>
                          <input
                            className="subdivision-lot-name-input"
                            type="number"
                            min={0}
                            step="0.01"
                            value={props.subdivisionCustomAreaDrafts[idx] ?? ""}
                            onChange={(e) => props.updateSubdivisionCustomAreaDraft(idx, e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {props.subdivisionCustomRemainingM2 !== null && props.subdivisionCustomRemainingM2 < -0.01 && (
                <p className="subdivision-validation-error">
                  Allocated area exceeds mother parcel by {Math.abs(props.subdivisionCustomRemainingM2).toFixed(2)} sqm.
                </p>
              )}
              {props.subdivisionCustomRemainingM2 !== null && props.subdivisionCustomRemainingM2 > 0.01 && (
                <p className="subdivision-note">
                  Remaining unallocated area: {props.subdivisionCustomRemainingM2.toFixed(2)} sqm. Allocate full area before preview.
                </p>
              )}
            </div>
          )}

          <div className="subdivision-action-row">
            <button
              className="btn-secondary"
              onClick={() => {
                props.setSubdivisionPreviewPanelTab("subdivision_lines");
                props.previewSubdivision(false);
              }}
              disabled={!props.plotId || props.subdivisionPreviewLoading || props.subdivisionApplyLoading}
            >
              {props.subdivisionPreviewLoading ? (
                <>
                  <span className="spinner" />
                  Computing...
                </>
              ) : (
                "Preview Split"
              )}
            </button>
          </div>

          <div className="subdivision-help-card">
            <div className="subdivision-help-row">
              <strong>Orientation</strong>
              <span>
                {Number.isFinite(Number(props.subdivisionOrientationDraft)) ? Number(props.subdivisionOrientationDraft).toFixed(1) : "0.0"} deg{" - "}rotates split-line direction.
              </span>
            </div>
            <div className="subdivision-help-row">
              <strong>Target by area</strong>
              <span>
                {props.subdivisionMethod === "by_area"
                  ? `${(props.parsePositiveFloat(props.subdivisionTargetAreaDraft) || 0).toLocaleString()} sqm per lot (approx).`
                  : props.subdivisionMethod === "by_fraction"
                  ? "Uses your fractions and draggable preview guides to control each lot share."
                  : props.subdivisionMethod === "by_custom_area"
                  ? "Uses exact per-lot areas you enter. Total must match mother parcel area."
                  : "Not used in by-count mode; lots are balanced by area."}
              </span>
            </div>
            {props.subdivisionPreview && (
              <div className="subdivision-help-row">
                <strong>Computed output</strong>
                <span>
                  {props.subdivisionPreview.resolved_count} plots, total {props.subdivisionPreview.derived_total_area_m2.toFixed(2)} sqm.
                </span>
              </div>
            )}
          </div>

          {props.subdivisionPreview && (
            <div className="subdivision-preview-wrap">
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
                      <th>Lot / Owner Name</th>
                      <th>Area (sqm)</th>
                      <th>Area (ha)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.subdivisionPreview.plots.slice(0, 12).map((item) => (
                      <tr key={`sub_lot_${item.index}`}>
                        <td>
                          <input
                            className="subdivision-lot-name-input"
                            value={props.subdivisionLotNamesDraft[item.index - 1] ?? item.lot_no}
                            onChange={(e) => props.updateSubdivisionLotName(item.index - 1, e.target.value)}
                            placeholder="Lot name / owner"
                          />
                        </td>
                        <td>{item.area_m2.toFixed(2)}</td>
                        <td>{item.area_hectares.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {props.subdivisionPreview.plots.length > 12 && (
                <p className="subdivision-note">Showing first 12 lots in preview. Total generated lots: {props.subdivisionPreview.plots.length}.</p>
              )}
            </div>
          )}
        </div>

        <div className="subdivision-batch-wrap">
          <div className="subdivision-batch-header">
            <h4>Generated Batches</h4>
            <button className="btn-outline btn-mini" onClick={() => props.loadSubdivisionBatches()} disabled={!props.plotId || props.subdivisionBatchLoading}>
              {props.subdivisionBatchLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {props.subdivisionBatches.length === 0 ? (
            <p className="subdivision-note">No subdivision batches generated yet for this mother parcel.</p>
          ) : (
            <div className="subdivision-batch-list">
              {props.subdivisionBatches.slice(0, 6).map((batch) => (
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

        <div className="action-bar">
          <button className="btn-outline" onClick={props.onBack}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Mother Parcel
          </button>
          <button className="btn-secondary" onClick={props.applySubdivision} disabled={!props.plotId || props.subdivisionApplyLoading || props.subdivisionPreviewLoading}>
            {props.subdivisionApplyLoading ? (
              <>
                <span className="spinner" />
                Generating...
              </>
            ) : (
              "Generate Batch"
            )}
          </button>
          <button className="btn-primary" onClick={props.onContinue} disabled={props.subdivisionBatches.length === 0}>
            Continue to Batch Export
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div className="panel-right preview-container">
        <div className="subdivision-right-wrap">
          <div className="subdivision-right-header">
            <h4>{props.subdivisionPreviewPanelTab === "survey_plan" ? "Survey Plan Preview" : "Subdivision Line Preview"}</h4>
            <span>
              {props.subdivisionPreviewPanelTab === "survey_plan"
                ? "Review the rendered survey plan before exporting."
                : props.subdivisionMethod === "by_fraction"
                ? "Drag vertical guides to adjust lot fractions live."
                : "Each lot boundary + area label"}
            </span>
            <div className="subdivision-right-tabs" role="tablist" aria-label="Subdivision preview tabs">
              <button
                type="button"
                role="tab"
                aria-selected={props.subdivisionPreviewPanelTab === "survey_plan"}
                className={`subdivision-right-tab ${props.subdivisionPreviewPanelTab === "survey_plan" ? "active" : ""}`}
                onClick={() => props.setSubdivisionPreviewPanelTab("survey_plan")}
              >
                Survey Plan Preview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={props.subdivisionPreviewPanelTab === "subdivision_lines"}
                className={`subdivision-right-tab ${props.subdivisionPreviewPanelTab === "subdivision_lines" ? "active" : ""}`}
                onClick={() => props.setSubdivisionPreviewPanelTab("subdivision_lines")}
              >
                Subdivision Line Preview
              </button>
            </div>
          </div>
          {props.subdivisionPreviewPanelTab === "survey_plan" ? (
            <div className="subdivision-survey-wrap">
              {props.previewNeedsRender && !rendering && (
                <div className="preview-stale-banner">
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.743 2.987H3.72c-1.53 0-2.493-1.653-1.743-2.987l6.28-11.18zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <span>
                    {props.hasRenderedCurrentPreview ? (
                      <>Preview is out of date — click <strong>{props.previewActionLabel}</strong> to see your latest changes.</>
                    ) : (
                      <>No preview yet — click <strong>{props.previewActionLabel}</strong> to generate your survey plan.</>
                    )}
                  </span>
                </div>
              )}
              <SurveyPreview
                previewType={props.previewType}
                onPreviewTypeChange={props.onPreviewTypeChange}
                topoSource={props.topoSource}
                onTopoSourceChange={props.onTopoSourceChange}
                northArrowStyle={props.northArrowStyle}
                northArrowColor={props.northArrowColor}
                beaconStyle={props.beaconStyle}
                roadWidth={props.roadWidth}
                boundaryColor={props.boundaryColor}
                gridColor={props.gridColor}
                textColor={props.textColor}
                roadColor={props.roadColor}
                riverColor={props.riverColor}
                buildingColor={props.buildingColor}
                buildingHatchType={props.buildingHatchType}
                roadStyle={props.roadStyle}
                onNorthArrowStyleChange={props.onNorthArrowStyleChange}
                onNorthArrowColorChange={props.onNorthArrowColorChange}
                onBeaconStyleChange={props.onBeaconStyleChange}
                onRoadWidthChange={props.onRoadWidthChange}
                onBoundaryColorChange={props.onBoundaryColorChange}
                onGridColorChange={props.onGridColorChange}
                onTextColorChange={props.onTextColorChange}
                onRoadColorChange={props.onRoadColorChange}
                onRiverColorChange={props.onRiverColorChange}
                onBuildingColorChange={props.onBuildingColorChange}
                onBuildingHatchTypeChange={props.onBuildingHatchTypeChange}
                onRoadStyleChange={props.onRoadStyleChange}
                titleFont={props.titleFont}
                titleSize={props.titleSize}
                gridFont={props.gridFont}
                gridSize={props.gridSize}
                stationFont={props.stationFont}
                stationSize={props.stationSize}
                bearingFont={props.bearingFont}
                bearingSize={props.bearingSize}
                areaFont={props.areaFont}
                areaSize={props.areaSize}
                onTitleFontChange={props.onTitleFontChange}
                onTitleSizeChange={props.onTitleSizeChange}
                onGridFontChange={props.onGridFontChange}
                onGridSizeChange={props.onGridSizeChange}
                onStationFontChange={props.onStationFontChange}
                onStationSizeChange={props.onStationSizeChange}
                onBearingFontChange={props.onBearingFontChange}
                onBearingSizeChange={props.onBearingSizeChange}
                onAreaFontChange={props.onAreaFontChange}
                onAreaSizeChange={props.onAreaSizeChange}
                paperSize={props.meta.paper_size}
                surveyPreviewUrl={props.surveyPreviewUrl}
                orthophotoPreviewUrl={props.orthophotoPreviewUrl}
                topoMapPreviewUrl={props.topoMapPreviewUrl}
                loading={props.previewLoading}
                orthophotoLoading={props.orthophotoLoading}
                topoMapLoading={props.topoMapLoading}
                hasHeightData={props.hasHeightData}
                allowedPreviewTypes={["survey"]}
                plotId={props.plotId}
                onSaveFeatureOverride={props.onSaveFeatureOverride}
                onRoadNamesSaved={props.onRoadNamesSaved}
                scaleText={props.meta.scale_text}
                templateName={props.meta.template_name}
              />
            </div>
          ) : (
            <>
              {!props.subdivisionPreview && (
                <div className="preview-empty">
                  <p>
                    Click <strong>Preview Split</strong> to see lot lines and area labels here.
                  </p>
                </div>
              )}
              {(props.subdivisionMapPreviewData || props.subdivisionSvgPreview) && (
                <div
                  ref={props.onSubdivisionLineCanvasRef}
                  className="subdivision-map-wrap"
                  onPointerUp={props.stopSubdivisionBreakDrag}
                  onPointerCancel={props.stopSubdivisionBreakDrag}
                >
                  {props.subdivisionMapPreviewData && props.hasMapboxToken ? (
                    <div ref={props.onSubdivisionMapContainerRef} className="subdivision-map-canvas" />
                  ) : (
                    <div className="subdivision-svg-wrap">
                      {props.subdivisionSvgPreview && (
                        <svg
                          viewBox={`0 0 ${props.subdivisionSvgPreview.width} ${props.subdivisionSvgPreview.height}`}
                          className="subdivision-svg"
                          role="img"
                          aria-label="Subdivision lot preview"
                        >
                          <rect x="0" y="0" width={props.subdivisionSvgPreview.width} height={props.subdivisionSvgPreview.height} fill="#0f172a" />
                          <g>
                            {props.subdivisionSvgPreview.plots.map((plot) => (
                              <path key={`plot_path_${plot.idx}`} d={plot.path} fill="rgba(16,185,129,0.08)" stroke={plot.stroke} strokeWidth={2.4} />
                            ))}
                          </g>
                          <g>
                            {props.subdivisionSvgPreview.plots.map((plot) => (
                              <text key={`plot_label_${plot.idx}`} x={plot.labelX} y={plot.labelY} textAnchor="middle" className="subdivision-svg-label">
                                <tspan x={plot.labelX} dy="0">
                                  {plot.lotNo}
                                </tspan>
                                <tspan x={plot.labelX} dy="12">
                                  {plot.areaHa.toFixed(3)} ha
                                </tspan>
                              </text>
                            ))}
                          </g>
                        </svg>
                      )}
                    </div>
                  )}

                  {props.subdivisionMethod === "by_fraction" && props.subdivisionFractionBreaksEffective.length > 0 && (
                    <div className="subdivision-break-overlay">
                      {props.subdivisionFractionBreaksEffective.map((value, idx) => {
                        const isActive = props.subdivisionDraggingBreakIndex === idx;
                        return (
                          <div
                            key={`subdiv_guide_${idx}`}
                            className={`subdivision-break-guide-dom${isActive ? " active" : ""}`}
                            style={{ left: `${Math.max(2, Math.min(98, value * 100))}%` }}
                          >
                            <div
                              className="subdivision-break-hitline-dom"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                props.startSubdivisionBreakDrag(idx, event.clientX);
                              }}
                            />
                            <div className="subdivision-break-line-dom" />
                            <button
                              type="button"
                              className="subdivision-break-handle-dom"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                props.startSubdivisionBreakDrag(idx, event.clientX);
                              }}
                            />
                            <span className="subdivision-break-value-dom">{(value * 100).toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {props.subdivisionPreview && (
                <div className="subdivision-legend">
                  <span>
                    Resolved lots: <strong>{props.subdivisionPreview.resolved_count}</strong>
                  </span>
                  <span>
                    Target area: <strong>{props.subdivisionTargetDisplayM2 > 0 ? `${props.subdivisionTargetDisplayM2.toFixed(2)} sqm` : "n/a"}</strong>
                  </span>
                  <span>
                    Orientation: <strong>{props.subdivisionOrientationDisplayDeg.toFixed(1)} deg</strong>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(SurveyPlanSubdivisionPreviewStep);
