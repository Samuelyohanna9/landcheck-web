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
import GreenWork from "./pages/GreenWork";
import GreenWorkLogin from "./pages/GreenWorkLogin";
import GreenPartnersLanding from "./pages/GreenPartnersLanding";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import SeoRouteMeta from "./components/SeoRouteMeta";
import PrivacyNoticeBanner from "./components/PrivacyNoticeBanner";
import { isGreenAuthed } from "./auth/greenAuth";
import { isWorkAuthed } from "./auth/workAuth";

function WorkProtectedRoute({ element }: { element: ReactElement }) {
  return isWorkAuthed() ? element : <Navigate to="/green-work/login" replace />;
}

function GreenProtectedRoute({ element }: { element: ReactElement }) {
  return isGreenAuthed() ? element : <Navigate to="/green/login" replace />;
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
        <Route path="/green" element={<GreenProtectedRoute element={<Green />} />} />
        <Route path="/green-work/login" element={<GreenWorkLogin />} />
        <Route path="/green-work" element={<WorkProtectedRoute element={<GreenWork />} />} />
        <Route path="/green-partners" element={<GreenPartnersLanding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
