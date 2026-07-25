"use client";

import { ChevronLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ensureProfile,
  getRankings,
  setRegionSchool,
} from "@/lib/client/store";
import { displayName, GRADES, SIDO } from "@/lib/shared/constants";

type Scope = "all" | "region" | "school";
type Ranking = { uid: string; nickname: string; bestCps: number };

const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "region", label: "지역" },
  { key: "school", label: "학교" },
];
const silverColor = GRADES.find((grade) => grade.name === "은축")?.color;
const brownColor = GRADES.find((grade) => grade.name === "갈축")?.color;

function rankStyle(rank: number) {
  if (rank === 1) return { color: "var(--color-primary)" };
  if (rank === 2 && silverColor) return { color: silverColor };
  if (rank === 3 && brownColor) return { color: brownColor };
  return undefined;
}

export default function RankPage() {
  const [scope, setScope] = useState<Scope>("all");
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [profile, rows] = await Promise.all([
      ensureProfile(),
      getRankings(scope, 100),
    ]);
    setMyUid(profile?.uid ?? null);
    setRankings(rows);
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveScope = async () => {
    setNotice(null);
    await setRegionSchool(region || null, schoolId.trim() || null);
    await load();
    setNotice("설정 저장을 요청했어요.");
  };

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-16 pt-4">
      <header className="flex items-center gap-2">
        <Link href="/" aria-label="홈으로" className="-ml-2 p-2">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-[22px] font-bold">랭킹</h1>
      </header>

      <p className="mt-2 text-[13px] text-dim">
        클라이언트에서 제출한 비공식 기록이며 인증된 경기 결과가 아닙니다.
      </p>

      <div className="mt-4 flex gap-2">
        {SCOPES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setScope(item.key)}
            className={`flex-1 rounded-[14px] py-2 text-base font-bold transition ${
              scope === item.key
                ? "bg-primary text-primary-ink"
                : "border border-surface-border bg-surface text-dim"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {scope !== "all" && (
        <section className="card mt-3 p-4">
          <p className="text-base font-bold">지역·학교 직접 설정</p>
          <p className="mt-1 text-[12px] text-dim">
            학교 검색은 준비 중이라 학교 문서 ID를 직접 입력해 주세요.
          </p>
          <select
            className="input mt-3"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            aria-label="지역"
          >
            <option value="">지역 선택 안 함</option>
            {SIDO.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            className="input mt-2"
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            placeholder="학교 문서 ID (선택)"
            aria-label="학교 문서 ID"
          />
          <button type="button" onClick={saveScope} className="btn-ghost mt-3">
            설정 저장 후 새로고침
          </button>
          {notice && <p className="mt-2 text-[12px] text-dim">{notice}</p>}
        </section>
      )}

      <section className="mt-4 flex flex-col gap-2">
        {loading ? (
          Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="skeleton h-14" />
          ))
        ) : rankings.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-6">
            <Trophy className="h-10 w-10 text-dim" aria-hidden />
            <p className="text-base font-bold">표시할 기록이 없어요</p>
            <Link href="/solo" className="text-[13px] font-bold text-primary">
              첫 기록 세우러 가기
            </Link>
          </div>
        ) : (
          rankings.map((ranking, index) => {
            const rank = index + 1;
            return (
              <div
                key={ranking.uid}
                className={`card flex items-center gap-3 px-4 py-3 ${
                  myUid === ranking.uid ? "border-primary" : ""
                }`}
              >
                <span
                  className={`tabular w-8 text-lg font-extrabold ${
                    rank <= 3 ? "" : "text-dim"
                  }`}
                  style={rankStyle(rank)}
                >
                  {rank}
                </span>
                <span className="flex-1 truncate text-base font-bold">
                  {displayName(ranking.nickname, ranking.uid)}
                </span>
                <span className="tabular text-lg font-extrabold">
                  {ranking.bestCps.toFixed(1)}
                  <span className="ml-1 text-[13px] font-medium text-dim">cps</span>
                </span>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
