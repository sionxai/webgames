import React, { useState } from 'react';
import { BossDefinition, EnhancePreview, UserGameProfile } from '../../types/game';
import {
  BOSS_LIST,
  CATALYST_DEFINITIONS,
  SWORD_STAGES,
  SWORD_SERIES_LIST,
  calculateEnhancePreview
} from '../../constants/gameBalance';
import { GAME_IMAGES } from '../../constants/imageAssets';
import { MaterialSprite } from '../common/MaterialSprite';
import { SwordSprite } from '../common/SwordSprite';

interface CollectionGuideViewProps {
  profile: UserGameProfile;
}

interface BossAtlasSpriteProps {
  boss: BossDefinition;
}

const BossAtlasSprite: React.FC<BossAtlasSpriteProps> = ({ boss }) => {
  if (boss.atlasSource === null || boss.atlasCell === null) return <span className="boss-atlas-fallback" aria-hidden="true">{boss.icon}</span>;
  const isMidboss = boss.atlasSource === 'midboss';
  const maxCell = isMidboss ? 4 : 9;
  const cell = Math.max(0, Math.min(maxCell, Math.floor(boss.atlasCell)));
  const column = cell % 5;
  const row = isMidboss ? 0 : Math.floor(cell / 5);

  return (
    <span
      className={isMidboss ? 'boss-atlas-sprite boss-atlas-sprite--midboss' : 'boss-atlas-sprite'}
      style={{
        '--boss-atlas-image': `url(${isMidboss ? GAME_IMAGES.forgeMidbossAtlas : GAME_IMAGES.forgeBossAtlas})`,
        '--boss-atlas-size': isMidboss ? '500% auto' : '500% 200%',
        '--boss-position-x': `${column * 25}%`,
        '--boss-position-y': isMidboss ? 'center' : `${row * 100}%`
      } as React.CSSProperties}
      aria-hidden="true"
    />
  );
};

interface TranscendenceSpriteProps {
  atlasCell: number;
}

const TranscendenceSprite: React.FC<TranscendenceSpriteProps> = ({ atlasCell }) => (
  <span
    className="transcendence-sprite"
    style={{
      '--transcendence-image': `url(${GAME_IMAGES.forgeTranscendenceAtlas})`,
      '--transcendence-position-x': atlasCell === 0 ? '0%' : '100%'
    } as React.CSSProperties}
    aria-hidden="true"
  />
);

function getDisplayedRates(preview: EnhancePreview) {
  const raw = [preview.successRate, preview.keepRate, preview.crackRate, preview.dropRate];
  const tenths = raw.map(rate => Math.floor(rate * 10 + Number.EPSILON));
  const remainder = 1000 - tenths.reduce((sum, rate) => sum + rate, 0);
  const order = raw
    .map((rate, index) => ({ index, fraction: rate * 10 - tenths[index] }))
    .sort((left, right) => right.fraction - left.fraction);
  for (let index = 0; index < remainder; index += 1) {
    tenths[order[index % order.length].index] += 1;
  }
  return tenths.map(rate => (rate / 10).toFixed(1));
}

function getProgressRewardLabel(level: number): string {
  if (level <= 9) return '제련의 불씨 4회까지 확정 충전';
  if (level <= 13) return '제련 3회 · 심연 2회까지 확정 충전';
  if (level <= 17) return '심연의 인장 2회까지 확정 충전';
  return '심연의 인장 1회까지 확정 충전';
}

interface BossArchiveProps {
  bosses: readonly BossDefinition[];
  profile: UserGameProfile;
  title: string;
  kicker: string;
  titleId: string;
  summary: string;
}

