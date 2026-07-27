import Image from "next/image";
import { HomeDock } from "@/components/home-dock";
import { HomeTicker } from "@/components/home-ticker";
import { TapZone } from "@/components/tap-zone";

export default function HomePage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden px-4 pb-3 pt-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-primary">
          <Image
            src="/games/dadadak/brand/symbol.svg"
            width={20}
            height={20}
            alt=""
            aria-hidden
            className="h-5 w-5"
            priority
          />
          <span className="text-[18px] font-extrabold leading-none">다다닥</span>
        </h1>
        <p className="text-[12px] leading-none text-dim">서버 없는 CPS 챌린지</p>
      </header>

      <div className="mt-2">
        <HomeTicker />
      </div>

      <div className="mt-2 flex min-h-0 flex-1">
        <TapZone />
      </div>

      <div className="mt-2">
        <HomeDock />
      </div>
    </main>
  );
}
