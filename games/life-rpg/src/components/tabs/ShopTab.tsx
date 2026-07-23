import React from "react";

import { SHOP_ITEMS } from "@/lib/constants";
import { formatMoney, toNumber } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShopTabProps = any;

export default function ShopTab(props: ShopTabProps) {
  const {
    shopCategories,
    shopFilter,
    setShopFilter,
    money,
    inventory,
    consumables,
    purchasingItemId,
    buyItem,
  } = props;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold mb-1">Premium Shop</h2>
          <p className="text-emerald-100 text-sm opacity-90">성장을 위한 최고의 투자.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-emerald-100">보유 자산</div>
          <div className="text-3xl font-mono font-bold">${formatMoney(toNumber(money, 0))}</div>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {shopCategories.map((category: any) => (
          <button
            key={category.id}
            onClick={() => setShopFilter(category.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${shopFilter === category.id
                ? "bg-emerald-600 text-white shadow-lg"
                : "bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700"
              }`}
          >
            {category.label}
          </button>
        ))}
        <button
          onClick={() => setShopFilter("all")}
          className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${shopFilter === "all" ? "bg-gray-800 text-white" : "bg-white dark:bg-gray-800 text-gray-500 border"
            }`}
        >
          전체 보기
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SHOP_ITEMS.filter((item) => shopFilter === "all" || item.category === shopFilter).map((item) => {
          const isOwned = inventory.includes(item.id);
          const availableMoney = toNumber(money, 0);
          const canAfford = availableMoney >= item.cost;
          const isConsumable = "consumable" in item && Boolean(item.consumable);
          const consumableCount = consumables[item.id] || 0;
          const isPurchasing = purchasingItemId === item.id;
          return (
            <div
              key={item.id}
              className={`p-5 rounded-xl border transition-all flex items-center gap-4 ${isOwned && !isConsumable
                  ? "bg-gray-100 dark:bg-gray-800 border-gray-200 opacity-60"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md"
                }`}
            >
              <div className={`p-3 rounded-full ${isOwned ? "bg-gray-200 text-gray-500" : "bg-emerald-50 text-emerald-600"}`}>
                <item.icon size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-800 dark:text-white">{item.label}</h3>
                <p className="text-xs text-gray-500 mb-1 line-clamp-1">{item.desc}</p>
                <div className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">${item.cost.toLocaleString()}</div>
              </div>
              <button
                onClick={() => buyItem(item.id)}
                disabled={isPurchasing || (!isConsumable && isOwned) || !canAfford}
                className={`px-4 py-2 rounded-lg text-xs font-bold ${isPurchasing
                    ? "bg-gray-200 text-gray-500"
                    : !isConsumable && isOwned
                      ? "bg-gray-200 text-gray-500"
                      : canAfford
                        ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
              >
                {isConsumable ? (consumableCount > 0 ? `보유 ${consumableCount}` : "구매") : isOwned ? "소유" : "구매"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
