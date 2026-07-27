"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "dadadak_clicker_interest";

function hasStoredInterest() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function storeInterest() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage를 쓸 수 없어도 현재 화면 상태 전환은 유지한다.
  }
}

export function ClickerInterest() {
  const [interested, setInterested] = useState(false);

  useEffect(() => {
    setInterested(hasStoredInterest());
  }, []);

  const submitInterest = () => {
    if (interested || hasStoredInterest()) {
      setInterested(true);
      return;
    }

    storeInterest();
    setInterested(true);
  };

  if (interested) {
    return (
      <div>
        <p className="text-base font-bold">관심 고마워요</p>
        <p className="mt-1 text-[13px] text-dim">이 브라우저에 관심 표시를 저장했어요.</p>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={submitInterest} className="btn-primary">
        실물로 나오면 써볼래요
      </button>
      <p className="mt-2 text-[13px] text-dim">
        연락처는 받지 않으며 선택은 이 브라우저에만 저장돼요.
      </p>
    </div>
  );
}
