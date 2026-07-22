import React from 'react';
import { GAME_IMAGES } from '../../constants/imageAssets';

interface MaterialSpriteProps {
  atlasCell: number;
  size?: number;
  className?: string;
}

export const MaterialSprite: React.FC<MaterialSpriteProps> = ({
  atlasCell,
  size = 48,
  className = ''
}) => {
  const cell = Math.max(0, Math.min(9, Math.floor(atlasCell)));
  const column = cell % 5;
  const row = Math.floor(cell / 5);

  return (
    <span
      className={`material-sprite${className ? ` ${className}` : ''}`}
      style={{
        '--material-size': `${size}px`,
        '--material-image': `url(${GAME_IMAGES.forgeMaterialAtlas})`,
        '--material-position-x': `${column * 25}%`,
        '--material-position-y': `${row * 100}%`
      } as React.CSSProperties}
      aria-hidden="true"
    />
  );
};
