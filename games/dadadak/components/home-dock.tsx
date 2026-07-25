import { MousePointerClick, Sparkles, Timer, Trophy } from "lucide-react";
import Link from "next/link";

// primary는 강조 항목에만 붙으므로, 없는 항목까지 포함하도록 타입을 명시한다.
const ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof Timer;
  primary?: boolean;
}> = [
  { href: "/solo", label: "솔로 측정", icon: Timer, primary: true },
  { href: "/tap", label: "집중 딸깍", icon: MousePointerClick },
  { href: "/rank", label: "랭킹", icon: Trophy },
  { href: "/clicker", label: "클리커", icon: Sparkles },
];

export function HomeDock() {
  return (
    <nav className="grid grid-cols-4 gap-2" aria-label="주요 메뉴">
      {ITEMS.map(({ href, label, icon: Icon, primary }) => (
        <Link
          key={href}
          href={href}
          className={`dock-icon ${
            primary
              ? "border-primary-edge bg-primary text-primary-ink"
              : "border-surface-border bg-surface"
          }`}
        >
          <Icon
            className={`h-[18px] w-[18px] ${primary ? "" : "text-dim"}`}
            aria-hidden
          />
          <span className="text-[11px]">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
