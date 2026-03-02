import { Leaf } from "lucide-react";

type BrandTheme = "light" | "dark";

interface BrandLogoProps {
  theme?: BrandTheme;
  titleSize?: number;
  badgeSize?: number;
  iconSize?: number;
  subtitle?: string;
}

export function BrandLogo({
  theme = "light",
  titleSize = 16,
  badgeSize = 36,
  iconSize = 18,
  subtitle = "Vendor Portal",
}: BrandLogoProps) {
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: badgeSize,
          height: badgeSize,
          backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "#2C5F2D",
        }}
      >
        <Leaf size={iconSize} color={isDark ? "#FCF6F5" : "#FCF6F5"} />
      </div>
      <div>
        <p
          className="font-bold leading-none"
          style={{
            fontFamily: "Plus Jakarta Sans",
            fontSize: titleSize,
            color: isDark ? "#FCF6F5" : "#1A1A1A",
          }}
        >
          AgriSetu
        </p>
        <p
          className="leading-none mt-0.5"
          style={{
            fontSize: 12,
            color: isDark ? "rgba(252,246,245,0.7)" : "#A0A0A0",
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
