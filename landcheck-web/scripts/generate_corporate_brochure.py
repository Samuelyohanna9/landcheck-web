from __future__ import annotations

from pathlib import Path
from textwrap import wrap


PAGE_WIDTH = 595
PAGE_HEIGHT = 842
MARGIN = 42


def pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class MiniPdf:
    def __init__(self) -> None:
        self._objects: list[str] = []

    def add_object(self, body: str) -> int:
        self._objects.append(body)
        return len(self._objects)

    def build(self) -> bytes:
        chunks = [b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"]
        offsets = [0]
        cursor = len(chunks[0])
        for index, body in enumerate(self._objects, start=1):
            encoded = f"{index} 0 obj\n{body}\nendobj\n".encode("latin-1")
            offsets.append(cursor)
            chunks.append(encoded)
            cursor += len(encoded)
        xref_offset = cursor
        xref = [f"xref\n0 {len(self._objects) + 1}\n".encode("latin-1"), b"0000000000 65535 f \n"]
        for offset in offsets[1:]:
            xref.append(f"{offset:010d} 00000 n \n".encode("latin-1"))
        trailer = (
            f"trailer\n<< /Size {len(self._objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
        ).encode("latin-1")
        return b"".join(chunks + xref + [trailer])


def rect(x: float, y: float, w: float, h: float, r: float, g: float, b: float) -> str:
    return f"{r:.3f} {g:.3f} {b:.3f} rg\n{x:.2f} {y:.2f} {w:.2f} {h:.2f} re f\n"


def stroke_rect(x: float, y: float, w: float, h: float, width: float, r: float, g: float, b: float) -> str:
    return f"{r:.3f} {g:.3f} {b:.3f} RG\n{width:.2f} w\n{x:.2f} {y:.2f} {w:.2f} {h:.2f} re S\n"


def line(x1: float, y1: float, x2: float, y2: float, width: float, r: float, g: float, b: float) -> str:
    return f"{r:.3f} {g:.3f} {b:.3f} RG\n{width:.2f} w\n{x1:.2f} {y1:.2f} m\n{x2:.2f} {y2:.2f} l S\n"


def text(x: float, y: float, font: str, size: float, value: str, r: float, g: float, b: float) -> str:
    return (
        "BT\n"
        f"/{font} {size:.2f} Tf\n"
        f"{r:.3f} {g:.3f} {b:.3f} rg\n"
        f"1 0 0 1 {x:.2f} {y:.2f} Tm\n"
        f"({pdf_escape(value)}) Tj\n"
        "ET\n"
    )


def paragraph(
    x: float,
    y: float,
    width_chars: int,
    font: str,
    size: float,
    leading: float,
    color: tuple[float, float, float],
    value: str,
) -> tuple[str, float]:
    commands: list[str] = []
    current_y = y
    for line_text in wrap(value, width_chars):
        commands.append(text(x, current_y, font, size, line_text, *color))
        current_y -= leading
    return "".join(commands), current_y


def bullet_list(
    x: float,
    y: float,
    width_chars: int,
    items: list[str],
    color: tuple[float, float, float],
    bullet_color: tuple[float, float, float] = (0.12, 0.53, 0.32),
) -> tuple[str, float]:
    commands: list[str] = []
    current_y = y
    for item in items:
        commands.append(rect(x, current_y + 4, 5, 5, *bullet_color))
        para, current_y = paragraph(x + 12, current_y, width_chars, "F3", 10.4, 13.2, color, item)
        commands.append(para)
        current_y -= 4
    return "".join(commands), current_y


def build_document(page_streams: list[str]) -> bytes:
    page_count = len(page_streams)
    page_obj_start = 3
    font_obj_start = page_obj_start + page_count
    stream_obj_start = font_obj_start + 4
    kids = " ".join(f"{page_obj_start + index} 0 R" for index in range(page_count))

    pdf = MiniPdf()
    pdf.add_object("<< /Type /Catalog /Pages 2 0 R >>")
    pdf.add_object(f"<< /Type /Pages /Count {page_count} /Kids [{kids}] >>")

    for index in range(page_count):
        content_obj = stream_obj_start + index
        pdf.add_object(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_obj_start} 0 R /F2 {font_obj_start + 1} 0 R "
            f"/F3 {font_obj_start + 2} 0 R /F4 {font_obj_start + 3} 0 R >> >> "
            f"/Contents {content_obj} 0 R >>"
        )

    pdf.add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pdf.add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    pdf.add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>")
    pdf.add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>")

    for stream in page_streams:
        pdf.add_object(f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream")

    return pdf.build()


def build_brochure() -> bytes:
    content: list[str] = []

    content.append(rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 0.972, 0.971, 0.962))
    content.append(rect(0, PAGE_HEIGHT - 188, PAGE_WIDTH, 188, 0.055, 0.165, 0.129))
    content.append(rect(MARGIN, PAGE_HEIGHT - 150, 164, 28, 0.898, 0.944, 0.912))
    content.append(text(MARGIN + 12, PAGE_HEIGHT - 141, "F2", 10.8, "LC GREEN CORPORATE", 0.102, 0.298, 0.209))
    content.append(text(MARGIN, PAGE_HEIGHT - 102, "F4", 27.5, "Verified CSR Implementation", 0.968, 0.979, 0.971))
    content.append(
        text(
            MARGIN,
            PAGE_HEIGHT - 132,
            "F3",
            14.5,
            "Tree planting, field verification, and stakeholder-ready reporting",
            0.844,
            0.904,
            0.869,
        )
    )
    hero_para, _ = paragraph(
        MARGIN,
        PAGE_HEIGHT - 162,
        69,
        "F3",
        10.6,
        13.2,
        (0.842, 0.906, 0.874),
        "LandCheck Green Corporate gives CSR managers, sustainability teams, NGOs, and donor-backed programmes a practical way to design projects, deploy field agents, verify GPS evidence, monitor maintenance, and prepare reporting outputs from one platform.",
    )
    content.append(hero_para)

    left_x = MARGIN
    right_x = 308
    top_y = PAGE_HEIGHT - 246
    box_w = 245
    box_h = 222

    for box_x in (left_x, right_x):
        content.append(rect(box_x, top_y - box_h, box_w, box_h, 1.0, 1.0, 0.998))
        content.append(stroke_rect(box_x, top_y - box_h, box_w, box_h, 1, 0.842, 0.886, 0.859))
        content.append(line(box_x, top_y - 26, box_x + box_w, top_y - 26, 1, 0.856, 0.904, 0.876))

    content.append(text(left_x + 16, top_y - 17, "F4", 14.2, "What LC Green delivers", 0.092, 0.219, 0.173))
    content.append(text(right_x + 16, top_y - 17, "F4", 14.2, "Why organisations buy", 0.092, 0.219, 0.173))

    left_items = [
        "Project planning with site, species, and implementation structure.",
        "Field-agent assignment with GPS-tagged capture and QR-linked workflow support.",
        "Supervisor review for planting, maintenance, and field-visit evidence.",
        "Premium export outputs for executive, donor, and public reporting.",
    ]
    right_items = [
        "Move from activity claims to verified implementation proof.",
        "Keep maintenance, survival, and evidence gaps visible after planting day.",
        "Give CSR, ESG, and communications teams cleaner reporting inputs.",
        "Create credibility before procurement with dashboards, brochures, and proof pages.",
    ]
    left_list, _ = bullet_list(left_x + 16, top_y - 50, 33, left_items, (0.294, 0.385, 0.349))
    right_list, _ = bullet_list(right_x + 16, top_y - 50, 33, right_items, (0.294, 0.385, 0.349))
    content.append(left_list)
    content.append(right_list)

    mid_y = 348
    content.append(text(MARGIN, mid_y + 114, "F4", 16, "Implementation flow", 0.091, 0.218, 0.173))
    content.append(line(MARGIN, mid_y + 104, PAGE_WIDTH - MARGIN, mid_y + 104, 1, 0.842, 0.889, 0.861))

    flow_cards = [
        ("01", "Design", "Define site, approval, species mix, and reporting scope."),
        ("02", "Deploy", "Assign field agents and monitor planting orders centrally."),
        ("03", "Verify", "Review GPS evidence, images, and implementation status."),
        ("04", "Report", "Export board-ready summaries and stakeholder proof."),
    ]
    start_x = MARGIN
    card_w = 122
    gap = 13
    for index, (step, title, desc) in enumerate(flow_cards):
        card_x = start_x + index * (card_w + gap)
        content.append(rect(card_x, mid_y, card_w, 92, 0.986, 0.989, 0.982))
        content.append(stroke_rect(card_x, mid_y, card_w, 92, 1, 0.858, 0.896, 0.872))
        content.append(text(card_x + 14, mid_y + 62, "F4", 12.4, step, 0.847, 0.61, 0.196))
        content.append(text(card_x + 14, mid_y + 44, "F4", 11.3, title, 0.09, 0.218, 0.173))
        para, _ = paragraph(card_x + 14, mid_y + 28, 18, "F3", 8.8, 11.0, (0.33, 0.43, 0.38), desc)
        content.append(para)

    lower_y = 176
    content.append(rect(MARGIN, lower_y, PAGE_WIDTH - (MARGIN * 2), 136, 0.088, 0.188, 0.151))
    content.append(text(MARGIN + 18, lower_y + 101, "F4", 16.2, "Proof pack on the website", 0.962, 0.978, 0.968))
    lower_items = [
        "Corporate landing page for CSR buyers",
        "Interactive dashboard screenshots and product video",
        "One-page brochure and sample report download",
        "Case-study story and public transparency experience",
        "SEO-ready insight articles around CSR, ESG, and GPS verification",
    ]
    lower_list, _ = bullet_list(
        MARGIN + 18,
        lower_y + 76,
        53,
        lower_items,
        (0.842, 0.906, 0.876),
        bullet_color=(0.878, 0.635, 0.202),
    )
    content.append(lower_list)
    content.append(text(MARGIN + 18, 97, "F4", 11.5, "Contact", 0.102, 0.298, 0.209))
    content.append(text(MARGIN + 18, 79, "F3", 10.4, "landcheck.online/green-partners", 0.174, 0.367, 0.289))
    content.append(text(MARGIN + 230, 79, "F3", 10.4, "landchecktech@gmail.com", 0.174, 0.367, 0.289))
    content.append(text(PAGE_WIDTH - MARGIN - 160, 79, "F3", 10.4, "LandCheck Geospatial Technologies", 0.174, 0.367, 0.289))

    return build_document(["".join(content)])


