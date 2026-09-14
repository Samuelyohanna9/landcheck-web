import type { ReactNode } from "react";
import EstateIcon from "./EstateIcon";

export default function EstateModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="edash-modal-overlay" onClick={onClose}>
      <div className="edash-modal" onClick={(event) => event.stopPropagation()}>
        <div className="edash-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="edash-modal-close" onClick={onClose} aria-label="Close">
            <EstateIcon name="close" />
          </button>
        </div>
        <div className="edash-modal-body">{children}</div>
      </div>
    </div>
  );
}
