export type LifestyleSurface =
  | "bag"
  | "petMart"
  | "clinic"
  | "upgrade";

export type LifestyleNavSurface = LifestyleSurface;

export interface BottomNavProps {
  active: LifestyleSurface | null;
  disabled: boolean;
  onSelect: (surface: LifestyleNavSurface) => void;
}

const NAV_ITEMS: ReadonlyArray<{
  id: LifestyleNavSurface;
  icon: string;
  label: string;
}> = [
  { id: "bag", icon: "▣", label: "가방" },
  { id: "petMart", icon: "◇", label: "펫마트" },
  { id: "clinic", icon: "+", label: "병원" },
  { id: "upgrade", icon: "↗", label: "업그레이드" },
];

export function BottomNav({ active, disabled, onSelect }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="생활 메뉴">
      {NAV_ITEMS.map((item) => (
        <button
          type="button"
          key={item.id}
          className={active === item.id ? "is-active" : ""}
          disabled={disabled}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
