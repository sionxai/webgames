import React from 'react';
import { SWORD_SERIES_LIST, SWORD_STAGES } from '../../constants/gameBalance';
import { GAME_IMAGES } from '../../constants/imageAssets';
import {
  clampSwordLevel,
  getSwordAtlasCell,
  SWORD_ATLAS_COLUMNS,
  SWORD_ATLAS_ROWS,
  SWORD_SERIES_VISUALS
} from '../../constants/swordVisuals';
import { SwordSeriesId } from '../../types/game';

interface SwordSpriteProps {
  level: number;
  seriesId: SwordSeriesId;
  size?: number;
  className?: string;
}

export const SwordSprite: React.FC<SwordSpriteProps> = ({
  level,
  seriesId,
  size = 64,
  className = ''
}) => {
  const safeLevel = clampSwordLevel(level);
  const cell = getSwordAtlasCell(safeLevel);
  const stage = SWORD_STAGES[safeLevel];
  const series = SWORD_SERIES_LIST.find(item => item.id === seriesId) || SWORD_SERIES_LIST[0];
  const visual = SWORD_SERIES_VISUALS[seriesId];
  const style = {
    '--sword-size': `${size}px`,
    '--sword-glow': visual.glow,
    '--sword-filter': visual.filter
  } as React.CSSProperties;

  return (
    <span
      className={`sword-sprite sword-sprite--${seriesId} sword-sprite--tier-${Math.floor(safeLevel / 5)} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={`${series.name} +${safeLevel} ${stage.name}`}
    >
      <img
        className="sword-sprite__sheet"
        src={GAME_IMAGES.swordLevelAtlas}
        alt=""
        draggable={false}
        style={{
          width: size * SWORD_ATLAS_COLUMNS,
          height: size * SWORD_ATLAS_ROWS,
          transform: `translate3d(${-cell.column * size}px, ${-cell.row * size}px, 0)`
        }}
      />
    </span>
  );
};
