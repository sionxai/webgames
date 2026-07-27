"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "dadadak_clicker_sku";

const OPTIONS = [
  { sku: "sku1", label: "1키 · 키링형", display: "1키" },
  { sku: "sku4", label: "4키 · 바형", display: "4키" },
  { sku: "sku9", label: "9키 · 패드형", display: "9키" },
] as const;

type ClickerSku = (typeof OPTIONS)[number]["sku"];

function isSku(v: unknown): v is ClickerSku {
  return typeof v === "string" && OPTIONS.some((o) => o.sku === v);
}

function readStoredSku() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isSku(value) ? value : null;
  } catch {
    return null;
  }
}

function storeSku(sku: ClickerSku) {
  try {
    window.localStorage.setItem(STORAGE_KEY, sku);
  } catch {
    // localStorage를 쓸 수 없어도 현재 화면 상태 전환은 유지한다.
  }
}

export function ClickerSkuVote() {
  const [selected, setSelected] = useState<ClickerSku | null>(null);

  useEffect(() => {
    setSelected(readStoredSku());
  }, []);

  const vote = (sku: ClickerSku) => {
    if (selected) return;

    const stored = readStoredSku();
    if (stored) {
      setSelected(stored);
      return;
    }

    storeSku(sku);
    setSelected(sku);
  };

  const selectedOption = OPTIONS.find((o) => o.sku === selected);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const voted = selected !== null;
          const isSelected = selected === option.sku;
          return (
            <button
              key={option.sku}
              type="button"
              onClick={() => vote(option.sku)}
              aria-pressed={isSelected}
              aria-disabled={voted}
              className={[
                "btn-ghost",
                voted ? "pointer-events-none" : "",
                voted && isSelected ? "border-primary text-primary" : "",
                voted && !isSelected ? "text-dim" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selectedOption && (
        <p className="mt-3 text-[13px] text-dim">
          골라줘서 고마워요 · 당신의 선택: {selectedOption.display}
        </p>
      )}
    </div>
  );
}
