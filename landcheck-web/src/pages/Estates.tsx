import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { clearEstateAuthSession, getEstateAuthSession } from "../auth/estateAuth";
import { api, extractApiErrorMessage } from "../api/client";
import { money } from "../components/estates/FinancialComponents";
import CoordinateInput from "../components/CoordinateInput";
import EstateLayoutImport, { type EstateLayoutMethod } from "../components/estates/EstateLayoutImport";
import EstateLayoutDesigner from "../components/estates/EstateLayoutDesigner";
import MapViewEnhanced from "../components/MapViewEnhanced";
import { loadMapboxGl, loadMapboxGlCss, MAPBOX_TOKEN } from "../utils/mapboxLoader";
import { toWGS84 } from "../utils/coordinateConverter";
import { checkPolygonClosure } from "../utils/surveyGeometry";
import EstateIcon from "../components/estates/EstateIcon";
import EstateShell from "../components/estates/EstateShell";
import "../styles/estates.css";
import "../styles/estate-dashboard.css";

const STATUS_COLORS = {
  available: "#1e8a4c",
  allocated: "#2a78d6",
  reserved: "#d69100",
  under_survey: "#d9622a",
  under_staking: "#6046a8",
  developed: "#d1433f",
  on_hold: "#667085",
} as const;

function relativeTime(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

type Estate = { id: number; name: string; status: string; organization_id: number; location?: string | null; crs?: string; project_reference?: string | null; project_owner?: string | null; financial?: { confirmed_collections:string; outstanding_balance:string } };
type EstateCoordinatePoint = { station: string; lng: number; lat: number; height?: number; is_boundary?: boolean };

function parseCoordinateRows(value: string): number[][] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,]+/).map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([x, y]) => [x, y]);
}

