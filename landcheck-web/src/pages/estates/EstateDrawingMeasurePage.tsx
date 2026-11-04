import { useSearchParams, useParams } from "react-router-dom";
import DrawingMeasureTool from "../../components/estates/DrawingMeasureTool";

// A standalone page for the live measure/markup tool - opened in its own browser tab (window.open)
// from EstateConstructionPage's "Measure" button rather than rendered inline, so a drawing can be
// measured in its own full-viewport space without losing the Construction tab's own state behind
// it. documentId comes from the route; filename/title travel as query params since the opener
// already has them in hand and a second fetch would just be a round trip for the same data.
export default function EstateDrawingMeasurePage() {
  const { documentId } = useParams();
  const [searchParams] = useSearchParams();
  const filename = searchParams.get("filename") || "";
  const title = searchParams.get("title") || filename || "Measure drawing";
  const parsedId = Number(documentId);

  if (!Number.isFinite(parsedId) || !filename) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0d10", color: "#9aa3ad", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
        This measurement link is missing information and can't be opened directly - go back to the Construction tab and click Measure on the drawing again.
      </div>
    );
  }

  return (
    <DrawingMeasureTool
      documentId={parsedId}
      filename={filename}
      title={title}
      onClose={() => {
        // window.close() only works on a tab the script itself opened (true here, since this page
        // only ever exists via window.open from EstateConstructionPage) - falls back to history for
        // the rare case of a bookmarked/shared link opened as the tab's very first page.
        window.close();
        setTimeout(() => { window.history.back(); }, 150);
      }}
    />
  );
}
