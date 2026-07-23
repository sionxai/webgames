import { useEffect, useRef } from "react";
import type {
  WaitdogCatalogView,
  WaitdogUiView,
} from "../services/waitdogSim";
import type {
  BarrierItemId,
  CatalogCategory,
  CatalogItemId,
  PadItemId,
  SalaryUpgradeId,
} from "../types";
import type { LifestyleSurface } from "./BottomNav";

type PlaceableItemId = PadItemId | BarrierItemId;
type PlacementPreset = "a" | "b";

interface LifestyleDialogProps {
  surface: LifestyleSurface;
  view: WaitdogUiView;
  feedback: string | null;
  storeCategory: CatalogCategory;
  onStoreCategory: (category: CatalogCategory) => void;
  onClose: () => void;
  onStartMission: () => void;
  onPurchase: (itemId: CatalogItemId) => void;
  onUse: (itemId: CatalogItemId) => void;
  onPlace: (itemId: PlaceableItemId, preset: PlacementPreset) => void;
  onClinic: () => void;
  onUpgrade: (upgradeId: SalaryUpgradeId) => void;
}

const SURFACE_TITLES: Record<LifestyleSurface, {
  kicker: string;
  title: string;
}> = {
  mission: { kicker: "NEXT TASK", title: "생활 미션" },
  bag: { kicker: "INVENTORY", title: "가방" },
  petMart: { kicker: "PET MART", title: "펫마트" },
  clinic: { kicker: "WELLNESS", title: "접종·예방 진료" },
  upgrade: { kicker: "CARE SKILLS", title: "업무 업그레이드" },
};

const STORE_CATEGORIES: ReadonlyArray<{
  id: Exclude<CatalogCategory, "clinic">;
  label: string;
}> = [
  { id: "food", label: "사료" },
  { id: "treat", label: "간식" },
  { id: "pad", label: "패드" },
  { id: "barrier", label: "칸막이" },
  { id: "shampoo", label: "샴푸" },
];

const isPlaceable = (
  item: WaitdogCatalogView,
): item is WaitdogCatalogView & { itemId: PlaceableItemId } =>
  item.category === "pad" || item.category === "barrier";

const canUseDirectly = (item: WaitdogCatalogView): boolean =>
  item.category === "food" || item.category === "treat" ||
  item.category === "shampoo";

const coverageLabel = (item: WaitdogCatalogView): string | null => {
  if (item.coverage !== undefined) {
    return `커버 반경 ${Math.round(item.coverage * 100)}%`;
  }
  if (item.panels !== undefined) return `${item.panels}패널`;
  return null;
};

