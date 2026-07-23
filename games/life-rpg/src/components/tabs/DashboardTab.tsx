import React from "react";
import { ArrowDown, BarChart3, Bell, ChevronsUp, Gem, Gift, Play, Plus, RefreshCw, Square, Target } from "lucide-react";

import { ACTIONS, STATS_DEF } from "@/lib/constants";
import type { ActionId, StatKey } from "@/types/game";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DashboardTabProps = any;

export default function DashboardTab(props: DashboardTabProps) {
  const {
    dndMode,
    claimableQuests,
    setActiveTab,
    activeLockInfo,
    tabIdRef,
    overallScore,
    stats,
    showStatsGraph,
    setShowStatsGraph,
    StatRadar,
    timer,
    activeAction,
    alarmRinging,
    jobInfo,
    formatTime,
    currentGains,
    projectedGains,
    alarmTime,
    requestNotificationPermission,
    notificationPermission,
    addAlarmTime,
    resetAlarm,
    manualAlarmInput,
    setManualAlarmInput,
    setManualAlarm,
    stopAction,
    selectedGoalDef,
    tryStartAction,
    cheatInput,
    setCheatInput,
    handleCheat,
  } = props;

  return (
    <div
      className={`max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ${dndMode ? "h-full flex flex-col justify-center" : ""
        }`}
    >
      {!dndMode && claimableQuests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift size={18} />
            <div className="text-sm font-bold">보상 수령 가능 퀘스트 {claimableQuests.length}개</div>
          </div>
          <button
            onClick={() => setActiveTab("quest")}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600"
          >
            퀘스트 보기
          </button>
        </div>
      )}
      {/* eslint-disable-next-line react-hooks/refs */}
      {!dndMode && activeLockInfo && activeLockInfo.owner !== tabIdRef.current && (
        <div className="bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 rounded-xl p-4 flex items-center justify-between">
          <div className="text-sm font-bold">
            다른 탭에서 {((ACTIONS as Record<string, { label: string }>)[activeLockInfo.category]?.label || activeLockInfo.category)} 진행 중입니다.
          </div>
          <span className="text-xs text-red-500">이 탭에서는 새 행동 시작이 잠겨 있습니다.</span>
        </div>
      )}
      {!dndMode && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center lg:col-span-1">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <BarChart3 size={18} className="text-indigo-500" /> 능력치
              <span
                className={`text-sm ml-auto font-mono font-bold ${overallScore >= 80 ? "text-purple-500" : overallScore >= 50 ? "text-blue-500" : "text-gray-500"
                  }`}
              >
                Score: {overallScore}
              </span>
            </h2>
            <div className="space-y-3">
              {(Object.entries(stats) as [StatKey, number][]).map(([key, value]) => {
                const Icon = STATS_DEF[key].icon;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${STATS_DEF[key].color} bg-gray-50 dark:bg-gray-700`}>
                        <Icon size={14} />
                      </div>
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{STATS_DEF[key].label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold w-20 text-right tracking-tighter">{value.toFixed(5)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center lg:col-span-2 min-h-[120px]">
            <button
              onClick={() => setShowStatsGraph((prev: boolean) => !prev)}
              className="w-full flex items-center justify-between text-sm font-bold text-gray-700 dark:text-gray-200"
            >
              <span>능력치 그래프</span>
              <span>{showStatsGraph ? "접기" : "펼치기"}</span>
            </button>
            {showStatsGraph && (
              <>
                <div className="mt-4">
                  <StatRadar />
                </div>
                <p className="text-xs text-gray-400 mt-4 flex items-center gap-1">
                  <ArrowDown size={12} className="text-red-400" /> 엔트로피 법칙: 초당 -0.0001 (패시브 적용)
                </p>
              </>
            )}
          </div>
        </div>
      )}
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl p-0 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col relative overflow-hidden transition-all ${dndMode ? "flex-1 scale-105 border-indigo-500 shadow-2xl" : ""
          }`}
      >
        {timer.active && activeAction ? (
          <div
            className={`w-full h-full min-h-[500px] flex-1 bg-gradient-to-br from-indigo-600 to-purple-700 text-white flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 ${alarmRinging ? "animate-pulse bg-red-600" : ""
              }`}
          >
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-white/20 rounded-full animate-ping opacity-20" />
              <div className="bg-white/20 p-6 rounded-full backdrop-blur-sm relative z-10 border border-white/30">
                <activeAction.icon size={dndMode ? 64 : 48} className="animate-bounce" />
              </div>
            </div>
            <h3 className="text-3xl font-bold mb-1">{activeAction.label}</h3>
            <p className="text-indigo-200 text-sm mb-6">{timer.category === "work" ? `${jobInfo.label} ($${jobInfo.wage}/h)` : activeAction.desc}</p>

            <div className="flex flex-col items-center gap-2 mb-6">
              <span className="text-xs text-indigo-300 uppercase tracking-widest">Elapsed Time</span>
              <div className="text-7xl font-mono font-bold tracking-wider text-white drop-shadow-lg">{formatTime(timer.elapsed)}</div>
            </div>

            <div className="bg-black/20 rounded-xl p-4 mb-6 w-full max-w-md backdrop-blur-sm border border-white/10">
              <div className="flex justify-between items-center mb-3">
                <div className="text-xs text-indigo-200 font-bold uppercase flex items-center gap-1">
                  <Target size={12} /> 실시간 성과
                </div>
                {currentGains && currentGains.itemMultiplier > 1 && (
                  <div className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-bold text-yellow-300 flex items-center gap-1">
                    <ChevronsUp size={10} /> 부스트 x{currentGains.itemMultiplier.toFixed(2)}
                  </div>
                )}
              </div>

              {currentGains && currentGains.activeItemLabels.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center mb-3">
                  {currentGains.activeItemLabels.map((label: string) => (
                    <span key={label} className="text-[10px] px-1.5 py-0.5 bg-indigo-500/30 border border-indigo-400/30 rounded text-indigo-100">
                      {label}
                    </span>
                  ))}
                </div>
              )}

              {currentGains && (
                <div className="flex flex-wrap justify-center gap-3">
                  {currentGains.money !== 0 && (
                    <span className="flex items-center gap-1 text-sm font-bold text-green-300">
                      <Gem size={14} /> ${currentGains.money > 0 ? "+" : ""}
                      {currentGains.money.toFixed(2)}
                    </span>
                  )}
                  {Object.entries(currentGains.stats as Record<string, { net: number; decayReduction: number }>).map(([key, info]) => (
                    <div key={key} className="flex flex-col items-center">
                      <span className={`flex items-center gap-1 text-sm font-bold ${info.net > 0 ? "text-blue-300" : "text-red-300"}`}>
                        {STATS_DEF[key as StatKey].label} {info.net > 0 ? "+" : ""}
                        {info.net.toFixed(2)}
                      </span>
                      {info.decayReduction > 0 && <span className="text-[9px] text-gray-400">🛡️{info.decayReduction}%</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {alarmTime && projectedGains && projectedGains.remainingSeconds > 0 && (
              <div className="bg-white/10 rounded-xl p-3 mb-6 backdrop-blur-sm border border-white/10 w-full max-w-md">
                <div className="flex justify-between items-center text-xs text-indigo-100 px-1 mb-2">
                  <span className="flex items-center gap-1 font-bold">
                    <Target size={12} /> 알람까지 예상 추가 성과
                  </span>
                  <span>{formatTime(projectedGains.remainingSeconds)} 남음</span>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  {projectedGains.money !== 0 && (
                    <span className="flex items-center gap-1 text-sm font-bold text-green-100">
                      <Gem size={14} /> ${projectedGains.money > 0 ? "+" : ""}
                      {projectedGains.money.toFixed(2)}
                    </span>
                  )}
                  {Object.entries(projectedGains.stats as Record<string, { net: number; decayReduction: number }>).map(([key, info]) => (
                    <div key={key} className="flex flex-col items-center">
                      <span className={`flex items-center gap-1 text-sm font-bold ${info.net > 0 ? "text-blue-100" : "text-red-200"}`}>
                        {STATS_DEF[key as StatKey].label} {info.net > 0 ? "+" : ""}
                        {info.net.toFixed(2)}
                      </span>
                      {info.decayReduction > 0 && <span className="text-[9px] text-indigo-100/80">🛡️{info.decayReduction}%</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="w-full max-w-md bg-white/10 rounded-xl p-3 mb-6 backdrop-blur-sm flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs text-indigo-200 px-1">
                <span className="flex items-center gap-1">
                  <Bell size={12} /> 알람 설정
                </span>
                {notificationPermission === "default" && (
                  <button onClick={requestNotificationPermission} className="text-[11px] underline">
                    브라우저 알림 켜기
                  </button>
                )}
                {alarmTime && <span>{formatTime(Math.max(0, alarmTime - timer.elapsed))} 남음</span>}
              </div>
              {alarmTime && (
                <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-yellow-400 transition-all duration-1000" style={{ width: `${Math.min(100, (timer.elapsed / alarmTime) * 100)}%` }} />
                </div>
              )}
              <div className="flex gap-2 justify-center flex-wrap">
                <button onClick={() => addAlarmTime(10)} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold flex items-center gap-1">
                  +10분
                </button>
                <button onClick={() => addAlarmTime(30)} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold flex items-center gap-1">
                  +30분
                </button>
                <button onClick={() => addAlarmTime(60)} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold flex items-center gap-1">
                  +1시간
                </button>
                <button onClick={resetAlarm} className="px-3 py-1 bg-red-500/60 hover:bg-red-500/80 rounded text-xs font-bold flex items-center gap-1">
                  <RefreshCw size={14} /> 리셋
                </button>
                <div className="flex items-center gap-1 bg-white/20 rounded px-2">
                  <input
                    type="number"
                    placeholder="분"
                    className="w-10 bg-transparent text-white text-xs text-center outline-none appearance-none"
                    value={manualAlarmInput}
                    onChange={(event) => setManualAlarmInput(event.target.value)}
                  />
                  <button onClick={setManualAlarm} className="text-xs font-bold">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={stopAction}
              className="bg-white text-indigo-600 hover:bg-gray-100 px-12 py-4 rounded-full font-bold text-xl shadow-xl active:scale-95 flex items-center gap-2"
            >
              <Square size={24} fill="currentColor" /> 종료 및 저장
            </button>
          </div>
        ) : (
          <div className="p-6 h-full flex flex-col">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Play size={18} className="text-green-500" /> 행동 시작
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 overflow-y-auto pr-1 flex-1">
              {Object.values(ACTIONS).map((action) => {
                const isRecommended = selectedGoalDef.rec.includes(action.id as ActionId);
                const jobDesc = action.id === "work" ? `시급 $${jobInfo.wage}` : action.desc;
                return (
                  <button
                    key={action.id}
                    onClick={() => tryStartAction(action.id as ActionId)}
                    className={`text-left p-4 rounded-xl border transition-all group hover:shadow-md flex flex-col items-start gap-3 ${isRecommended ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200"
                      }`}
                  >
                    <div className={`p-2 rounded-lg ${isRecommended ? "bg-indigo-100 text-indigo-600" : "bg-white text-gray-500"}`}>
                      <action.icon size={24} />
                    </div>
                    <div>
                      <span className="font-bold text-sm block text-gray-700">{action.label}</span>
                      <p className="text-[10px] text-gray-500 mt-1">{jobDesc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {!dndMode && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              value={cheatInput}
              onChange={(event) => setCheatInput(event.target.value)}
              placeholder="치트 코드 입력"
              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button onClick={handleCheat} className="px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 text-sm font-bold">
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
