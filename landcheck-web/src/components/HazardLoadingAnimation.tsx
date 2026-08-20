import BrandedLoadingAnimation from "./BrandedLoadingAnimation";

type Props = {
  label?: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

export default function HazardLoadingAnimation(props: Props) {
  return <BrandedLoadingAnimation src="/LandCheck_Flood_Erosion_Loading_Animation.svg" {...props} />;
}