const BossArchive: React.FC<BossArchiveProps> = ({ bosses, profile, title, kicker, titleId, summary }) => {
  const activeBossId = profile.currentWeapon.bossEncounter?.active?.bossId ?? null;
  return (
    <section className="boss-codex-section" aria-labelledby={titleId}>
      <div className="boss-codex-heading">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <span>{summary}</span>
      </div>
      <div className="encounter-codex-grid">
        {bosses.map(boss => {
          const discovered = profile.maxLevelReached >= boss.milestone;
          const isActive = boss.id === activeBossId;
          return (
            <article
              key={boss.id}
              className={`encounter-codex-card${discovered ? ' is-discovered' : ' is-locked'}${isActive ? ' is-active' : ''}`}
            >
              <BossAtlasSprite boss={boss} />
              <div className="encounter-codex-card__copy">
                <small>+{boss.milestone} {isActive ? '· 현재 조우' : ''}</small>
                <strong>{discovered ? boss.name : '미지의 보스'}</strong>
                <span>{getProgressRewardLabel(boss.milestone)}</span>
                <span>일반 적 셔플백 징조로 자동 출현</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export const CollectionGuideView: React.FC<CollectionGuideViewProps> = ({ profile }) => {
  const [subTab, setSubTab] = useState<'collection' | 'probability' | 'guide'>('collection');
  const totalItems = SWORD_SERIES_LIST.length * 21;
  const unlockedCount = profile.unlockedSwords.length;
  const unlockPercent = ((unlockedCount / totalItems) * 100).toFixed(1);
  const midbosses = BOSS_LIST.filter(boss => boss.milestone >= 5 && boss.milestone <= 9);
  const upperBosses = BOSS_LIST.filter(boss => boss.milestone >= 10 && boss.milestone <= 19);
  const discoveredMidbosses = midbosses.filter(boss => profile.maxLevelReached >= boss.milestone).length;
  const discoveredUpperBosses = upperBosses.filter(boss => profile.maxLevelReached >= boss.milestone).length;
  const relics = [
    { id: 'godblood' as const, name: '신혈의 성유물', stage: 18, chance: 3, threshold: 40, atlasCell: 0 },
    { id: 'end' as const, name: '종말의 성유물', stage: 19, chance: 1, threshold: 100, atlasCell: 1 }
  ];

  return (
    <div className="collection-guide-view">
      <div className="collection-subtabs" role="tablist" aria-label="도감과 게임 정보">
        <button type="button" role="tab" aria-selected={subTab === 'collection'} className={subTab === 'collection' ? 'is-active is-collection' : ''} onClick={() => setSubTab('collection')}>
          📖 검·조우 도감
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'probability'} className={subTab === 'probability' ? 'is-active is-probability' : ''} onClick={() => setSubTab('probability')}>
          📊 실제 확률표
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'guide'} className={subTab === 'guide' ? 'is-active is-guide' : ''} onClick={() => setSubTab('guide')}>
          💡 공략 가이드
        </button>
      </div>

      {subTab === 'collection' && (
        <div className="collection-sections" role="tabpanel">
          <div className="collection-progress">🎯 현재 검 도감 수집률: <b>{unlockPercent}%</b> ({unlockedCount}종 발견)</div>
          {SWORD_SERIES_LIST.map(series => (
            <section key={series.id} className="glass-card sword-codex-series">
              <h3><span aria-hidden="true">{series.icon}</span> {series.name} 계열</h3>
              <div className="sword-codex-grid">
                {[0, 5, 10, 15, 20].map(level => {
                  const key = `${series.id}_${level}`;
                  const isUnlocked = profile.unlockedSwords.includes(key) || (series.id === 'kingdom' && level <= profile.maxLevelReached);
                  const stageData = SWORD_STAGES[level];
                  return (
                    <div key={level} className={isUnlocked ? 'sword-codex-item is-unlocked' : 'sword-codex-item'} style={{ '--codex-color': stageData.color } as React.CSSProperties}>
                      {isUnlocked ? <SwordSprite level={level} seriesId={series.id} size={48} /> : <div className="sword-codex-lock" aria-label={`+${level} 미발견`}>🔒</div>}
                      <div>{isUnlocked ? stageData.name : '???'}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <BossArchive bosses={midbosses} profile={profile} title="중간보스 5종" kicker="MIDBOSS ENCOUNTERS" titleId="midboss-codex-title" summary={`${discoveredMidbosses} / 5 발견`} />
          <BossArchive bosses={upperBosses} profile={profile} title="상위보스 10종" kicker="UPPER BOSS ENCOUNTERS" titleId="upper-boss-codex-title" summary={`${discoveredUpperBosses} / 10 발견`} />

          <section className="boss-codex-section transcendence-section" aria-labelledby="transcendence-codex-title">
            <div className="boss-codex-heading">
              <div><span className="section-kicker">PERMANENT TRANSCENDENCE</span><h2 id="transcendence-codex-title">초월 유물 2종</h2></div>
              <span>계정 영구 보존</span>
            </div>
            <div className="transcendence-grid">
              {relics.map(relic => {
                const progress = profile.transcendence[relic.id];
                return (
                  <article key={relic.id} className={progress.relics > 0 ? 'transcendence-card is-owned' : 'transcendence-card'}>
                    <TranscendenceSprite atlasCell={relic.atlasCell} />
                    <div><small>+{relic.stage} 보스 · 검당 최초 1회 {relic.chance}%</small><strong>{relic.name}</strong><span>완제품 {progress.relics}개 · 조각 {progress.shards}/{relic.threshold}</span><p>실패 시 조각 1개 확정, 충전·매각·정산과 무관하게 영구 유지</p></div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="boss-codex-section legacy-catalyst-section" aria-labelledby="legacy-catalyst-title">
            <div className="boss-codex-heading">
              <div><span className="section-kicker">READ-ONLY LEGACY ARCHIVE</span><h2 id="legacy-catalyst-title">레거시 재료 보관함</h2></div>
              <span>신규 충전과 분리</span>
            </div>
            <p className="legacy-catalyst-note">기존 재료·천장·활성 충전 기록을 그대로 보존합니다. 제련의 불씨나 심연의 인장으로 환전되지 않으며 강화에 사용되지 않습니다.</p>
            <div className="legacy-catalyst-grid">
              {CATALYST_DEFINITIONS.map(definition => {
                const discovered = profile.discoveredCatalysts.includes(definition.id);
                return (
                  <article key={definition.id} className={discovered ? 'legacy-catalyst-card is-discovered' : 'legacy-catalyst-card'}>
                    <MaterialSprite atlasCell={definition.atlasCell} size={52} />
                    <div><strong>{definition.name}</strong><span>+{definition.gateLevel} 예전 전용 재료</span></div>
                    <dl><div><dt>보관</dt><dd>{profile.catalystInventory[definition.id] || 0}</dd></div><div><dt>천장 기록</dt><dd>{profile.catalystPity[definition.id] || 0}</dd></div><div><dt>구 충전</dt><dd>{profile.activeCatalystCharges[definition.id] || 0}</dd></div></dl>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {subTab === 'probability' && (
        <div className="probability-table-shell" role="tabpanel">
          <p className="probability-table-note">현재 검 계열·영구 성장·연속 실패 보정을 적용한 실제 최종 4분포입니다.</p>
          <table>
            <thead><tr><th>단계</th><th>검 이름</th><th>강화비용</th><th>성공</th><th>유지</th><th>균열</th><th>하락</th></tr></thead>
            <tbody>
              {SWORD_STAGES.map(stage => {
                const rates = stage.level < 20 ? getDisplayedRates(calculateEnhancePreview({ ...profile, currentLevel: stage.level })) : null;
                return (
                  <tr key={stage.level} style={{ '--stage-color': stage.color } as React.CSSProperties}>
                    <td>+{stage.level}</td><td>{stage.name}</td><td>{stage.level < 20 ? `${stage.enhanceCost.toLocaleString()} G` : '완성'}</td>
                    {rates ? <><td>{rates[0]}%</td><td>{rates[1]}%</td><td>{rates[2]}%</td><td>{rates[3]}%</td></> : <td colSpan={4}>최고 단계</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'guide' && (
        <div className="strategy-guide" role="tabpanel">
          <div className="strategy-tip strategy-tip--gold"><strong>💡 팁 1: 핵심 골드 수급은 [검 매각]!</strong><p>사냥 골드는 최소한입니다. 강화한 검을 매각해 큰 골드를 확보하세요.</p></div>
          <div className="strategy-tip strategy-tip--repair"><strong>💡 팁 2: 균열 관리와 귀속 충전</strong><p>파괴 후 복구하면 현재 검의 충전은 남지만, 매각·정산으로 새 검을 만들면 소멸합니다.</p></div>
          <div className="strategy-tip strategy-tip--catalyst"><strong>💡 팁 3: 보스 징조는 자동 진행</strong><p>+5부터 일반 적을 처치하면 셔플백이 진행됩니다. 현재 구간에 쓸 충전이 있으면 징조는 기존 위치에서 잠시 멈춥니다.</p></div>
        </div>
      )}
    </div>
  );
};
