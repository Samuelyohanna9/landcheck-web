import { createPortal } from "react-dom";
import { useEffect, type ReactNode } from "react";

export type CoordinateTableColumn = {
  key: string;
  label: string;
};

export type CoordinateTableRow = {
  id: string;
  cells: ReactNode[];
};

type Props = {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  columns: CoordinateTableColumn[];
  rows: CoordinateTableRow[];
  onClose: () => void;
};

export default function GeoreferenceCoordinateTableModal({
  isOpen,
  title,
  subtitle,
  columns,
  rows,
  onClose,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="georef-coordinate-table-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="georef-coordinate-table-modal" role="dialog" aria-modal="true" aria-labelledby="georef-coordinate-table-title">
        <header className="georef-coordinate-table-modal-header">
          <div>
            <span className="georef-coordinate-table-modal-kicker">Coordinate table</span>
            <h2 id="georef-coordinate-table-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="georef-coordinate-table-modal-close" onClick={onClose} aria-label="Close coordinate table">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="georef-coordinate-table-modal-meta">
          <span>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
          <span>All values shown</span>
        </div>

        <div className="georef-coordinate-table-modal-table-wrap">
          {rows.length ? (
            <table className="georef-coordinate-table-modal-table">
              <thead>
                <tr>
                  {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, index) => <td key={`${row.id}-${columns[index]?.key || index}`}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="georef-coordinate-table-modal-empty">No coordinate rows are available yet.</div>
          )}
        </div>

        <footer className="georef-coordinate-table-modal-footer">
          <button type="button" className="geo-btn geo-btn-primary" onClick={onClose}>Close table</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