def build_sample_report() -> bytes:
    page_one: list[str] = []
    page_one.append(rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 0.983, 0.981, 0.973))
    page_one.append(rect(0, PAGE_HEIGHT - 96, PAGE_WIDTH, 96, 0.054, 0.158, 0.126))
    page_one.append(line(0, PAGE_HEIGHT - 96, PAGE_WIDTH, PAGE_HEIGHT - 96, 4, 0.85, 0.632, 0.228))
    page_one.append(text(MARGIN, PAGE_HEIGHT - 42, "F4", 21, "LandCheck Green Corporate", 0.968, 0.979, 0.971))
    page_one.append(text(MARGIN, PAGE_HEIGHT - 66, "F3", 12.4, "Sample CSR implementation report", 0.86, 0.92, 0.888))
    page_one.append(text(PAGE_WIDTH - 168, PAGE_HEIGHT - 42, "F3", 10.4, "Generated: 21 Jul 2026", 0.89, 0.94, 0.914))
    page_one.append(text(PAGE_WIDTH - 186, PAGE_HEIGHT - 60, "F3", 10.2, "For proposal and due-diligence use", 0.77, 0.86, 0.814))

    page_one.append(text(MARGIN, PAGE_HEIGHT - 128, "F4", 18, "Executive snapshot", 0.112, 0.215, 0.171))
    metric_y = PAGE_HEIGHT - 230
    metric_w = 118
    metric_gap = 12
    metrics = [
        ("10,000", "Target trees", "Approved implementation scope"),
        ("96%", "Evidence rate", "GPS plus photo proof coverage"),
        ("91%", "Survival", "Current approved survival view"),
        ("4", "Field zones", "Mapped delivery clusters"),
    ]
    for index, (value, label, sublabel) in enumerate(metrics):
        x = MARGIN + index * (metric_w + metric_gap)
        page_one.append(rect(x, metric_y, metric_w, 84, 1.0, 1.0, 0.998))
        page_one.append(stroke_rect(x, metric_y, metric_w, 84, 1, 0.854, 0.898, 0.87))
        page_one.append(text(x + 12, metric_y + 52, "F4", 20, value, 0.092, 0.22, 0.172))
        page_one.append(text(x + 12, metric_y + 34, "F4", 10.4, label, 0.262, 0.367, 0.322))
        note, _ = paragraph(x + 12, metric_y + 18, 16, "F3", 8.6, 10.6, (0.427, 0.505, 0.461), sublabel)
        page_one.append(note)

    page_one.append(text(MARGIN, 570, "F4", 16.4, "Programme brief", 0.112, 0.215, 0.171))
    brief, _ = paragraph(
        MARGIN,
        546,
        85,
        "F3",
        10.7,
        13.4,
        (0.254, 0.332, 0.297),
        "This sample report shows the kind of premium package a CSR manager receives from LandCheck Green Corporate. It combines implementation footprint, governance controls, evidence coverage, survival visibility, and clear next actions into one exportable record for internal review, donor communication, and board reporting.",
    )
    page_one.append(brief)

    left_x = MARGIN
    right_x = 304
    card_y = 354
    card_w = 249
    card_h = 152
    for box_x in (left_x, right_x):
        page_one.append(rect(box_x, card_y, card_w, card_h, 1.0, 1.0, 0.998))
        page_one.append(stroke_rect(box_x, card_y, card_w, card_h, 1, 0.854, 0.898, 0.87))

    page_one.append(text(left_x + 16, card_y + 124, "F4", 14.2, "Implementation footprint", 0.112, 0.215, 0.171))
    left_items = [
        "4 mapped field zones with polygon coverage already approved.",
        "Named field agents assigned through implementation orders.",
        "Species allocation can be attached at assignment stage for QR-tag printing.",
        "Supervisor review keeps planting, maintenance, and evidence status aligned.",
    ]
    left_list, _ = bullet_list(left_x + 16, card_y + 98, 29, left_items, (0.294, 0.385, 0.349))
    page_one.append(left_list)

    page_one.append(text(right_x + 16, card_y + 124, "F4", 14.2, "Governance and controls", 0.112, 0.215, 0.171))
    right_items = [
        "Assignment logs show who was instructed, when, and for which site.",
        "GPS coordinates and photos remain tied to each verified record.",
        "Outstanding risks and low-evidence zones are visible before reporting.",
        "Public proof pages and certificates can extend transparency externally.",
    ]
    right_list, _ = bullet_list(right_x + 16, card_y + 98, 29, right_items, (0.294, 0.385, 0.349))
    page_one.append(right_list)

    band_y = 172
    page_one.append(rect(MARGIN, band_y, PAGE_WIDTH - (MARGIN * 2), 126, 0.092, 0.188, 0.153))
    page_one.append(text(MARGIN + 18, band_y + 94, "F4", 15.6, "Reporting highlights", 0.968, 0.979, 0.971))
    highlights = [
        "Evidence-backed reporting supports leadership updates, partner briefings, and external storytelling.",
        "Mapped implementation coverage reduces ambiguity about where activity actually happened.",
        "Maintenance visibility helps teams speak honestly about programme quality after planting day.",
        "Exports are designed to support sustainability, CSR, donor, and communications workflows.",
    ]
    highlight_list, _ = bullet_list(
        MARGIN + 18,
        band_y + 70,
        54,
        highlights,
        (0.862, 0.924, 0.89),
        bullet_color=(0.878, 0.635, 0.202),
    )
    page_one.append(highlight_list)
    page_one.append(text(MARGIN, 72, "F3", 9.6, "Sample only. Live client exports include current programme values and verified field records.", 0.37, 0.46, 0.421))
    page_one.append(text(PAGE_WIDTH - 168, 72, "F3", 9.6, "landcheck.online", 0.37, 0.46, 0.421))

    page_two: list[str] = []
    page_two.append(rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 0.983, 0.981, 0.973))
    page_two.append(rect(0, PAGE_HEIGHT - 84, PAGE_WIDTH, 84, 0.056, 0.161, 0.127))
    page_two.append(text(MARGIN, PAGE_HEIGHT - 42, "F4", 19.5, "Implementation register sample", 0.968, 0.979, 0.971))
    page_two.append(text(PAGE_WIDTH - 158, PAGE_HEIGHT - 42, "F3", 10.2, "Page 2 of 2", 0.86, 0.92, 0.888))

    table_x = MARGIN
    table_y = 478
    table_w = PAGE_WIDTH - (MARGIN * 2)
    table_h = 244
    page_two.append(rect(table_x, table_y, table_w, table_h, 1.0, 1.0, 0.998))
    page_two.append(stroke_rect(table_x, table_y, table_w, table_h, 1, 0.854, 0.898, 0.87))
    page_two.append(rect(table_x, table_y + table_h - 34, table_w, 34, 0.932, 0.951, 0.939))
    page_two.append(text(table_x + 12, table_y + table_h - 22, "F4", 10.6, "Site / Stakeholder", 0.112, 0.215, 0.171))
    page_two.append(text(table_x + 228, table_y + table_h - 22, "F4", 10.6, "Trees", 0.112, 0.215, 0.171))
    page_two.append(text(table_x + 286, table_y + table_h - 22, "F4", 10.6, "Alive", 0.112, 0.215, 0.171))
    page_two.append(text(table_x + 342, table_y + table_h - 22, "F4", 10.6, "Evidence", 0.112, 0.215, 0.171))
    page_two.append(text(table_x + 434, table_y + table_h - 22, "F4", 10.6, "Status", 0.112, 0.215, 0.171))
    rows = [
        ("Adamawa urban belt | school corridor", "2,500", "2,304", "97%", "Active"),
        ("Community resilience cluster | river buffer", "3,000", "2,761", "95%", "Monitored"),
        ("Corporate volunteer grove | pilot site", "1,500", "1,396", "99%", "Verified"),
        ("Peri-urban restoration strip | access road", "3,000", "2,672", "94%", "Needs follow-up"),
    ]
    current_y = table_y + table_h - 58
    for row in rows:
        page_two.append(line(table_x, current_y, table_x + table_w, current_y, 0.8, 0.89, 0.922, 0.902))
        page_two.append(text(table_x + 12, current_y - 16, "F3", 10.2, row[0], 0.247, 0.333, 0.298))
        page_two.append(text(table_x + 230, current_y - 16, "F3", 10.2, row[1], 0.247, 0.333, 0.298))
        page_two.append(text(table_x + 288, current_y - 16, "F3", 10.2, row[2], 0.247, 0.333, 0.298))
        page_two.append(text(table_x + 346, current_y - 16, "F3", 10.2, row[3], 0.247, 0.333, 0.298))
        page_two.append(text(table_x + 436, current_y - 16, "F3", 10.2, row[4], 0.247, 0.333, 0.298))
        current_y -= 44

    risk_y = 202
    risk_w = table_w
    risk_h = 214
    page_two.append(rect(MARGIN, risk_y, risk_w, risk_h, 1.0, 1.0, 0.998))
    page_two.append(stroke_rect(MARGIN, risk_y, risk_w, risk_h, 1, 0.854, 0.898, 0.87))
    page_two.append(text(MARGIN + 16, risk_y + 184, "F4", 14.6, "Risk, care cadence, and next actions", 0.112, 0.215, 0.171))
    risk_items = [
        "Low-survival pockets should trigger targeted maintenance revisits, not only year-end reporting notes.",
        "Client exports should distinguish between approved records, rejected submissions, and evidence still outstanding.",
        "Where public or donor visibility is needed, link the report to a public proof page or certificate route for selected sites.",
        "Use this register alongside map snapshots, field photos, and timeline charts in the live reporting package.",
    ]
    risk_list, _ = bullet_list(MARGIN + 16, risk_y + 156, 62, risk_items, (0.294, 0.385, 0.349))
    page_two.append(risk_list)
    page_two.append(text(MARGIN, 78, "F3", 9.5, "Sample CSR reporting asset for premium sales and due-diligence conversations.", 0.37, 0.46, 0.421))
    page_two.append(text(PAGE_WIDTH - 210, 78, "F3", 9.5, "Live dashboards, proof pages, and exports powered by LandCheck", 0.37, 0.46, 0.421))

    return build_document(["".join(page_one), "".join(page_two)])


def main() -> None:
    public_dir = Path(__file__).resolve().parents[1] / "public"
    brochure_output = public_dir / "lc-green-corporate-brochure.pdf"
    report_output = public_dir / "lc-green-csr-sample-report.pdf"

    brochure_output.write_bytes(build_brochure())
    report_output.write_bytes(build_sample_report())

    print(f"Wrote {brochure_output}")
    print(f"Wrote {report_output}")


if __name__ == "__main__":
    main()
