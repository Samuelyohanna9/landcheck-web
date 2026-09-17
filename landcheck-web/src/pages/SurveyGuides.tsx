import { Link } from "react-router-dom";
import "../styles/survey-guides.css";

type GuideStep = {
  title: string;
  body: string;
};

type GuideSection = {
  number: string;
  id: string;
  kicker: string;
  title: string;
  intro: string;
  steps: GuideStep[];
  checks: string[];
};

const guideSections: GuideSection[] = [
  {
    number: "01",
    id: "survey-plan",
    kicker: "Survey plan production",
    title: "Create a survey plan",
    intro: "Build a review-ready plan from coordinate data, a parcel boundary, or an existing project record.",
    steps: [
      { title: "Open a new survey", body: "From the workspace, select Create New, then Survey. You can also open the Survey Plan tool from the Survey product page." },
      { title: "Choose units and coordinates", body: "Select the working unit and coordinate reference system before entering points. Confirm whether your source uses metres, feet, latitude and longitude, or a projected grid such as UTM." },
      { title: "Add or import points", body: "Enter each point with its station name and coordinate values, or import a supported coordinate file. Keep the point order consistent with the boundary traverse." },
      { title: "Close the parcel", body: "Connect the final point back to the first point. Check for duplicate points, crossed lines, missing corners, and an area that matches the source record." },
      { title: "Complete plan details", body: "Add the project title, location, client or owner details, surveyor information, and any notes needed on the final plan." },
      { title: "Run the final geometry check", body: "Review the plotted boundary, bearings, distances, area, labels, scale, north arrow, and coordinate schedule. Resolve warnings before approving the plan." },
      { title: "Export the approved plan", body: "Use the available export actions to produce the PDF, CAD, GIS, or coordinate output required by your team. Keep the source project in the workspace for later revisions." },
    ],
    checks: [
      "The coordinate system and units match the source survey data.",
      "The boundary closes without self-intersections or unexplained gaps.",
      "The displayed area and dimensions have been checked by the responsible survey professional.",
    ],
  },
  {
    number: "02",
    id: "subdivision",
    kicker: "Layout design",
    title: "Subdivide a parcel",
    intro: "Turn one estate boundary into a practical layout of plots, roads, reserves, and shared open space.",
    steps: [
      { title: "Start subdivision mode", body: "Select Create New, then Subdivision, or open an existing boundary and choose the subdivision workflow." },
      { title: "Confirm the estate boundary", body: "Draw, import, or select the boundary to divide. Check its total area and confirm that the boundary is in the correct coordinate system." },
      { title: "Set plot requirements", body: "Choose a target plot area, frontage, and unit. For familiar estate dimensions, enter the frontage and depth in metres or feet where the custom layout option is available." },
      { title: "Configure access and reserves", body: "Set internal road width, orientation, edge reserve, drainage reserve, and any open-space requirement. Use the criteria that match the estate brief and local planning expectations." },
      { title: "Generate the first layout", body: "Run the layout generator. LandCheck estimates the number of plots that fit inside the boundary after accounting for roads and reserves." },
      { title: "Review and fine-tune", body: "Inspect plot access, frontage, leftover areas, road continuity, labels, and plot sizes. Adjust the criteria and regenerate until the layout is usable." },
      { title: "Approve and export", body: "Complete the geometry check as the final step. Approve only after the boundary, plots, roads, reserves, and plot count are correct, then export the layout." },
    ],
    checks: [
      "Every plot has practical access and a readable identifier.",
      "Roads and reserves are included in the area calculation and are not counted as saleable plots.",
      "The total plot count is checked against the estate boundary and the selected dimensions.",
    ],
  },
  {
    number: "03",
    id: "georeference",
    kicker: "Map alignment",
    title: "Georeference a scanned plan",
    intro: "Place an existing paper or scanned layout on its correct real-world position so it can be compared with satellite or map data.",
    steps: [
      { title: "Create a georeference session", body: "Select Create New, then Georeference. Give the session a clear name and choose the coordinate reference system for the control points." },
      { title: "Upload the source plan", body: "Add the scanned plan or image at the best available resolution. Keep the original file unchanged so it remains available for comparison." },
      { title: "Choose known control points", body: "Identify points visible on both the scan and the map, such as survey beacons, road intersections, boundary corners, or other features with reliable coordinates." },
      { title: "Enter and distribute control points", body: "Place control points around the full plan rather than clustering them in one area. Enter their known coordinates and use clear labels for later review." },
      { title: "Align and inspect", body: "Run the alignment, then compare the scan against the basemap. Look for rotation, scale, offset, or distortion that indicates a control point needs correction." },
      { title: "Save the aligned session", body: "Save the georeferenced result only after the control points and overlay have been reviewed. Keep a note of the source, CRS, and any known limitations." },
    ],
    checks: [
      "Control points are identifiable on the source plan and the reference map.",
      "Points are spread across the plan and do not all sit along one line.",
      "The aligned boundary agrees with reliable map features and known survey information.",
    ],
  },
  {
    number: "04",
    id: "digitise",
    kicker: "Editable map data",
    title: "Digitise the aligned layout",
    intro: "Trace the useful features from a georeferenced plan into editable geometry that can be reviewed, measured, and exported.",
    steps: [
      { title: "Open the digitising workspace", body: "Continue from a georeference session or open the aligned plan in the digitising workflow. Keep the source image visible while tracing." },
      { title: "Trace the estate boundary", body: "Start with the outer boundary and follow each corner in order. Use snapping where available and close the polygon by connecting the final vertex to the first." },
      { title: "Add roads and reserves", body: "Trace access roads, drainage corridors, communal areas, and other non-plot features as separate layers so they remain easy to inspect." },
      { title: "Trace and identify plots", body: "Create one closed polygon for each plot. Add the plot number, block, area, and any source annotation needed by the register." },
      { title: "Validate the geometry", body: "Check that plot polygons do not overlap, do not extend outside the estate boundary, and do not leave unintended gaps. Compare important corners with the scan." },
      { title: "Run geometry check and save", body: "Use the geometry check as the final review step, correct any errors, and save the approved digitised layer for layout or estate operations." },
    ],
    checks: [
      "All polygons are closed and have the intended feature type.",
      "Plot identifiers are unique and match the source plan or estate register.",
      "Digitised features are reviewed against the scan before they are treated as approved data.",
    ],
  },
  {
    number: "05",
    id: "flood",
    kicker: "Hazard analysis",
    title: "Run a flood analysis",
    intro: "Screen a parcel or estate for flood exposure using the available terrain, hydrology, rainfall, and map evidence layers.",
    steps: [
      { title: "Open Hazard Analysis", body: "From the workspace or product page, choose Hazard Analysis and select Flood. Use an existing parcel or provide the boundary for the area to screen." },
      { title: "Confirm the analysis area", body: "Check the boundary, location, and coordinate system. For an estate, confirm whether you are screening the whole layout or selected plots." },
      { title: "Run the screening", body: "Start the flood analysis and wait for the result layers to load. The analysis may use separate signals for river, floodplain, rainfall, and elevation-related exposure." },
      { title: "Read the result", body: "Review the map, risk class, supporting indicators, and any unavailable-data notes. Compare the result with drainage, waterways, access roads, and the proposed development." },
      { title: "Save or export the report", body: "Keep the result with the project record and export the available report or map evidence for planning discussions and professional review." },
    ],
    checks: [
      "The assessed boundary is the intended site and is not accidentally offset.",
      "Unavailable data or low-confidence signals are recorded with the result.",
      "The screening is treated as an early risk indicator, not a replacement for engineering or regulatory review.",
    ],
  },
  {
    number: "06",
    id: "erosion",
    kicker: "Hazard analysis",
    title: "Run an erosion analysis",
    intro: "Assess terrain and surface conditions that may indicate susceptibility to soil erosion or ground instability.",
    steps: [
      { title: "Select Erosion", body: "Open Hazard Analysis, choose Erosion, and select the parcel, estate boundary, or plot group to assess." },
      { title: "Review site context", body: "Confirm the slope, drainage direction, exposed surfaces, access routes, and any mapped streams or low points visible around the site." },
      { title: "Run the analysis", body: "Start the erosion screening and allow the map layers and risk indicators to finish loading before interpreting the result." },
      { title: "Interpret the risk areas", body: "Use the risk class and map pattern to identify areas that may need drainage, slope protection, vegetation, or a more detailed geotechnical investigation." },
      { title: "Record the decision", body: "Save the result with the project and note the mitigation or follow-up action agreed by the responsible planner, engineer, or survey professional." },
    ],
    checks: [
      "The result is reviewed together with the actual site conditions and recent imagery.",
      "Proposed roads, drainage, and plot grading are considered alongside the erosion map.",
      "High-risk areas are referred for appropriate engineering or environmental assessment.",
    ],
  },
  {
    number: "07",
    id: "lulc",
    kicker: "Land cover intelligence",
    title: "Run a Land Use / Land Cover analysis",
    intro: "Use LULC classification to understand what is currently present on the site and how the land may change over time.",
    steps: [
      { title: "Open the LULC tool", body: "Start Hazard Analysis or the available land-cover workflow, then choose Land Use / Land Cover (LULC). Select the boundary to classify." },
      { title: "Set the period and area", body: "Confirm the analysis boundary and select the available imagery period or comparison dates where the tool provides that option." },
      { title: "Run the classification", body: "Start the analysis and wait for the classified map and summary to load. Common classes may include built-up areas, vegetation, bare ground, cropland, and water." },
      { title: "Review the classes", body: "Inspect the map legend, class areas, and percentage breakdown. Compare the result with the latest satellite image and known site information." },
      { title: "Compare or export", body: "Use available time comparisons to identify change, then save or export the map and summary for site planning, environmental review, or project reporting." },
    ],
    checks: [
      "The image date and cloud or visibility limitations are considered.",
      "Classification is checked against current satellite imagery and field knowledge.",
      "LULC output is used as planning evidence, not as a legal determination of ownership or land title.",
    ],
  },
];

