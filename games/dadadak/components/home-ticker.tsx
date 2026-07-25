import Link from "next/link";

export function HomeTicker() {
  return (
    <div className="card flex items-center justify-between gap-3 px-3 py-2">
      <p className="min-w-0 truncate text-[13px]">
        솔로 CPS를 측정하고 비공식 랭킹에 도전하세요
      </p>
      <Link
        href="/privacy"
        className="shrink-0 text-[11px] text-dim underline underline-offset-4"
      >
        개인정보
      </Link>
    </div>
  );
}
