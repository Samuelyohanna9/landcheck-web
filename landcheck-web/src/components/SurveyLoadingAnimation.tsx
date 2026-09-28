import GreenLoadingAnimation from "./GreenLoadingAnimation";

type Props = {
  label?: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

// Used only for in-context loading (waiting on a raster upload, a subdivision recompute, a topo
// preview render) - never the app's own initial load screen (App.tsx uses GreenLoadingAnimation
// directly for that, the same compact mark this delegates to). The previous version rendered
// public/LandCheck_Survey_Loading_Animation.svg: a large (320x135+) illustrated scene whose
// wordmark is coloured for a dark backdrop (#F1F5F9, near-white). Survey Plan's light theme put
// that text on a near-white card, which made it read as barely-there grey - not a small tweak,
// the asset just isn't theme-aware, so every in-page use of it had the same problem waiting to
// happen. This ring is a plain white badge regardless of the page behind it.
export default function SurveyLoadingAnimation(props: Props) {
  return <GreenLoadingAnimation {...props} />;
}
