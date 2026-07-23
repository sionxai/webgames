import React from "react";
import { CheckCircle2, Gift, Target } from "lucide-react";

import { ACTIONS, STATS_DEF } from "@/lib/constants";
import type { ActionId, StatKey } from "@/types/game";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QuestTabProps = any;

export default function QuestTab(props: QuestTabProps) {
  const {
    sortedQuests,
    getQuestProgressValue,
    isQuestUnlocked,
    isQuestCompleted,
    questClaims,
    calculateQuestReward,
    questMultiProgress,
    claimQuestReward,
  } = props;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold mb-1">Quest Board</h2>
        <p className="text-indigo-100 text-sm opacity-90">행동을 지속하여 보상을 획득하세요.</p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {sortedQuests.map((quest: any) => {
          const { current, percent } = getQuestProgressValue(quest);
          const { unlocked, reason } = isQuestUnlocked(quest);
          const completed = isQuestCompleted(quest);
          const claimable = completed && !questClaims[quest.id] && unlocked;
          const reward = calculateQuestReward(quest);
          return (
            <div
              key={quest.id}
              className={`bg-white dark:bg-gray-800 border rounded-xl p-5 transition-all ${claimable
                  ? "border-amber-500 bg-amber-50/60 dark:bg-amber-900/20"
                  : completed
                    ? "border-green-500/50 bg-green-50/50 dark:bg-green-900/10"
                    : "border-gray-200 dark:border-gray-700"
                }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${claimable
                        ? "bg-amber-500 text-white"
                        : completed
                          ? "bg-green-500 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                      }`}
                  >
                    {claimable ? <Gift size={20} /> : completed ? <CheckCircle2 size={20} /> : <Target size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`font-bold ${completed ? "text-green-700 dark:text-green-400" : "text-gray-800 dark:text-white"}`}>{quest.label}</h3>
                      {completed && <span className="text-[10px] bg-green-200 text-green-800 px-1.5 rounded font-bold">완료</span>}
                      {!unlocked && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 rounded font-bold">잠금</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {quest.target.kind === "single" ? (
                        <>
                          <span className="font-bold text-gray-700 dark:text-gray-300">{current.toFixed(0)}</span> / {quest.target.minutes}분 달성
                        </>
                      ) : (
                        "다중 목표"
                      )}
                    </p>
                    {reason && <p className="text-[11px] text-red-500">{reason}</p>}
                    {quest.flavorText && <p className="text-[11px] text-gray-400 mt-1">{quest.flavorText}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">보상</div>
                  <div className="flex gap-1 justify-end flex-wrap">
                    {Object.entries(reward).map(([key, value]) => {
                      if (key !== "money" && !STATS_DEF[key as StatKey]) return null;
                      return (
                        <span
                          key={key}
                          className={`flex items-center gap-1 text-[10px] font-bold ${key === "money" ? "text-green-600" : STATS_DEF[key as StatKey].color
                            }`}
                        >
                          {key === "money" ? `$${value}` : `+${value}`}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
              {quest.target.kind === "multi" && (
                <div className="text-[11px] text-gray-500 mb-2">
                  {Object.entries(quest.target.requirements).map(([cat, minutes]) => {
                    const catProgress = questMultiProgress[quest.id]?.[cat as ActionId] || 0;
                    return (
                      <div key={cat} className="flex items-center gap-2">
                        <span className="font-bold text-gray-700 dark:text-gray-300">{ACTIONS[cat as ActionId]?.label || cat}</span>
                        <span>
                          {catProgress.toFixed(0)} / {minutes}분
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${claimable ? "bg-amber-500" : completed ? "bg-green-500" : "bg-indigo-500"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => claimQuestReward(quest.id)}
                  disabled={!claimable}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${claimable ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    }`}
                >
                  보상 수령
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
