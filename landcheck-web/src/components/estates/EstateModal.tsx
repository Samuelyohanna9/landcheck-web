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
  // Dismissal is close-button-or-Escape only, deliberately NOT click-outside: many of these
  // modals are multi-field forms (e.g. "Add staff"), and a misclick on the backdrop used to
  // silently discard everything the person had typed with no warning.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="edash-modal-overlay">
      <div className="edash-modal">
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
