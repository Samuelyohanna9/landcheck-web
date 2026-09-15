import { useEffect, type ReactNode } from "react";
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
  // Standard modal dismissal trio: click-outside (the overlay's own onClick, below), close button,
  // and Escape - every modal in the app gets all three for free just by using this component.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
