import { prefetchMapboxDrawBundle } from "./mapboxLoader";

type ConnectionLike = {
  effectiveType?: string;
  saveData?: boolean;
};

function getConnection() {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & {
    connection?: ConnectionLike;
    mozConnection?: ConnectionLike;
    webkitConnection?: ConnectionLike;
  }).connection
    || (navigator as Navigator & { mozConnection?: ConnectionLike }).mozConnection
    || (navigator as Navigator & { webkitConnection?: ConnectionLike }).webkitConnection
    || null;
}

function isLowBandwidthConnection() {
  const connection = getConnection();
  if (!connection) return false;
  if (connection.saveData) return true;
  return ["slow-2g", "2g", "3g"].includes(String(connection.effectiveType || "").toLowerCase());
}

let surveyPlanRoutePromise: Promise<unknown> | null = null;
let surveyPlanPreviewPromise: Promise<unknown> | null = null;
let surveyPlanDraftMapPromise: Promise<unknown> | null = null;
let surveyPlanIdlePrefetchScheduled = false;

export function prefetchSurveyPlanRoute() {
  if (!surveyPlanRoutePromise) {
    surveyPlanRoutePromise = Promise.all([
      import("../pages/SurveyPlan"),
      import("../components/survey-plan/SurveyPlanStepOnePanel"),
    ]).catch(() => undefined);
  }
  return surveyPlanRoutePromise;
}

export function prefetchSurveyPlanPreviewStep() {
  if (isLowBandwidthConnection()) {
    return prefetchSurveyPlanRoute();
  }
  if (!surveyPlanPreviewPromise) {
    surveyPlanPreviewPromise = Promise.all([
      prefetchSurveyPlanRoute(),
      import("../components/survey-plan/SurveyPlanSurveyPreviewStep"),
    ]).catch(() => undefined);
  }
  return surveyPlanPreviewPromise;
}

export function prefetchSurveyPlanDraftMapTools() {
  if (!surveyPlanDraftMapPromise) {
    surveyPlanDraftMapPromise = Promise.all([
      prefetchSurveyPlanRoute(),
      import("../components/MapViewEnhanced"),
      prefetchMapboxDrawBundle(),
    ]).catch(() => undefined);
  }
  return surveyPlanDraftMapPromise;
}

export function scheduleSurveyPlanIdlePrefetch() {
  if (surveyPlanIdlePrefetchScheduled || isLowBandwidthConnection() || typeof window === "undefined") {
    return;
  }
  surveyPlanIdlePrefetchScheduled = true;
  const warm = () => {
    void prefetchSurveyPlanRoute();
    void prefetchSurveyPlanPreviewStep();
  };
  if ("requestIdleCallback" in window && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warm, { timeout: 1800 });
    return;
  }
  window.setTimeout(warm, 1200);
}
