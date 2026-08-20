import BrandedLoadingAnimation from "./BrandedLoadingAnimation";

type Props = {
  label?: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

export default function GreenLoadingAnimation(props: Props) {
  return <BrandedLoadingAnimation src="/LandCheck_Green_Loading_Animation.svg" aspectRatio={1} {...props} />;
}