export function LifestyleDialog({
  surface,
  view,
  feedback,
  storeCategory,
  onStoreCategory,
  onClose,
  onStartMission,
  onPurchase,
  onUse,
  onPlace,
  onClinic,
  onUpgrade,
}: LifestyleDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const title = SURFACE_TITLES[surface];
  const catalogById = new Map(
    view.catalog.map((item) => [item.itemId, item]),
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeRef.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="surface-backdrop" onPointerDown={onClose}>
      <section
        ref={dialogRef}
        className="lifestyle-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="surface-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="section-kicker">{title.kicker}</span>
            <h2 id="surface-title">{title.title}</h2>
          </div>
          <button
            ref={closeRef}
            className="dialog-close"
            type="button"
            aria-label={`${title.title} 닫기`}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="surface-body">
          {surface === "mission" && (
            <section className="mission-launch">
              <span className="mission-orbit" aria-hidden="true">◎</span>
              <h3>강아지의 다음 신호를 함께 읽어 보세요.</h3>
              <p>
                단서를 관찰하고 원인·대응·마무리 보상을 차례로 선택하는 짧은 미션입니다.
              </p>
              <button
                className="primary-action"
                type="button"
                onClick={onStartMission}
              >
                다음 생활 미션 시작
              </button>
            </section>
          )}

          {surface === "bag" && (
            <ul className="inventory-list">
              {view.inventory.filter((entry) => entry.count > 0).map((entry) => {
                const item = catalogById.get(entry.itemId);
                if (!item) return null;
                return (
                  <li key={entry.itemId}>
                    <div className="item-copy">
                      <strong>{item.label}</strong>
                      <span>{entry.effectSummary}</span>
                      <small>
                        보유 {entry.count}개
                        {coverageLabel(item) && ` · ${coverageLabel(item)}`}
                      </small>
                    </div>
                    {canUseDirectly(item) && (
                      <button
                        type="button"
                        onClick={() => onUse(entry.itemId)}
                      >
                        사용
                      </button>
                    )}
                    {isPlaceable(item) && (
                      <div className="placement-actions" aria-label={`${item.label} 배치`}>
                        <button
                          type="button"
                          onClick={() => onPlace(item.itemId, "a")}
                        >
                          안전 프리셋 A
                        </button>
                        <button
                          type="button"
                          onClick={() => onPlace(item.itemId, "b")}
                        >
                          안전 프리셋 B
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {surface === "petMart" && (
            <>
              <div className="store-tabs" role="tablist" aria-label="펫마트 분류">
                {STORE_CATEGORIES.map((category) => (
                  <button
                    type="button"
                    role="tab"
                    key={category.id}
                    aria-selected={storeCategory === category.id}
                    className={storeCategory === category.id ? "is-active" : ""}
                    onClick={() => onStoreCategory(category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <ul className="catalog-list">
                {view.catalog
                  .filter((item) => item.category === storeCategory)
                  .map((item) => {
                    const count = view.inventory.find((entry) =>
                      entry.itemId === item.itemId
                    )?.count ?? 0;
                    return (
                      <li key={item.itemId}>
                        <div className="item-copy">
                          <strong>{item.label}</strong>
                          <span>{item.effectSummary}</span>
                          <small>
                            {coverageLabel(item) ?? "생활용품"} · 보유 {count}개
                          </small>
                        </div>
                        <div className="catalog-price">
                          <strong>{item.price.toLocaleString("ko-KR")}원</strong>
                          {item.locked && (
                            <small>돌봄 {item.unlockCarePoints}P 필요</small>
                          )}
                          <button
                            type="button"
                            disabled={item.locked || view.economy.money < item.price}
                            onClick={() => onPurchase(item.itemId)}
                          >
                            구매
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}

          {surface === "clinic" && (
            <section className="clinic-card">
              <span className="clinic-mark" aria-hidden="true">+</span>
              <h3>접종·예방 진료 예약</h3>
              <p>
                접종 일정과 예방 관리를 기록하는 게임 기능입니다. 건강 상태를 대신 진단하지 않으며, 이상 징후가 있으면 실제 동물병원에 문의하세요.
              </p>
              <dl>
                <div>
                  <dt>할인 쿠폰</dt>
                  <dd>{view.clinic.couponAvailable ? "사용 가능" : "없음"}</dd>
                </div>
                <div>
                  <dt>오늘 진료</dt>
                  <dd>{view.clinic.preventiveVisitCompleted ? "완료" : "미완료"}</dd>
                </div>
              </dl>
              <button
                className="primary-action"
                type="button"
                disabled={view.clinic.preventiveVisitCompleted}
                onClick={onClinic}
              >
                {view.clinic.preventiveVisitCompleted ? "예약 완료" : "접종·예방 진료 예약"}
              </button>
            </section>
          )}

          {surface === "upgrade" && (
            <ul className="upgrade-list">
              {view.upgrades.map((upgrade) => (
                <li key={upgrade.id}>
                  <div>
                    <strong>{upgrade.label}</strong>
                    <span>급여 보너스 +{upgrade.bonusPercent}%</span>
                  </div>
                  <button
                    type="button"
                    disabled={upgrade.purchased ||
                      view.economy.carePoints < upgrade.carePointCost}
                    onClick={() => onUpgrade(upgrade.id)}
                  >
                    {upgrade.purchased
                      ? "적용됨"
                      : `돌봄 ${upgrade.carePointCost}P`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {feedback && <p className="surface-feedback" role="status">{feedback}</p>}
      </section>
    </div>
  );
}
