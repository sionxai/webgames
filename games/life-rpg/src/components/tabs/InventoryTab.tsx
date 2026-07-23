import React from "react";
import { ShoppingBag } from "lucide-react";

import { ACTIONS, STATS_DEF } from "@/lib/constants";
import type { ActionId, StatKey } from "@/types/game";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InventoryTabProps = any;

export default function InventoryTab(props: InventoryTabProps) {
  const {
    ownedItems,
    dailyMealUses,
    remainingMeals,
    consumableList,
    consumables,
    consumeItem,
    showEffectSummary,
    setShowEffectSummary,
    passiveSummary,
  } = props;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <ShoppingBag size={18} /> 인벤토리 & 효과
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-500 uppercase">보유 아이템</div>
            <div className="flex flex-wrap gap-2">
              {ownedItems.length > 0 ? (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ownedItems.map((item: any) => (
                  <span
                    key={item.id}
                    className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600"
                  >
                    {item.label}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500">아이템이 없습니다.</span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase">
              <span>소모품</span>
              <span className="text-[10px] text-gray-400">식사 사용 {dailyMealUses}/3회 (남은 {remainingMeals})</span>
            </div>
            <div className="space-y-2">
              {consumableList.length > 0 ? (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                consumableList.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
                      <item.icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{item.label}</div>
                      <div className="text-[11px] text-gray-500">{item.desc}</div>
                    </div>
                    <div className="text-xs font-mono text-gray-600 dark:text-gray-300">x{consumables[item.id]}</div>
                    <button onClick={() => consumeItem(item.id)} className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700">
                      사용
                    </button>
                  </div>
                ))
              ) : (
                <span className="text-xs text-gray-500">소모품이 없습니다.</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setShowEffectSummary((prev: boolean) => !prev)}
            className="w-full flex items-center justify-between text-xs font-bold text-gray-600 dark:text-gray-200 uppercase bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
          >
            <span>보유 효과 요약</span>
            <span>{showEffectSummary ? "접기" : "펼치기"}</span>
          </button>
          {showEffectSummary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-1">
                <div className="font-bold">성장/보조</div>
                <div>성장 부스트 x{passiveSummary.growth.toFixed(2)}</div>
                <div>갭 보상 x{passiveSummary.gap.toFixed(2)}</div>
                <div>패널티 스케일 x{passiveSummary.penalty.toFixed(2)}</div>
                <div>수면 효율 x{passiveSummary.sleep.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-1">
                <div className="font-bold">감쇠 방어</div>
                {(Object.keys(passiveSummary.decay) as StatKey[]).map((key) => (
                  <div key={key}>
                    {STATS_DEF[key].label}: x{passiveSummary.decay[key].toFixed(2)}
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-1">
                <div className="font-bold">액션 부스트</div>
                {(Object.keys(passiveSummary.actionBoosts) as ActionId[]).map((actionId) => (
                  <div key={actionId} className="flex justify-between">
                    <span>{ACTIONS[actionId].label}</span>
                    <span>x{passiveSummary.actionBoosts[actionId].toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
