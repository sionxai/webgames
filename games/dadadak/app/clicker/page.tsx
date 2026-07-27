import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClickerInterest } from "@/components/clicker-interest";
import { ClickerSkuVote } from "@/components/clicker-sku-vote";

const BASE_PATH = "/games/dadadak";

export const metadata: Metadata = {
  title: "다다닥 클리커 — 실물 딸깍",
  description:
    "웹으로 딸깍, 이제 진짜 버튼으로. 커스텀 캐릭터 키캡으로 바꿔 끼우는 블루투스 연타 클리커.",
  openGraph: { images: [`${BASE_PATH}/clicker/a1-sku1-hero_v1.webp`] },
};

// 큐레이션 이미지 (실제 픽셀 크기 — next/image 비율용)
function Shot({
  src,
  w,
  h,
  alt,
  caption,
  priority,
}: {
  src: string;
  w: number;
  h: number;
  alt: string;
  caption?: string;
  priority?: boolean;
}) {
  return (
    <figure className="m-0">
      <Image
        src={`${BASE_PATH}/clicker/${src}_v1.webp`}
        width={w}
        height={h}
        alt={alt}
        priority={priority}
        className="h-auto w-full rounded-[16px] border border-surface-border"
      />
      {caption && (
        <figcaption className="mt-2 text-[13px] text-dim">{caption}</figcaption>
      )}
    </figure>
  );
}

const KEYCAPS = [
  { src: "e1-chick", name: "병아리" },
  { src: "e2-cat", name: "고양이" },
  { src: "e3-bear", name: "곰" },
  { src: "e4-frog", name: "개구리" },
  { src: "e5-panda", name: "판다" },
  { src: "e6-strawberry", name: "딸기" },
  { src: "e7-star", name: "별" },
  { src: "e8-penguin", name: "펭귄" },
  { src: "e9-octopus", name: "문어" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 border-l-[3px] border-primary pl-3 text-[22px] font-extrabold">
      {children}
    </h2>
  );
}

