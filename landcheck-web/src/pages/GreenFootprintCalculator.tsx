import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GpsIcon from "../components/GpsIcon";
import "../styles/green-public-sponsor.css";
import "../styles/green-footprint-calculator.css";

// Rough, defensible global emission factors — sourced from Our World in Data,
// USDA Forest Service, Poore & Nemecek (2018), and the University of Michigan
// Center for Sustainable Systems. This is intentionally a quick estimate, not
// a precise personal audit — it exists to translate everyday habits into a
// tree-sponsorship number, not to replace a professional carbon audit.

type TransportMode = "none" | "occasional" | "regular" | "frequent";
type TransportFuel = "petrol" | "electric";
type EnergyLevel = "low" | "average" | "high";
type GeneratorUse = "none" | "occasional" | "frequent" | "constant";
type Diet = "meat-heavy" | "average" | "vegetarian" | "vegan";

const TRANSPORT_KM_PER_YEAR: Record<TransportMode, number> = {
  none: 0,
  occasional: 4000,
  regular: 12000,
  frequent: 25000,
};
const TRANSPORT_KG_PER_KM: Record<TransportFuel, number> = { petrol: 0.17, electric: 0.09 };
const FLIGHT_SHORT_HAUL_KG = 500; // round trip, regional/domestic, economy
const FLIGHT_LONG_HAUL_KG = 1800; // round trip, international, economy
const ENERGY_KG_PER_YEAR: Record<EnergyLevel, number> = { low: 600, average: 1400, high: 2800 };
const GENERATOR_KG_PER_YEAR: Record<GeneratorUse, number> = { none: 0, occasional: 150, frequent: 600, constant: 1500 };
const DIET_KG_PER_YEAR: Record<Diet, number> = { "meat-heavy": 3300, average: 2500, vegetarian: 1700, vegan: 1500 };
const SHARED_BASELINE_KG = 1000; // goods, services & public infrastructure — everyone's share, per common footprint-calculator practice
const TREE_ABSORPTION_KG_PER_YEAR = 21;

const TRANSPORT_OPTIONS: { value: TransportMode; label: string; hint: string }[] = [
  { value: "none", label: "I don't drive", hint: "Walk, cycle, or public transit" },
  { value: "occasional", label: "Occasional driver", hint: "A few short trips a week" },
  { value: "regular", label: "Regular driver", hint: "Daily commute" },
  { value: "frequent", label: "Frequent driver", hint: "Long distances most days" },
];

const ENERGY_OPTIONS: { value: EnergyLevel; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Small home, efficient appliances" },
  { value: "average", label: "Average", hint: "Typical household usage" },
  { value: "high", label: "High", hint: "Large home, AC or heating most days" },
];

const GENERATOR_OPTIONS: { value: GeneratorUse; label: string; hint: string }[] = [
  { value: "none", label: "Never", hint: "Reliable grid power" },
  { value: "occasional", label: "Occasionally", hint: "A few hours a week" },
  { value: "frequent", label: "Frequently", hint: "Several hours most days" },
  { value: "constant", label: "Almost always", hint: "Runs most of the day" },
];

const DIET_OPTIONS: { value: Diet; label: string; hint: string }[] = [
  { value: "meat-heavy", label: "Meat with most meals", hint: "Beef, lamb, or dairy-heavy" },
  { value: "average", label: "Average diet", hint: "Meat a few times a week" },
  { value: "vegetarian", label: "Vegetarian", hint: "No meat or fish" },
  { value: "vegan", label: "Vegan", hint: "No animal products" },
];

const STEPS = ["Transport", "Flights", "Home Energy", "Diet", "Results"] as const;

