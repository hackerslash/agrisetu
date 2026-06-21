import { Sprout } from "lucide-react";

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
  titleSize = 17,
  badgeSize = 38,
  iconSize = 20,
  subtitle = "Vendor Portal",
}: BrandLogoProps) {
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center"
        style={{
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize * 0.32,
          backgroundColor: isDark
            ? "color-mix(in oklch, white 16%, transparent)"
            : "var(--color-leaf-600)",
          boxShadow: isDark ? "none" : "0 4px 12px oklch(0.47 0.115 150 / 0.28)",
        }}
      >
        <Sprout size={iconSize} color={isDark ? "#fff" : "var(--color-gold-300)"} />
      </div>
      <div>
        <p
          className="font-display leading-none"
          style={{
            fontSize: titleSize,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: isDark ? "#fff" : "var(--color-ink)",
          }}
        >
          AgriSetu
        </p>
        {subtitle && (
          <p
            className="leading-none"
            style={{
              fontSize: 11.5,
              marginTop: 4,
              fontWeight: 500,
              color: isDark
                ? "color-mix(in oklch, white 72%, transparent)"
                : "var(--color-ink-faint)",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
