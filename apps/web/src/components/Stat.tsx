import { Link } from "react-router-dom";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { number } from "./ui";

export function Stat({
  title,
  value,
  icon: Icon,
  to,
  note,
  accent = false,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  to: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <Link className={`stat-card ${accent ? "accent" : ""}`} to={to}>
      <div className="stat-top">
        <span>{title}</span>
        <span className="stat-icon">
          <Icon size={22} />
        </span>
      </div>
      <strong>{number(value)}</strong>
      <small>
        {note}
        <ArrowUpRight size={13} />
      </small>
    </Link>
  );
}
