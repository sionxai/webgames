/** 격 — identity_status(전승상의 위상)에서 파생한다. 출처 문서의 품질과 무관하다. */
export type BonpuriRank = '상신' | '정신' | '당신' | '직신';

export type BonpuriCard = {
  id: string;
  name: string;
  canonical: string;
  aliases: string[];
  lineage: string;
  rank: BonpuriRank;
  cardType: string;
  domains: string[];
  sets: string[];
  bonds: string[];
  myth: string | null;
  bonpuriType: string | null;
  worship: string[];
  summary: string;
  sources: string[];
  region: {
    province: string | null;
    locality: string | null;
    shrine: string | null;
  } | null;
  flags: {
    needsReview: boolean;
    normalized: boolean;
  };
};
