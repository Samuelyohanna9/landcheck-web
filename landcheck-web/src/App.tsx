import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SurveyPlan from "./pages/SurveyPlan";
import Dashboard from "./pages/Dashboard";
import Feedback from "./pages/Feedback";
import AdminDashboard from "./pages/AdminDashboard";
import HazardAnalysis from "./pages/HazardAnalysis";
import Green from "./pages/Green";
import GreenWork from "./pages/GreenWork";
import GreenPartnersLanding from "./pages/GreenPartnersLanding";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/survey-plan" element={<SurveyPlan />} />
        <Route path="/hazard-analysis" element={<HazardAnalysis />} />
        <Route path="/green" element={<Green />} />
        <Route path="/green-work" element={<GreenWork />} />
        <Route path="/green-partners" element={<GreenPartnersLanding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
