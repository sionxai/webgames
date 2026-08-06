import { readFile, writeFile } from 'node:fs/promises';

const INPUT_PATH = 'ref/korean_deities_300.json';
const OUTPUT_PATH = 'src/bonpuri/data/cards.generated.json';
const SET_NAMES = new Set([
  '시왕',
  '십이지신장',
  '칠성 구성신',
  '오방제',
  '사신·오방수호신',
  '오토지신 구성신',
  '오방부인 구성신',
  '가택신',
  '마을·본향당신',
  '일월조상신',
  '무조신',
  '역병신'
]);
const GENEALOGY_KEYS = ['parents', 'spouses', 'children', 'related_deities'] as const;

type Genealogy = Record<(typeof GENEALOGY_KEYS)[number], string[]>;
type SourceDeity = {
  id: string;
  record_name: string;
  canonical_name: string;
  aliases: string[];
  group: string;
  deity_class: string;
  domains: string[];
  identity_status: string;
  myth_cycle: string | null;
  bonpuri_type: string | null;
  genealogy: Genealogy | null;
  worship_context: string[];
  narrative_summary: string;
  source_ids: string[];
  confidence: string;
  source_grade: string;
  region: {
    province: string | null;
    locality: string | null;
    shrine: string | null;
  } | null;
  quality_flags: {
    orthography_normalized: boolean;
    needs_primary_source_review: boolean;
  };
};

type SourceDocument = { deities: SourceDeity[] };

function addName(index: Map<string, string>, name: string, id: string): void {
  if (!index.has(name)) index.set(name, id);
}

// 격은 identity_status(전승상의 위상)에서만 파생한다.
// source_grade를 쓰면 제주 신격이 일률 하위로 밀린다 — 전국 200종은 A등급, 제주 100종은 67건이 B등급인데
// 이는 출처 문서의 성격(백과 vs OCR 정규화 일람표)일 뿐 신격의 위상이 아니다.
const RANK_BY_IDENTITY = new Map<string, '상신' | '정신' | '당신' | '직신'>([
  // 상신 — 고유한 이름·서사를 가진 독립신과 시원신
  ['independent', '상신'],
  ['founder_deity', '상신'],
  ['deified_founder', '상신'],
  ['deified_ancestress', '상신'],
  ['deified_king', '상신'],
  // 정신 — 신격화된 인물과 집합 신격
  ['deified_mythic_figure', '정신'],
  ['deified_historical_person', '정신'],
  ['deified_spirit', '정신'],
  ['mythic_deity', '정신'],
  ['collective_deity', '정신'],
  ['syncretic_deity', '정신'],
  // 당신 — 특정 지역·신당·가문에 좌정한 고유 신격
  ['localized_deity', '당신'],
  ['localized_manifestation', '당신'],
  ['regional_variant', '당신'],
  ['deified_ancestor', '당신'],
  ['disputed_deity', '당신'],
  ['disputed_deified_figure', '당신'],
  // 직신 — 직함·유형명으로 전승되거나 집단 신격의 구성원
  ['office_title', '직신'],
  ['deity_type', '직신'],
  ['collective_member', '직신'],
  ['regional_deity_type', '직신'],
  ['ancestor_deity_type', '직신']
]);

function rankFor(deity: SourceDeity): '상신' | '정신' | '당신' | '직신' {
  const rank = RANK_BY_IDENTITY.get(deity.identity_status);
  if (!rank) throw new Error(`매핑되지 않은 identity_status: ${deity.identity_status} (${deity.id})`);
  return rank;
}

const source = JSON.parse(await readFile(INPUT_PATH, 'utf8')) as SourceDocument;
const deities = [...source.deities].sort((a, b) => a.id.localeCompare(b.id));
const recordNames = new Map<string, string>();
const canonicalNames = new Map<string, string>();
const aliases = new Map<string, string>();

for (const deity of deities) addName(recordNames, deity.record_name, deity.id);
for (const deity of deities) addName(canonicalNames, deity.canonical_name, deity.id);
for (const deity of deities) {
  for (const alias of deity.aliases) addName(aliases, alias, deity.id);
}

const unresolved: Array<{ id: string; name: string }> = [];
const cards = deities.map(deity => {
  const bondIds = new Set<string>();
  if (deity.genealogy) {
    for (const key of GENEALOGY_KEYS) {
      for (const name of deity.genealogy[key]) {
        const id = recordNames.get(name) ?? canonicalNames.get(name) ?? aliases.get(name);
        if (!id) unresolved.push({ id: deity.id, name });
        else if (id !== deity.id) bondIds.add(id);
      }
    }
  }

  return {
    id: deity.id,
    name: deity.record_name,
    canonical: deity.canonical_name,
    aliases: [...deity.aliases],
    lineage: deity.group,
    rank: rankFor(deity),
    cardType: deity.identity_status,
    domains: [...deity.domains],
    sets: SET_NAMES.has(deity.deity_class) ? [deity.deity_class] : [],
    bonds: [...bondIds].sort((a, b) => a.localeCompare(b)),
    myth: deity.myth_cycle,
    bonpuriType: deity.bonpuri_type,
    worship: [...deity.worship_context],
    summary: deity.narrative_summary,
    sources: [...deity.source_ids],
    region: deity.region === null
      ? null
      : {
          province: deity.region.province,
          locality: deity.region.locality,
          shrine: deity.region.shrine
        },
    flags: {
      needsReview: deity.quality_flags.needs_primary_source_review,
      normalized: deity.quality_flags.orthography_normalized
    }
  };
});

await writeFile(OUTPUT_PATH, `${JSON.stringify(cards, null, 2)}\n`, 'utf8');

function counts(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of [...values].sort((a, b) => a.localeCompare(b))) {
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

console.log(`계열별 카드 수: ${JSON.stringify(counts(cards.map(card => card.lineage)))}`);
console.log(`격별 카드 수: ${JSON.stringify(counts(cards.map(card => card.rank)))}`);
console.log(`세트별 구성원 수: ${JSON.stringify(counts(cards.flatMap(card => card.sets)))}`);
console.log(`해석 실패한 연계 이름 (${unresolved.length}건):`);
for (const item of unresolved) console.log(`- ${item.id}: ${item.name}`);
