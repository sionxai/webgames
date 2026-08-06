import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const INPUT_PATH = 'ref/korean_deities_300.json';
const OUTPUT_PATH = 'src/bonpuri/data/cards.generated.json';
const EXPECTED_SHA = 'feb82e4d768950d0c08d8af9ffcaef084690f8ad925408e28e28c66128c3682a';
const GENEALOGY_KEYS = ['parents', 'spouses', 'children', 'related_deities'] as const;
const EXPECTED_LINEAGES: Record<string, number> = {
  '자연·가택·생업·마을 신격': 66,
  '천상·방위·명부·호법 신격': 59,
  '제주 마을 당신·본향신': 45,
  '서사무가·무조·무신도 계열': 40,
  '제주 일반신본풀이·공통 신격': 40,
  '창세·건국·시조·신격화 인물': 35,
  '제주 조상신·일월조상': 15
};
const EXPECTED_RANKS: Record<string, number> = { 상신: 36, 정신: 51, 당신: 85, 직신: 128 };
const EXPECTED_SETS: Record<string, number> = {
  시왕: 10,
  십이지신장: 12,
  '칠성 구성신': 7,
  오방제: 5,
  '사신·오방수호신': 5,
  '오토지신 구성신': 5,
  '오방부인 구성신': 5,
  가택신: 18,
  '마을·본향당신': 45,
  일월조상신: 15,
  무조신: 9,
  역병신: 5
};

type Genealogy = Record<(typeof GENEALOGY_KEYS)[number], string[]>;
type SourceDeity = {
  id: string;
  record_name: string;
  canonical_name: string;
  aliases: string[];
  genealogy: Genealogy | null;
};
type Card = {
  id: string;
  lineage: string;
  rank: string;
  sets: string[];
  bonds: string[];
  summary: string;
  sources: string[];
};

let passed = 0;
const failures: string[] = [];

function check(number: number, name: string, action: () => void): void {
  try {
    action();
    passed += 1;
    console.log(`✓ ${number}. ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${number}. ${name}: ${message}`);
    console.error(`✗ ${number}. ${name}: ${message}`);
  }
}

function counts(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

const sourceBytes = await readFile(INPUT_PATH);
const source = JSON.parse(sourceBytes.toString('utf8')) as { deities: SourceDeity[] };
let generatedBytes = await readFile(OUTPUT_PATH);
let cards = JSON.parse(generatedBytes.toString('utf8')) as Card[];
const sourceIds = new Set(source.deities.map(deity => deity.id));
const cardIds = new Set(cards.map(card => card.id));

check(1, '총 카드 수', () => assert.equal(cards.length, 300));
check(2, 'id 중복 0', () => assert.equal(cardIds.size, cards.length));
check(3, '원본 id 전건 대응', () => {
  assert.deepEqual([...sourceIds].filter(id => !cardIds.has(id)), []);
  assert.deepEqual([...cardIds].filter(id => !sourceIds.has(id)), []);
});
check(4, '계열 수 / 합계', () => {
  const actual = counts(cards.map(card => card.lineage));
  assert.equal(Object.keys(actual).length, 7);
  assert.equal(Object.values(actual).reduce((sum, value) => sum + value, 0), 300);
});
check(5, '계열별 카드 수', () => assert.deepEqual(counts(cards.map(card => card.lineage)), EXPECTED_LINEAGES));
check(6, '격 분포', () => assert.deepEqual(counts(cards.map(card => card.rank)), EXPECTED_RANKS));
check(7, '세트 구성원 수', () => assert.deepEqual(counts(cards.flatMap(card => card.sets)), EXPECTED_SETS));
check(8, '연계 무결성', () => {
  const byId = new Map(source.deities.map(deity => [deity.id, deity]));
  const recordNames = new Map(source.deities.map(deity => [deity.record_name, deity.id]));
  const canonicalNames = new Map(source.deities.map(deity => [deity.canonical_name, deity.id]));
  const aliasNames = new Map(source.deities.flatMap(deity => deity.aliases.map(alias => [alias, deity.id] as const)));
  for (const card of cards) {
    assert.ok(card.bonds.every(id => cardIds.has(id)), `${card.id}: 존재하지 않는 bond`);
    const deity = byId.get(card.id);
    assert.ok(deity, `${card.id}: 원본 없음`);
    const grounded = new Set<string>();
    if (deity.genealogy) {
      for (const key of GENEALOGY_KEYS) {
        for (const name of deity.genealogy[key]) {
          const id = recordNames.get(name) ?? canonicalNames.get(name) ?? aliasNames.get(name);
          if (id && id !== deity.id) grounded.add(id);
        }
      }
    }
    assert.deepEqual(card.bonds, [...grounded].sort((a, b) => a.localeCompare(b)), `${card.id}: genealogy 불일치`);
  }
});
check(9, '연계 출처', () => {
  const byId = new Map(source.deities.map(deity => [deity.id, deity]));
  for (const card of cards.filter(item => item.bonds.length > 0)) {
    assert.ok(byId.get(card.id)?.genealogy, `${card.id}: genealogy 없음`);
  }
});
check(10, '결정성', () => {
  // npm run 실행 시 node_modules/.bin(상위 디렉토리 포함)이 PATH에 주입된다.
  // 상대경로를 하드코딩하면 워크트리처럼 로컬 node_modules가 없는 환경에서 ENOENT가 난다.
  const command = 'esbuild';
  const args = ['scripts/build-bonpuri-cards.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=/tmp/bonpuri-build.mjs'];
  const bundle = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(bundle.status, 0, bundle.stderr);
  const firstBuild = spawnSync(process.execPath, ['/tmp/bonpuri-build.mjs'], { encoding: 'utf8' });
  assert.equal(firstBuild.status, 0, firstBuild.stderr);
  const first = readFileSync(OUTPUT_PATH);
  const secondBuild = spawnSync(process.execPath, ['/tmp/bonpuri-build.mjs'], { encoding: 'utf8' });
  assert.equal(secondBuild.status, 0, secondBuild.stderr);
  const second = readFileSync(OUTPUT_PATH);
  assert.deepEqual(first, second);
});
check(11, '원본 불변', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), EXPECTED_SHA);
});
check(12, '필수 필드', () => {
  generatedBytes = readFileSync(OUTPUT_PATH);
  cards = JSON.parse(generatedBytes.toString('utf8')) as Card[];
  assert.ok(cards.every(card => card.summary.trim().length > 0), '빈 summary');
  assert.ok(cards.every(card => card.sources.length >= 1), '빈 sources');
});

console.log(`검증 결과: ${passed}/12 통과, ${failures.length} 실패`);
if (failures.length > 0) process.exitCode = 1;
