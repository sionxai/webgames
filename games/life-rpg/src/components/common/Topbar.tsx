import React from "react";
import { AlertTriangle, Cloud, Eye, EyeOff, Gem, RefreshCw, User, Briefcase } from "lucide-react";

import { formatMoney, toNumber } from "@/lib/utils";

type TopbarProps = {
  dndMode: boolean;
  isOfflineMode: boolean;
  isSyncing: boolean;
  level: number;
  money: number;
  jobLabel: string;
  nickname: string;
  onOpenAuth: () => void;
  onToggleDnd: () => void;
};

export default function Topbar({
  dndMode,
  isOfflineMode,
  isSyncing,
  level,
  money,
  jobLabel,
  nickname,
  onOpenAuth,
  onToggleDnd,
}: TopbarProps) {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm z-10 p-4 flex justify-between items-center shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenAuth}
          className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-colors"
          aria-label="계정"
        >
          <User size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold leading-tight flex items-center gap-2">
            Life RPG v28.0
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                isOfflineMode ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-600"
              }`}
            >
              {isOfflineMode ? (
                <AlertTriangle size={10} />
              ) : isSyncing ? (
                <RefreshCw size={10} className="animate-spin" />
              ) : (
                <Cloud size={10} />
              )}
              {isOfflineMode ? "Offline (local)" : "Online"}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
            <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
              Lv.{level}
            </span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-mono font-bold text-sm bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded border border-green-100 dark:border-green-800">
              <Gem size={12} /> ${formatMoney(toNumber(money, 0))}
            </span>
            <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
              <Briefcase size={12} /> {jobLabel}
            </span>
            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
              <User size={12} />
              {nickname}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={onToggleDnd}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-700"
      >
        {dndMode ? <EyeOff size={14} /> : <Eye size={14} />} 몰입
      </button>
    </header>
  );
}
