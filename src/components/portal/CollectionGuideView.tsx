import React, { useState } from 'react';
import { UserGameProfile } from '../../types/game';
import {
  BOSS_LIST,
  CATALYST_DEFINITIONS,
  SWORD_STAGES,
  SWORD_SERIES_LIST
} from '../../constants/gameBalance';
import { GAME_IMAGES } from '../../constants/imageAssets';
import { MaterialSprite } from '../common/MaterialSprite';
import { SwordSprite } from '../common/SwordSprite';

interface CollectionGuideViewProps {
  profile: UserGameProfile;
}

interface BossAtlasSpriteProps {
  atlasCell: number;
}

const BossAtlasSprite: React.FC<BossAtlasSpriteProps> = ({ atlasCell }) => {
  const cell = Math.max(0, Math.min(9, Math.floor(atlasCell)));
  const column = cell % 5;
  const row = Math.floor(cell / 5);

  return (
    <span
      className="boss-atlas-sprite"
      style={{
        '--boss-atlas-image': `url(${GAME_IMAGES.forgeBossAtlas})`,
        '--boss-position-x': `${column * 25}%`,
        '--boss-position-y': `${row * 100}%`
      } as React.CSSProperties}
      aria-hidden="true"
    />
  );
};

export const CollectionGuideView: React.FC<CollectionGuideViewProps> = ({ profile }) => {
  const [subTab, setSubTab] = useState<'collection' | 'probability' | 'guide'>('collection');

  const totalItems = SWORD_SERIES_LIST.length * 21;
  const unlockedCount = profile.unlockedSwords.length;
  const unlockPercent = ((unlockedCount / totalItems) * 100).toFixed(1);
  const discoveredCatalystCount = CATALYST_DEFINITIONS.filter(definition => (
    profile.discoveredCatalysts.includes(definition.id)
  )).length;

  return (
    <div className="collection-guide-view">
      <div className="collection-subtabs" role="tablist" aria-label="도감과 게임 정보">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'collection'}
          className={subTab === 'collection' ? 'is-active is-collection' : ''}
          onClick={() => setSubTab('collection')}
        >
          📖 검·보스 도감 ({unlockedCount}/{totalItems})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'probability'}
          className={subTab === 'probability' ? 'is-active is-probability' : ''}
          onClick={() => setSubTab('probability')}
        >
          📊 공식 확률표
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'guide'}
          className={subTab === 'guide' ? 'is-active is-guide' : ''}
          onClick={() => setSubTab('guide')}
        >
          💡 공략 가이드
        </button>
      </div>

      {subTab === 'collection' && (
        <div className="collection-sections" role="tabpanel">
          <div className="collection-progress">
            🎯 현재 검 도감 수집률: <b>{unlockPercent}%</b> ({unlockedCount}종 발견)
          </div>

          {SWORD_SERIES_LIST.map(series => (
            <section key={series.id} className="glass-card sword-codex-series">
              <h3><span aria-hidden="true">{series.icon}</span> {series.name} 계열</h3>
              <div className="sword-codex-grid">
                {[0, 5, 10, 15, 20].map(level => {
                  const key = `${series.id}_${level}`;
                  const isUnlocked = profile.unlockedSwords.includes(key)
                    || (series.id === 'kingdom' && level <= profile.maxLevelReached);
                  const stageData = SWORD_STAGES[level];

                  return (
                    <div
                      key={level}
                      className={isUnlocked ? 'sword-codex-item is-unlocked' : 'sword-codex-item'}
                      style={{ '--codex-color': stageData.color } as React.CSSProperties}
                    >
                      {isUnlocked ? (
                        <SwordSprite level={level} seriesId={series.id} size={48} />
                      ) : (
                        <div className="sword-codex-lock" aria-label={`+${level} 미발견`}>🔒</div>
                      )}
                      <div>{isUnlocked ? stageData.name : '???'}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="boss-codex-section" aria-labelledby="boss-codex-title">
            <div className="boss-codex-heading">
              <div>
                <span className="section-kicker">BOSS &amp; CATALYST ARCHIVE</span>
                <h2 id="boss-codex-title">보스·촉매 도감</h2>
              </div>
              <span>{discoveredCatalystCount} / {CATALYST_DEFINITIONS.length} 발견</span>
            </div>

            <div className="boss-codex-grid">
              {CATALYST_DEFINITIONS.map(definition => {
                const boss = BOSS_LIST.find(item => item.milestone === definition.gateLevel);
                const discovered = profile.discoveredCatalysts.includes(definition.id);
                const inventoryCount = profile.catalystInventory[definition.id] || 0;

                return (
                  <article
                    key={definition.id}
                    className={discovered ? 'boss-codex-card is-discovered' : 'boss-codex-card is-locked'}
                  >
                    <div className="boss-codex-card__visuals">
                      <div className="boss-codex-card__portrait">
                        <BossAtlasSprite atlasCell={definition.atlasCell} />
                        <span>+{definition.gateLevel} {boss?.name || '미지의 보스'}</span>
                      </div>
                      <span className="boss-codex-card__arrow" aria-hidden="true">→</span>
                      <div className="boss-codex-card__material">
                        <MaterialSprite atlasCell={definition.atlasCell} size={54} />
                        <span>{definition.name}</span>
                        {!discovered && <b aria-label="미발견 재료">🔒 미발견</b>}
                      </div>
                    </div>

                    <dl className="boss-codex-card__rules">
                      <div><dt>드롭률</dt><dd>{definition.dropRate}%</dd></div>
                      <div><dt>천장</dt><dd>{definition.pityThreshold}회</dd></div>
                      <div><dt>1개 충전</dt><dd>{definition.chargesPerItem}회</dd></div>
                      <div><dt>보유량</dt><dd>{inventoryCount}개</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {subTab === 'probability' && (
        <div className="probability-table-shell" role="tabpanel">
          <table>
            <thead>
              <tr>
                <th>단계</th>
                <th>검 이름</th>
                <th>강화비용</th>
                <th>성공률</th>
                <th>유지</th>
                <th>균열</th>
                <th>하락</th>
              </tr>
            </thead>
            <tbody>
              {SWORD_STAGES.map(stage => (
                <tr key={stage.level} style={{ '--stage-color': stage.color } as React.CSSProperties}>
                  <td>+{stage.level}</td>
                  <td>{stage.name}</td>
                  <td>{stage.enhanceCost.toLocaleString()} G</td>
                  <td>{stage.baseSuccessRate}%</td>
                  <td>{stage.keepFailRate}%</td>
                  <td>{stage.crackFailRate}%</td>
                  <td>{stage.dropFailRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'guide' && (
        <div className="strategy-guide" role="tabpanel">
          <div className="strategy-tip strategy-tip--gold">
            <strong>💡 팁 1: 핵심 골드 수급은 [검 매각]!</strong>
            <p>사냥 골드는 최소한입니다. 강화를 거듭하여 무기 단계를 올린 뒤 [검 매각]으로 큰 골드를 수급하세요.</p>
          </div>
          <div className="strategy-tip strategy-tip--repair">
            <strong>💡 팁 2: 균열 관리와 감가상각</strong>
            <p>균열이 발생하면 매각가가 15%씩 줄어듭니다. 파괴되기 전에 균열 수리를 적극 활용하세요.</p>
          </div>
          <div className="strategy-tip strategy-tip--catalyst">
            <strong>💡 팁 3: 고강화는 보스 추적부터</strong>
            <p>+10~+19 강화에는 단계별 촉매 충전이 필요합니다. 보스 모드를 반복 공략하면 공개 천장 안에 재료를 확정 획득합니다.</p>
          </div>
        </div>
      )}
    </div>
  );
};
