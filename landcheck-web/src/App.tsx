import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SurveyPlan from "./pages/SurveyPlan";
import Dashboard from "./pages/Dashboard";
import Feedback from "./pages/Feedback";
import AdminDashboard from "./pages/AdminDashboard";
import HazardAnalysis from "./pages/HazardAnalysis";
import Green from "./pages/Green";
import GreenWork from "./pages/GreenWork";
import GreenWorkLogin from "./pages/GreenWorkLogin";
import GreenPartnersLanding from "./pages/GreenPartnersLanding";
import SeoRouteMeta from "./components/SeoRouteMeta";
import { isWorkAuthed } from "./auth/workAuth";

function WorkProtectedRoute({ element }: { element: ReactElement }) {
  return isWorkAuthed() ? element : <Navigate to="/green-work/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <SeoRouteMeta />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/survey-plan" element={<SurveyPlan />} />
        <Route path="/hazard-analysis" element={<HazardAnalysis />} />
        <Route path="/green" element={<Green />} />
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
