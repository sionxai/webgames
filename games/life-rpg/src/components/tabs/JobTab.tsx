import React from "react";
import { Briefcase, LogOut, ShoppingBag, Target } from "lucide-react";

import { COMPANY_TIERS, INDUSTRIES, PART_TIME_JOBS, POSITIONS, SHOP_ITEMS, STATS_DEF } from "@/lib/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobTabProps = any;

export default function JobTab(props: JobTabProps) {
  const {
    career,
    partTimeJobId,
    stats,
    switchPartTime,
    startCareer,
    handleResign,
    calculateWage,
    getPositionScore,
    checkPromotion,
    ENTRY_REQ_STAT,
  } = props;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const industries = INDUSTRIES as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statDef = STATS_DEF as Record<string, any>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {!career ? (
        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <ShoppingBag size={18} /> 알바 (Part-time)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PART_TIME_JOBS.map((job) => {
                const isSelected = partTimeJobId === job.id;
                const reqs: { label: string; met: boolean }[] = [];
                let qualified = true;
                const req = job.req as Record<string, unknown>;
                if (typeof req.health === "number") {
                  const met = stats.health >= req.health;
                  reqs.push({ label: `체력 ${stats.health.toFixed(0)}/${req.health}`, met });
                  if (!met) qualified = false;
                }
                if (typeof req.intelligence === "number") {
                  const met = stats.intelligence >= req.intelligence;
                  reqs.push({ label: `지능 ${stats.intelligence.toFixed(0)}/${req.intelligence}`, met });
                  if (!met) qualified = false;
                }
                if (typeof req.immunity === "number") {
                  const met = stats.immunity >= req.immunity;
                  reqs.push({ label: `면역 ${stats.immunity.toFixed(0)}/${req.immunity}`, met });
                  if (!met) qualified = false;
                }
                if (typeof req.item === "string") {
                  const itemName = SHOP_ITEMS.find((item) => item.id === req.item)?.label || req.item;
                  const met = props.inventory.includes(req.item);
                  reqs.push({ label: `보유: ${itemName} (${met ? "보유" : "미보유"})`, met });
                  if (!met) qualified = false;
                }
                const cardTextClass = isSelected ? "text-gray-900" : "text-gray-900 dark:text-gray-100";
                const disabledClasses =
                  "bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 cursor-not-allowed";
                return (
                  <button
                    key={job.id}
                    onClick={() => switchPartTime(job.id)}
                    disabled={!qualified}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${cardTextClass} ${isSelected
                        ? "bg-green-50 border-green-500 ring-1 ring-green-500"
                        : !qualified
                          ? disabledClasses
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    <div className={`p-3 rounded-full shrink-0 ${isSelected ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      <job.icon size={20} />
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-bold text-sm ${cardTextClass}`}>{job.label}</h4>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span
                          className={`text-xs font-mono font-bold px-1.5 rounded ${isSelected ? "text-green-800 bg-green-100" : "text-green-600 bg-green-100 dark:text-green-300 dark:bg-green-900/30"
                            }`}
                        >
                          시급 ${job.wage}
                        </span>
                        {reqs.map((reqInfo) => (
                          <span
                            key={reqInfo.label}
                            className={`text-[10px] px-1.5 rounded border ${reqInfo.met
                                ? "text-green-700 border-green-200 bg-green-50 dark:text-green-300 dark:border-green-800 dark:bg-green-900/20"
                                : "text-red-600 border-red-200 bg-red-50 dark:text-red-300 dark:border-red-800 dark:bg-red-900/20"
                              }`}
                          >
                            {reqInfo.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    {isSelected && <div className="text-xs font-bold text-green-600">선택됨</div>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Briefcase size={18} /> 정규직 커리어 (Career Track)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.values(INDUSTRIES).map((industry) => {
                const reqStat = ENTRY_REQ_STAT;
                const coreStat1 = stats[industry.core[0]];
                const coreStat2 = stats[industry.core[1]];
                const qualified = coreStat1 >= reqStat && coreStat2 >= reqStat;
                return (
                  <button
                    key={industry.id}
                    onClick={() => startCareer(industry.id)}
                    disabled={!qualified}
                    className={`flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl transition-all group text-left ${!qualified
                        ? "cursor-not-allowed bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-100"
                        : "hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-lg"
                      }`}
                  >
                    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900 group-hover:text-indigo-600 transition-colors">
                      <industry.icon size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-800 dark:text-white">{industry.label}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-200 mb-2">{industry.desc}</p>
                      <div className="mt-2 text-xs bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                        <span className="text-gray-400 font-bold block mb-1 text-[10px] uppercase">입사 조건 (Entry Req)</span>
                        <div className="flex gap-2 font-mono font-bold">
                          <span className={coreStat1 >= reqStat ? "text-green-600" : "text-red-500"}>
                            {statDef[industry.core[0]].label}: {coreStat1.toFixed(0)}/{reqStat}
                          </span>
                          <span className={coreStat2 >= reqStat ? "text-green-600" : "text-red-500"}>
                            {statDef[industry.core[1]].label}: {coreStat2.toFixed(0)}/{reqStat}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 font-mono">기본시급 ${industry.baseWage}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Briefcase size={120} />
            </div>
            <button
              onClick={handleResign}
              className="absolute top-4 right-4 z-20 flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors border border-red-200"
            >
              <LogOut size={14} /> 퇴사하기
            </button>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">BUSINESS CARD</span>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{industries[career.industry].label} 전문가</h2>
                </div>
                <div className="text-right mt-8">
                  <div className={`text-xl font-bold ${COMPANY_TIERS.find((tier) => tier.id === career.company)?.color}`}>
                    {COMPANY_TIERS.find((tier) => tier.id === career.company)?.label}
                  </div>
                  <div className="text-gray-500 font-medium">{POSITIONS.find((position) => position.id === career.position)?.label}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                <div>
                  <div className="text-xs text-gray-400">현재 시급 (Wage)</div>
                  <div className="text-2xl font-mono font-bold text-green-600">
                    ${calculateWage()}
                    <span className="text-sm text-gray-400">/h</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">직급 점수 (Position Score)</div>
                  <div className="text-2xl font-mono font-bold text-indigo-600">
                    {getPositionScore(career.industry)}
                    <span className="text-sm text-gray-400"> pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold flex items-center gap-2">
                <Target size={18} /> 승진/이직 로드맵
              </h3>
              <button
                onClick={checkPromotion}
                className="px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-full hover:opacity-80 transition-opacity"
              >
                승진 심사 요청
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-400 uppercase">Company Tier (이직 조건)</div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {COMPANY_TIERS.map((tier, index) => {
                    const currentIndex = COMPANY_TIERS.findIndex((item) => item.id === career.company);
                    const isNext = index === currentIndex + 1;
                    const industry = industries[career.industry];
                    const core1Label = statDef[industry.core[0]].label;
                    const core2Label = statDef[industry.core[1]].label;
                    const core1Val = stats[industry.core[0]];
                    const core2Val = stats[industry.core[1]];
                    return (
                      <div
                        key={tier.id}
                        className={`flex-shrink-0 w-40 p-3 rounded-lg border flex flex-col gap-1 ${index <= currentIndex
                            ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-80"
                          }`}
                      >
                        <div className={`text-xs font-bold ${index <= currentIndex ? tier.color : "text-gray-400"}`}>{tier.label}</div>
                        <div className="text-[10px] text-gray-500">필요: {core1Label}, {core2Label} 각 {tier.minStat}+</div>
                        {isNext && (
                          <div className="text-[10px] font-bold mt-1">
                            <div className={core1Val >= tier.minStat ? "text-green-600" : "text-red-500"}>
                              {core1Label}: {core1Val.toFixed(0)}/{tier.minStat}
                            </div>
                            <div className={core2Val >= tier.minStat ? "text-green-600" : "text-red-500"}>
                              {core2Label}: {core2Val.toFixed(0)}/{tier.minStat}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-400 uppercase">Position Ladder (승진 조건)</div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {POSITIONS.map((position, index) => {
                    const currentIndex = POSITIONS.findIndex((pos) => pos.id === career.position);
                    const isNext = index === currentIndex + 1;
                    const company = COMPANY_TIERS.find((tier) => tier.id === career.company);
                    const requirement = (company?.minStat ?? ENTRY_REQ_STAT) + position.addStat;
                    const industry = industries[career.industry];
                    const core1Val = stats[industry.core[0]];
                    const core2Val = stats[industry.core[1]];
                    const met = core1Val >= requirement && core2Val >= requirement;
                    return (
                      <div
                        key={position.id}
                        className={`flex-shrink-0 w-32 p-3 rounded-lg border flex flex-col gap-1 ${index <= currentIndex
                            ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-80"
                          }`}
                      >
                        <div className={`text-xs font-bold ${index <= currentIndex ? "text-green-700" : "text-gray-400"}`}>{position.label}</div>
                        <div className="text-[10px] text-gray-500">필요: 각 {requirement}+</div>
                        {isNext && <div className={`text-[10px] font-bold ${met ? "text-green-600" : "text-red-500"}`}>{met ? "조건 충족!" : "스탯 부족"}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
