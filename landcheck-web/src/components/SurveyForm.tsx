import { useState } from "react";

export type SurveyFormData = {
  title_text: string;
  scale_text: string;
  location_text: string;
  lga_text: string;
  state_text: string;
  station_text: string;
  surveyor_name: string;
  surveyor_rank: string;
  station_names: string[];
};

type Props = {
  onPreview: (data: SurveyFormData) => void;
  onGeneratePDF: (data: SurveyFormData) => void;
};

export default function SurveyForm({ onPreview, onGeneratePDF }: Props) {
  const [form, setForm] = useState<SurveyFormData>({
    title_text: "SURVEY PLAN",
    scale_text: "1 : 1000",
    location_text: "",
    lga_text: "",
    state_text: "",
    station_text: "",
    surveyor_name: "",
    surveyor_rank: "",
    station_names: [],
  });

  const [stationsText, setStationsText] = useState("");

  const update = (k: keyof SurveyFormData, v: any) => {
    setForm({ ...form, [k]: v });
  };

  const applyStations = () => {
    const arr = stationsText
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    update("station_names", arr);
  };

  return (
    <div style={box}>
      <h3>Survey Plan Details</h3>

      <div style={grid}>
        <Field label="Title">
          <input value={form.title_text} onChange={e => update("title_text", e.target.value)} />
        </Field>

        <Field label="Scale">
          <select
            value={form.scale_text}
            onChange={e => update("scale_text", e.target.value)}
          >
            <option>1 : 500</option>
            <option>1 : 1000</option>
            <option>1 : 2000</option>
            <option>1 : 5000</option>
            <option value="custom">Custom</option>
          </select>

          {form.scale_text === "custom" && (
            <input
              placeholder="e.g. 1 : 750"
              onChange={e => update("scale_text", e.target.value)}
            />
          )}
        </Field>

        <Field label="Location">
          <input value={form.location_text} onChange={e => update("location_text", e.target.value)} />
        </Field>

        <Field label="LGA">
          <input value={form.lga_text} onChange={e => update("lga_text", e.target.value)} />
        </Field>

        <Field label="State">
          <input value={form.state_text} onChange={e => update("state_text", e.target.value)} />
        </Field>

        <Field label="Station">
          <input value={form.station_text} onChange={e => update("station_text", e.target.value)} />
        </Field>

        <Field label="Surveyor Name">
          <input value={form.surveyor_name} onChange={e => update("surveyor_name", e.target.value)} />
        </Field>

        <Field label="Surveyor Rank">
          <input value={form.surveyor_rank} onChange={e => update("surveyor_rank", e.target.value)} />
        </Field>
      </div>

      <Field label="Station Names (comma separated)">
        <input
          placeholder="A,B,C,D"
          value={stationsText}
          onChange={e => setStationsText(e.target.value)}
          onBlur={applyStations}
        />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button onClick={() => onPreview(form)}>Preview Plan</button>
        <button onClick={() => onGeneratePDF(form)}>Generate PDF</button>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 12, color: "#555" }}>{label}</label>
      {children}
    </div>
  );
}

const box: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 12,
  marginTop: 10,
  borderRadius: 6,
  background: "#fafafa",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};
