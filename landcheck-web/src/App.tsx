import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SurveyPlan from "./pages/SurveyPlan";
import Dashboard from "./pages/Dashboard";
import Feedback from "./pages/Feedback";
import AdminDashboard from "./pages/AdminDashboard";
import HazardAnalysis from "./pages/HazardAnalysis";
import Green from "./pages/Green";
import GreenLogin from "./pages/GreenLogin";
import GreenSponsor from "./pages/GreenSponsor";
import GreenWork from "./pages/GreenWork";
import GreenWorkLogin from "./pages/GreenWorkLogin";
import GreenPartnersLanding from "./pages/GreenPartnersLanding";
import SurveyPlanLanding from "./pages/SurveyPlanLanding";
import FloodAnalysisLanding from "./pages/FloodAnalysisLanding";
import CareersPage from "./pages/CareersPage";
import NewsPage from "./pages/NewsPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DonorImpactPage from "./pages/DonorImpactPage";
import SeoRouteMeta from "./components/SeoRouteMeta";
import PrivacyNoticeBanner from "./components/PrivacyNoticeBanner";
import { getGreenAuthSession, isGreenAuthed, isSponsorGreenSession } from "./auth/greenAuth";
import { isWorkAuthed } from "./auth/workAuth";

function WorkProtectedRoute({ element }: { element: ReactElement }) {
  return isWorkAuthed() ? element : <Navigate to="/green-work/login" replace />;
}

function GreenProtectedRoute({ element }: { element: ReactElement }) {
  return isGreenAuthed() ? element : <Navigate to="/green/login" replace />;
}

function GreenRouteSwitch() {
  const session = getGreenAuthSession();
  if (session && isSponsorGreenSession(session)) return <GreenSponsor />;
  return <Green />;
}

export default function App() {
  return (
    <BrowserRouter>
      <SeoRouteMeta />
      <PrivacyNoticeBanner />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/survey-plan" element={<SurveyPlan />} />
        <Route path="/hazard-analysis" element={<HazardAnalysis />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/green/login" element={<GreenLogin />} />
        <Route path="/green/login/:authRoute" element={<GreenLogin />} />
        <Route path="/green" element={<GreenProtectedRoute element={<GreenRouteSwitch />} />} />
        <Route path="/green-work/login" element={<GreenWorkLogin />} />
        <Route path="/green-work" element={<WorkProtectedRoute element={<GreenWork />} />} />
        <Route path="/survey" element={<SurveyPlanLanding />} />
        <Route path="/flood" element={<FloodAnalysisLanding />} />
        <Route path="/career" element={<CareersPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/green-partners" element={<GreenPartnersLanding />} />
        <Route path="/impact/:orgSlug" element={<DonorImpactPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
