import { useState } from "react";
import "../../styles/csv-preview-modal.css";
import "../../styles/technical-report-modal.css";

export type TechnicalReportFields = {
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

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initial: TechnicalReportFields;
  controlPointName: string;
  generating: boolean;
  progress?: number | null;
  onGenerate: (fields: TechnicalReportFields) => void;
};

const BASIC_INSTRUMENTS = [
  "Total Station",
  "Handheld GPS",
  "Measuring Tape",
  "Ranging Poles/Pegs",
  "Crowbar",
  "Handheld Trowel",
  "Laptop Computer",
  "AutoCAD Software",
  "MS Word",
  "Printer",
];

export default function TechnicalReportModal({
  isOpen,
  onClose,
  initial,
  controlPointName,
  generating,
  progress,
  onGenerate,
}: Props) {
  const [instruments, setInstruments] = useState<string[]>(initial.technical_report_instruments || []);
  const [otherInstrument, setOtherInstrument] = useState("");
  const [useDgps, setUseDgps] = useState(Boolean(initial.technical_report_dgps_type));
  const [dgpsType, setDgpsType] = useState(initial.technical_report_dgps_type || "");
  const [numSurveyors, setNumSurveyors] = useState(
    initial.technical_report_num_surveyors != null ? String(initial.technical_report_num_surveyors) : "1"
  );
  const [numTechnicalOfficers, setNumTechnicalOfficers] = useState(
    initial.technical_report_num_technical_officers != null ? String(initial.technical_report_num_technical_officers) : "1"
  );
  const [numLabourers, setNumLabourers] = useState(
    initial.technical_report_num_labourers != null ? String(initial.technical_report_num_labourers) : "2"
  );
  const [recceText, setRecceText] = useState(initial.technical_report_recce_text || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [demarcationText, setDemarcationText] = useState(initial.technical_report_demarcation_text || "");
  const [computationSoftwareText, setComputationSoftwareText] = useState(
    initial.technical_report_computation_software_text || "AutoCAD software"
  );
  const [plottingSoftwareText, setPlottingSoftwareText] = useState(
    initial.technical_report_plotting_software_text || "AutoCAD software"
  );
  const [generalObservationText, setGeneralObservationText] = useState(
    initial.technical_report_general_observation_text || "The work was hitch-free."
  );
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleInstrument = (label: string) => {
    setInstruments((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]));
  };

  const handleConfirm = () => {
    setError(null);
    if (!useDgps && instruments.length === 0 && !otherInstrument.trim()) {
      setError("Select at least one instrument used (or the DGPS used).");
      return;
    }
    if (useDgps && !dgpsType.trim()) {
      setError("Enter the DGPS type/model used.");
      return;
    }
    const surveyors = Number(numSurveyors);
    const technicalOfficers = Number(numTechnicalOfficers);
    const labourers = Number(numLabourers);
    if (!Number.isFinite(surveyors) || !Number.isFinite(technicalOfficers) || !Number.isFinite(labourers)) {
      setError("Enter the number of surveyors, technical officers, and labourers.");
      return;
    }
    if (!recceText.trim()) {
      setError("Describe where the control point tied to the work is located.");
      return;
    }

    const finalInstruments = [...instruments];
    if (otherInstrument.trim()) finalInstruments.push(otherInstrument.trim());

    onGenerate({
      technical_report_instruments: finalInstruments,
      technical_report_dgps_type: useDgps ? dgpsType.trim() : "",
      technical_report_num_surveyors: surveyors,
      technical_report_num_technical_officers: technicalOfficers,
      technical_report_num_labourers: labourers,
      technical_report_recce_text: recceText.trim(),
      technical_report_demarcation_text: demarcationText.trim(),
      technical_report_computation_software_text: computationSoftwareText.trim() || "AutoCAD software",
      technical_report_plotting_software_text: plottingSoftwareText.trim() || "AutoCAD software",
      technical_report_general_observation_text: generalObservationText.trim() || "The work was hitch-free.",
    });
  };

  return (
    <div className="csv-modal-overlay" onClick={onClose}>
      <div className="csv-modal tr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="csv-modal-header">
          <h3>Technical Report Details</h3>
          <button className="csv-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="csv-modal-body">
          <p className="tr-modal-intro">
            A few details from the field aren't captured elsewhere in the plan yet — fill these in to complete the
            Survey Technical Report.
          </p>

          <div className="tr-section">
            <h4>Instruments / Equipment Used</h4>
            <label className="tr-checkbox-row tr-dgps-row">
              <input type="checkbox" checked={useDgps} onChange={(e) => setUseDgps(e.target.checked)} />
              Differential GPS (DGPS)
            </label>
            {useDgps && (
              <input
                type="text"
                className="tr-text-input tr-dgps-input"
                placeholder="e.g. Hi-Target V30+ DGPS, Model VAPG"
                value={dgpsType}
                onChange={(e) => setDgpsType(e.target.value)}
              />
            )}
            <div className="tr-instrument-grid">
              {BASIC_INSTRUMENTS.map((label) => (
                <label key={label} className="tr-checkbox-row">
                  <input type="checkbox" checked={instruments.includes(label)} onChange={() => toggleInstrument(label)} />
                  {label}
                </label>
              ))}
            </div>
            <input
              type="text"
              className="tr-text-input"
              placeholder="Other instrument (optional)"
              value={otherInstrument}
              onChange={(e) => setOtherInstrument(e.target.value)}
            />
          </div>

          <div className="tr-section">
            <h4>Survey Party / Personnel</h4>
            <div className="tr-personnel-row">
              <label>
                Surveyors
                <input type="number" min={0} value={numSurveyors} onChange={(e) => setNumSurveyors(e.target.value)} />
              </label>
              <label>
                Technical officers
                <input
                  type="number"
                  min={0}
                  value={numTechnicalOfficers}
                  onChange={(e) => setNumTechnicalOfficers(e.target.value)}
                />
              </label>
              <label>
                Labourers
                <input type="number" min={0} value={numLabourers} onChange={(e) => setNumLabourers(e.target.value)} />
              </label>
            </div>
          </div>

          <div className="tr-section">
            <h4>Reconnaissance (RECCE)</h4>
            <p className="tr-field-hint">
              Control point: <strong>{controlPointName || "not set yet"}</strong> — describe where it's located.
            </p>
            <textarea
              className="tr-textarea"
              rows={2}
              placeholder="e.g. is located At Airport Round About Yola North Local Government Area"
              value={recceText}
              onChange={(e) => setRecceText(e.target.value)}
            />
          </div>

          <button type="button" className="tr-advanced-toggle" onClick={() => setShowAdvanced((prev) => !prev)}>
            {showAdvanced ? "Hide" : "Show"} additional details (optional)
          </button>
          {showAdvanced && (
            <div className="tr-section">
              <label className="tr-field-label">
                Demarcation beacon range (optional)
                <input
                  type="text"
                  className="tr-text-input"
                  placeholder="e.g. SCAD/9179-SCAD/9182"
                  value={demarcationText}
                  onChange={(e) => setDemarcationText(e.target.value)}
                />
              </label>
              <label className="tr-field-label">
                Computation software
                <input
                  type="text"
                  className="tr-text-input"
                  value={computationSoftwareText}
                  onChange={(e) => setComputationSoftwareText(e.target.value)}
                />
              </label>
              <label className="tr-field-label">
                Plotting software
                <input
                  type="text"
                  className="tr-text-input"
                  value={plottingSoftwareText}
                  onChange={(e) => setPlottingSoftwareText(e.target.value)}
                />
              </label>
              <label className="tr-field-label">
                General observation / suggestion
                <textarea
                  className="tr-textarea"
                  rows={2}
                  value={generalObservationText}
                  onChange={(e) => setGeneralObservationText(e.target.value)}
                />
              </label>
            </div>
          )}

          {error && <div className="csv-error">{error}</div>}
        </div>

        <div className="csv-modal-footer">
          <button className="csv-btn-cancel" onClick={onClose} disabled={generating}>
            Cancel
          </button>
          <button className="csv-btn-confirm" onClick={handleConfirm} disabled={generating}>
            {generating ? (
              <span className="download-progress" role="progressbar" aria-valuenow={Math.round(progress ?? 0)} aria-valuemin={0} aria-valuemax={100}>
                <span className="download-progress-track">
                  <span className="download-progress-fill" style={{ width: `${Math.round(progress ?? 0)}%` }} />
                </span>
                <span className="download-progress-pct">{Math.round(progress ?? 0)}%</span>
              </span>
            ) : (
              "Generate Report"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
