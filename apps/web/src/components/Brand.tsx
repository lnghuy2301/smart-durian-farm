import logo from "@brand/01_Logos/SVG/logo-horizontal-color.svg";
import whiteLogo from "@brand/01_Logos/SVG/logo-horizontal-white.svg";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <img
      className="brand-logo"
      src={light ? whiteLogo : logo}
      alt="Smart Durian"
    />
  );
}
