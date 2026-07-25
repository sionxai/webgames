"use client";
import { RotateCcw } from "lucide-react";

/** 배틀 화면 가로 모드 진입 시 안내 오버레이 (PRD 6장) — CSS 미디어쿼리로만 토글 */
export function OrientationGuard() {
  return (
    <div className="landscape-guard fixed inset-0 z-50 flex-col items-center justify-center gap-3 bg-bg">
      <RotateCcw className="h-10 w-10 text-primary" aria-hidden />
      <p className="text-[22px] font-bold">세로로 돌려주세요</p>
    </div>
  );
}
