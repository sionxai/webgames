import { SwordSeriesId } from '../types/game';

export const SWORD_ATLAS_COLUMNS = 7;
export const SWORD_ATLAS_ROWS = 3;
export const SWORD_ATLAS_CELL_SIZE = 256;

export interface SwordSeriesVisual {
  accent: string;
  glow: string;
  filter: string;
}

export const SWORD_SERIES_VISUALS: Record<SwordSeriesId, SwordSeriesVisual> = {
  kingdom: {
    accent: '#e2c79c',
    glow: 'rgba(226, 199, 156, 0.72)',
    filter: 'saturate(0.88) contrast(1.04)'
  },
  flame: {
    accent: '#ff6a2a',
    glow: 'rgba(255, 78, 28, 0.86)',
    filter: 'sepia(0.2) saturate(1.55) hue-rotate(338deg) contrast(1.08)'
  },
  guardian: {
    accent: '#50dcff',
    glow: 'rgba(64, 211, 255, 0.84)',
    filter: 'hue-rotate(92deg) saturate(1.18) brightness(1.06)'
  },
  berserk: {
    accent: '#ff334f',
    glow: 'rgba(255, 38, 69, 0.88)',
    filter: 'sepia(0.32) saturate(1.7) hue-rotate(320deg) contrast(1.15) brightness(0.9)'
  },
  dragon: {
    accent: '#ffd45a',
    glow: 'rgba(255, 205, 64, 0.92)',
    filter: 'sepia(0.42) saturate(1.42) hue-rotate(350deg) brightness(1.1)'
  }
};

export function clampSwordLevel(level: number): number {
  return Math.max(0, Math.min(20, Math.round(level)));
}

export function getSwordAtlasCell(level: number): { column: number; row: number } {
  const safeLevel = clampSwordLevel(level);
  return {
    column: safeLevel % SWORD_ATLAS_COLUMNS,
    row: Math.floor(safeLevel / SWORD_ATLAS_COLUMNS)
  };
}
