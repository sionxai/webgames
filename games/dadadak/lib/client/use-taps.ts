"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dadadak_total_taps";

function readTotal(): number {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeTotal(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // 저장소를 사용할 수 없어도 현재 세션의 탭은 계속 센다.
  }
}

export function useTaps() {
  const [total, setTotal] = useState(0);
  const [session, setSession] = useState(0);

  useEffect(() => {
    setTotal(readTotal());
  }, []);

  const tap = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const delta = Math.floor(amount);
    setTotal((current) => {
      const next = current + delta;
      writeTotal(next);
      return next;
    });
    setSession((current) => current + delta);
  }, []);

  return { total, session, tap };
}
