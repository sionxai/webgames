import Link from "next/link";

export const metadata = { title: "개인정보처리방침 — 다다닥" };

export default function PrivacyPage() {
  return (
    <main className="px-4 pb-16 pt-10">
      <h1 className="text-[28px] font-extrabold">개인정보처리방침</h1>
      <p className="mt-2 text-[13px] text-dim">시행일: 2026-07-02 (초안)</p>

      <section className="mt-8 flex flex-col gap-6 text-base leading-relaxed">
        <div>
          <h2 className="text-[22px] font-bold">1. 수집하는 정보</h2>
          <p className="mt-2 text-dim">
            다다닥은 이메일, 전화번호, 실명, 생년월일 등 개인을 식별할 수 있는
            정보를 직접 입력받지 않습니다. Firebase 익명 계정으로 서비스를
            구분하며 다음 정보를 저장할 수 있습니다.
          </p>
          <ul className="mt-2 list-disc pl-5 text-dim">
            <li>Firebase가 발급한 익명 사용자 ID와 표시용 닉네임</li>
            <li>이용자가 선택적으로 설정한 학교·지역 (자가 신고, 인증 없음)</li>
            <li>최고 CPS와 해당 기록 제출 시 누적되는 탭 수</li>
            <li>브라우저에 저장되는 누적 딸깍·클리커 관심·선호 선택</li>
          </ul>
        </div>
        <div>
          <h2 className="text-[22px] font-bold">2. 저장 위치</h2>
          <p className="mt-2 text-dim">
            익명 사용자 ID, 닉네임, 최고 CPS, 지역·학교 설정은 Google Firebase
            Authentication·Firestore·Realtime Database를 통해 처리됩니다. 로컬
            누적 딸깍과 클리커 선택은 이용자의 브라우저 localStorage에 저장됩니다.
          </p>
        </div>
        <div>
          <h2 className="text-[22px] font-bold">3. 기록 유지</h2>
          <p className="mt-2 text-dim">
            Firebase 익명 계정 또는 브라우저 저장소가 삭제되면 기존 기록과의
            연결이 끊기거나 로컬 기록이 사라질 수 있습니다. 광고·행동 추적
            목적으로 이 정보를 사용하지 않습니다.
          </p>
        </div>
        <div>
          <h2 className="text-[22px] font-bold">4. 외부 서비스</h2>
          <p className="mt-2 text-dim">
            서비스 제공을 위해 Google Firebase를 사용하며, 그 밖에 저장된 기록을
            판매하거나 광고 사업자에게 제공하지 않습니다. 법령에 따른 요청이
            있는 경우에는 예외로 합니다.
          </p>
        </div>
        <div>
          <h2 className="text-[22px] font-bold">5. 문의</h2>
          <p className="mt-2 text-dim">
            개인정보 관련 문의는 서비스 운영자에게 연락해 주세요. 방침이 변경되면
            이 페이지에 고지합니다.
          </p>
        </div>
      </section>

      <Link
        href="/"
        className="mt-10 block text-center text-base font-bold text-primary"
      >
        홈으로
      </Link>
    </main>
  );
}
