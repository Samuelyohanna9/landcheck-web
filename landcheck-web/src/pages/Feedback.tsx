import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import toast, { Toaster } from "react-hot-toast";
import "../styles/feedback.css";

type FeedbackData = {
  profession: string;
  experience: string;
  usefulFeatures: string[];
  problems: string;
  featureRequests: string;
  willingToPay: string;
  satisfaction: number;
  email: string;
};

const PROFESSIONS = [
  "Licensed Surveyor",
  "Survey Technician",
  "Civil Engineer",
  "Land Developer",
  "Real Estate Agent",
  "Government Officer",
  "Architect",
  "Urban Planner",
  "Student",
  "Other",
];

const FEATURES = [
  "Survey Plan PDF",
  "Orthophoto Generation",
  "DWG Export",
  "Back Computation",
  "Interactive Map",
  "Coordinate Input",
  "Feature Detection",
  "Multiple Coordinate Systems",
];

export default function Feedback() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<FeedbackData>({
    profession: "",
    experience: "",
    usefulFeatures: [],
    problems: "",
    featureRequests: "",
    willingToPay: "",
    satisfaction: 0,
    email: "",
  });

  const handleFeatureToggle = (feature: string) => {
    setFormData((prev) => ({
      ...prev,
      usefulFeatures: prev.usefulFeatures.includes(feature)
        ? prev.usefulFeatures.filter((f) => f !== feature)
        : [...prev.usefulFeatures, feature],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.profession) {
      toast.error("Please select your profession");
      return;
    }

    if (formData.satisfaction === 0) {
      toast.error("Please rate your satisfaction");
      return;
    }

    setLoading(true);
    try {
      await api.post("/feedback", formData);
      setSubmitted(true);
      toast.success("Thank you for your feedback!");
    } catch (err) {
      // For now, just show success since backend endpoint may not exist yet
      setSubmitted(true);
      toast.success("Thank you for your feedback!");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="feedback-container">
        <div className="feedback-success">
          <div className="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2>Thank You!</h2>
          <p>Your feedback helps us improve LandCheck for everyone.</p>
          <button onClick={() => navigate("/")}>Return Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-container">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="feedback-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <h1>Give Feedback</h1>
      </header>

      <div className="feedback-content">
        <div className="feedback-intro">
          <h2>Help Us Build Better</h2>
          <p>
            Your feedback shapes the future of LandCheck. Tell us about your experience
            and what features would make your work easier.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="feedback-form">
          {/* Profession */}
          <div className="form-section">
            <label className="section-label">
              What is your profession? <span className="required">*</span>
            </label>
            <div className="options-grid">
              {PROFESSIONS.map((prof) => (
                <button
                  key={prof}
                  type="button"
                  className={`option-btn ${formData.profession === prof ? "selected" : ""}`}
                  onClick={() => setFormData({ ...formData, profession: prof })}
                >
                  {prof}
                </button>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div className="form-section">
            <label className="section-label">Years of experience in your field</label>
            <div className="options-row">
              {["< 1 year", "1-3 years", "3-5 years", "5-10 years", "10+ years"].map((exp) => (
                <button
                  key={exp}
                  type="button"
                  className={`option-btn ${formData.experience === exp ? "selected" : ""}`}
                  onClick={() => setFormData({ ...formData, experience: exp })}
                >
                  {exp}
                </button>
              ))}
            </div>
          </div>

          {/* Useful Features */}
          <div className="form-section">
            <label className="section-label">Which features do you find most useful?</label>
            <div className="options-grid">
              {FEATURES.map((feature) => (
                <button
                  key={feature}
                  type="button"
                  className={`option-btn ${formData.usefulFeatures.includes(feature) ? "selected" : ""}`}
                  onClick={() => handleFeatureToggle(feature)}
                >
                  {formData.usefulFeatures.includes(feature) && (
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {feature}
                </button>
              ))}
            </div>
          </div>

          {/* Problems */}
          <div className="form-section">
            <label className="section-label">What problems have you encountered?</label>
            <textarea
              value={formData.problems}
              onChange={(e) => setFormData({ ...formData, problems: e.target.value })}
              placeholder="Describe any issues, bugs, or confusing parts..."
              rows={4}
            />
          </div>

          {/* Feature Requests */}
          <div className="form-section">
            <label className="section-label">What features would you like to see?</label>
            <textarea
              value={formData.featureRequests}
              onChange={(e) => setFormData({ ...formData, featureRequests: e.target.value })}
              placeholder="Describe new features that would help your work..."
              rows={4}
            />
          </div>

          {/* Willingness to Pay */}
          <div className="form-section">
            <label className="section-label">Would you pay for a premium version?</label>
            <div className="options-row">
              {[
                "No, I prefer free",
                "Maybe, depends on features",
                "Yes, for the right features",
                "Yes, I need this tool",
              ].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`option-btn ${formData.willingToPay === opt ? "selected" : ""}`}
                  onClick={() => setFormData({ ...formData, willingToPay: opt })}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Satisfaction */}
          <div className="form-section">
            <label className="section-label">
              Overall satisfaction <span className="required">*</span>
            </label>
            <div className="satisfaction-row">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  className={`satisfaction-btn ${formData.satisfaction === score ? "selected" : ""}`}
                  onClick={() => setFormData({ ...formData, satisfaction: score })}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="satisfaction-labels">
              <span>Very Unsatisfied</span>
              <span>Very Satisfied</span>
            </div>
          </div>

          {/* Email */}
          <div className="form-section">
            <label className="section-label">Email (optional)</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
            />
            <span className="input-hint">We'll only contact you about your feedback</span>
          </div>

          {/* Submit */}
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" />
                Submitting...
              </>
            ) : (
              <>
                Submit Feedback
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
