import { useEffect, useRef, useState } from "react";

interface TutorialOverlayProps {
  onClose: () => void;
}

const PAGES = [
  {
    title: "기다려, 멍!",
    body:
      "강아지와 함께 사는 하루를 보내며, 강아지가 보내는 신호를 읽고 알맞게 반응해 주는 게임입니다.\n체벌 대신 유도와 보상으로 가르칩니다.",
  },
  {
    title: "움직이기",
    body:
      "WASD 또는 방향키로 움직이고, 바닥을 클릭해도 이동합니다.\n다른 방으로 갈 때는 문 앞에서 E를 누르세요.",
  },
  {
    title: "상호작용",
    body:
      "대상 가까이 다가가면 화면 아래에 행동이 나타납니다. E로 실행하고,\n선택지가 여러 개일 때는 1·2·3 키로 고릅니다.",
  },
  {
    title: "돌봄 미션",
    body:
      "강아지가 신호를 보내면 말풍선이 뜹니다. 가까이 가서 관찰한 뒤 대응을 고르고,\n마지막에 칭찬이나 간식으로 마무리하세요. 미션은 하루에 여러 번 저절로 찾아옵니다.",
  },
  {
    title: "일과 살림",
    body:
      "컴퓨터 앞에 앉아 R을 누르고 있으면 업무가 진행되고 급여를 받습니다.\n부엌 그릇에는 밥과 물을 채워 주세요.",
  },
  {
    title: "준비 완료",
    body:
      "가방·펫마트·병원·업그레이드는 화면 오른쪽 메뉴에서 열 수 있습니다.\n이 도움말은 상단 도움말 버튼으로 언제든 다시 볼 수 있습니다.",
  },
] as const;

export function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "waitdog-tutorial-title";

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || dialog === null) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const page = PAGES[pageIndex];
  const lastPage = pageIndex === PAGES.length - 1;

  return (
    <div className="tutorial-backdrop">
      <div
        className="tutorial-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button
          className="tutorial-close"
          type="button"
          aria-label="튜토리얼 닫기"
          onClick={onClose}
        >
          닫기
        </button>
        <div className="tutorial-page" aria-live="polite">
          <span className="tutorial-count">
            {pageIndex + 1} / {PAGES.length}
          </span>
          <h2 id={titleId}>{page.title}</h2>
          <p>{page.body}</p>
        </div>
        <div className="tutorial-actions">
          <button
            type="button"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((current) => current - 1)}
          >
            이전
          </button>
          <button
            type="button"
            onClick={() => {
              if (lastPage) onClose();
              else setPageIndex((current) => current + 1);
            }}
          >
            {lastPage ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
