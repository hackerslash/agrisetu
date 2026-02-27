import { cn } from "../../lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, className, style }: CardProps) {
  return (
    <div className={cn("bg-white rounded-2xl p-5", className)} style={style}>
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  color?: string;
}

export function MetricCard({ label, value, sub, icon }: MetricCardProps) {
  return (
    <Card className="flex-1" style={{ padding: 20 }}>
      <div className="flex flex-col gap-3">
        {/* Top row: label + icon */}
        <div className="flex items-center justify-between">
          <p style={{ fontSize: 13, fontWeight: 500, color: "#A0A0A0" }}>
            {label}
          </p>
          {icon && (
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 32,
                height: 32,
                backgroundColor: "rgba(44,95,45,0.09)",
              }}
            >
              {icon}
            </div>
          )}
        </div>
        {/* Large value */}
        <p
          style={{
            fontFamily: "Plus Jakarta Sans",
            fontSize: 36,
            fontWeight: 700,
            color: "#2C5F2D",
            lineHeight: 1,
          }}
        >
          {value}
        </p>
        {/* Sub */}
        {sub && <p style={{ fontSize: 12, color: "#A0A0A0" }}>{sub}</p>}
      </div>
    </Card>
  );
}
