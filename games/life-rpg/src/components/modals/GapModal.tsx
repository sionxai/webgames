import React from "react";
import { Clock } from "lucide-react";

import { GAP_ACTIVITIES } from "@/lib/constants";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GapModalProps = any;

export default function GapModal({ gapData, resolveGap }: GapModalProps) {
  if (!gapData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4 text-indigo-500">
          <Clock size={32} />
          <h2 className="text-2xl font-bold">공백 시간 확인</h2>
        </div>
        <p className="mb-6">
          지난 <span className="font-bold text-indigo-500">{Math.floor(gapData.minutes / 60)}시간 {gapData.minutes % 60}분</span> 동안 무엇을 하셨나요?
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
          {Object.values(GAP_ACTIVITIES).map((activity) => (
            <button
              key={activity.id}
              onClick={() => resolveGap(activity.id as keyof typeof GAP_ACTIVITIES)}
              className="flex items-start gap-4 p-4 rounded-xl border hover:bg-gray-50 text-left group"
            >
              <div className="bg-white p-3 rounded-full shadow-sm">
                <activity.icon size={24} />
              </div>
              <div>
                <div className="font-bold text-sm">{activity.label}</div>
                <p className="text-xs text-gray-500">{activity.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
