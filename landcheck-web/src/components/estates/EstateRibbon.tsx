import { useState } from "react";
import EstateIcon, { type EstateIconName } from "./EstateIcon";
import "../../styles/estate-ribbon.css";

export type EstateRibbonButton = {
  key: string;
  label: string;
  icon: EstateIconName;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
};

export type EstateRibbonGroup = {
  key: string;
  label: string;
  buttons: EstateRibbonButton[];
};

export type EstateRibbonTab = {
  key: string;
  label: string;
  groups: EstateRibbonGroup[];
};

// A RustGIS/ArcGIS-Pro-style ribbon: a row of tabs, each holding labeled groups of icon+label
// buttons. It only ever wraps existing page actions passed in via `tabs` - it doesn't own any
// business logic itself. Pages with few actions still get one tab ("Home") with one or two
// small groups, by design, for a consistent top strip across every Estate page.
export default function EstateRibbon({ tabs }: { tabs: EstateRibbonTab[] }) {
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.key || "");
  const current = tabs.find((tab) => tab.key === activeTabKey) || tabs[0];
  if (!tabs.length) return null;
  return (
    <div className="edash-ribbon">
      <div className="edash-ribbon-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`edash-ribbon-tab${tab.key === current?.key ? " active" : ""}`}
            onClick={() => setActiveTabKey(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="edash-ribbon-body">
        {current?.groups.map((group) => (
          <div key={group.key} className="edash-ribbon-group">
            <div className="edash-ribbon-group-buttons">
              {group.buttons.map((button) => (
                <button
                  key={button.key}
                  type="button"
                  className={`edash-ribbon-btn${button.active ? " active" : ""}`}
                  onClick={button.onClick}
                  disabled={button.disabled}
                  title={button.title || button.label}
                >
                  <EstateIcon name={button.icon} />
                  <span>{button.label}</span>
                </button>
              ))}
            </div>
            <div className="edash-ribbon-group-label">{group.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
