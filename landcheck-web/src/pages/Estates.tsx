import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { clearEstateAuthSession, getEstateAuthSession } from "../auth/estateAuth";
import { api, extractApiErrorMessage } from "../api/client";
import { money } from "../components/estates/FinancialComponents";
import CoordinateInput from "../components/CoordinateInput";
import { loadMapboxGl, loadMapboxGlCss, MAPBOX_TOKEN } from "../utils/mapboxLoader";
import { toWGS84 } from "../utils/coordinateConverter";
import "../styles/estates.css";

type Estate = { id: number; name: string; status: string; organization_id: number; location?: string | null; crs?: string; project_reference?: string | null; project_owner?: string | null; financial?: { confirmed_collections:string; outstanding_balance:string } };
type EstateCoordinatePoint = { station: string; lng: number; lat: number; height?: number; is_boundary?: boolean };

function parseCoordinateRows(value: string): number[][] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,]+/).map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([x, y]) => [x, y]);
}

export default function Estates() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [newEstateName, setNewEstateName] = useState("");
  const [newEstateLocation, setNewEstateLocation] = useState("");
  const [newEstateCrs, setNewEstateCrs] = useState("EPSG:4326");
  const [newEstateDatum, setNewEstateDatum] = useState("");
  const [newEstateProjectReference, setNewEstateProjectReference] = useState("");
  const [newEstateProjectOwner, setNewEstateProjectOwner] = useState("");
  const [newEstateOwnershipDetails, setNewEstateOwnershipDetails] = useState("");
  const [newEstateBoundaryCoordinates, setNewEstateBoundaryCoordinates] = useState("");
  const [newEstateOrg, setNewEstateOrg] = useState("");
  const [plotNumber, setPlotNumber] = useState("");
  const [plotCoordinates, setPlotCoordinates] = useState("");
  const [plotInputPoints, setPlotInputPoints] = useState<EstateCoordinatePoint[]>([]);
  const [plotInputCoordinateSystem, setPlotInputCoordinateSystem] = useState("wgs84");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [paymentPlan, setPaymentPlan] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [inspectionOutcome, setInspectionOutcome] = useState("observed");
  const [hazards, setHazards] = useState<any>(null);
  const [hazardDashboard, setHazardDashboard] = useState<any>(null);
  const [layerType, setLayerType] = useState("road");
  const [layerName, setLayerName] = useState("");
  const [layerCoordinates, setLayerCoordinates] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [layerEditCoordinates, setLayerEditCoordinates] = useState("");
  const [blocks, setBlocks] = useState<any[]>([]);
  const [blockLabel, setBlockLabel] = useState("");
  const [blockName, setBlockName] = useState("");
  const [inspections, setInspections] = useState<any[]>([]);
  const [importSessionId, setImportSessionId] = useState("");
  const [importReviews, setImportReviews] = useState<any[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);
  const [dxfFile, setDxfFile] = useState<File | null>(null);
  const [scannedLayoutFile, setScannedLayoutFile] = useState<File | null>(null);
  const [importSourceCrs, setImportSourceCrs] = useState("EPSG:4326");
  const [reviewCandidateText, setReviewCandidateText] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("Loading estates...");
  const [allocations, setAllocations] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const [allocationId, setAllocationId] = useState("");
  const [financial, setFinancial] = useState<any>(null);
  const [surveyRequests, setSurveyRequests] = useState<any[]>([]);
  const [stakingTasks, setStakingTasks] = useState<any[]>([]);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [stakingEvidence, setStakingEvidence] = useState<File | null>(null);
  const [plotGeojson, setPlotGeojson] = useState<any>({ type: "FeatureCollection", features: [] });
  const [layerGeojson, setLayerGeojson] = useState<any>({ type: "FeatureCollection", features: [] });
  const [statusFilter, setStatusFilter] = useState("all");
  const [plotSearch, setPlotSearch] = useState("");
  const [quality, setQuality] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [estateDetail, setEstateDetail] = useState<any>(null);
  const [surveyRuleEnabled, setSurveyRuleEnabled] = useState(false);
  const [surveyRulePercentage, setSurveyRulePercentage] = useState("0");
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const visiblePlotGeojson = useMemo(() => {
    const query = plotSearch.trim().toLowerCase();
    return {
      ...plotGeojson,
      features: (plotGeojson.features || []).filter((feature: any) => {
        const properties = feature.properties || {};
        const plotNumber = String(properties.plot_number || properties.number || "").toLowerCase();
        return (statusFilter === "all" || properties.commercial_status === statusFilter) && (!query || plotNumber.includes(query));
      }),
    };
  }, [plotGeojson, plotSearch, statusFilter]);
  const plotInputMapPoints = useMemo(() => plotInputPoints.map((point) => {
    const [lng, lat] = toWGS84(Number(point.lng), Number(point.lat), plotInputCoordinateSystem);
    return { ...point, lng, lat };
  }).filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat)), [plotInputPoints, plotInputCoordinateSystem]);
  useEffect(() => {
    api.get("/estates/foundation/access").then((response) => { const rows=response.data.organizations || []; setOrganizations(rows); if (rows.length === 1) setNewEstateOrg(String(rows[0].id)); }).catch(() => setOrganizations([]));
    api.get("/estates")
      .then((response) => response.data)
      .then(async (rows) => {
        const enriched = await Promise.all(rows.map(async (estate: Estate) => {
          try { return { ...estate, financial: (await api.get(`/estates/${estate.id}/financial-summary`)).data }; }
          catch { return estate; }
        }));
        setEstates(enriched); setMessage(rows.length ? "" : "No estates available yet. An authorized organization owner can create the first estate through the Phase 1 API.");
      })
      .catch(async (error) => setMessage(await extractApiErrorMessage(error, "Estates are not available for this account.")));
  }, []);
  const createEstate = async () => {
    if (!newEstateOrg || !newEstateName.trim()) { setMessage("Choose an organization and enter an Estate name."); return; }
    const boundaryRows = parseCoordinateRows(newEstateBoundaryCoordinates);
    if (newEstateBoundaryCoordinates.trim() && boundaryRows.length < 3) { setMessage("The Estate boundary needs at least three valid longitude, latitude rows."); return; }
    const boundary = boundaryRows.length >= 3 ? { type: "Polygon", coordinates: [[...boundaryRows, boundaryRows[0]]] } : null;
    try { const response=await api.post(`/estates/organizations/${newEstateOrg}`, { name:newEstateName.trim(), location_text:newEstateLocation.trim() || null, crs:newEstateCrs.trim() || "EPSG:4326", datum:newEstateDatum.trim() || null, project_reference:newEstateProjectReference.trim() || null, project_owner:newEstateProjectOwner.trim() || null, ownership_details:newEstateOwnershipDetails.trim() || null, boundary }); window.location.assign(`/estates/${response.data.id}/map`); }
    catch (error) { setMessage(await extractApiErrorMessage(error, "Estate could not be created.")); }
  };
  const approveEstateMap = async () => {
    if (!estateId) return;
    try { const response = await api.post(`/estates/${estateId}/approve-map`); setDashboard((current: any) => current ? { ...current, estate: { ...current.estate, status: response.data.status } } : current); setWorkflowMessage("Estate map approved and published as the operational plot register."); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Resolve the geometry issues before publishing the Estate map.")); }
  };
  const saveSurveyRule = async () => {
    if (!estateDetail) return;
    try { const response = await api.put(`/estates/organizations/${estateDetail.organization_id}/survey-eligibility`, { is_enabled: surveyRuleEnabled, percentage: Number(surveyRulePercentage || 0), description: "Minimum confirmed payment percentage before Survey preparation" }); setSurveyRuleEnabled(response.data.is_enabled); setSurveyRulePercentage(response.data.percentage); setWorkflowMessage("Survey eligibility rule saved for this organization."); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Survey eligibility could not be saved.")); }
  };
  const createPlot = async () => {
    if (!estateId || !plotNumber.trim()) { setMessage("Enter a plot number and at least three coordinate rows."); return; }
    const ring = plotCoordinates.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,]+/).map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([lng, lat]) => [lng, lat]);
    if (ring.length < 3) { setMessage("Use one longitude,latitude coordinate per line (at least three rows)."); return; }
    try { await api.post(`/estates/${estateId}/plots`, { plot_number: plotNumber.trim(), geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] }, geometry_status: "approved" }); window.location.reload(); }
    catch (error) { setMessage(await extractApiErrorMessage(error, "Plot could not be created.")); }
  };
  const updatePlotInputPoint = (index: number, field: string, value: string | number | boolean) => {
    setPlotInputPoints((current) => current.map((point, pointIndex) => pointIndex === index ? { ...point, [field]: value } : point));
  };
  const addPlotInputPoint = () => {
    setPlotInputPoints((current) => [...current, { station: `P${current.length + 1}`, lng: 0, lat: 0, is_boundary: true }]);
  };
  const removePlotInputPoint = (index: number) => {
    setPlotInputPoints((current) => current.filter((_, pointIndex) => pointIndex !== index));
  };
  const importPlotInputPoints = (points: EstateCoordinatePoint[]) => {
    setPlotInputPoints(points.map((point, index) => ({ ...point, station: point.station || `P${index + 1}`, is_boundary: true })));
  };
  const createPlotFromInput = async () => {
    if (!estateId || !plotNumber.trim()) { setWorkflowMessage("Enter a plot number first."); return; }
    if (plotInputPoints.length < 3) { setWorkflowMessage("Add at least three boundary points or import a coordinate file."); return; }
    const ring = plotInputMapPoints.map((point) => [point.lng, point.lat]);
    if (ring.length < 3 || ring.some((point) => point.some((value) => !Number.isFinite(value)))) { setWorkflowMessage("Check the coordinate values before creating this plot."); return; }
    try { await api.post(`/estates/${estateId}/plots`, { plot_number: plotNumber.trim(), geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] }, geometry_status: "approved" }); window.location.reload(); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Plot could not be created.")); }
  };
  const createCustomer = async () => {
    const estate = estates.find((item) => item.id === Number(estateId));
    if (!estate || !customerName.trim()) { setMessage("Enter the customer name."); return; }
    try { const response = await api.post(`/estates/organizations/${estate.organization_id}/customers`, { full_name: customerName.trim(), phone: customerPhone.trim() || null }); setSelectedCustomerId(String(response.data.id)); setCustomerName(""); setCustomerPhone(""); window.location.reload(); }
    catch (error) { setMessage(await extractApiErrorMessage(error, "Customer could not be created.")); }
  };
  const assignCustomer = async (allocate: boolean) => {
    if (!estateId || !selectedPlot || !selectedCustomerId) { setMessage("Choose a parcel and customer first."); return; }
    try { await api.post(`/estates/${estateId}/plots/${selectedPlot.id}/${allocate ? "allocate" : "reserve"}`, { customer_id: Number(selectedCustomerId), agreed_price: agreedPrice ? Number(agreedPrice) : null, payment_plan: paymentPlan.trim() || null }); window.location.reload(); }
    catch (error) { setMessage(await extractApiErrorMessage(error, "Parcel action could not be completed.")); }
  };
  const recordInspection = async () => {
    if (!selectedPlot) return;
    try { await api.post(`/estates/plots/${selectedPlot.id}/inspections`, { inspection_type: "site_visit", outcome: inspectionOutcome, notes: inspectionNotes || null }); setInspectionNotes(""); setWorkflowMessage("Field inspection recorded."); setInspections((await api.get(`/estates/plots/${selectedPlot.id}/inspections`)).data); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Inspection could not be recorded.")); }
  };
  useEffect(() => { const plot = plots.find((item) => item.id === selectedPlotId); if (!plot) { setInspections([]); return; } api.get(`/estates/plots/${plot.id}/inspections`).then((response) => setInspections(response.data || [])).catch(() => setInspections([])); }, [plots, selectedPlotId]);
  const loadHazards = async () => {
    if (!selectedPlot) return;
    try { const response = await api.post(`/estates/plots/${selectedPlot.id}/hazards/assess`); setHazards(response.data); if (estateId) setHazardDashboard((await api.get(`/estates/${estateId}/hazards`)).data); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Hazard screening could not be loaded.")); }
  };
  const createLayer = async () => {
    if (!estateId) return;
    const coordinates=layerCoordinates.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,]+/).map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([lng,lat]) => [lng,lat]);
    if (coordinates.length < 2) { setWorkflowMessage("Enter at least two longitude, latitude rows for the layer."); return; }
    const polygon=layerType === "open_space";
    const geometry=polygon ? {type:"Polygon",coordinates:[[...coordinates,coordinates[0]]]} : {type:"LineString",coordinates};
    try { await api.post(`/estates/${estateId}/layers`, {feature_type:layerType,name:layerName || null,geometry}); window.location.reload(); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error,"Layer could not be saved.")); }
  };
  const createBlock = async () => {
    if (!estateId || !blockLabel.trim()) { setWorkflowMessage("Enter a block label first."); return; }
    try { const response = await api.post(`/estates/${estateId}/blocks`, { label: blockLabel.trim(), name: blockName.trim() || null }); setBlocks((current) => [...current, response.data]); setBlockLabel(""); setBlockName(""); setWorkflowMessage("Block added to the estate register."); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Block could not be saved.")); }
  };
  const refreshImportReviews = async () => {
    if (!estateId) return;
    setImportReviews((await api.get(`/estates/${estateId}/import-reviews`)).data || []);
  };
  const uploadLayout = async (kind: "csv" | "geojson" | "dxf" | "scanned-layout") => {
    if (!estateId) return;
    const selected = kind === "csv" ? csvFile : kind === "geojson" ? geojsonFile : kind === "dxf" ? dxfFile : scannedLayoutFile;
    if (!selected) { setWorkflowMessage("Choose a file before uploading."); return; }
    const form = new FormData(); form.append("file", selected);
    if (kind === "scanned-layout" && importSessionId.trim()) form.append("survey_georeference_session_id", importSessionId.trim());
    try {
      const params = kind === "dxf" || kind === "csv" ? { source_crs: importSourceCrs || "EPSG:4326" } : undefined;
      await api.post(`/estates/${estateId}/import-reviews/${kind}`, form, { params });
      await refreshImportReviews();
      setWorkflowMessage(`${kind.toUpperCase()} intake added to the geometry approval queue.`);
    } catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Layout import could not be uploaded.")); }
  };
  const decideImportReview = async (reviewId: number, status: "approved" | "rejected", candidateText?: string) => {
    try {
      const candidate_data = candidateText?.trim() ? JSON.parse(candidateText) : undefined;
      await api.post(`/estates/import-reviews/${reviewId}/decision`, { status, candidate_data });
      await refreshImportReviews(); setWorkflowMessage(`Import review ${status}.`);
    }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Import decision could not be saved.")); }
  };
  const selectLayerForEdit = (id: string) => {
    setSelectedLayerId(id);
    const feature = (layerGeojson.features || []).find((item: any) => String(item.id) === id);
    const coordinates = feature?.geometry?.coordinates || [];
    const rows = feature?.geometry?.type === "Polygon" ? coordinates[0] : coordinates;
    setLayerEditCoordinates((rows || []).map((point: number[]) => point.join(", ")).join("\n"));
  };
  const updateLayer = async () => {
    if (!estateId || !selectedLayerId) return;
    const feature = (layerGeojson.features || []).find((item: any) => String(item.id) === selectedLayerId);
    const points = layerEditCoordinates.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,]+/).map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([lng, lat]) => [lng, lat]);
    if (!feature || points.length < 2) { setWorkflowMessage("Enter at least two valid coordinate rows."); return; }
    const isPolygon = feature.geometry.type === "Polygon";
    const ring = isPolygon && points[0].join() !== points[points.length - 1].join() ? [...points, points[0]] : points;
    try { await api.patch(`/estates/${estateId}/layers/${selectedLayerId}`, { geometry: isPolygon ? { type: "Polygon", coordinates: [ring] } : { type: "LineString", coordinates: points } }); setLayerGeojson((current: any) => ({ ...current, features: current.features.map((item: any) => item.id === Number(selectedLayerId) ? { ...item, geometry: isPolygon ? { type: "Polygon", coordinates: [ring] } : { type: "LineString", coordinates: points } } : item) })); setWorkflowMessage("Layer geometry updated."); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Layer could not be updated.")); }
  };
  const archiveLayer = async () => {
    if (!estateId || !selectedLayerId) return;
    try { await api.delete(`/estates/${estateId}/layers/${selectedLayerId}`); setLayerGeojson((current: any) => ({ ...current, features: current.features.filter((item: any) => item.id !== Number(selectedLayerId)) })); setSelectedLayerId(""); setLayerEditCoordinates(""); setWorkflowMessage("Layer archived."); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Layer could not be archived.")); }
  };
  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then(async (response) => { setEstateDetail(response.data); try { const rule = (await api.get(`/estates/organizations/${response.data.organization_id}/survey-eligibility`)).data; setSurveyRuleEnabled(Boolean(rule.is_enabled)); setSurveyRulePercentage(String(rule.percentage || "0")); } catch { setSurveyRuleEnabled(false); setSurveyRulePercentage("0"); } }).catch(() => setEstateDetail(null));
    api.get("/estates/selectors", { params: { estate_id: estateId } })
      .then((response) => { setAllocations(response.data.allocations || []); setPlots(response.data.plots || []); setCustomers(response.data.customers || []); })
      .catch(() => { setAllocations([]); setPlots([]); setCustomers([]); });
    Promise.all([
      api.get("/estates/survey-requests"),
      api.get("/estates/staking-tasks"),
    ]).then(([surveys, staking]) => {
      setSurveyRequests((surveys.data || []).filter((item: any) => item.estate.id === Number(estateId)));
      setStakingTasks((staking.data || []).filter((item: any) => item.estate_id === Number(estateId)));
    }).catch(() => {
      setSurveyRequests([]);
      setStakingTasks([]);
    });
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => setPlotGeojson(response.data)).catch(() => setPlotGeojson({ type: "FeatureCollection", features: [] }));
    api.get(`/estates/${estateId}/layers.geojson`).then((response) => setLayerGeojson(response.data)).catch(() => setLayerGeojson({ type: "FeatureCollection", features: [] }));
    api.get(`/estates/${estateId}/import-reviews`).then((response) => setImportReviews(response.data || [])).catch(() => setImportReviews([]));
    api.get(`/estates/${estateId}/hazards`).then((response) => setHazardDashboard(response.data)).catch(() => setHazardDashboard(null));
    api.get(`/estates/${estateId}/blocks`).then((response) => setBlocks(response.data || [])).catch(() => setBlocks([]));
    Promise.all([api.get(`/estates/${estateId}/quality-check`), api.get(`/estates/${estateId}/activity`), api.get(`/estates/${estateId}/dashboard`)]).then(([qc, events, metrics]) => { setQuality(qc.data); setActivity(events.data || []); setDashboard(metrics.data); }).catch(() => { setQuality(null); setActivity([]); setDashboard(null); });
  }, [estateId]);
  useEffect(() => {
    if (!estateId || !mapContainer.current || !MAPBOX_TOKEN) return;
    let cancelled = false;
    void Promise.all([loadMapboxGl(), loadMapboxGlCss()]).then(([mapboxgl]) => {
      if (cancelled || !mapContainer.current) return;
      mapRef.current?.remove();
      const map = new mapboxgl.Map({ container: mapContainer.current, style: "mapbox://styles/mapbox/light-v11", center: [7.4, 9.1], zoom: 12 });
      mapRef.current = map;
      map.on("load", () => {
        if (estateDetail?.boundary) {
          const boundaryFeature = { type: "Feature", properties: {}, geometry: estateDetail.boundary };
          map.addSource("estate-boundary", { type: "geojson", data: boundaryFeature as any });
          map.addLayer({ id: "estate-boundary-fill", type: "fill", source: "estate-boundary", paint: { "fill-color": "#8bb59a", "fill-opacity": 0.08 } });
          map.addLayer({ id: "estate-boundary-outline", type: "line", source: "estate-boundary", paint: { "line-color": "#087f76", "line-width": 2, "line-dasharray": [2, 2] } });
        }
        map.addSource("estate-plots", { type: "geojson", data: visiblePlotGeojson });
        map.addLayer({ id: "estate-plots-fill", type: "fill", source: "estate-plots", paint: { "fill-color": ["match", ["get", "commercial_status"], "available", "#5b9b65", "reserved", "#dcaa43", "allocated", "#ba5e52", "on_hold", "#6d7690", "#87928b"], "fill-opacity": 0.58 } });
        map.addLayer({ id: "estate-plots-outline", type: "line", source: "estate-plots", paint: { "line-color": "#173d30", "line-width": 1.5 } });
        map.addSource("estate-layers", { type: "geojson", data: layerGeojson });
        map.addLayer({ id: "estate-layers-line", type: "line", source: "estate-layers", filter: ["!=", ["geometry-type"], "Polygon"], paint: { "line-color": ["match", ["get", "type"], "road", "#313131", "drainage", "#287cb4", "#b77c2d"], "line-width": 3 } });
        map.addLayer({ id: "estate-layers-fill", type: "fill", source: "estate-layers", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["match", ["get", "type"], "open_space", "#78a85d", "infrastructure", "#b77c2d", "#287cb4"], "fill-opacity": 0.35 } });
        const bounds = new mapboxgl.LngLatBounds();
        const extendGeometry = (geometry: any) => {
          if (!geometry) return;
          const coordinates = geometry.coordinates;
          if (geometry.type === "Point") bounds.extend(coordinates);
          else if (geometry.type === "LineString") coordinates.forEach((coord: number[]) => bounds.extend(coord));
          else coordinates.forEach((part: any) => extendGeometry({ type: geometry.type === "Polygon" ? "LineString" : geometry.type === "MultiPolygon" ? "Polygon" : "LineString", coordinates: geometry.type === "Polygon" ? part : part }));
        };
        if (estateDetail?.boundary) extendGeometry(estateDetail.boundary);
        visiblePlotGeojson.features.forEach((feature: any) => extendGeometry(feature.geometry));
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 46, maxZoom: 17 });
        map.on("click", "estate-plots-fill", (event: any) => { const id = Number(event.features?.[0]?.properties?.id); setSelectedPlotId(id); const allocation = allocations.find((item) => item.plot_id === id); if (allocation) void selectAllocation(String(allocation.id)); else { setAllocationId(""); setFinancial(null); } });
        map.on("mouseenter", "estate-plots-fill", () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", "estate-plots-fill", () => { map.getCanvas().style.cursor = ""; });
      });
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [estateId, estateDetail, visiblePlotGeojson, layerGeojson, allocations]);
  useEffect(() => {
    const anchors: Array<[string, string]> = [
      [".estate-map-panel", "plot-register"],
      [".estate-workflow-panel", "estate-workflow"],
      [".estate-qc.estate-hazard-dashboard", "hazard-dashboard"],
      [".estate-settings", "estate-settings"],
      [".estate-timeline", "estate-timeline"],
    ];
    anchors.forEach(([selector, id]) => document.querySelector(`.estate-app ${selector}`)?.setAttribute("id", id));
  }, [estateId, selectedPlotId, financial, hazardDashboard, activity]);
  const selectAllocation = async (id: string) => {
    setAllocationId(id); setFinancial(null);
    if (!id) return;
    const allocation = allocations.find((item) => String(item.id) === id); if (allocation) setSelectedPlotId(allocation.plot_id);
    try { setFinancial((await api.get(`/estates/allocations/${id}/financial-detail`)).data); }
    catch (error) { setMessage(await extractApiErrorMessage(error, "Allocation financial detail could not be loaded.")); }
  };
  const refreshWorkflow = async () => {
    if (!estateId) return;
    const [surveys, staking] = await Promise.all([api.get("/estates/survey-requests"), api.get("/estates/staking-tasks")]);
    setSurveyRequests((surveys.data || []).filter((item: any) => item.estate.id === Number(estateId)));
    setStakingTasks((staking.data || []).filter((item: any) => item.estate_id === Number(estateId)));
  };
  const runWorkflow = async (label: string, action: () => Promise<unknown>) => {
    setWorkflowMessage("");
    try { await action(); await refreshWorkflow(); setWorkflowMessage(`${label} completed.`); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, `${label} could not be completed.`)); }
  };
  const downloadDgps = async (taskId: number) => {
    try {
      const response = await api.get(`/estates/staking-tasks/${taskId}/exports/dgps.csv`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `staking-task-${taskId}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "DGPS CSV could not be downloaded.")); }
  };
  const uploadStakingEvidence = async (taskId: number) => {
    if (!stakingEvidence) { setWorkflowMessage("Choose a staking photo or field record first."); return; }
    const form = new FormData(); form.append("file", stakingEvidence);
    try {
      await api.post("/estates/documents", form, { params: { entity_type: "staking_task", entity_id: taskId, document_type: "staking_record", description: "DGPS staking field evidence" } });
      setStakingEvidence(null); setWorkflowMessage("Staking evidence stored in the private Document Vault.");
    } catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Staking evidence could not be uploaded.")); }
  };
  const selectedAllocation = allocations.find((allocation) => String(allocation.id) === allocationId);
  const selectedPlot = plots.find((plot) => plot.id === (selectedPlotId || selectedAllocation?.plot_id));
  const selectedSurvey = selectedAllocation && surveyRequests.find((item) => item.plot.id === selectedAllocation.plot_id);
  const selectedTask = selectedSurvey && stakingTasks.find((item) => item.survey_request_id === selectedSurvey.id);
  const estateSession = getEstateAuthSession();
  return <main className="estates-shell">
    <aside className="estate-sidebar">
      <div className="estate-brand"><span className="estate-brand-mark">L</span><div><strong>LandCheck</strong><small>Estates</small></div></div>
      <div className="estate-sidebar-estate"><small>ACTIVE ESTATE</small><strong>{estateDetail?.name || estates[0]?.name || "Estate workspace"}</strong><span>{estateDetail?.location_text || estates[0]?.location || "Choose an estate to begin"}</span></div>
      <nav aria-label="Estate navigation">
        <Link className={!estateId ? "active" : ""} to="/estates/workspace"><span>⌂</span>Dashboard</Link>
        <Link className={estateId ? "active" : ""} to={estateId ? `/estates/${estateId}/map` : "/estates/workspace"}><span>▦</span>Map &amp; Plots</Link>
        <Link to={estateId ? `/estates/${estateId}/map#plot-register` : "/estates/workspace#plot-register"}><span>▤</span>Plots</Link>
        <Link to="/estates/payments"><span>♙</span>Customers</Link>
        <Link to="/estates/payments"><span>₦</span>Sales &amp; Payments</Link>
        <a href={estateId ? "#estate-workflow" : "/estates/workspace"}><span>⌖</span>Survey</a>
        <a href={estateId ? "#estate-workflow" : "/estates/workspace"}><span>⌁</span>Staking</a>
        <Link to="/estates/documents"><span>□</span>Documents</Link>
        <a href={estateId ? "#estate-workflow" : "/estates/workspace"}><span>⌂</span>Development</a>
        <a href={estateId ? "#hazard-dashboard" : "/estates/workspace"}><span>△</span>Hazard Analysis</a>
        <a href={estateId ? "#estate-timeline" : "/estates/workspace"}><span>◷</span>Audit Timeline</a>
        <a href={estateId ? "#estate-settings" : "/estates/workspace"}><span>⚙</span>Settings</a>
      </nav>
      <div className="estate-sidebar-footer"><span>?</span>Help &amp; Support</div>
    </aside>
    <div className="estate-app">
      <div className="estate-topbar"><div className="estate-breadcrumb"><span>Estates</span><b>›</b><strong>{estateDetail?.name || "Workspace"}</strong></div><label className="estate-search"><span aria-hidden="true">⌕</span><input value={plotSearch} onChange={(event) => setPlotSearch(event.target.value)} placeholder="Search plots by number..." aria-label="Search plots by number" /></label><div className="estate-user"><span className="estate-avatar">{(estateSession?.user.organization_name || "E").slice(0, 1).toUpperCase()}</span><div><strong>{estateSession?.user.organization_name || "Estate team"}</strong><small>Estate workspace</small></div></div></div>
    <header><span>LandCheck Estates</span><h1>{estateDetail?.name || "Estate workspace"}</h1><p>Map-first parcel operations for layouts, plots, customers and delivery.</p></header>
    {!estateId && estates.length > 0 && <section className="estate-existing-chooser"><div><p className="workflow-eyebrow">Your estates</p><h2>Open an existing estate</h2><p>Choose an Estate to open its map and plot register.</p></div><label>Choose an estate<select defaultValue="" onChange={(event) => { if (event.target.value) navigate(`/estates/${event.target.value}/map`); }}><option value="">Select an estate</option>{estates.map((estate) => <option key={estate.id} value={estate.id}>{estate.name}{estate.location ? ` - ${estate.location}` : ""}</option>)}</select></label></section>}
    {!estateId && organizations.length > 0 && <section className="estate-create estate-setup-simple"><div><p className="workflow-eyebrow">Start here</p><h2>Create an estate</h2><p>Add the basics now. You can bring in the layout and plots after the Estate is created.</p></div><label>Your organisation<select value={newEstateOrg} onChange={(event) => setNewEstateOrg(event.target.value)}><option value="">Choose organisation</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><label>Estate name<input value={newEstateName} onChange={(event) => setNewEstateName(event.target.value)} placeholder="e.g. Greenview Estate" /></label><label>Location<input value={newEstateLocation} onChange={(event) => setNewEstateLocation(event.target.value)} placeholder="City, state or area" /></label><label className="estate-boundary-field">Estate boundary <span>Optional - one longitude, latitude pair per line</span><textarea value={newEstateBoundaryCoordinates} onChange={(event) => setNewEstateBoundaryCoordinates(event.target.value)} placeholder="7.1234, 9.1234&#10;7.1238, 9.1234&#10;7.1238, 9.1238" /></label><details><summary>Project details (optional)</summary><div><label>Coordinate system<input value={newEstateCrs} onChange={(event) => setNewEstateCrs(event.target.value)} placeholder="EPSG:4326" /></label><label>Datum<input value={newEstateDatum} onChange={(event) => setNewEstateDatum(event.target.value)} placeholder="Datum" /></label><label>Project reference<input value={newEstateProjectReference} onChange={(event) => setNewEstateProjectReference(event.target.value)} placeholder="Reference" /></label><label>Developer or owner<input value={newEstateProjectOwner} onChange={(event) => setNewEstateProjectOwner(event.target.value)} placeholder="Name" /></label><label>Notes<textarea value={newEstateOwnershipDetails} onChange={(event) => setNewEstateOwnershipDetails(event.target.value)} placeholder="Ownership or project notes" /></label></div></details><button type="button" onClick={() => void createEstate()}>Create estate</button></section>}
    {estateId && <section className="estate-plot-input-panel"><div><p className="workflow-eyebrow">Add one plot</p><h2>Create a plot from coordinates</h2><p>Import a CSV or Excel file or enter points manually. Review the boundary on the Estate map before adding it to the plot register.</p></div><label>Plot number<input value={plotNumber} onChange={(event) => setPlotNumber(event.target.value)} placeholder="e.g. B-024" /></label><CoordinateInput title="Add plot boundary" subtitle="Choose a spreadsheet or enter the points manually." sidebar={<div className="estate-coordinate-context"><strong>Plot boundary</strong><span>Use the same coordinate workflow as Survey.</span></div>} points={plotInputPoints} onUpdatePoint={updatePlotInputPoint} onRemovePoint={removePlotInputPoint} onAddPoint={addPlotInputPoint} onBulkUpload={importPlotInputPoints} disabled={false} coordinateSystem={plotInputCoordinateSystem} onCoordinateSystemChange={setPlotInputCoordinateSystem} onClearAllPoints={() => setPlotInputPoints([])} /><button type="button" className="estate-plot-create-button" disabled={plotInputMapPoints.length < 3} onClick={() => void createPlotFromInput()}>Create plot</button></section>}
    <section className="estates-toolbar"><strong>{estateSession?.user.organization_name || "My estates"}</strong><div><Link to="/estates/workspace">Estate workspace</Link><button type="button" onClick={() => { clearEstateAuthSession(); navigate("/estates", { replace: true }); }}>Sign out</button></div></section>
    {!estateId && organizations.length > 0 && <section className="estate-create estate-setup"><div><p className="workflow-eyebrow">Step 1 · Create Estate</p><h2>Start the estate register</h2><p>Set the project context first. You can add the boundary and approved parcels through the layout review workflow.</p></div><select value={newEstateOrg} onChange={(event) => setNewEstateOrg(event.target.value)}><option value="">Organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><input value={newEstateName} onChange={(event) => setNewEstateName(event.target.value)} placeholder="Estate name" /><input value={newEstateLocation} onChange={(event) => setNewEstateLocation(event.target.value)} placeholder="Location" /><input value={newEstateCrs} onChange={(event) => setNewEstateCrs(event.target.value)} placeholder="Coordinate system, e.g. EPSG:4326" /><input value={newEstateDatum} onChange={(event) => setNewEstateDatum(event.target.value)} placeholder="Datum (optional)" /><input value={newEstateProjectReference} onChange={(event) => setNewEstateProjectReference(event.target.value)} placeholder="Project reference (optional)" /><input value={newEstateProjectOwner} onChange={(event) => setNewEstateProjectOwner(event.target.value)} placeholder="Developer / owner (optional)" /><textarea value={newEstateOwnershipDetails} onChange={(event) => setNewEstateOwnershipDetails(event.target.value)} placeholder="Ownership or project details (optional)" /><textarea value={newEstateBoundaryCoordinates} onChange={(event) => setNewEstateBoundaryCoordinates(event.target.value)} placeholder="Estate boundary: longitude, latitude per line (optional)" /><button type="button" onClick={() => void createEstate()}>Create Estate</button></section>}
    {estateId && <section className="estate-import-panel"><div><p className="workflow-eyebrow">Step 2 · Bring in layout data</p><h2>Import and verify the Estate layout</h2><p>Upload an existing digital layout, or georeference and digitize a scanned plan in Survey. Geometry stays in review until an authorized surveyor or manager approves it.</p></div><Link to="/survey-plan?mode=georeference">Georeference scanned layout</Link><Link to="/survey-plan?mode=survey">Import survey coordinates</Link></section>}
    {estateId && <section className="estate-import-panel"><div><p className="workflow-eyebrow">Digital layout intake</p><h2>CSV, GIS, CAD or scanned layout</h2><p>Digital parcel geometry is checked before approval. A scanned source is private reference material; its digitized geometry must be reviewed before it becomes the Estate register.</p></div><label>Source CRS<input value={importSourceCrs} onChange={(event) => setImportSourceCrs(event.target.value)} placeholder="EPSG:4326" /></label><label>Survey session (optional)<input value={importSessionId} onChange={(event) => setImportSessionId(event.target.value)} placeholder="Georeference session ID" /></label><label>CSV<input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} /></label><button type="button" onClick={() => void uploadLayout("csv")}>Upload CSV</button><label>GIS GeoJSON<input type="file" accept=".json,.geojson,application/geo+json" onChange={(event) => setGeojsonFile(event.target.files?.[0] || null)} /></label><button type="button" onClick={() => void uploadLayout("geojson")}>Upload GIS</button><label>CAD DXF<input type="file" accept=".dxf,application/dxf" onChange={(event) => setDxfFile(event.target.files?.[0] || null)} /></label><button type="button" onClick={() => void uploadLayout("dxf")}>Upload CAD</button><label>Scanned PDF/image<input type="file" accept=".pdf,image/jpeg,image/png" onChange={(event) => setScannedLayoutFile(event.target.files?.[0] || null)} /></label><button type="button" onClick={() => void uploadLayout("scanned-layout")}>Upload scan</button></section>}
    {estateId && <section className="estate-map-panel"><div><p className="workflow-eyebrow">Step 4 · Manage plot inventory</p><h2>Estate parcel map</h2><p>Every approved plot is visible here: green available, amber reserved, red allocated/sold, slate on hold.</p></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All plot statuses</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="allocated">Allocated / sold</option><option value="on_hold">On hold</option></select>{MAPBOX_TOKEN ? <div ref={mapContainer} className="estate-map" /> : <div className="estate-map-fallback">Set <code>VITE_MAPBOX_TOKEN</code> to render the interactive map. {visiblePlotGeojson.features.length} plot geometries are available.</div>}</section>}
    {estateId && dashboard && <section className="estate-metrics"><strong>{dashboard.total_plots} total plots</strong><span>{dashboard.statuses.available || 0} available</span><span>{dashboard.statuses.reserved || 0} reserved</span><span>{dashboard.statuses.allocated || 0} allocated / sold</span><span>{dashboard.statuses.on_hold || 0} on hold</span><span>{dashboard.awaiting_survey} awaiting survey</span><span>{dashboard.survey_completed || 0} Survey completed</span><span>{dashboard.awaiting_staking} awaiting staking</span><span>{dashboard.development.site_cleared || 0} site cleared</span><span>{dashboard.development.foundation || 0} foundation</span><span>{dashboard.development.under_construction || 0} under construction</span><span>{dashboard.development.developed || 0} developed</span><span>Collected {money(dashboard.financial.confirmed_collections)}</span><span>Outstanding {money(dashboard.financial.outstanding_balance)}</span></section>}
    {estateId && estateDetail && <section className="estate-settings"><div><p className="workflow-eyebrow">Operating rule</p><h2>Survey eligibility</h2><p>Prepare Survey when the selected percentage of the agreed price has been confirmed. Set 0% to allow preparation immediately.</p></div><label><span>Minimum confirmed payment</span><input type="number" min="0" max="100" step="1" value={surveyRulePercentage} onChange={(event) => setSurveyRulePercentage(event.target.value)} /></label><label className="estate-checkbox"><input type="checkbox" checked={surveyRuleEnabled} onChange={(event) => setSurveyRuleEnabled(event.target.checked)} /> Enforce this rule</label><button type="button" onClick={() => void saveSurveyRule()}>Save rule</button></section>}
    {estateId && hazardDashboard && <section className="estate-qc estate-hazard-dashboard"><div><p className="workflow-eyebrow">Site intelligence</p><h2>Persisted hazard screening</h2><p>{hazardDashboard.assessment_count || 0} assessment record(s) stored against this Estate.</p></div>{Object.entries(hazardDashboard.summary || {}).map(([type, value]: [string, any]) => <p key={type}><strong>{type.toUpperCase()}</strong> - {value.assessed} result(s): {Object.entries(value.classes || {}).map(([risk, count]) => `${risk} (${count})`).join(", ") || "No classification"}</p>)}{(hazardDashboard.assessments || []).slice(0, 12).map((item: any) => <p key={item.plot_id || "estate"}><strong>{item.plot_id ? `Plot ${item.plot_id}` : "Estate"}</strong> - {Object.entries(item.hazards || {}).map(([type, value]: [string, any]) => `${type}: ${value.risk_class || "unavailable"}`).join("; ")}</p>)}</section>}
    {estateId && quality && <section className="estate-qc"><div><p className="workflow-eyebrow">Step 3 · Approve the Estate map</p><h2>{quality.review_required ? "Review required" : "Geometry ready"}</h2><p>{quality.plot_count} plots checked. {quality.issues.length} issue(s) detected.</p></div>{quality.issues.slice(0,8).map((issue:any,index:number) => <p key={`${issue.code}-${index}`} className={issue.severity}>{issue.message}</p>)}{dashboard && <div className="estate-publish-action"><p><strong>Register status:</strong> {dashboard.estate.status.replaceAll("_", " ")}</p><button type="button" disabled={dashboard.estate.status === "active" || quality.review_required || quality.plot_count === 0} onClick={() => void approveEstateMap()}>{dashboard.estate.status === "active" ? "Estate map published" : "Approve and publish map"}</button></div>}</section>}
    {estateId && <section className="estate-create estate-plot-import"><div><p className="workflow-eyebrow">Add parcel</p><h2>Coordinates or CSV rows</h2><p>Paste one <code>longitude, latitude</code> pair per line. Geometry is checked before saving.</p></div><input value={plotNumber} onChange={(event) => setPlotNumber(event.target.value)} placeholder="Plot number, e.g. B-024" /><textarea value={plotCoordinates} onChange={(event) => setPlotCoordinates(event.target.value)} placeholder="7.1234, 9.1234&#10;7.1238, 9.1234&#10;7.1238, 9.1238" /><button type="button" onClick={() => void createPlot()}>Add approved plot</button></section>}
    {estateId && <section className="estate-create estate-plot-import"><div><p className="workflow-eyebrow">Map layer</p><h2>Road, drainage, open space, infrastructure</h2><p>Paste coordinate rows to add a visible operational layer.</p></div><select value={layerType} onChange={(event) => setLayerType(event.target.value)}><option value="road">Road</option><option value="drainage">Drainage</option><option value="open_space">Open space</option><option value="infrastructure">Infrastructure</option></select><input value={layerName} onChange={(event) => setLayerName(event.target.value)} placeholder="Layer name" /><textarea value={layerCoordinates} onChange={(event) => setLayerCoordinates(event.target.value)} placeholder="longitude, latitude per line" /><button type="button" onClick={() => void createLayer()}>Add layer</button></section>}
    {estateId && selectedPlot && <section className="estate-plot-record"><p className="workflow-eyebrow">Selected plot record</p><h2>{selectedPlot.plot_number}</h2><div><span>{selectedPlot.commercial_status.replaceAll("_", " ")}</span><span>{selectedPlot.development_status?.replaceAll("_", " ") || "not started"}</span><span>{Number(selectedPlot.area_sqm || 0).toLocaleString()} sqm</span></div><p>{selectedAllocation ? `${selectedAllocation.customer_name} · ${selectedAllocation.status}` : "No active customer allocation."}</p>{selectedAllocation && <button type="button" onClick={() => void selectAllocation(String(selectedAllocation.id))}>Open financial record</button>}<button type="button" onClick={() => void loadHazards()}>Screen flood and erosion</button>{hazards && <p>Flood: {hazards.flood?.summary?.floodplain_class || "unavailable"} · Erosion: {hazards.erosion?.risk_class || "unavailable"}</p>}<div className="inspection-form"><p className="optional-work-note">Optional site note. This is a web record; no field app is required.</p><select value={inspectionOutcome} onChange={(event) => setInspectionOutcome(event.target.value)}><option value="observed">Observed</option><option value="passed">Passed</option><option value="attention_required">Attention required</option><option value="failed">Failed</option></select><input value={inspectionNotes} onChange={(event) => setInspectionNotes(event.target.value)} placeholder="Optional site note" /><button type="button" onClick={() => void recordInspection()}>Save site note</button></div>{inspections.slice(0,5).map((inspection) => <p key={inspection.id}><strong>{inspection.outcome.replaceAll("_", " ")}</strong> · {inspection.notes || "No note"}</p>)}</section>}
    {estateId && selectedPlot && !selectedAllocation && <section className="estate-create estate-allocation-action"><div><p className="workflow-eyebrow">Step 5 · Customer and allocation</p><h2>Reserve or allocate {selectedPlot.plot_number}</h2><p>Create a customer or choose an existing customer, then record the commercial terms for this parcel.</p></div><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="New customer full name" /><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone (optional)" /><button type="button" onClick={() => void createCustomer()}>Add customer</button><select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><input type="number" min="0.01" step="0.01" value={agreedPrice} onChange={(event) => setAgreedPrice(event.target.value)} placeholder="Agreed price (NGN)" /><input value={paymentPlan} onChange={(event) => setPaymentPlan(event.target.value)} placeholder="Payment plan (optional)" /><button type="button" onClick={() => void assignCustomer(false)}>Reserve</button><button type="button" onClick={() => void assignCustomer(true)}>Allocate / sell</button></section>}
    {estateId && layerGeojson.features.length > 0 && <section className="estate-create estate-layer-editor"><div><p className="workflow-eyebrow">Spatial layer editor</p><h2>Correct detected infrastructure</h2><p>Select a layer, adjust its coordinate rows, then save. Archiving removes it from the operational map without deleting its audit trail.</p></div><select value={selectedLayerId} onChange={(event) => selectLayerForEdit(event.target.value)}><option value="">Select a layer</option>{layerGeojson.features.map((feature: any) => <option key={feature.id} value={feature.id}>{feature.properties.name || feature.properties.type} #{feature.id}</option>)}</select>{selectedLayerId && <><textarea value={layerEditCoordinates} onChange={(event) => setLayerEditCoordinates(event.target.value)} /><button type="button" onClick={() => void updateLayer()}>Save geometry</button><button type="button" onClick={() => void archiveLayer()}>Archive layer</button></>}</section>}
    {estateId && <section className="estate-allocation-panel"><h2>Selected Plot Financials</h2><select value={allocationId} onChange={(event) => void selectAllocation(event.target.value)}><option value="">Select an allocated plot</option>{allocations.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.plot_number} - {allocation.customer_name}</option>)}</select>{financial && <><p><strong>{financial.customer.name}</strong> | {financial.estate.name} / {financial.plot.number}</p><div className="estate-financial-grid"><span>Agreed {money(financial.financial.agreed_price)}</span><span>Confirmed {money(financial.financial.confirmed_paid)}</span><span>Pending {money(financial.financial.pending_paid)}</span><span>Outstanding {money(financial.financial.outstanding)}</span><span>Progress {financial.financial.percentage}%</span><span>{financial.financial.fully_paid ? "Fully paid" : "Balance outstanding"}</span></div><h3>Payment History</h3>{financial.payments.map((payment: any) => <p key={payment.id}>{payment.date}: {money(payment.amount)} - {payment.status} {payment.reference ? `(${payment.reference})` : ""}</p>)}<Link to="/estates/payments">Record payment, open payment, view receipt, confirm or void</Link><Link to="/estates/payments">View customer statement</Link></>}</section>}
    {estateId && allocationId && <section className="estate-workflow-panel"><p className="workflow-eyebrow">Steps 7–9 · Survey, staking and development</p><h2>Deliver this allocated plot</h2><p>Prepare Survey from the approved Estate geometry, then prepare a DGPS file for the developer or surveyor. Field evidence is optional and the normal GNSS field workflow remains outside Estates.</p>{selectedPlot && <label className="workflow-upload">Development progress <select value={selectedPlot.development_status || "not_started"} onChange={(event) => void runWorkflow("Development status", async () => { await api.patch(`/estates/plots/${selectedPlot.id}/development-status`, { status: event.target.value }); setPlots((current) => current.map((plot) => plot.id === selectedPlot.id ? { ...plot, development_status: event.target.value } : plot)); })}><option value="not_started">Not started</option><option value="site_cleared">Site cleared</option><option value="foundation">Foundation</option><option value="under_construction">Under construction</option><option value="developed">Developed</option></select></label>}{!selectedSurvey && selectedAllocation && <button type="button" onClick={() => void runWorkflow("Survey preparation", () => api.post(`/estates/plots/${selectedAllocation.plot_id}/survey-requests`))}>Prepare Survey</button>}{selectedSurvey && <><p><strong>Survey:</strong> {selectedSurvey.status.replaceAll("_", " ")}{selectedSurvey.survey_reference ? ` (${selectedSurvey.survey_reference})` : ""}</p>{!selectedSurvey.materialized && <button type="button" onClick={() => void runWorkflow("Survey workspace", () => api.post(`/estates/survey-requests/${selectedSurvey.id}/start`))}>Open Survey preparation</button>}{selectedSurvey.materialized && <Link className="workflow-link" to={`/survey-plan?mode=survey&estate_survey_plot=${selectedSurvey.survey_working_plot_id || ""}`}>Open approved plot in Survey</Link>}{selectedSurvey.materialized && selectedSurvey.status !== "completed" && <button type="button" onClick={() => void runWorkflow("Survey completion", () => api.post(`/estates/survey-requests/${selectedSurvey.id}/complete`))}>Mark Survey complete</button>}{selectedSurvey.materialized && !selectedTask && <button type="button" onClick={() => void runWorkflow("Staking preparation", () => api.post(`/estates/survey-requests/${selectedSurvey.id}/staking-tasks`))}>Prepare for Staking</button>}</>}{selectedTask && <div className="workflow-task"><p><strong>Staking preparation:</strong> {selectedTask.status.replaceAll("_", " ")}{selectedTask.assigned_subject_id ? ` · handled by ${selectedTask.assigned_subject_id}` : ""}</p><button type="button" onClick={() => void downloadDgps(selectedTask.id)}>Download DGPS CSV</button><label className="workflow-upload">Optional supporting evidence <input type="file" accept="image/*,.pdf" onChange={(event) => setStakingEvidence(event.target.files?.[0] || null)} /></label>{stakingEvidence && <button type="button" onClick={() => void uploadStakingEvidence(selectedTask.id)}>Add optional evidence</button>}{selectedTask.status === "pending" && <button type="button" onClick={() => void runWorkflow("Staking status", () => api.post(`/estates/staking-tasks/${selectedTask.id}/start`))}>Mark staking in progress</button>}{selectedTask.status === "in_progress" && <button type="button" onClick={() => void runWorkflow("Staking completion", () => api.post(`/estates/staking-tasks/${selectedTask.id}/complete`))}>Mark staking complete</button>}</div>}{workflowMessage && <p className="workflow-message">{workflowMessage}</p>}</section>}
    {estateId && activity.length > 0 && <section className="estate-timeline"><p className="workflow-eyebrow">Activity</p><h2>Parcel activity timeline</h2>{activity.slice(0,12).map((event) => <p key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong> · {new Date(event.created_at).toLocaleString()}</p>)}</section>}
    {message ? <p className="estates-message">{message}</p> : <section className="estate-grid">{estates.map((estate) => <article key={estate.id}><small>{estate.status.replaceAll("_", " ")}</small><h2>{estate.name}</h2><p>{estate.location || "Location pending"}</p>{estate.financial && <p className="estate-financial">Collected {money(estate.financial.confirmed_collections)}<br/>Outstanding {money(estate.financial.outstanding_balance)}</p>}<Link to={`/estates/${estate.id}/map`}>Open estate map</Link><Link to="/estates/payments">Payments and statements</Link></article>)}</section>}
    {estateId && <section className="estate-create estate-block-editor"><div><p className="workflow-eyebrow">Estate structure</p><h2>Blocks</h2><p>Define block labels before assigning imported or manually created plots.</p></div><input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} placeholder="Block label, e.g. B" /><input value={blockName} onChange={(event) => setBlockName(event.target.value)} placeholder="Block name (optional)" /><button type="button" onClick={() => void createBlock()}>Add block</button><p>{blocks.map((block) => `${block.label}${block.name ? ` - ${block.name}` : ""}`).join(" · ") || "No blocks yet."}</p></section>}
    {estateId && importReviews.length > 0 && <section className="estate-import-review-queue"><p className="workflow-eyebrow">Approval queue</p><h2>Review candidate parcels</h2>{importReviews.map((review) => <details key={review.id}><summary>{review.source_type} - {review.status} - {review.candidate_count} candidate(s)</summary>{review.status === "review_required" && <><p>Adjust the JSON only after surveyor verification. Each item needs plot_number and a GeoJSON Polygon geometry.</p><textarea value={reviewCandidateText[review.id] ?? JSON.stringify(review.candidates || [], null, 2)} onChange={(event) => setReviewCandidateText((current) => ({ ...current, [review.id]: event.target.value }))} /><button type="button" onClick={() => void decideImportReview(review.id, "approved", reviewCandidateText[review.id])}>Approve candidates as Estate plots</button><button type="button" onClick={() => void decideImportReview(review.id, "rejected")}>Reject review</button></>}</details>)}</section>}
    </div>
  </main>;
}
