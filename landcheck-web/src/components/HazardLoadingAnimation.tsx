import GreenLoadingAnimation from "./GreenLoadingAnimation";

type Props = {
  label?: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

// Previously rendered public/LandCheck_Flood_Erosion_Loading_Animation.svg - its own large,
// illustrated animation, in the same style the Survey one used to be before it was switched to
// this same shared mark (see SurveyLoadingAnimation's comment for the reasoning: a wide
// illustration with its own hardcoded backdrop assumptions isn't theme-aware, so every new
// context it's dropped into is a potential new mismatch). Hazard follows that same precedent now,
// for the same reason, and so the whole app uses one consistent brand mark for "loading" rather
// than five different illustrations.
export default function HazardLoadingAnimation(props: Props) {
  return <GreenLoadingAnimation {...props} />;
}
