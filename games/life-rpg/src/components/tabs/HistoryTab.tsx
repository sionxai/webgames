import React from "react";
import { AlertTriangle, ArrowDown, Clock, Gem, ShoppingBag } from "lucide-react";

import { ACTIONS, STATS_DEF } from "@/lib/constants";
import { formatChangeValue, formatMoney } from "@/lib/utils";
import type { ActionId, StatKey } from "@/types/game";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoryTabProps = any;

export default function HistoryTab(props: HistoryTabProps) {
  const { logs, aggregateLogStats } = props;

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="font-bold text-lg">행동 히스토리</h2>
        <span className="text-xs text-gray-500">최근 기록</span>
      </div>
      {logs.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
          {(() => {
            const { statsDelta, moneyDelta } = aggregateLogStats(logs);
            return (
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span
                  className={`px-2 py-1 rounded-full font-bold flex items-center gap-1 ${moneyDelta >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                    }`}
                >
                  <Gem size={12} /> 자산 {moneyDelta >= 0 ? "+" : ""}
                  {formatMoney(moneyDelta)}
                </span>
                {Object.entries(statsDelta).map(([key, value]) => {
                  if (!STATS_DEF[key as StatKey]) return null;
                  const Icon = STATS_DEF[key as StatKey].icon;
                  const formatted = formatChangeValue(value as number);
                  return (
                    <span
                      key={key}
                      className={`px-2 py-1 rounded-full font-bold flex items-center gap-1 ${(value as number) >= 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-600"
                        }`}
                    >
                      <Icon size={12} /> {STATS_DEF[key as StatKey].label} {(value as number) >= 0 ? "+" : ""}
                      {formatted}
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
      <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
        {logs.length === 0 ? (
          <div className="p-10 text-center text-gray-400">기록이 없습니다.</div>
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          logs.map((log: any, index: number) => (
            <div
              key={`${log.id}-${index}`}
              className={`p-4 transition-colors ${log.category === "gap" ? "bg-yellow-50 dark:bg-yellow-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${log.category === "gap"
                        ? "bg-yellow-100 text-yellow-600"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }`}
                  >
                    {log.category === "gap" ? (
                      <Clock size={18} />
                    ) : log.category === "purchase" ? (
                      <ShoppingBag size={18} />
                    ) : log.category === "decay" ? (
                      <ArrowDown size={18} />
                    ) : ACTIONS[log.category as ActionId] ? (
                      React.createElement(ACTIONS[log.category as ActionId].icon, { size: 18 })
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-gray-800 dark:text-gray-200">
                      {log.category === "gap"
                        ? log.label
                        : log.category === "decay"
                          ? log.label || "능력치 자연 감소"
                          : ACTIONS[log.category as ActionId]?.label || log.label || "Unknown"}
                    </div>
                    <div className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {log.duration} <span className="text-xs text-gray-400 font-sans">min</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 pl-12">
                {(() => {
                  const moneyChange =
                    typeof log.changes?.money === "number" ? log.changes.money : typeof log.money === "number" ? log.money : 0;
                  if (moneyChange === 0) return null;
                  return (
                    <span
                      className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${moneyChange > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}
                    >
                      <Gem size={10} /> ${moneyChange > 0 ? "+" : "-"}
                      {formatMoney(Math.abs(moneyChange))}
                    </span>
                  );
                })()}
                {Object.entries(log.changes ?? log.gains ?? {}).map(([key, value]) => {
                  if (!STATS_DEF[key as StatKey]) return null;
                  const changeValue = typeof value === "number" ? value : Number(value);
                  if (!Number.isFinite(changeValue) || changeValue === 0) return null;
                  const Icon = STATS_DEF[key as StatKey].icon;
                  const formatted = formatChangeValue(changeValue);
                  return (
                    <span
                      key={key}
                      className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${changeValue < 0 ? "bg-red-100 text-red-600" : `bg-gray-100 dark:bg-gray-800 ${STATS_DEF[key as StatKey].color}`
                        }`}
                    >
                      <Icon size={10} />
                      {STATS_DEF[key as StatKey].label} {changeValue > 0 ? "+" : ""}
                      {formatted}
                    </span>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
