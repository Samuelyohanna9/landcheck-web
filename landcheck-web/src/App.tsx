import { lazy, Suspense, type ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SeoRouteMeta from "./components/SeoRouteMeta";
import PrivacyNoticeBanner from "./components/PrivacyNoticeBanner";
import { getGreenAuthSession, isGreenAuthed, isSponsorGreenSession } from "./auth/greenAuth";
import { isWorkAuthed } from "./auth/workAuth";
import LandingPage from "./pages/LandingPage";

const SurveyPlan = lazy(() => import("./pages/SurveyPlan"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Feedback = lazy(() => import("./pages/Feedback"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const HazardAnalysis = lazy(() => import("./pages/HazardAnalysis"));
const Green = lazy(() => import("./pages/Green"));
const GreenLogin = lazy(() => import("./pages/GreenLogin"));
const GreenSponsor = lazy(() => import("./pages/GreenSponsor"));
const GreenMerchantDashboard = lazy(() => import("./pages/GreenMerchantDashboard"));
const GreenWork = lazy(() => import("./pages/GreenWork"));
const GreenWorkLogin = lazy(() => import("./pages/GreenWorkLogin"));
const GreenPartnersLanding = lazy(() => import("./pages/GreenPartnersLanding"));
const GreenPublicSponsor = lazy(() => import("./pages/GreenPublicSponsor"));
const GreenFootprintCalculator = lazy(() => import("./pages/GreenFootprintCalculator"));
const SurveyPlanLanding = lazy(() => import("./pages/SurveyPlanLanding"));
const FloodAnalysisLanding = lazy(() => import("./pages/FloodAnalysisLanding"));
const CareersPage = lazy(() => import("./pages/CareersPage"));
const NewsPage = lazy(() => import("./pages/NewsPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const DonorImpactPage = lazy(() => import("./pages/DonorImpactPage"));

function WorkProtectedRoute({ element }: { element: ReactElement }) {
  return isWorkAuthed() ? element : <Navigate to="/green-work/login" replace />;
}

function GreenProtectedRoute({ element }: { element: ReactElement }) {
  return isGreenAuthed() ? element : <Navigate to="/green/login" replace />;
}

function MerchantProtectedRoute({ element }: { element: ReactElement }) {
  const session = getGreenAuthSession();
  if (!session || !isSponsorGreenSession(session)) {
    return <Navigate to="/green/login" state={{ from: "/green-merchant" }} replace />;
  }
  // A merchant landing on the wrong dashboard route is a routing mistake, not an auth
  // failure — send individual/organization sponsors back to their own dashboard instead
  // of erroring, since they do have a valid session, just not this one.
  if (session.user?.account_type !== "merchant") return <Navigate to="/green" replace />;
  return element;
}

function GreenRouteSwitch() {
  const session = getGreenAuthSession();
  if (session && isSponsorGreenSession(session)) {
    // Merchants live on their own dedicated route (/green-merchant), not this shared
    // public-sponsor / organization-sponsor route.
    if (session.user?.account_type === "merchant") return <Navigate to="/green-merchant" replace />;
    return <GreenSponsor />;
  }
  return <Green />;
}

export default function App() {
  return (
    <BrowserRouter>
      <SeoRouteMeta />
      <PrivacyNoticeBanner />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/survey-plan" element={<SurveyPlan />} />
          <Route path="/hazard-analysis" element={<HazardAnalysis />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/green/login" element={<GreenLogin />} />
          <Route path="/green/login/:authRoute" element={<GreenLogin />} />
          <Route path="/green" element={<GreenProtectedRoute element={<GreenRouteSwitch />} />} />
          <Route path="/green-merchant" element={<MerchantProtectedRoute element={<GreenMerchantDashboard />} />} />
          <Route path="/green-work/login" element={<GreenWorkLogin />} />
          <Route path="/green-work" element={<WorkProtectedRoute element={<GreenWork />} />} />
          <Route path="/survey" element={<SurveyPlanLanding />} />
          <Route path="/flood" element={<FloodAnalysisLanding />} />
          <Route path="/career" element={<CareersPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/green-partners" element={<GreenPartnersLanding />} />
          <Route path="/sponsor" element={<GreenPublicSponsor />} />
          <Route path="/sponsor/calculator" element={<GreenFootprintCalculator />} />
          <Route path="/impact/:orgSlug" element={<DonorImpactPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
