import React from "react";
import { Activity, Briefcase, Calendar, CheckCircle2, ShoppingBag } from "lucide-react";

type SidebarProps = {
  activeTab: string;
  onChange: (tabId: string) => void;
};

const MENU = [
  { id: "dashboard", icon: Activity, label: "상태" },
  { id: "job", icon: Briefcase, label: "직장" },
  { id: "shop", icon: ShoppingBag, label: "쇼핑" },
  { id: "inventory", icon: ShoppingBag, label: "인벤" },
  { id: "history", icon: Calendar, label: "기록" },
  { id: "quest", icon: CheckCircle2, label: "퀘스트" },
] as const;

export default function Sidebar({ activeTab, onChange }: SidebarProps) {
  return (
    <nav className="w-20 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 gap-6 shrink-0">
      {MENU.map((menu) => (
        <button
          key={menu.id}
          onClick={() => onChange(menu.id)}
          className={`flex flex-col items-center gap-1 w-full py-2 transition-colors relative ${
            activeTab === menu.id ? "text-indigo-600" : "text-gray-400"
          }`}
        >
          <menu.icon size={24} strokeWidth={activeTab === menu.id ? 2.5 : 2} />
          <span className="text-[10px] font-medium">{menu.label}</span>
          {activeTab === menu.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r-full" />}
        </button>
      ))}
    </nav>
  );
}