export default function GreenFootprintCalculator() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [transportMode, setTransportMode] = useState<TransportMode | null>(null);
  const [transportFuel, setTransportFuel] = useState<TransportFuel>("petrol");
  const [shortHaulFlights, setShortHaulFlights] = useState(0);
  const [longHaulFlights, setLongHaulFlights] = useState(0);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | null>(null);
  const [generatorUse, setGeneratorUse] = useState<GeneratorUse | null>(null);
  const [diet, setDiet] = useState<Diet | null>(null);

  const breakdown = useMemo(() => {
    const transportKg = transportMode && transportMode !== "none"
      ? TRANSPORT_KM_PER_YEAR[transportMode] * TRANSPORT_KG_PER_KM[transportFuel]
      : 0;
    const flightsKg = shortHaulFlights * FLIGHT_SHORT_HAUL_KG + longHaulFlights * FLIGHT_LONG_HAUL_KG;
    const energyKg = energyLevel ? ENERGY_KG_PER_YEAR[energyLevel] : 0;
    const generatorKg = generatorUse ? GENERATOR_KG_PER_YEAR[generatorUse] : 0;
    const dietKg = diet ? DIET_KG_PER_YEAR[diet] : 0;
    const totalKg = transportKg + flightsKg + energyKg + generatorKg + dietKg + SHARED_BASELINE_KG;
    const treesNeeded = Math.max(1, Math.ceil(totalKg / TREE_ABSORPTION_KG_PER_YEAR));
    return {
      transportKg, flightsKg, energyKg, generatorKg, dietKg,
      baselineKg: SHARED_BASELINE_KG,
      totalKg,
      treesNeeded,
    };
  }, [transportMode, transportFuel, shortHaulFlights, longHaulFlights, energyLevel, generatorUse, diet]);

  const canAdvance = useMemo(() => {
    if (step === 0) return transportMode !== null;
    if (step === 1) return true; // flight counts default to 0, always valid
    if (step === 2) return energyLevel !== null && generatorUse !== null;
    if (step === 3) return diet !== null;
    return true;
  }, [step, transportMode, energyLevel, generatorUse, diet]);

  const goNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const resetCalculator = () => {
    setStep(0);
    setTransportMode(null);
    setTransportFuel("petrol");
    setShortHaulFlights(0);
    setLongHaulFlights(0);
    setEnergyLevel(null);
    setGeneratorUse(null);
    setDiet(null);
  };

  const goSponsor = () => {
    navigate(`/sponsor?suggested_qty=${breakdown.treesNeeded}`);
  };

  const breakdownRows = [
    { label: "Transport", kg: breakdown.transportKg, icon: "car" },
    { label: "Flights", kg: breakdown.flightsKg, icon: "plane" },
    { label: "Home energy", kg: breakdown.energyKg, icon: "bolt" },
    { label: "Backup generator", kg: breakdown.generatorKg, icon: "bolt" },
    { label: "Diet", kg: breakdown.dietKg, icon: "meal" },
    { label: "Everyday essentials", kg: breakdown.baselineKg, icon: "package" },
  ].filter((row) => row.kg > 0);
  const maxRowKg = Math.max(1, ...breakdownRows.map((r) => r.kg));

  return (
    <div className="gps-page gfc-page">
      <header className="gfc-topbar">
        <a href="/sponsor" className="gfc-back-link"><GpsIcon name="arrow-left" className="gps-icon-inline" /> Back to Sponsor</a>
        <span className="gfc-topbar-brand"><GpsIcon name="leaf" className="gps-icon" /> LandCheck Green</span>
      </header>

      <main className="gfc-main">
        <div className="gfc-intro">
          <span className="gfc-intro-icon"><GpsIcon name="calculator" className="gps-icon" /></span>
          <h1>How Many Trees Suit You?</h1>
          <p>Answer a few quick questions about your everyday habits — wherever in the world you live — and we'll estimate your annual carbon footprint and how many trees would offset it.</p>
        </div>

        {step < STEPS.length - 1 && (
          <div className="gfc-progress" aria-hidden="true">
            {STEPS.slice(0, -1).map((label, i) => (
              <div key={label} className={`gfc-progress-step${i === step ? " active" : ""}${i < step ? " done" : ""}`}>
                <span className="gfc-progress-dot">{i < step ? <GpsIcon name="check-circle" className="gps-icon-inline" /> : i + 1}</span>
                <span className="gfc-progress-label">{label}</span>
              </div>
            ))}
          </div>
        )}

        <section className="gfc-card">
          {step === 0 && (
            <>
              <h2><GpsIcon name="car" className="gps-icon-inline" /> How do you usually get around?</h2>
              <div className="gfc-option-grid">
                {TRANSPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`gfc-option-card${transportMode === opt.value ? " selected" : ""}`}
                    onClick={() => setTransportMode(opt.value)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
              {transportMode && transportMode !== "none" && (
                <div className="gfc-subfield">
                  <span>What does it run on?</span>
                  <div className="gfc-toggle-row">
                    <button type="button" className={transportFuel === "petrol" ? "selected" : ""} onClick={() => setTransportFuel("petrol")}>Petrol / Diesel</button>
                    <button type="button" className={transportFuel === "electric" ? "selected" : ""} onClick={() => setTransportFuel("electric")}>Electric</button>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h2><GpsIcon name="plane" className="gps-icon-inline" /> How many flights do you take per year?</h2>
              <p className="gfc-hint">Count round trips. If you're not sure, a rough guess is fine.</p>
              <div className="gfc-stepper-row">
                <div className="gfc-stepper-field">
                  <span>Short-haul / domestic <em>(under ~3 hrs)</em></span>
                  <div className="gfc-stepper">
                    <button type="button" onClick={() => setShortHaulFlights((v) => Math.max(0, v - 1))} aria-label="Decrease">−</button>
                    <strong>{shortHaulFlights}</strong>
                    <button type="button" onClick={() => setShortHaulFlights((v) => Math.min(50, v + 1))} aria-label="Increase">+</button>
                  </div>
                </div>
                <div className="gfc-stepper-field">
                  <span>Long-haul / international <em>(over ~6 hrs)</em></span>
                  <div className="gfc-stepper">
                    <button type="button" onClick={() => setLongHaulFlights((v) => Math.max(0, v - 1))} aria-label="Decrease">−</button>
                    <strong>{longHaulFlights}</strong>
                    <button type="button" onClick={() => setLongHaulFlights((v) => Math.min(50, v + 1))} aria-label="Increase">+</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2><GpsIcon name="bolt" className="gps-icon-inline" /> Home energy use</h2>
              <div className="gfc-option-grid">
                {ENERGY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`gfc-option-card${energyLevel === opt.value ? " selected" : ""}`}
                    onClick={() => setEnergyLevel(opt.value)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
              <div className="gfc-subfield">
                <span>Do you regularly use a petrol/diesel backup generator?</span>
                <div className="gfc-option-grid">
                  {GENERATOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`gfc-option-card${generatorUse === opt.value ? " selected" : ""}`}
                      onClick={() => setGeneratorUse(opt.value)}
                    >
                      <strong>{opt.label}</strong>
                      <span>{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2><GpsIcon name="meal" className="gps-icon-inline" /> Which best describes your diet?</h2>
              <div className="gfc-option-grid">
                {DIET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`gfc-option-card${diet === opt.value ? " selected" : ""}`}
                    onClick={() => setDiet(opt.value)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <div className="gfc-results">
              <span className="gfc-results-icon"><GpsIcon name="tree" className="gps-icon" /></span>
              <p className="gfc-results-lead">Your estimated footprint is about</p>
              <strong className="gfc-results-total">{(breakdown.totalKg / 1000).toFixed(1)} tons CO₂ / year</strong>
              <p className="gfc-results-sub">
                Sponsoring <strong>{breakdown.treesNeeded}</strong> tree{breakdown.treesNeeded === 1 ? "" : "s"} a year would help offset that
                (at roughly {TREE_ABSORPTION_KG_PER_YEAR}kg of CO₂ absorbed per tree, per year).
              </p>

              <div className="gfc-breakdown">
                {breakdownRows.map((row) => (
                  <div className="gfc-breakdown-row" key={row.label}>
                    <span className="gfc-breakdown-label"><GpsIcon name={row.icon} className="gps-icon-inline" /> {row.label}</span>
                    <div className="gfc-breakdown-bar-track">
                      <div className="gfc-breakdown-bar" style={{ width: `${Math.max(4, (row.kg / maxRowKg) * 100)}%` }} />
                    </div>
                    <span className="gfc-breakdown-kg">{Math.round(row.kg)} kg</span>
                  </div>
                ))}
              </div>

              <div className="gfc-results-ctas">
                <button type="button" className="gps-primary-btn full" onClick={goSponsor}>
                  Sponsor {breakdown.treesNeeded} Tree{breakdown.treesNeeded === 1 ? "" : "s"} Now <GpsIcon name="arrow-right" className="gps-icon-inline" />
                </button>
                <button type="button" className="gfc-restart-btn" onClick={resetCalculator}>
                  <GpsIcon name="refresh" className="gps-icon-inline" /> Recalculate
                </button>
              </div>
              <p className="gfc-disclaimer">
                This is a rough global estimate to help you choose a sponsorship size — not a precise personal carbon audit.
              </p>
            </div>
          )}

          {step < STEPS.length - 1 && (
            <div className="gfc-nav-row">
              <button type="button" className="gfc-nav-back" onClick={goBack} disabled={step === 0}>
                <GpsIcon name="arrow-left" className="gps-icon-inline" /> Back
              </button>
              <button type="button" className="gps-primary-btn" onClick={goNext} disabled={!canAdvance}>
                {step === STEPS.length - 2 ? "See My Results" : "Next"} <GpsIcon name="arrow-right" className="gps-icon-inline" />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
