import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "soft" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  soft: "btn-soft",
  danger: "btn-danger",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "btn",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