const quickLinks = [
  { id: "survey-plan", label: "Survey plan" },
  { id: "subdivision", label: "Subdivision" },
  { id: "georeference", label: "Georeference" },
  { id: "digitise", label: "Digitise" },
  { id: "flood", label: "Flood" },
  { id: "erosion", label: "Erosion" },
  { id: "lulc", label: "LULC" },
];

function GuideIcon({ type }: { type: "survey" | "layout" | "map" | "hazard" }) {
  if (type === "layout") {
    return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.7" /></svg>;
  }
  if (type === "map") {
    return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  }
  if (type === "hazard") {
    return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 9 17H3L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M12 9v5M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 18V6l7-3 7 3v12l-7 3-7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M12 3v18M5 6l7 3 7-3" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

export default function SurveyGuides() {
  return (
    <main className="survey-guides-page">
      <header className="survey-guides-header">
        <div className="survey-guides-header-inner">
          <Link to="/" className="survey-guides-brand" aria-label="LandCheck home">
            <img src="/logo.svg" alt="LandCheck" width="132" height="36" />
            <span>Survey guides</span>
          </Link>
          <nav className="survey-guides-header-actions" aria-label="Guide actions">
            <Link to="/dashboard">Back to workspace</Link>
            <a href="mailto:support@landcheck.online?subject=LandCheck%20Survey%20Support">Contact support</a>
          </nav>
        </div>
      </header>

      <div className="survey-guides-layout">
        <aside className="survey-guides-sidebar">
          <div className="survey-guides-toc">
            <p>On this page</p>
            <nav aria-label="Guide sections">
              {quickLinks.map((item, index) => (
                <a key={item.id} href={`#${item.id}`}><span>{String(index + 1).padStart(2, "0")}</span>{item.label}</a>
              ))}
            </nav>
          </div>
          <div className="survey-guides-sidebar-note">
            <strong>Use real project data</strong>
            <p>Review every automated result against the source plan, field evidence, and the responsible professional's judgement.</p>
          </div>
        </aside>

        <article className="survey-guides-content">
          <section className="survey-guides-hero">
            <p className="survey-guides-kicker">LandCheck Survey</p>
            <h1>From raw coordinates to review-ready land records.</h1>
            <p className="survey-guides-hero-copy">A practical guide to creating survey plans, designing subdivisions, aligning and digitising scanned layouts, and screening sites for flood, erosion, and land-cover risk.</p>
            <div className="survey-guides-hero-actions">
              <Link to="/survey-plan" className="survey-guides-primary-action">Open Survey workspace</Link>
              <Link to="/hazard-analysis" className="survey-guides-secondary-action">Run hazard analysis</Link>
            </div>
            <div className="survey-guides-quick-grid" aria-label="Guide overview">
              <div><span>01</span><strong>Prepare</strong><small>Coordinates and source plans</small></div>
              <div><span>02</span><strong>Build</strong><small>Plans and estate layouts</small></div>
              <div><span>03</span><strong>Review</strong><small>Geometry and map evidence</small></div>
              <div><span>04</span><strong>Export</strong><small>Shareable project outputs</small></div>
            </div>
          </section>

          <div className="survey-guides-notice">
            <strong>Important:</strong> LandCheck assists with drafting, mapping, and screening. Confirm coordinates, boundaries, approvals, and professional conclusions before relying on any output for a transaction, construction, or regulatory submission.
          </div>

          {guideSections.map((section) => (
            <section className="survey-guide-section" id={section.id} key={section.id}>
              <header className="survey-guide-section-header">
                <span className="survey-guide-section-number">{section.number}</span>
                <div>
                  <p className="survey-guides-kicker">{section.kicker}</p>
                  <h2>{section.title}</h2>
                  <p>{section.intro}</p>
                </div>
              </header>
              <div className="survey-guide-steps">
                {section.steps.map((step, index) => (
                  <div className="survey-guide-step" key={step.title}>
                    <span className="survey-guide-step-number">{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="survey-guide-checks">
                <div className="survey-guide-checks-heading"><GuideIcon type={section.id === "survey-plan" ? "survey" : section.id === "subdivision" ? "layout" : section.id === "georeference" || section.id === "digitise" ? "map" : "hazard"} /><strong>Before you approve</strong></div>
                <ul>{section.checks.map((check) => <li key={check}>{check}</li>)}</ul>
              </div>
            </section>
          ))}

          <section className="survey-guides-closing">
            <p className="survey-guides-kicker">Next step</p>
            <h2>Keep the source, review the result, then export.</h2>
            <p>LandCheck keeps the working record and its outputs together so you can return to a boundary, layout, georeference session, or hazard result when the project changes.</p>
            <div className="survey-guides-hero-actions">
              <Link to="/dashboard" className="survey-guides-primary-action">Return to workspace</Link>
              <a href="mailto:support@landcheck.online?subject=LandCheck%20Survey%20Support" className="survey-guides-secondary-action">Ask for help</a>
            </div>
          </section>
        </article>
      </div>

      <footer className="survey-guides-footer">
        <span>LandCheck Survey</span>
        <span>Support: support@landcheck.online</span>
      </footer>
    </main>
  );
}