function segmentsCross(a: { lng: number; lat: number }, b: { lng: number; lat: number }, c: { lng: number; lat: number }, d: { lng: number; lat: number }) {
  const orientation = (p: typeof a, q: typeof a, r: typeof a) => (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const ab = orientation(a, b, c);
  const ac = orientation(a, b, d);
  const cd = orientation(c, d, a);
  const cb = orientation(c, d, b);
  return ((ab > 0 && ac < 0) || (ab < 0 && ac > 0)) && ((cd > 0 && cb < 0) || (cd < 0 && cb > 0));
}

function orderBoundaryPointIndexes(points: Array<{ lng: number; lat: number }>) {
  if (points.length < 3) return points.map((_, index) => index);
  const center = points.reduce((sum, point) => ({ lng: sum.lng + point.lng / points.length, lat: sum.lat + point.lat / points.length }), { lng: 0, lat: 0 });
  const order = points.map((_, index) => index).sort((left, right) => Math.atan2(points[left].lat - center.lat, points[left].lng - center.lng) - Math.atan2(points[right].lat - center.lat, points[right].lng - center.lng));
  for (let pass = 0; pass < points.length * points.length; pass += 1) {
    let changed = false;
    for (let first = 0; first < order.length - 2 && !changed; first += 1) {
      for (let second = first + 2; second < order.length && !changed; second += 1) {
        if (first === 0 && second === order.length - 1) continue;
        const nextFirst = (first + 1) % order.length;
        const nextSecond = (second + 1) % order.length;
        if (segmentsCross(points[order[first]], points[order[nextFirst]], points[order[second]], points[order[nextSecond]])) {
          order.splice(first + 1, second - first, ...order.slice(first + 1, second + 1).reverse());
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return order;
}

export default function Estates() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isMapView = location.pathname.endsWith("/map");
  const [searchParams] = useSearchParams();
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
  const [importReviews, setImportReviews] = useState<any[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);
  const [dxfFile, setDxfFile] = useState<File | null>(null);
  const [scannedLayoutFile, setScannedLayoutFile] = useState<File | null>(null);
  const [importSourceCrs, setImportSourceCrs] = useState("EPSG:4326");
  const [layoutUploadBusy, setLayoutUploadBusy] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState("");
  const [layoutProposal, setLayoutProposal] = useState<any>(null);
  const [layoutDesignerBusy, setLayoutDesignerBusy] = useState(false);
  const [layoutDesignerMessage, setLayoutDesignerMessage] = useState("");
  const [message, setMessage] = useState("Loading estates...");
  const [allocations, setAllocations] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const [subdivisionCount, setSubdivisionCount] = useState("4");
  const [subdivisionBusy, setSubdivisionBusy] = useState(false);
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
  const [mapStyleMode, setMapStyleMode] = useState<"map" | "satellite">("satellite");
  const [blockFilterId, setBlockFilterId] = useState("all");
  const [layersVisible, setLayersVisible] = useState(true);
  const [drawerTab, setDrawerTab] = useState<"overview" | "customer" | "survey" | "staking" | "documents" | "hazards" | "timeline">("overview");
  const [editingDevelopment, setEditingDevelopment] = useState(false);
  const [plotDocumentFile, setPlotDocumentFile] = useState<File | null>(null);
  const [plotDocumentBusy, setPlotDocumentBusy] = useState(false);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const visiblePlotGeojson = useMemo(() => {
    const query = plotSearch.trim().toLowerCase();
    return {
      ...plotGeojson,
      features: (plotGeojson.features || []).filter((feature: any) => {
        const properties = feature.properties || {};
        const plotNumber = String(properties.plot_number || properties.number || "").toLowerCase();
        const matchesBlock = blockFilterId === "all" || String(properties.block_id ?? "") === blockFilterId;
        return matchesBlock && (statusFilter === "all" || properties.commercial_status === statusFilter) && (!query || plotNumber.includes(query));
      }),
    };
  }, [plotGeojson, plotSearch, statusFilter, blockFilterId]);
  const plotInputMapPoints = useMemo(() => plotInputPoints.map((point) => {
    const [lng, lat] = toWGS84(Number(point.lng), Number(point.lat), plotInputCoordinateSystem);
    return { ...point, lng, lat };
  }).filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat)), [plotInputPoints, plotInputCoordinateSystem]);
  const plotInputClosure = useMemo(() => checkPolygonClosure(plotInputMapPoints.map((point) => [point.lng, point.lat] as [number, number])), [plotInputMapPoints]);
  useEffect(() => {
    api.get("/estates/foundation/access").then((response) => { const rows=response.data.organizations || []; setOrganizations(rows); if (rows.length === 1) setNewEstateOrg(String(rows[0].id)); }).catch(() => setOrganizations([]));
    api.get("/estates")
      .then((response) => response.data)
      .then(async (rows) => {
        const enriched = await Promise.all(rows.map(async (estate: Estate) => {
          try { return { ...estate, financial: (await api.get(`/estates/${estate.id}/financial-summary`)).data }; }
          catch { return estate; }
        }));
        setEstates(enriched); setMessage(rows.length ? "" : "No estates yet. Create your first estate to get started.");
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
  const reorderPlotInputPoints = () => {
    if (plotInputMapPoints.length !== plotInputPoints.length || plotInputClosure !== "self-intersecting") return;
    const order = orderBoundaryPointIndexes(plotInputMapPoints);
    const reordered = order.map((index) => plotInputPoints[index]);
    const reorderedMapPoints = order.map((index) => plotInputMapPoints[index]);
    setPlotInputPoints(reordered);
    setWorkflowMessage(checkPolygonClosure(reorderedMapPoints.map((point) => [point.lng, point.lat] as [number, number])) === "closed" ? "Point order corrected. Review the boundary, then create the plot." : "The points still cross. Edit the point order manually before creating the plot.");
  };
  const handlePlotCoordinatesDrawn = (points: Array<{ station: string; lng: number; lat: number }>) => {
    setPlotInputCoordinateSystem("wgs84");
    setPlotInputPoints(points.map((point) => ({ ...point, is_boundary: true })));
    setWorkflowMessage("Boundary updated from the map. Review it, then create the plot.");
  };
  const importPlotInputPoints = (points: EstateCoordinatePoint[]) => {
    setPlotInputPoints(points.map((point, index) => ({ ...point, station: point.station || `P${index + 1}`, is_boundary: true })));
  };
  const createPlotFromInput = async () => {
    if (!estateId || !plotNumber.trim()) { setWorkflowMessage("Enter a plot number first."); return; }
    if (plotInputPoints.length < 3) { setWorkflowMessage("Add at least three boundary points or import a coordinate file."); return; }
    const ring = plotInputMapPoints.map((point) => [point.lng, point.lat]);
    if (ring.length < 3 || ring.some((point) => point.some((value) => !Number.isFinite(value)))) { setWorkflowMessage("Check the coordinate values before creating this plot."); return; }
    if (plotInputClosure === "self-intersecting") { setWorkflowMessage("Order the boundary points before creating the plot."); return; }
    try { await api.post(`/estates/${estateId}/plots`, { plot_number: plotNumber.trim(), geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] }, geometry_status: "approved" }); window.location.reload(); }
    catch (error) { setWorkflowMessage(await extractApiErrorMessage(error, "Plot could not be created.")); }
  };
  const subdividePlot = async () => {
    if (!estateId || !selectedPlot) return;
    const splitCount = Number(subdivisionCount);
    if (!Number.isInteger(splitCount) || splitCount < 2 || splitCount > 100) {
      setWorkflowMessage("Choose between 2 and 100 new plots.");
      return;
    }
    setSubdivisionBusy(true);
    try {
      const response = await api.post(`/estates/${estateId}/plots/${selectedPlot.id}/subdivide`, { split_count: splitCount });
      setWorkflowMessage(`${response.data.created_count} plots created. They are ready to reserve or allocate.`);
      window.location.reload();
    } catch (error) {
      setWorkflowMessage(await extractApiErrorMessage(error, "This plot could not be split."));
    } finally {
      setSubdivisionBusy(false);
    }
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
    if (!selected) { setLayoutMessage("Choose a file before uploading."); return; }
    const form = new FormData(); form.append("file", selected);
    setLayoutUploadBusy(true);
    setLayoutMessage("");
    try {
      const params = kind === "dxf" || kind === "csv" ? { source_crs: importSourceCrs || estateDetail?.crs || "EPSG:4326" } : undefined;
      await api.post(`/estates/${estateId}/import-reviews/${kind}`, form, { params });
      await refreshImportReviews();
      setLayoutMessage("Your layout is ready to review below.");
    } catch (error) { setLayoutMessage(await extractApiErrorMessage(error, "Layout import could not be uploaded.")); }
    finally { setLayoutUploadBusy(false); }
  };
  const decideImportReview = async (reviewId: number, status: "approved" | "rejected") => {
    setLayoutUploadBusy(true);
    setLayoutMessage("");
    try {
      await api.post(`/estates/import-reviews/${reviewId}/decision`, { status });
      await refreshImportReviews(); setLayoutMessage(status === "approved" ? "Plots added to your Estate register." : "Layout discarded.");
      if (status === "approved") window.location.reload();
    }
    catch (error) { setLayoutMessage(await extractApiErrorMessage(error, "Import decision could not be saved.")); }
    finally { setLayoutUploadBusy(false); }
  };
  const handleLayoutFileChange = (method: EstateLayoutMethod, file: File | null) => {
    if (method === "csv") setCsvFile(file);
    else if (method === "geojson") setGeojsonFile(file);
    else if (method === "dxf") setDxfFile(file);
    else setScannedLayoutFile(file);
  };
  const generateLayoutProposal = async (criteria: Record<string, unknown>) => {
    if (!estateId) return;
    setLayoutDesignerBusy(true);
    setLayoutDesignerMessage("");
    try {
      const response = await api.post(`/estates/${estateId}/layout-proposals`, criteria);
      setLayoutProposal(response.data);
      setLayoutDesignerMessage("Draft layout created. Review it before adding plots to the Estate.");
    } catch (error) {
      setLayoutDesignerMessage(await extractApiErrorMessage(error, "The draft layout could not be created."));
    } finally {
      setLayoutDesignerBusy(false);
    }
  };
  const decideLayoutProposal = async (proposalId: number, status: "approved" | "rejected") => {
    setLayoutDesignerBusy(true);
    setLayoutDesignerMessage("");
    try {
      await api.post(`/estates/layout-proposals/${proposalId}/decision`, { status });
      setLayoutDesignerMessage(status === "approved" ? "The plots and shared spaces were added to the Estate map." : "Draft layout discarded.");
      if (status === "approved") window.location.reload();
      else setLayoutProposal((current: any) => current ? { ...current, status } : current);
    } catch (error) {
      setLayoutDesignerMessage(await extractApiErrorMessage(error, "The layout decision could not be saved."));
    } finally {
      setLayoutDesignerBusy(false);
    }
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
    api.get(`/estates/${estateId}`).then((response) => { setEstateDetail(response.data); setImportSourceCrs(response.data.crs || "EPSG:4326"); }).catch(() => setEstateDetail(null));
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
    api.get(`/estates/${estateId}/layout-proposals`).then((response) => setLayoutProposal((response.data || [])[0] || null)).catch(() => setLayoutProposal(null));
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
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: mapStyleMode === "satellite" ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/light-v11",
        center: [7.4, 9.1],
        zoom: 12,
      });
      mapRef.current = map;
      map.on("load", () => {
        if (estateDetail?.boundary) {
          const boundaryFeature = { type: "Feature", properties: {}, geometry: estateDetail.boundary };
          map.addSource("estate-boundary", { type: "geojson", data: boundaryFeature as any });
          map.addLayer({ id: "estate-boundary-fill", type: "fill", source: "estate-boundary", paint: { "fill-color": "#8bb59a", "fill-opacity": 0.08 } });
          map.addLayer({ id: "estate-boundary-outline", type: "line", source: "estate-boundary", paint: { "line-color": "#087f76", "line-width": 2, "line-dasharray": [2, 2] } });
        }
        map.addSource("estate-plots", { type: "geojson", data: visiblePlotGeojson });
        map.addLayer({
          id: "estate-plots-fill",
          type: "fill",
          source: "estate-plots",
          paint: {
            "fill-color": [
              "match",
              ["get", "commercial_status"],
              "available", STATUS_COLORS.available,
              "reserved", STATUS_COLORS.reserved,
              "allocated", STATUS_COLORS.allocated,
              "on_hold", STATUS_COLORS.on_hold,
              STATUS_COLORS.on_hold,
            ],
            "fill-opacity": mapStyleMode === "satellite" ? 0.62 : 0.5,
          },
        });
        map.addLayer({ id: "estate-plots-outline", type: "line", source: "estate-plots", paint: { "line-color": "#ffffff", "line-width": 1.4 } });
        map.addSource("estate-layers", { type: "geojson", data: layersVisible ? layerGeojson : { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "estate-layers-line", type: "line", source: "estate-layers", filter: ["!=", ["geometry-type"], "Polygon"], paint: { "line-color": ["match", ["get", "type"], "road", "#2b2f36", "drainage", "#287cb4", "#b77c2d"], "line-width": 3 } });
        map.addLayer({ id: "estate-layers-fill", type: "fill", source: "estate-layers", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["match", ["get", "type"], "open_space", "#78a85d", "infrastructure", "#b77c2d", "#287cb4"], "fill-opacity": 0.35 } });

        const blockCentroids = new Map<string, { sumLng: number; sumLat: number; count: number }>();
        const collectVertices = (geometry: any, blockId: string) => {
          if (!geometry) return;
          const walk = (coords: any): void => {
            if (typeof coords[0] === "number") {
              const entry = blockCentroids.get(blockId) || { sumLng: 0, sumLat: 0, count: 0 };
              entry.sumLng += coords[0];
              entry.sumLat += coords[1];
              entry.count += 1;
              blockCentroids.set(blockId, entry);
            } else {
              coords.forEach(walk);
            }
          };
          walk(geometry.coordinates);
        };
        visiblePlotGeojson.features.forEach((feature: any) => {
          const blockId = feature.properties?.block_id;
          if (blockId === undefined || blockId === null) return;
          collectVertices(feature.geometry, String(blockId));
        });
        const blockLabelFeatures = Array.from(blockCentroids.entries()).map(([blockId, entry]) => {
          const block = blocks.find((item) => String(item.id) === blockId);
          return {
            type: "Feature",
            properties: { label: block ? `BLOCK ${block.label}` : `BLOCK ${blockId}` },
            geometry: { type: "Point", coordinates: [entry.sumLng / entry.count, entry.sumLat / entry.count] },
          };
        });
        map.addSource("estate-block-labels", { type: "geojson", data: { type: "FeatureCollection", features: blockLabelFeatures } as any });
        map.addLayer({
          id: "estate-block-labels",
          type: "symbol",
          source: "estate-block-labels",
          layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] },
          paint: { "text-color": "#ffffff", "text-halo-color": "rgba(16,24,39,0.85)", "text-halo-width": 3 },
        });

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
        map.on("click", "estate-plots-fill", (event: any) => {
          const id = Number(event.features?.[0]?.properties?.id);
          setSelectedPlotId(id);
          setDrawerTab("overview");
          const allocation = allocations.find((item) => item.plot_id === id);
          if (allocation) void selectAllocation(String(allocation.id));
          else { setAllocationId(""); setFinancial(null); }
        });
        map.on("mouseenter", "estate-plots-fill", () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", "estate-plots-fill", () => { map.getCanvas().style.cursor = ""; });
      });
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [estateId, estateDetail, visiblePlotGeojson, layerGeojson, allocations, mapStyleMode, blocks, layersVisible]);
  const selectAllocation = async (id: string) => {
    setAllocationId(id); setFinancial(null);
    if (!id) return;
    const allocation = allocations.find((item) => String(item.id) === id); if (allocation) setSelectedPlotId(allocation.plot_id);
    try { setFinancial((await api.get(`/estates/allocations/${id}/financial-detail`)).data); }
    catch (error) { setMessage(await extractApiErrorMessage(error, "Allocation financial detail could not be loaded.")); }
  };
  useEffect(() => {
    const plotParam = searchParams.get("plot");
    const id = Number(plotParam);
    if (!plotParam || !Number.isFinite(id)) return;
    setSelectedPlotId(id);
    setDrawerTab("overview");
    const allocation = allocations.find((item) => item.plot_id === id);
    if (allocation) void selectAllocation(String(allocation.id));
  }, [searchParams, allocations]);
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

  const orderedPlotIds = visiblePlotGeojson.features.map((feature: any) => Number(feature.properties?.id));
  const selectedPlotPosition = selectedPlot ? orderedPlotIds.indexOf(selectedPlot.id) : -1;
  const goToAdjacentPlot = (direction: 1 | -1) => {
    if (selectedPlotPosition < 0 || orderedPlotIds.length === 0) return;
    const nextIndex = (selectedPlotPosition + direction + orderedPlotIds.length) % orderedPlotIds.length;
    const nextId = orderedPlotIds[nextIndex];
    setSelectedPlotId(nextId);
    setDrawerTab("overview");
    const allocation = allocations.find((item) => item.plot_id === nextId);
    if (allocation) void selectAllocation(String(allocation.id));
    else { setAllocationId(""); setFinancial(null); }
  };
  const selectedBlock = selectedPlot ? blocks.find((block) => block.id === selectedPlot.block_id) : undefined;
  const openTab = (tab: typeof drawerTab) => { setDrawerTab(tab); setEditingDevelopment(false); };
  const flyToSelectedPlot = () => {
    if (!mapRef.current || !selectedPlot) return;
    const feature = visiblePlotGeojson.features.find((item: any) => Number(item.properties?.id) === selectedPlot.id);
    const ring = feature?.geometry?.type === "Polygon" ? feature.geometry.coordinates[0] : null;
    if (!ring || ring.length === 0) return;
    const lngs = ring.map((coord: number[]) => coord[0]);
    const lats = ring.map((coord: number[]) => coord[1]);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 120, maxZoom: 19 }
    );
  };
  const updateDevelopmentStatus = async (status: string) => {
    if (!selectedPlot) return;
    try {
      await api.patch(`/estates/plots/${selectedPlot.id}/development-status`, { status });
      setPlots((current) => current.map((plot) => (plot.id === selectedPlot.id ? { ...plot, development_status: status } : plot)));
      setEditingDevelopment(false);
    } catch (error) {
      setWorkflowMessage(await extractApiErrorMessage(error, "Development status could not be saved."));
    }
  };
  const uploadPlotDocument = async () => {
    if (!selectedPlot || !plotDocumentFile) return;
    const form = new FormData();
    form.append("file", plotDocumentFile);
    setPlotDocumentBusy(true);
    try {
      await api.post("/estates/documents", form, { params: { entity_type: "plot", entity_id: selectedPlot.id, document_type: "plot_record", description: `Uploaded from the plot drawer for ${selectedPlot.plot_number}` } });
      setPlotDocumentFile(null);
      setWorkflowMessage("Document stored in the private Document Vault.");
    } catch (error) {
      setWorkflowMessage(await extractApiErrorMessage(error, "Document could not be uploaded."));
    } finally {
      setPlotDocumentBusy(false);
    }
  };
  const riskTone = (riskClass: string | undefined) => {
    const value = (riskClass || "").toLowerCase();
    if (["low", "minimal", "none"].includes(value)) return "good";
    if (["moderate", "medium"].includes(value)) return "warn";
    if (["high", "severe", "critical"].includes(value)) return "danger";
    return "neutral";
  };
  const statusPillTone = (status: string | undefined) => {
    const value = (status || "").toLowerCase();
    if (["completed", "approved", "allocated", "active", "fully_paid", "confirmed"].includes(value)) return "good";
    if (["in_progress", "assigned", "requested", "reserved"].includes(value)) return "info";
    if (["attention_required", "review_required", "pending_confirmation", "site_cleared", "foundation"].includes(value)) return "warn";
    if (["failed", "cancelled", "rejected", "voided"].includes(value)) return "danger";
    return "neutral";
  };
  const activityTone = (action: string | undefined) => {
    const value = (action || "").toLowerCase();
    if (value.includes("payment") || value.includes("confirm")) return "good";
    if (value.includes("created") || value.includes("survey") || value.includes("staking")) return "info";
    return "neutral";
  };
  const activityIcon = (action: string | undefined): import("../components/estates/EstateIcon").EstateIconName => {
    const value = (action || "").toLowerCase();
    if (value.includes("payment")) return "payments";
    if (value.includes("survey")) return "survey";
    if (value.includes("staking")) return "staking";
    if (value.includes("allocat")) return "customers";
    if (value.includes("document")) return "documents";
    if (value.includes("plot")) return "plots";
    return "activity";
  };
  const donutOrder: Array<{ key: string; label: string; value: number; color: string }> = dashboard
    ? [
        { key: "reserved", label: "Reserved", value: dashboard.statuses?.reserved || 0, color: STATUS_COLORS.reserved },
        { key: "available", label: "Available", value: dashboard.statuses?.available || 0, color: STATUS_COLORS.available },
        { key: "allocated", label: "Allocated", value: dashboard.statuses?.allocated || 0, color: STATUS_COLORS.allocated },
        { key: "under_survey", label: "Under Survey", value: dashboard.awaiting_survey || 0, color: STATUS_COLORS.under_survey },
        { key: "under_staking", label: "Under Staking", value: dashboard.awaiting_staking || 0, color: STATUS_COLORS.under_staking },
        { key: "developed", label: "Developed", value: dashboard.development?.developed || 0, color: STATUS_COLORS.developed },
      ]
    : [];
  const donutTotal = donutOrder.reduce((sum, item) => sum + item.value, 0) || 1;
  let donutCursor = 0;
  const donutArcs = donutOrder.map((item) => {
    const fraction = item.value / donutTotal;
    const arc = { ...item, offset: donutCursor, fraction };
    donutCursor += fraction;
    return arc;
  });
  const donutCircumference = 2 * Math.PI * 15.9155;
  const allocatedFraction = dashboard ? (dashboard.statuses?.allocated || 0) / (dashboard.total_plots || 1) : 0;
  const plotTimeline = selectedPlot ? activity.filter((event: any) => event.entity_type === "plot" && Number(event.entity_id) === selectedPlot.id) : [];

  function renderStatsRow() {
    if (!dashboard) return null;
    const total = dashboard.total_plots || 0;
    const pct = (value: number) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%");
    const cards: Array<{ label: string; value: number; sub: string; icon: import("../components/estates/EstateIcon").EstateIconName; tone: string }> = [
      { label: "Total Plots", value: total, sub: `${Number(dashboard.mapped_area_sqm || 0).toLocaleString()} m² mapped`, icon: "grid", tone: "neutral" },
      { label: "Allocated", value: dashboard.statuses?.allocated || 0, sub: pct(dashboard.statuses?.allocated || 0), icon: "person", tone: "allocated" },
      { label: "Available", value: dashboard.statuses?.available || 0, sub: pct(dashboard.statuses?.available || 0), icon: "house", tone: "available" },
      { label: "Reserved", value: dashboard.statuses?.reserved || 0, sub: pct(dashboard.statuses?.reserved || 0), icon: "clock", tone: "reserved" },
      { label: "Under Survey", value: dashboard.awaiting_survey || 0, sub: pct(dashboard.awaiting_survey || 0), icon: "compass", tone: "survey" },
      { label: "Under Staking", value: dashboard.awaiting_staking || 0, sub: pct(dashboard.awaiting_staking || 0), icon: "pin", tone: "staking" },
    ];
    return (
      <>
        <div className="edash-section-head">
          <button type="button" className="edash-btn-outline" onClick={flyToSelectedPlot} disabled={!selectedPlot}>
            <EstateIcon name="map" /> View on Map
          </button>
        </div>
        <div className="edash-stats-row">
          {cards.map((card) => (
            <div key={card.label} className="edash-stat-card">
              <span className={`edash-stat-icon tone-${card.tone}`}><EstateIcon name={card.icon} /></span>
              <div className="edash-stat-body">
                <p className="edash-stat-label">{card.label}</p>
                <p className="edash-stat-value">{card.value.toLocaleString()}</p>
                <span className={`edash-stat-sub${card.label === "Total Plots" ? "" : " positive"}`}>{card.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderMapPanel() {
    return (
      <div className="edash-card edash-map-card">
        <div className="edash-map-toolbar">
          <div className="edash-map-mode-tabs">
            <button type="button" className={`edash-map-mode-tab${mapStyleMode === "map" ? " active" : ""}`} onClick={() => setMapStyleMode("map")}>Map</button>
            <button type="button" className={`edash-map-mode-tab${mapStyleMode === "satellite" ? " active" : ""}`} onClick={() => setMapStyleMode("satellite")}>Satellite</button>
            <button type="button" className={`edash-map-mode-tab${layersVisible ? " active" : ""}`} onClick={() => setLayersVisible((value) => !value)} title="Toggle roads, drainage and open space">Layers</button>
          </div>
          <label className="edash-map-search">
            <EstateIcon name="search" />
            <input value={plotSearch} onChange={(event) => setPlotSearch(event.target.value)} placeholder="Search plot number..." />
          </label>
          <select className="edash-map-select" value={blockFilterId} onChange={(event) => setBlockFilterId(event.target.value)}>
            <option value="all">All Blocks</option>
            {blocks.map((block) => <option key={block.id} value={String(block.id)}>{`Block ${block.label}`}</option>)}
          </select>
          <select className="edash-map-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="allocated">Allocated</option>
            <option value="on_hold">On hold</option>
          </select>
          <div className="edash-map-toolbar-spacer" />
          <button type="button" className="edash-icon-btn" title="Reset filters" onClick={() => { setStatusFilter("all"); setBlockFilterId("all"); setPlotSearch(""); }}>
            <EstateIcon name="filter" />
          </button>
        </div>
        <div className="edash-map-canvas-wrap">
          {MAPBOX_TOKEN ? (
            <div ref={mapContainer} className="edash-map-canvas" />
          ) : (
            <div className="edash-map-fallback">Map preview is unavailable right now. {visiblePlotGeojson.features.length} plot geometries are ready in this Estate.</div>
          )}
          <div className="edash-map-controls">
            <div className="edash-map-controls-group">
              <button type="button" className="edash-map-ctrl-btn" title="Zoom in" onClick={() => mapRef.current?.zoomIn()}><EstateIcon name="zoom-in" /></button>
              <button type="button" className="edash-map-ctrl-btn" title="Zoom out" onClick={() => mapRef.current?.zoomOut()}><EstateIcon name="zoom-out" /></button>
            </div>
            <button type="button" className="edash-map-controls-group edash-map-ctrl-btn" title="Fit to estate" onClick={() => {
              if (!mapRef.current) return;
              const bounds = visiblePlotGeojson.features.reduce((acc: number[][] | null, feature: any) => {
                const ring = feature.geometry?.type === "Polygon" ? feature.geometry.coordinates[0] : [];
                return ring.reduce((box: number[][] | null, coord: number[]) => {
                  if (!box) return [[coord[0], coord[1]], [coord[0], coord[1]]];
                  box[0][0] = Math.min(box[0][0], coord[0]); box[0][1] = Math.min(box[0][1], coord[1]);
                  box[1][0] = Math.max(box[1][0], coord[0]); box[1][1] = Math.max(box[1][1], coord[1]);
                  return box;
                }, acc);
              }, null);
              if (bounds) mapRef.current.fitBounds(bounds, { padding: 46, maxZoom: 17 });
            }}>
              <EstateIcon name="locate" />
            </button>
            <button type="button" className={`edash-map-controls-group edash-map-ctrl-btn${layersVisible ? " active" : ""}`} title="Toggle layers" onClick={() => setLayersVisible((value) => !value)}>
              <EstateIcon name="layers" />
            </button>
            <button type="button" className="edash-map-controls-group edash-map-ctrl-btn" title="Fullscreen" onClick={() => mapContainer.current?.parentElement?.requestFullscreen?.()}>
              <EstateIcon name="expand" />
            </button>
          </div>
          <div className="edash-map-legend">
            {[
              { label: "Available", color: STATUS_COLORS.available },
              { label: "Allocated", color: STATUS_COLORS.allocated },
              { label: "Reserved", color: STATUS_COLORS.reserved },
              { label: "Under Survey", color: STATUS_COLORS.under_survey },
              { label: "Under Staking", color: STATUS_COLORS.under_staking },
              { label: "Developed", color: STATUS_COLORS.developed },
            ].map((item) => (
              <span key={item.label} className="edash-map-legend-item">
                <span className="edash-map-legend-dot" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="edash-map-scale">
            <div className="edash-map-scale-bar"><span style={{ width: 60 }} /></div>
            <span className="edash-map-scale-label">0&nbsp;&nbsp;50&nbsp;&nbsp;100 m</span>
          </div>
        </div>
      </div>
    );
  }

  function renderPlotDrawer() {
    const statusValue = selectedPlot?.commercial_status;
    const developmentValue = selectedPlot?.development_status || "not_started";
    const developmentLabels: Record<string, string> = { not_started: "Not started", site_cleared: "Site cleared", foundation: "Foundation", under_construction: "Under construction", developed: "Developed" };
    const surveyLabel = selectedSurvey ? String(selectedSurvey.status).replaceAll("_", " ") : "Not started";
    const stakingLabel = selectedTask ? String(selectedTask.status).replaceAll("_", " ") : "Not started";
    const hazardFlood = hazards?.flood?.summary?.floodplain_class || hazardDashboard?.assessments?.find((item: any) => item.plot_id === selectedPlot?.id)?.hazards?.flood?.risk_class;
    const hazardErosion = hazards?.erosion?.risk_class || hazardDashboard?.assessments?.find((item: any) => item.plot_id === selectedPlot?.id)?.hazards?.erosion?.risk_class;
    const hazardOverall = [hazardFlood, hazardErosion].filter(Boolean);
    const hazardOverallLabel = hazardOverall.length ? (hazardOverall.every((value) => riskTone(value) === "good") ? "Low Risk" : hazardOverall.some((value) => riskTone(value) === "danger") ? "High Risk" : "Moderate Risk") : "Not screened";

    return (
      <div className="edash-card edash-drawer">
        {!selectedPlot ? (
          <div className="edash-drawer-empty">
            <EstateIcon name="plots" />
            <strong>No plot selected</strong>
            <span>Click a parcel on the map to open its full record here.</span>
          </div>
        ) : (
          <>
            <div className="edash-drawer-head">
              <div className="edash-drawer-title-row">
                <span className="edash-drawer-plot-no">Plot {selectedPlot.plot_number}</span>
                <span className={`edash-status-pill tone-${statusPillTone(statusValue)}`}>{String(statusValue || "").replaceAll("_", " ")}</span>
                <div className="edash-drawer-nav">
                  <button type="button" className="edash-drawer-nav-btn" onClick={() => goToAdjacentPlot(-1)} disabled={orderedPlotIds.length < 2} aria-label="Previous plot"><EstateIcon name="chevron-left" /></button>
                  <button type="button" className="edash-drawer-nav-btn" onClick={() => goToAdjacentPlot(1)} disabled={orderedPlotIds.length < 2} aria-label="Next plot"><EstateIcon name="chevron-right" /></button>
                  <button type="button" className="edash-drawer-nav-btn" onClick={() => { setSelectedPlotId(null); setAllocationId(""); setFinancial(null); }} aria-label="Close"><EstateIcon name="close" /></button>
                </div>
              </div>
              <p className="edash-drawer-sub">{selectedBlock ? `Block ${selectedBlock.label}` : "Unassigned block"} &middot; {Number(selectedPlot.area_sqm || 0).toLocaleString()} m²</p>
              <button type="button" className="edash-btn-outline edash-drawer-view-map" onClick={flyToSelectedPlot}>
                <EstateIcon name="map" /> View on Map
              </button>
              <div className="edash-drawer-tabs">
                {([
                  ["overview", "Overview"], ["customer", "Customer"], ["survey", "Survey"], ["staking", "Staking"],
                  ["documents", "Documents"], ["hazards", "Hazards"], ["timeline", "Timeline"],
                ] as Array<[typeof drawerTab, string]>).map(([key, label]) => (
                  <button key={key} type="button" className={`edash-drawer-tab${drawerTab === key ? " active" : ""}`} onClick={() => openTab(key)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="edash-drawer-body">
              {drawerTab === "overview" && (
                <div className="edash-tab-panel">
                  <div className="edash-overview-grid">
                    <div className="edash-overview-field"><span>Status</span><strong style={{ textTransform: "capitalize" }}>{String(statusValue || "").replaceAll("_", " ")}</strong></div>
                    <div className="edash-overview-field"><span>Block</span><strong>{selectedBlock?.label || "--"}</strong></div>
                    <div className="edash-overview-field"><span>Plot No.</span><strong>{selectedPlot.plot_number}</strong></div>
                    <div className="edash-overview-field"><span>Area</span><strong>{Number(selectedPlot.area_sqm || 0).toLocaleString()} m²</strong></div>
                    <div className="edash-overview-thumb" aria-hidden="true" />
                  </div>

                  {selectedPlot.commercial_status === "available" && (
                    <details className="edash-info-card" style={{ display: "block" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "0.82rem" }}>Split this plot</summary>
                      <p className="edash-status-row-desc" style={{ margin: "8px 0" }}>Create smaller plots from this available plot. The new plots appear on the map and can be reserved or allocated.</p>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="number" min="2" max="100" value={subdivisionCount} onChange={(event) => setSubdivisionCount(event.target.value)} style={{ width: 80, padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
                        <button type="button" className="edash-btn-primary" disabled={subdivisionBusy} onClick={() => void subdividePlot()}>{subdivisionBusy ? "Creating plots..." : "Create plots"}</button>
                      </div>
                    </details>
                  )}

                  <div className="edash-info-card" style={{ flexDirection: "column" }}>
                    <div className="edash-info-card-head"><span className="edash-status-row-title">Site notes</span></div>
                    <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
                      <select className="edash-map-select" value={inspectionOutcome} onChange={(event) => setInspectionOutcome(event.target.value)}>
                        <option value="observed">Observed</option>
                        <option value="passed">Passed</option>
                        <option value="attention_required">Attention required</option>
                        <option value="failed">Failed</option>
                      </select>
                      <input value={inspectionNotes} onChange={(event) => setInspectionNotes(event.target.value)} placeholder="Optional site note" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
                      <button type="button" className="edash-btn-outline" onClick={() => void recordInspection()}>Save</button>
                    </div>
                    {inspections.slice(0, 4).map((inspection) => (
                      <p key={inspection.id} className="edash-status-row-desc" style={{ margin: "2px 0" }}>
                        <strong style={{ color: "var(--edash-ink)", textTransform: "capitalize" }}>{inspection.outcome.replaceAll("_", " ")}</strong> &middot; {inspection.notes || "No note"}
                      </p>
                    ))}
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="customers" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head"><span className="edash-info-card-title">Customer</span></div>
                      {selectedAllocation ? (
                        <>
                          <p className="edash-info-card-name">{selectedAllocation.customer_name}</p>
                          <p className="edash-info-card-meta">{financial?.customer?.email || financial?.customer?.phone || selectedAllocation.status}</p>
                        </>
                      ) : (
                        <p className="edash-info-card-meta">No active customer allocation.</p>
                      )}
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("customer")}>View Customer</button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="wallet" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head"><span className="edash-info-card-title">Payment Summary</span></div>
                      {financial ? (
                        <>
                          <p className="edash-payment-total">{money(financial.financial.agreed_price)}</p>
                          <div className="edash-payment-split">
                            <span className="confirmed">{money(financial.financial.confirmed_paid)}<small>Confirmed</small></span>
                            <span className="outstanding">{money(financial.financial.outstanding)}<small>Outstanding</small></span>
                          </div>
                        </>
                      ) : (
                        <p className="edash-info-card-meta">No payment record for this plot yet.</p>
                      )}
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("customer")}>View Payments</button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="survey" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Survey</span>
                        <span className={`edash-status-pill tone-${statusPillTone(selectedSurvey?.status)}`}>{surveyLabel}</span>
                      </div>
                      <p className="edash-status-row-desc">{selectedSurvey ? `Survey reference ${selectedSurvey.survey_reference || "pending"}.` : "Prepare a Survey package once this plot is allocated."}</p>
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("survey")}>View Survey</button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="staking" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Staking</span>
                        <span className={`edash-status-pill tone-${statusPillTone(selectedTask?.status)}`}>{stakingLabel}</span>
                      </div>
                      <p className="edash-status-row-desc">{selectedTask ? "DGPS staking task created for this plot." : "Generate DGPS and create a staking task."}</p>
                    </div>
                    <button
                      type="button"
                      className="edash-btn-primary edash-info-card-action"
                      disabled={!selectedSurvey?.materialized || Boolean(selectedTask)}
                      onClick={() => {
                        if (selectedTask) { openTab("staking"); return; }
                        void runWorkflow("Staking preparation", () => api.post(`/estates/survey-requests/${selectedSurvey!.id}/staking-tasks`)).then(() => openTab("staking"));
                      }}
                    >
                      {selectedTask ? "View Staking" : "Start Staking"}
                    </button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="development" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Development</span>
                        <span className={`edash-status-pill tone-${statusPillTone(developmentValue)}`}>{developmentLabels[developmentValue] || developmentValue}</span>
                      </div>
                      <p className="edash-status-row-desc">{developmentValue === "not_started" ? "No development record yet" : `Latest status: ${developmentLabels[developmentValue]}`}</p>
                    </div>
                    {editingDevelopment ? (
                      <select className="edash-map-select" autoFocus defaultValue={developmentValue} onChange={(event) => void updateDevelopmentStatus(event.target.value)} onBlur={() => setEditingDevelopment(false)}>
                        {Object.entries(developmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    ) : (
                      <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => setEditingDevelopment(true)}>{developmentValue === "not_started" ? "Add Record" : "Update"}</button>
                    )}
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="hazard" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Hazard Analysis</span>
                        <span className={`edash-status-pill tone-${hazardOverall.length ? riskTone(hazardOverall.find((value) => riskTone(value) !== "good") || hazardOverall[0]) : "neutral"}`}>{hazardOverallLabel}</span>
                      </div>
                      <p className="edash-status-row-desc">{hazardOverall.length ? "Flood, erosion and vulnerability analysis completed" : "Run flood and erosion screening for this plot."}</p>
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("hazards")}>View Analysis</button>
                  </div>
                </div>
              )}

              {drawerTab === "customer" && (
                <div className="edash-tab-panel">
                  {selectedAllocation ? (
                    <>
                      <div className="edash-info-card">
                        <span className="edash-info-card-icon"><EstateIcon name="customers" /></span>
                        <div className="edash-info-card-body">
                          <p className="edash-info-card-name">{selectedAllocation.customer_name}</p>
                          <p className="edash-info-card-meta">Allocation status: {selectedAllocation.status.replaceAll("_", " ")}</p>
                        </div>
                      </div>
                      {financial && (
                        <>
                          <div className="edash-overview-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                            <div className="edash-overview-field"><span>Agreed</span><strong>{money(financial.financial.agreed_price)}</strong></div>
                            <div className="edash-overview-field"><span>Confirmed</span><strong>{money(financial.financial.confirmed_paid)}</strong></div>
                            <div className="edash-overview-field"><span>Outstanding</span><strong>{money(financial.financial.outstanding)}</strong></div>
                          </div>
                          <p className="edash-status-row-title" style={{ margin: "6px 0" }}>Payment history</p>
                          {financial.payments?.length ? (
                            <table className="edash-mini-table">
                              <thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
                              <tbody>
                                {financial.payments.slice(0, 8).map((payment: any) => (
                                  <tr key={payment.id}><td>{payment.date}</td><td>{money(payment.amount)}</td><td style={{ textTransform: "capitalize" }}>{payment.status.replaceAll("_", " ")}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <p className="edash-tab-empty">No payments recorded yet.</p>}
                          <Link className="edash-btn-outline" style={{ display: "inline-flex", marginTop: 8 }} to="/estates/payments">Open full payment workspace</Link>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="edash-tab-panel">
                      <p className="edash-tab-empty" style={{ padding: "10px 0" }}>This plot has no customer yet. Add one or choose an existing customer to reserve or allocate it.</p>
                      <label className="edash-overview-field" style={{ marginBottom: 8 }}><span>New customer</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} /></label>
                      <button type="button" className="edash-btn-outline" onClick={() => void createCustomer()}>Add customer</button>
                      <select className="edash-map-select" style={{ margin: "10px 0", width: "100%" }} value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                        <option value="">Choose customer</option>
                        {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                      <input type="number" min="0" step="0.01" value={agreedPrice} onChange={(event) => setAgreedPrice(event.target.value)} placeholder="Agreed price (NGN)" style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)", width: "100%", marginBottom: 8 }} />
                      <input value={paymentPlan} onChange={(event) => setPaymentPlan(event.target.value)} placeholder="Payment plan (optional)" style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)", width: "100%", marginBottom: 8 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="edash-btn-outline" onClick={() => void assignCustomer(false)}>Reserve</button>
                        <button type="button" className="edash-btn-primary" onClick={() => void assignCustomer(true)}>Allocate / sell</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {drawerTab === "survey" && (
                <div className="edash-tab-panel">
                  {selectedSurvey ? (
                    <>
                      <div className="edash-info-card">
                        <span className="edash-info-card-icon"><EstateIcon name="survey" /></span>
                        <div className="edash-info-card-body">
                          <div className="edash-info-card-head"><span className="edash-status-row-title">Survey request</span><span className={`edash-status-pill tone-${statusPillTone(selectedSurvey.status)}`}>{surveyLabel}</span></div>
                          <p className="edash-status-row-desc">{selectedSurvey.survey_reference ? `Reference ${selectedSurvey.survey_reference}` : "No reference assigned yet."}</p>
                        </div>
                      </div>
                      {!selectedSurvey.materialized && <button type="button" className="edash-btn-primary" onClick={() => void runWorkflow("Survey workspace", () => api.post(`/estates/survey-requests/${selectedSurvey.id}/start`))}>Open Survey preparation</button>}
                      {selectedSurvey.materialized && <Link className="edash-btn-outline" style={{ display: "inline-flex", marginRight: 8 }} to={`/survey-plan?mode=survey&estate_survey_plot=${selectedSurvey.survey_working_plot_id || ""}`}>Open approved plot in Survey</Link>}
                      {selectedSurvey.materialized && selectedSurvey.status !== "completed" && <button type="button" className="edash-btn-primary" onClick={() => void runWorkflow("Survey completion", () => api.post(`/estates/survey-requests/${selectedSurvey.id}/complete`))}>Mark Survey complete</button>}
                    </>
                  ) : (
                    <div className="edash-tab-empty">
                      <EstateIcon name="survey" />
                      <span>No Survey request yet for this plot.</span>
                      {selectedAllocation && <button type="button" className="edash-btn-primary" style={{ marginTop: 8 }} onClick={() => void runWorkflow("Survey preparation", () => api.post(`/estates/plots/${selectedAllocation.plot_id}/survey-requests`))}>Prepare Survey</button>}
                    </div>
                  )}
                  {workflowMessage && <p className="edash-tab-empty" style={{ color: "var(--edash-good)" }}>{workflowMessage}</p>}
                </div>
              )}

              {drawerTab === "staking" && (
                <div className="edash-tab-panel">
                  {selectedTask ? (
                    <>
                      <div className="edash-info-card">
                        <span className="edash-info-card-icon"><EstateIcon name="staking" /></span>
                        <div className="edash-info-card-body">
                          <div className="edash-info-card-head"><span className="edash-status-row-title">Staking task</span><span className={`edash-status-pill tone-${statusPillTone(selectedTask.status)}`}>{stakingLabel}</span></div>
                          <p className="edash-status-row-desc">{selectedTask.assigned_subject_id ? `Handled by ${selectedTask.assigned_subject_id}` : "Not yet assigned to a field officer."}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="edash-btn-outline" onClick={() => void downloadDgps(selectedTask.id)}><EstateIcon name="download" /> Download DGPS CSV</button>
                        {selectedTask.status === "pending" && <button type="button" className="edash-btn-primary" onClick={() => void runWorkflow("Staking status", () => api.post(`/estates/staking-tasks/${selectedTask.id}/start`))}>Mark in progress</button>}
                        {selectedTask.status === "in_progress" && <button type="button" className="edash-btn-primary" onClick={() => void runWorkflow("Staking completion", () => api.post(`/estates/staking-tasks/${selectedTask.id}/complete`))}>Mark complete</button>}
                      </div>
                      <label className="edash-overview-field" style={{ marginTop: 10 }}>
                        <span>Field evidence</span>
                        <input type="file" accept="image/*,.pdf" onChange={(event) => setStakingEvidence(event.target.files?.[0] || null)} />
                      </label>
                      {stakingEvidence && <button type="button" className="edash-btn-outline" onClick={() => void uploadStakingEvidence(selectedTask.id)}>Upload evidence</button>}
                    </>
                  ) : (
                    <div className="edash-tab-empty">
                      <EstateIcon name="staking" />
                      <span>{selectedSurvey?.materialized ? "Staking has not been prepared for this plot yet." : "Complete Survey first to prepare staking."}</span>
                    </div>
                  )}
                </div>
              )}

              {drawerTab === "documents" && (
                <div className="edash-tab-panel">
                  <label className="edash-overview-field">
                    <span>Upload a document for this plot</span>
                    <input type="file" onChange={(event) => setPlotDocumentFile(event.target.files?.[0] || null)} />
                  </label>
                  <button type="button" className="edash-btn-primary" disabled={!plotDocumentFile || plotDocumentBusy} onClick={() => void uploadPlotDocument()}>
                    <EstateIcon name="upload" /> {plotDocumentBusy ? "Uploading..." : "Upload document"}
                  </button>
                  <Link className="edash-btn-outline" style={{ display: "inline-flex", marginTop: 10 }} to="/estates/documents">Open the full Document Vault</Link>
                </div>
              )}

              {drawerTab === "hazards" && (
                <div className="edash-tab-panel">
                  <div className="edash-risk-list">
                    <div className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name="flood" /></span>
                      <span>Flood Risk</span>
                      <span className={`edash-status-pill tone-${hazardFlood ? riskTone(hazardFlood) : "neutral"}`}>{hazardFlood ? hazardFlood.replaceAll("_", " ") : "Not screened"}</span>
                    </div>
                    <div className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name="erosion" /></span>
                      <span>Erosion Risk</span>
                      <span className={`edash-status-pill tone-${hazardErosion ? riskTone(hazardErosion) : "neutral"}`}>{hazardErosion ? hazardErosion.replaceAll("_", " ") : "Not screened"}</span>
                    </div>
                  </div>
                  <button type="button" className="edash-btn-primary" style={{ marginTop: 12 }} onClick={() => void loadHazards()}>Run flood + erosion screening</button>
                </div>
              )}

              {drawerTab === "timeline" && (
                <div className="edash-tab-panel">
                  {plotTimeline.length ? (
                    <div className="edash-timeline-list">
                      {plotTimeline.map((event: any) => (
                        <div key={event.id} className="edash-timeline-item">
                          <span className="edash-timeline-dot" />
                          <div>
                            <strong>{String(event.action || "").replaceAll("_", " ")}</strong>
                            <small>{new Date(event.created_at).toLocaleString()}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="edash-tab-empty">
                      <EstateIcon name="audit" />
                      <span>No recorded activity for this plot yet.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderBottomRow() {
    return (
      <div className="edash-bottom-row">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Recent Activity</h3>
              <Link className="edash-card-link" to={`/estates/${estateId}/timeline`}>View All</Link>
            </div>
            {activity.length ? (
              <div className="edash-activity-list">
                {activity.slice(0, 6).map((event: any) => (
                  <div key={event.id} className="edash-activity-item">
                    <span className={`edash-activity-icon tone-${activityTone(event.action)}`}><EstateIcon name={activityIcon(event.action)} /></span>
                    <div className="edash-activity-body">
                      <strong>{String(event.action || "").replaceAll("_", " ")}</strong>
                      <span>{event.entity_type === "plot" ? `Plot ${event.entity_id} · ` : ""}{relativeTime(event.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="edash-tab-empty">No activity recorded yet.</p>}
          </div>
        </div>

        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Estate Progress</h3></div>
            {dashboard ? (
              <div className="edash-progress-donut-row">
                <svg viewBox="0 0 36 36" width="118" height="118">
                  <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--edash-border-soft)" strokeWidth="4.2" />
                  {donutArcs.map((arc) => (
                    <circle
                      key={arc.key}
                      cx="18" cy="18" r="15.9155" fill="none"
                      stroke={arc.color}
                      strokeWidth="4.2"
                      strokeDasharray={`${arc.fraction * donutCircumference} ${donutCircumference - arc.fraction * donutCircumference}`}
                      strokeDashoffset={25 - arc.offset * 100}
                      strokeLinecap="butt"
                    />
                  ))}
                  <text x="18" y="19.5" textAnchor="middle" fontSize="7" fontWeight="800" fill="var(--edash-ink)">{Math.round(allocatedFraction * 100)}%</text>
                </svg>
                <div className="edash-donut-legend">
                  {donutOrder.map((item) => (
                    <div key={item.key} className="edash-donut-legend-item">
                      <span className="edash-donut-legend-dot" style={{ background: item.color }} />
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="edash-tab-empty">No plots mapped yet.</p>}
          </div>
        </div>

        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Risk Overview</h3>
              <Link className="edash-card-link" to={`/estates/${estateId}/hazards`}>View Details</Link>
            </div>
            <div className="edash-risk-list">
              {Object.entries(hazardDashboard?.summary || {}).length ? (
                Object.entries(hazardDashboard.summary).map(([type, value]: [string, any]) => {
                  const classes: string[] = Object.keys(value.classes || {});
                  const worst = classes.find((entry) => riskTone(entry) === "danger") || classes.find((entry) => riskTone(entry) === "warn") || classes[0];
                  return (
                    <div key={type} className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name={type === "flood" ? "flood" : "erosion"} /></span>
                      <span style={{ textTransform: "capitalize" }}>{type} Risk</span>
                      <span className={`edash-status-pill tone-${worst ? riskTone(worst) : "neutral"}`}>{worst ? worst.replaceAll("_", " ") : "Unscreened"}</span>
                    </div>
                  );
                })
              ) : (
                <>
                  <div className="edash-risk-item"><span className="edash-risk-icon"><EstateIcon name="flood" /></span><span>Flood Risk</span><span className="edash-status-pill tone-neutral">Not screened</span></div>
                  <div className="edash-risk-item"><span className="edash-risk-icon"><EstateIcon name="erosion" /></span><span>Erosion Risk</span><span className="edash-status-pill tone-neutral">Not screened</span></div>
                </>
              )}
              <div className="edash-risk-item">
                <span className="edash-risk-icon"><EstateIcon name="shield" /></span>
                <span>General Vulnerability</span>
                <span className={`edash-status-pill tone-${quality && !quality.review_required ? "good" : "neutral"}`}>{quality ? (quality.review_required ? "Review required" : "Low") : "Pending"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderQuickActions() {
    const actions: Array<{ label: string; icon: import("../components/estates/EstateIcon").EstateIconName; to: string }> = [
      { label: "Import Land Data", icon: "upload", to: `/estates/${estateId}/map#layout-import` },
      { label: "Create Plot", icon: "plus", to: `/estates/${estateId}/map#plot-register` },
      { label: "Run Geometry Check", icon: "check-circle", to: `/estates/${estateId}/map#estate-qc` },
      { label: "Generate Report", icon: "reports", to: `/estates/${estateId}/reports` },
      { label: "Estate Settings", icon: "settings", to: `/estates/${estateId}/settings` },
    ];
    return (
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Quick Actions</h3></div>
          <div className="edash-quick-actions">
            {actions.map((action) => (
              <Link key={action.label} className="edash-quick-action-btn" to={action.to}>
                <EstateIcon name={action.icon} />
                <span>{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderFooter() {
    return (
      <div className="edash-footer">
        <span>landcheck-estates v3.0.0</span>
        <span>Secure &middot; Private &middot; For a more certain tomorrow</span>
      </div>
    );
  }

  if (!estateId) {
    return (
      <main className="estates-shell">
        <aside className="estate-sidebar">
          <div className="estate-brand"><span className="estate-brand-mark">L</span><div><strong>LandCheck</strong><small>Estates</small></div></div>
          <div className="estate-sidebar-estate"><small>ACTIVE ESTATE</small><strong>{estates[0]?.name || "Estate workspace"}</strong><span>{estates[0]?.location || "Choose an estate to begin"}</span></div>
          <nav aria-label="Estate navigation">
            <Link className="active" to="/estates/workspace"><span>⌂</span>Dashboard</Link>
            <Link to="/estates/workspace"><span>▦</span>Map &amp; Plots</Link>
            <Link to="/estates/workspace#plot-register"><span>▤</span>Plots</Link>
            <Link to="/estates/payments"><span>♙</span>Customers</Link>
            <Link to="/estates/payments"><span>₦</span>Sales &amp; Payments</Link>
            <Link to="/estates/workspace"><span>⌖</span>Survey</Link>
            <Link to="/estates/workspace"><span>⌁</span>Staking</Link>
            <Link to="/estates/documents"><span>□</span>Documents</Link>
            <Link to="/estates/workspace"><span>⌂</span>Development</Link>
            <Link to="/estates/workspace"><span>△</span>Hazard Analysis</Link>
            <Link to="/estates/workspace"><span>◷</span>Audit Timeline</Link>
            <Link to="/estates/workspace"><span>⚙</span>Settings</Link>
          </nav>
          <div className="estate-sidebar-footer"><span>?</span>Help &amp; Support</div>
        </aside>
        <div className="estate-app">
          <div className="estate-topbar"><div className="estate-breadcrumb"><span>Estates</span><b>›</b><strong>Workspace</strong></div><label className="estate-search"><span aria-hidden="true">⌕</span><input value={plotSearch} onChange={(event) => setPlotSearch(event.target.value)} placeholder="Search plots by number..." aria-label="Search plots by number" /></label><div className="estate-user"><span className="estate-avatar">{(estateSession?.user.organization_name || "E").slice(0, 1).toUpperCase()}</span><div><strong>{estateSession?.user.organization_name || "Estate team"}</strong><small>Estate workspace</small></div></div></div>
          <header><span>LandCheck Estates</span><h1>Estate workspace</h1><p>Map-first parcel operations for layouts, plots, customers and delivery.</p></header>
          {estates.length > 0 && <section className="estate-existing-chooser"><div><p className="workflow-eyebrow">Your estates</p><h2>Open an existing estate</h2><p>Choose an Estate to open its map and plot register.</p></div><label>Choose an estate<select defaultValue="" onChange={(event) => { if (event.target.value) navigate(`/estates/${event.target.value}/map`); }}><option value="">Select an estate</option>{estates.map((estate) => <option key={estate.id} value={estate.id}>{estate.name}{estate.location ? ` - ${estate.location}` : ""}</option>)}</select></label></section>}
          {organizations.length > 0 && <section className="estate-create estate-setup-simple"><div><p className="workflow-eyebrow">Start here</p><h2>Create an estate</h2><p>Add the basics now. You can bring in the layout and plots after the Estate is created.</p></div><label>Your organisation<select value={newEstateOrg} onChange={(event) => setNewEstateOrg(event.target.value)}><option value="">Choose organisation</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><label>Estate name<input value={newEstateName} onChange={(event) => setNewEstateName(event.target.value)} placeholder="e.g. Greenview Estate" /></label><label>Location<input value={newEstateLocation} onChange={(event) => setNewEstateLocation(event.target.value)} placeholder="City, state or area" /></label><label className="estate-boundary-field">Estate boundary <span>Optional - one longitude, latitude pair per line</span><textarea value={newEstateBoundaryCoordinates} onChange={(event) => setNewEstateBoundaryCoordinates(event.target.value)} placeholder="7.1234, 9.1234&#10;7.1238, 9.1234&#10;7.1238, 9.1238" /></label><details><summary>Project details (optional)</summary><div><label>Coordinate system<input value={newEstateCrs} onChange={(event) => setNewEstateCrs(event.target.value)} placeholder="EPSG:4326" /></label><label>Datum<input value={newEstateDatum} onChange={(event) => setNewEstateDatum(event.target.value)} placeholder="Datum" /></label><label>Project reference<input value={newEstateProjectReference} onChange={(event) => setNewEstateProjectReference(event.target.value)} placeholder="Reference" /></label><label>Developer or owner<input value={newEstateProjectOwner} onChange={(event) => setNewEstateProjectOwner(event.target.value)} placeholder="Name" /></label><label>Notes<textarea value={newEstateOwnershipDetails} onChange={(event) => setNewEstateOwnershipDetails(event.target.value)} placeholder="Ownership or project notes" /></label></div></details><button type="button" onClick={() => void createEstate()}>Create estate</button></section>}
          <section className="estates-toolbar"><strong>{estateSession?.user.organization_name || "My estates"}</strong><div><Link to="/estates/workspace">Estate workspace</Link><button type="button" onClick={() => { clearEstateAuthSession(); navigate("/estates", { replace: true }); }}>Sign out</button></div></section>
          {organizations.length > 0 && <section className="estate-create estate-setup"><div><p className="workflow-eyebrow">Step 1 · Create Estate</p><h2>Start the estate register</h2><p>Set the project context first. You can add the boundary and approved parcels through the layout review workflow.</p></div><select value={newEstateOrg} onChange={(event) => setNewEstateOrg(event.target.value)}><option value="">Organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><input value={newEstateName} onChange={(event) => setNewEstateName(event.target.value)} placeholder="Estate name" /><input value={newEstateLocation} onChange={(event) => setNewEstateLocation(event.target.value)} placeholder="Location" /><input value={newEstateCrs} onChange={(event) => setNewEstateCrs(event.target.value)} placeholder="Coordinate system, e.g. EPSG:4326" /><input value={newEstateDatum} onChange={(event) => setNewEstateDatum(event.target.value)} placeholder="Datum (optional)" /><input value={newEstateProjectReference} onChange={(event) => setNewEstateProjectReference(event.target.value)} placeholder="Project reference (optional)" /><input value={newEstateProjectOwner} onChange={(event) => setNewEstateProjectOwner(event.target.value)} placeholder="Developer / owner (optional)" /><textarea value={newEstateOwnershipDetails} onChange={(event) => setNewEstateOwnershipDetails(event.target.value)} placeholder="Ownership or project details (optional)" /><textarea value={newEstateBoundaryCoordinates} onChange={(event) => setNewEstateBoundaryCoordinates(event.target.value)} placeholder="Estate boundary: longitude, latitude per line (optional)" /><button type="button" onClick={() => void createEstate()}>Create Estate</button></section>}
          {message ? <p className="estates-message">{message}</p> : <section className="estate-grid">{estates.map((estate) => <article key={estate.id}><small>{estate.status.replaceAll("_", " ")}</small><h2>{estate.name}</h2><p>{estate.location || "Location pending"}</p>{estate.financial && <p className="estate-financial">Collected {money(estate.financial.confirmed_collections)}<br/>Outstanding {money(estate.financial.outstanding_balance)}</p>}<Link to={`/estates/${estate.id}/map`}>Open estate map</Link><Link to="/estates/payments">Payments and statements</Link></article>)}</section>}
        </div>
      </main>
    );
  }

  return (
    <EstateShell
      estateId={estateId}
      estateName={estateDetail?.name}
      activeKey={isMapView ? "map" : "dashboard"}
      search={plotSearch}
      onSearchChange={setPlotSearch}
      recentActivity={activity}
    >
      {renderStatsRow()}
      {isMapView ? (
        <div className="edash-content-row">
          {renderMapPanel()}
          {renderPlotDrawer()}
        </div>
      ) : null}
      {renderBottomRow()}
      {renderQuickActions()}
      {renderFooter()}

      {isMapView && (
        <div className="edash-legacy-tools">
          <div className="edash-legacy-tools-head">
            <h2>Plot &amp; layout tools</h2>
            <p>Create plots, import a layout, manage blocks and spatial layers, and publish the approved Estate map.</p>
          </div>
          <section id="plot-register" className="estate-plot-input-panel"><div><p className="workflow-eyebrow">Add one plot</p><h2>Create a plot from coordinates</h2><p>Import a CSV or Excel file or enter points manually. The boundary appears on the map immediately, where you can move points before adding it to the plot register.</p></div><label>Plot number<input value={plotNumber} onChange={(event) => setPlotNumber(event.target.value)} placeholder="e.g. B-024" /></label><div className="estate-plot-input-workbench"><CoordinateInput title="Add plot boundary" subtitle="Choose a spreadsheet or enter the points manually." sidebar={<div className="estate-coordinate-context"><strong>Plot boundary</strong><span>Use the same coordinate workflow as Survey.</span></div>} points={plotInputPoints} onUpdatePoint={updatePlotInputPoint} onRemovePoint={removePlotInputPoint} onAddPoint={addPlotInputPoint} onBulkUpload={importPlotInputPoints} disabled={false} coordinateSystem={plotInputCoordinateSystem} onCoordinateSystemChange={setPlotInputCoordinateSystem} onReorderPoints={reorderPlotInputPoints} onClearAllPoints={() => setPlotInputPoints([])} /><div className="estate-plot-map-preview"><div><p className="workflow-eyebrow">Map preview</p><h3>Check the plot location</h3><p>Edit the boundary on the map or use the table above.</p></div>{MAPBOX_TOKEN ? <MapViewEnhanced coordinates={plotInputMapPoints} onCoordinatesDrawn={handlePlotCoordinatesDrawn} coordinateSystem="wgs84" showToolbar /> : <div className="estate-map-fallback">Map preview is unavailable right now. You can still review the coordinates above.</div>}</div></div>{workflowMessage && <p className="estate-plot-input-message" role="status">{workflowMessage}</p>}<button type="button" className="estate-plot-create-button" disabled={plotInputMapPoints.length < 3 || plotInputClosure === "self-intersecting"} onClick={() => void createPlotFromInput()}>{plotInputClosure === "self-intersecting" ? "Fix boundary first" : "Create plot"}</button></section>
          <div id="layout-import">
            <EstateLayoutImport reviews={importReviews} files={{ csv: csvFile, geojson: geojsonFile, dxf: dxfFile, "scanned-layout": scannedLayoutFile }} onFileChange={handleLayoutFileChange} onUpload={(method) => void uploadLayout(method)} onDecision={(reviewId, status) => void decideImportReview(reviewId, status)} message={layoutMessage} busy={layoutUploadBusy} />
          </div>
          <EstateLayoutDesigner boundaryPresent={Boolean(estateDetail?.boundary)} proposal={layoutProposal} busy={layoutDesignerBusy} message={layoutDesignerMessage} onGenerate={(criteria) => void generateLayoutProposal(criteria)} onDecision={(proposalId, status) => void decideLayoutProposal(proposalId, status)} />
          {quality && <section id="estate-qc" className="estate-qc"><div><p className="workflow-eyebrow">Approve the Estate map</p><h2>{quality.review_required ? "Review required" : "Geometry ready"}</h2><p>{quality.plot_count} plots checked. {quality.issues.length} issue(s) detected.</p></div>{quality.issues.slice(0,8).map((issue:any,index:number) => <p key={`${issue.code}-${index}`} className={issue.severity}>{issue.message}</p>)}{dashboard && <div className="estate-publish-action"><p><strong>Register status:</strong> {dashboard.estate.status.replaceAll("_", " ")}</p><button type="button" disabled={dashboard.estate.status === "active" || quality.review_required || quality.plot_count === 0} onClick={() => void approveEstateMap()}>{dashboard.estate.status === "active" ? "Estate map published" : "Approve and publish map"}</button></div>}</section>}
          <section className="estate-create estate-plot-import"><div><p className="workflow-eyebrow">Add parcel</p><h2>Coordinates or CSV rows</h2><p>Paste one <code>longitude, latitude</code> pair per line. Geometry is checked before saving.</p></div><input value={plotNumber} onChange={(event) => setPlotNumber(event.target.value)} placeholder="Plot number, e.g. B-024" /><textarea value={plotCoordinates} onChange={(event) => setPlotCoordinates(event.target.value)} placeholder="7.1234, 9.1234&#10;7.1238, 9.1234&#10;7.1238, 9.1238" /><button type="button" onClick={() => void createPlot()}>Add approved plot</button></section>
          <section className="estate-create estate-plot-import"><div><p className="workflow-eyebrow">Map layer</p><h2>Road, drainage, open space, infrastructure</h2><p>Paste coordinate rows to add a visible operational layer.</p></div><select value={layerType} onChange={(event) => setLayerType(event.target.value)}><option value="road">Road</option><option value="drainage">Drainage</option><option value="open_space">Open space</option><option value="infrastructure">Infrastructure</option></select><input value={layerName} onChange={(event) => setLayerName(event.target.value)} placeholder="Layer name" /><textarea value={layerCoordinates} onChange={(event) => setLayerCoordinates(event.target.value)} placeholder="longitude, latitude per line" /><button type="button" onClick={() => void createLayer()}>Add layer</button></section>
          {layerGeojson.features.length > 0 && <section className="estate-create estate-layer-editor"><div><p className="workflow-eyebrow">Spatial layer editor</p><h2>Correct detected infrastructure</h2><p>Select a layer, adjust its coordinate rows, then save. Archiving removes it from the operational map without deleting its audit trail.</p></div><select value={selectedLayerId} onChange={(event) => selectLayerForEdit(event.target.value)}><option value="">Select a layer</option>{layerGeojson.features.map((feature: any) => <option key={feature.id} value={feature.id}>{feature.properties.name || feature.properties.type} #{feature.id}</option>)}</select>{selectedLayerId && <><textarea value={layerEditCoordinates} onChange={(event) => setLayerEditCoordinates(event.target.value)} /><button type="button" onClick={() => void updateLayer()}>Save geometry</button><button type="button" onClick={() => void archiveLayer()}>Archive layer</button></>}</section>}
          <section className="estate-create estate-block-editor"><div><p className="workflow-eyebrow">Estate structure</p><h2>Blocks</h2><p>Define block labels before assigning imported or manually created plots.</p></div><input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} placeholder="Block label, e.g. B" /><input value={blockName} onChange={(event) => setBlockName(event.target.value)} placeholder="Block name (optional)" /><button type="button" onClick={() => void createBlock()}>Add block</button><p>{blocks.map((block) => `${block.label}${block.name ? ` - ${block.name}` : ""}`).join(" · ") || "No blocks yet."}</p></section>
        </div>
      )}
    </EstateShell>
  );
}