export default function ClickerPage() {
  return (
    <main className="flex min-h-dvh flex-col px-4 pb-16 pt-4">
      <header className="flex items-center gap-2">
        <Link href="/" aria-label="홈으로" className="-ml-2 p-2">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-[22px] font-bold">다다닥 클리커</h1>
        <span className="ml-auto rounded-full border border-surface-border px-3 py-0.5 text-[13px] font-bold text-dim">
          출시 준비 중
        </span>
      </header>

      {/* 히어로 */}
      <section className="mt-4">
        <Shot
          src="a1-sku1-hero"
          w={1536}
          h={1024}
          alt="다다닥 클리커 SKU-1 키링형 히어로"
          priority
        />
        <h2 className="mt-5 text-[28px] font-extrabold leading-tight">
          손끝의 딸깍,
          <br />
          이제 진짜 버튼으로
        </h2>
        <p className="mt-2 text-base text-dim">
          폰 터치로도 즐기던 10초 대결을, 기계식 스위치의 진짜 딸깍으로. 다크 네이비
          무광 본체에 옐로 키캡, 블루투스로 폰·태블릿·PC에 바로 연결되는 연타 전용
          클리커.
        </p>
      </section>

      {/* 라인업 */}
      <SectionTitle>라인업</SectionTitle>
      <p className="mt-2 text-base text-dim">
        휴대부터 데스크까지 세 가지 폼팩터.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        <div>
          <Shot src="a1-sku1-hero" w={1536} h={1024} alt="SKU-1 키링형 1키" />
          <p className="mt-2 text-base font-bold">
            SKU-1 · 키링형 <span className="text-dim">1키</span>
          </p>
          <p className="text-[13px] text-dim">
            가방·주머니에 달고 다니는 휴대형. 언제 어디서든 딸깍.
          </p>
        </div>
        <div>
          <Shot src="a2-sku4" w={1536} h={1024} alt="SKU-4 바형 2×2 4키" />
          <p className="mt-2 text-base font-bold">
            SKU-4 · 바형 <span className="text-dim">4키</span>
          </p>
          <p className="text-[13px] text-dim">한 기기로 둘이 붙는 2인 대전 패드.</p>
        </div>
        <div>
          <Shot src="a3-sku9-desk" w={1536} h={1024} alt="SKU-9 패드형 3×3 9키" />
          <p className="mt-2 text-base font-bold">
            SKU-9 · 패드형 <span className="text-dim">9키</span>
          </p>
          <p className="text-[13px] text-dim">
            데스크에 두는 3×3 확장 패드. 연타도 리듬도.
          </p>
        </div>
      </div>

      {/* SKU 선호 투표 — 수요 신호 */}
      <SectionTitle>하나만 만든다면?</SectionTitle>
      <p className="mt-2 text-base text-dim">
        가장 갖고 싶은 폼팩터를 골라줘요. 어떤 걸 먼저 만들지 정하는 데 참고해요.
      </p>
      <div className="mt-4">
        <ClickerSkuVote />
      </div>

      {/* 커스터마이징 */}
      <SectionTitle>키캡을 바꿔 끼우세요</SectionTitle>
      <p className="mt-2 text-base text-dim">
        노란 버튼을 귀여운 캐릭터 아티산 키캡으로 자유롭게 교체. MX 스템 호환이라
        원하는 대로 스왑.
      </p>
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {KEYCAPS.map((k) => (
          <li key={k.src} className="card overflow-hidden p-0">
            <div className="relative aspect-square">
              <Image
                src={`${BASE_PATH}/clicker/${k.src}_v1.webp`}
                alt={`${k.name} 커스텀 키캡`}
                fill
                sizes="(max-width: 480px) 33vw, 150px"
                className="object-cover"
              />
            </div>
            <p className="px-2 py-1.5 text-center text-[13px] font-bold">
              {k.name}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Shot
          src="f-allstar-sku9"
          w={1536}
          h={1024}
          alt="SKU-9에 9종 캐릭터 키캡을 모두 장착한 올스타"
          caption="9종을 모두 끼운 올스타 셋업"
        />
      </div>

      {/* 설계 & 스펙 */}
      <SectionTitle>설계 & 스펙</SectionTitle>
      <div className="mt-4 flex flex-col gap-5">
        <Shot
          src="b1-sku1-exploded"
          w={864}
          h={1821}
          alt="SKU-1 분해도 — 키캡·스위치·핫스왑 소켓·PCB·배터리·NFC·하우징"
          caption="키캡 → 스위치 → 핫스왑 소켓 → PCB(BLE) → 배터리 → NFC → 하우징"
        />
        <Shot
          src="d1-specsheet"
          w={1024}
          h={1536}
          alt="다다닥 클리커 스펙 시트"
          caption="Bluetooth 5.0 · USB-C 충전 · 20시간 · 스위치 5천만 클릭 · 45×45×20mm · 35g"
        />
      </div>

      {/* 컬렉터블 */}
      <SectionTitle>모으는 재미</SectionTitle>
      <p className="mt-2 text-base text-dim">
        블라인드박스로 만나는 캐릭터 키캡. 뭐가 나올지 열어봐야 아는 컬렉터블.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        <Shot src="i1-blindbox-hero" w={1024} h={1536} alt="블라인드박스 패키지" />
        <Shot
          src="i2-collection"
          w={1536}
          h={1024}
          alt="캐릭터 키캡 컬렉션 도감"
          caption="9종 + 시크릿"
        />
      </div>

      {/* 라이프스타일 */}
      <SectionTitle>어디서든 딸깍</SectionTitle>
      <div className="mt-4 flex flex-col gap-5">
        <Shot src="j1-battle-cafe" w={1536} h={1024} alt="카페에서 연타 대결" />
        <Shot src="j2-classroom-girl" w={1536} h={1024} alt="교실에서 딸깍" />
        <Shot src="j3-friends-group" w={1536} h={1024} alt="친구들과 함께" />
      </div>

      {/* CTA — 수요 신호 + 웹 진입 */}
      <section className="card mt-10 p-6 text-center">
        <p className="text-[22px] font-extrabold">실물로 나오면 써볼래요?</p>
        <p className="mt-2 text-base text-dim">
          실물 클리커는 아직 준비 중이에요. 관심을 눌러주면 얼마나 원하는지 세어보고
          만들지 정해요.
        </p>
        <div className="mt-5">
          <ClickerInterest />
        </div>
        <div className="mt-6 border-t border-surface-border pt-6">
          <p className="text-base text-dim">
            지금은 웹으로 딸깍. 먼저 기록을 쌓아두면 나중에 그대로 이어져요.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <Link href="/solo" className="btn-primary">
              웹으로 지금 딸깍하기
            </Link>
            <Link href="/" className="btn-ghost">
              홈으로
            </Link>
          </div>
        </div>
      </section>

      <p className="mt-6 text-center text-[13px] text-dim">
        이미지는 컨셉 시안이며 실제 제품과 다를 수 있어요.
      </p>
    </main>
  );
}
