import { cn } from "../../lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, className, style }: CardProps) {
  return (
    <div className={cn("card p-5", className)} style={style}>
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  /** subtle accent tone for the value + icon chip */
  accent?: "leaf" | "clay" | "gold" | "ink";
  subTone?: "up" | "down" | "muted";
}

const ACCENT_VALUE: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  leaf: "text-leaf-700",
  clay: "text-clay-700",
  gold: "text-gold-700",
  ink: "text-ink",
};

const ACCENT_CHIP: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  leaf: "bg-leaf-50 text-leaf-600",
  clay: "bg-clay-50 text-clay-600",
  gold: "bg-gold-100 text-gold-700",
  ink: "bg-sunk text-ink-soft",
};

const SUB_TONE: Record<NonNullable<MetricCardProps["subTone"]>, string> = {
  up: "text-leaf-600",
  down: "text-danger",
  muted: "text-ink-faint",
};

export function MetricCard({
  label,
  value,
  sub,
  icon,
  accent = "ink",
  subTone = "muted",
}: MetricCardProps) {
  return (
    <div className="card flex-1 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex items-center justify-center rounded-xl",
              ACCENT_CHIP[accent],
            )}
            style={{ width: 32, height: 32 }}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn("tnum font-display mt-3", ACCENT_VALUE[accent])}
        style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.05 }}
      >
        {value}
      </p>
      {sub && <p className={cn("mt-1.5 text-xs", SUB_TONE[subTone])}>{sub}</p>}
    </div>
  );
}
