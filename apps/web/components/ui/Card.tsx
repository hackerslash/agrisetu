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

export function MetricCard({
  label,
  value,
  sub,
  icon,
  color,
}: MetricCardProps) {
  return (
    <Card className="flex-1">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <p style={{ fontSize: 13, color: "#A0A0A0" }}>{label}</p>
          <p
            className="font-bold"
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 28,
              color: color ?? "#1A1A1A",
            }}
          >
            {value}
          </p>
          {sub && <p style={{ fontSize: 12, color: "#A0A0A0" }}>{sub}</p>}
        </div>
        {icon && (
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 44,
              height: 44,
              backgroundColor: "#F7F5F0",
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
