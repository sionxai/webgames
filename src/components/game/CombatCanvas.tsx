import React, { useEffect, useRef, useState } from 'react';
import { BOSS_LIST, SWORD_SERIES_LIST, SWORD_STAGES } from '../../constants/gameBalance';
import {
  BossDefeatResult,
  CatalystDefinition,
  CatalystDropResult,
  SwordSeriesId,
  UserGameProfile
} from '../../types/game';
import { GAME_IMAGES } from '../../constants/imageAssets';
import { MaterialSprite } from '../common/MaterialSprite';
import {
  getSwordAtlasCell,
  SWORD_ATLAS_CELL_SIZE,
  SWORD_SERIES_VISUALS
} from '../../constants/swordVisuals';

declare global {
  interface Window {
    render_game_to_text?: () => string;
  }
}

interface CombatCanvasProps {
  profile: UserGameProfile;
  onAttackHit: (baseGold: number) => number;
  onBossKilled: (milestone: number) => BossDefeatResult;
}

type HuntMode = 'normal' | 'boss';

interface CombatConfig {
  level: number;
  seriesId: SwordSeriesId;
  attackPower: number;
  swordColor: string;
  swordGlow: string;
  destroyed: boolean;
  isBoss: boolean;
  repeatableBoss: boolean;
  huntMode: HuntMode;
  bossId: string | null;
  bossAtlasCell: number | null;
  bossMilestone: number | null;
  bossClaimed: boolean;
  catalyst: CatalystDefinition | null;
  catalystPity: number;
  catalystInventory: number;
  activeCatalystCharges: number;
  targetName: string;
  maxHp: number;
  normalMaxHp: number;
  baseGoldReward: number;
  visibleGoldReward: number;
  visibleEssenceReward: number;
  targetKey: string;
}

interface EffectParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  debris: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  value: string;
  color: string;
  life: number;
  maxLife: number;
}

interface SlashArc {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  color: string;
}

interface DropBurst {
  atlasCell: number;
  name: string;
  life: number;
  maxLife: number;
}

interface VisualState {
  autoElapsed: number;
  swingPhase: number;
  flash: number;
  shakeUntil: number;
  particles: EffectParticle[];
  texts: FloatingText[];
  arcs: SlashArc[];
  dropBurst: DropBurst | null;
}

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 420;
const TARGET_X = 360;
const TARGET_Y = 186;
const AUTO_ATTACK_INTERVAL = 1050;
const BOSS_MANUAL_ATTACK_COOLDOWN = 900;
const BOSS_ATLAS_CELL_SIZE = 384;
const MATERIAL_ATLAS_CELL_SIZE = 256;

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function drawForgeFallback(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#241a17');
  gradient.addColorStop(0.58, '#15100f');
  gradient.addColorStop(1, '#080707');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = '#3a2015';
  ctx.fillRect(0, 308, CANVAS_WIDTH, 112);
  ctx.fillStyle = 'rgba(240, 112, 35, 0.2)';
  ctx.beginPath();
  ctx.ellipse(TARGET_X, 352, 210, 42, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let index = 0; index < 7; index += 1) {
    const x = 38 + index * 112;
    ctx.fillStyle = index % 2 === 0 ? '#342721' : '#2b211d';
    ctx.fillRect(x, 35, 52, 260);
  }
}

function drawImpFallback(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(TARGET_X, TARGET_Y);
  ctx.fillStyle = '#42211d';
  ctx.beginPath();
  ctx.moveTo(-58, -36);
  ctx.lineTo(-82, -86);
  ctx.lineTo(-30, -64);
  ctx.lineTo(0, -78);
  ctx.lineTo(30, -64);
  ctx.lineTo(82, -86);
  ctx.lineTo(58, -36);
  ctx.quadraticCurveTo(72, 35, 0, 62);
  ctx.quadraticCurveTo(-72, 35, -58, -36);
  ctx.fill();
  ctx.fillStyle = '#f3a23e';
  ctx.beginPath();
  ctx.ellipse(-23, -14, 9, 6, -0.2, 0, Math.PI * 2);
  ctx.ellipse(23, -14, 9, 6, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBoss(ctx: CanvasRenderingContext2D, milestone: number) {
  const accent = milestone >= 15 ? '#c05cff' : milestone >= 10 ? '#ef4f2f' : '#d67a2c';
  ctx.save();
  ctx.translate(TARGET_X, TARGET_Y + 4);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 32;
  ctx.fillStyle = '#171313';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-72, -38);
  ctx.lineTo(-104, -91);
  ctx.lineTo(-38, -68);
  ctx.quadraticCurveTo(0, -102, 38, -68);
  ctx.lineTo(104, -91);
  ctx.lineTo(72, -38);
  ctx.quadraticCurveTo(82, 54, 0, 82);
  ctx.quadraticCurveTo(-82, 54, -72, -38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffd180';
  ctx.beginPath();
  ctx.ellipse(-30, -12, 13, 8, -0.25, 0, Math.PI * 2);
  ctx.ellipse(30, -12, 13, 8, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBossAtlasCell(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  atlasCell: number,
  time: number,
  reducedMotion: boolean,
  destroyed: boolean
) {
  const column = atlasCell % 5;
  const row = Math.floor(atlasCell / 5);
  const bob = reducedMotion || destroyed ? 0 : Math.sin(time * 0.0024) * 4;
  const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 0.0018) * 0.012;
  const drawSize = 330;

  ctx.save();
  ctx.translate(TARGET_X, TARGET_Y + 5 + bob);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = atlasCell >= 5 ? 'rgba(156, 91, 255, 0.78)' : 'rgba(240, 95, 44, 0.75)';
  ctx.shadowBlur = 28;
  ctx.drawImage(
    image,
    column * BOSS_ATLAS_CELL_SIZE,
    row * BOSS_ATLAS_CELL_SIZE,
    BOSS_ATLAS_CELL_SIZE,
    BOSS_ATLAS_CELL_SIZE,
    -drawSize / 2,
    -drawSize / 2,
    drawSize,
    drawSize
  );
  ctx.restore();
}

function drawMaterialDropBurst(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  burst: DropBurst,
  elapsedMs: number,
  reducedMotion: boolean
) {
  burst.life -= elapsedMs;
  if (burst.life <= 0) return;

  const progress = 1 - burst.life / burst.maxLife;
  const fade = Math.min(1, burst.life / 240);
  const rise = reducedMotion ? 0 : Math.sin(Math.min(1, progress) * Math.PI) * 18;
  const centerY = 142 - rise;

  ctx.save();
  ctx.globalAlpha = fade * (reducedMotion ? 0.62 : 0.92);
  const beam = ctx.createLinearGradient(TARGET_X, 344, TARGET_X, 38);
  beam.addColorStop(0, 'rgba(112, 227, 188, 0)');
  beam.addColorStop(0.24, 'rgba(112, 227, 188, 0.38)');
  beam.addColorStop(0.68, 'rgba(210, 255, 233, 0.82)');
  beam.addColorStop(1, 'rgba(229, 255, 241, 0)');
  ctx.fillStyle = beam;
  ctx.fillRect(TARGET_X - 62, 34, 124, 316);

  const halo = ctx.createRadialGradient(TARGET_X, centerY, 5, TARGET_X, centerY, 86);
  halo.addColorStop(0, 'rgba(234, 255, 243, 0.92)');
  halo.addColorStop(0.38, 'rgba(94, 222, 176, 0.52)');
  halo.addColorStop(1, 'rgba(94, 222, 176, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(TARGET_X - 92, centerY - 92, 184, 184);

  if (image?.complete && image.naturalWidth > 0) {
    const column = burst.atlasCell % 5;
    const row = Math.floor(burst.atlasCell / 5);
    ctx.shadowColor = '#85f0c2';
    ctx.shadowBlur = 24;
    ctx.drawImage(
      image,
      column * MATERIAL_ATLAS_CELL_SIZE,
      row * MATERIAL_ATLAS_CELL_SIZE,
      MATERIAL_ATLAS_CELL_SIZE,
      MATERIAL_ATLAS_CELL_SIZE,
      TARGET_X - 48,
      centerY - 48,
      96,
      96
    );
  } else {
    ctx.fillStyle = '#a8f2d1';
    ctx.shadowColor = '#85f0c2';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(TARGET_X, centerY, 25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSwordFallback(ctx: CanvasRenderingContext2D, config: CombatConfig, swingPhase: number) {
  const swing = Math.sin(Math.min(1, swingPhase) * Math.PI) * -0.58;
  ctx.save();
  ctx.translate(572, 338);
  ctx.rotate(-0.58 + swing);
  ctx.shadowColor = config.swordGlow;
  ctx.shadowBlur = 24;

  const blade = ctx.createLinearGradient(-12, -150, 14, 12);
  blade.addColorStop(0, '#fff7da');
  blade.addColorStop(0.34, config.swordColor);
  blade.addColorStop(1, '#5f554e');
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(0, -168);
  ctx.lineTo(17, -126);
  ctx.lineTo(13, -12);
  ctx.lineTo(-13, -12);
  ctx.lineTo(-17, -126);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 5;
  ctx.fillStyle = '#d9943d';
  ctx.fillRect(-38, -12, 76, 12);
  ctx.fillStyle = '#3a261f';
  ctx.fillRect(-9, 0, 18, 64);
  ctx.fillStyle = '#d9943d';
  ctx.beginPath();
  ctx.arc(0, 70, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

interface SwordPose {
  phase: 'idle' | 'anticipation' | 'windup' | 'slash' | 'impact' | 'follow-through' | 'recovery';
  angle: number;
  x: number;
  y: number;
  scale: number;
  afterimage: number;
}

function easeInOut(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * easeInOut(progress);
}

function resolveSwordPose(swingPhase: number, reducedMotion: boolean): SwordPose {
  if (swingPhase <= 0 || swingPhase >= 1) {
    return { phase: 'idle', angle: 0, x: 0, y: 0, scale: 1, afterimage: 0 };
  }

  const motionScale = reducedMotion ? 0.42 : 1;
  if (swingPhase < 0.14) {
    const progress = swingPhase / 0.14;
    return {
      phase: 'anticipation',
      angle: mix(0, 0.18, progress) * motionScale,
      x: mix(0, 8, progress) * motionScale,
      y: mix(0, 4, progress) * motionScale,
      scale: mix(1, 0.97, progress),
      afterimage: 0
    };
  }
  if (swingPhase < 0.28) {
    const progress = (swingPhase - 0.14) / 0.14;
    return {
      phase: 'windup',
      angle: mix(0.18, 0.48, progress) * motionScale,
      x: mix(8, 20, progress) * motionScale,
      y: mix(4, 10, progress) * motionScale,
      scale: mix(0.97, 0.94, progress),
      afterimage: 0
    };
  }
  if (swingPhase < 0.52) {
    const progress = (swingPhase - 0.28) / 0.24;
    return {
      phase: 'slash',
      angle: mix(0.48, -1.05, progress) * motionScale,
      x: mix(20, -32, progress) * motionScale,
      y: mix(10, -18, progress) * motionScale,
      scale: mix(0.94, 1.06, progress),
      afterimage: reducedMotion ? 0 : Math.sin(progress * Math.PI)
    };
  }
  if (swingPhase < 0.66) {
    const progress = (swingPhase - 0.52) / 0.14;
    return {
      phase: 'impact',
      angle: mix(-1.05, -1.28, progress) * motionScale,
      x: mix(-32, -46, progress) * motionScale,
      y: mix(-18, -26, progress) * motionScale,
      scale: mix(1.06, 1.03, progress),
      afterimage: reducedMotion ? 0 : 1 - progress * 0.45
    };
  }
  if (swingPhase < 0.82) {
    const progress = (swingPhase - 0.66) / 0.16;
    return {
      phase: 'follow-through',
      angle: mix(-1.28, -0.72, progress) * motionScale,
      x: mix(-46, -20, progress) * motionScale,
      y: mix(-26, -12, progress) * motionScale,
      scale: mix(1.03, 0.98, progress),
      afterimage: reducedMotion ? 0 : 0.42 * (1 - progress)
    };
  }

  const progress = (swingPhase - 0.82) / 0.18;
  return {
    phase: 'recovery',
    angle: mix(-0.72, 0, progress) * motionScale,
    x: mix(-20, 0, progress) * motionScale,
    y: mix(-12, 0, progress) * motionScale,
    scale: mix(0.98, 1, progress),
    afterimage: 0
  };
}

function drawSwordSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  config: CombatConfig,
  swingPhase: number,
  time: number,
  reducedMotion: boolean
) {
  const cell = getSwordAtlasCell(config.level);
  const visual = SWORD_SERIES_VISUALS[config.seriesId];
  const pose = resolveSwordPose(swingPhase, reducedMotion);
  const sourceX = cell.column * SWORD_ATLAS_CELL_SIZE;
  const sourceY = cell.row * SWORD_ATLAS_CELL_SIZE;
  const idleAngle = reducedMotion || pose.phase !== 'idle' ? 0 : Math.sin(time * 0.0021) * 0.025;
  const idleY = reducedMotion || pose.phase !== 'idle' ? 0 : Math.sin(time * 0.0028) * 2.4;
  const baseScale = (0.9 + config.level * 0.006) * pose.scale;

  const drawFrame = (angleOffset: number, alpha: number, xOffset = 0, yOffset = 0) => {
    ctx.save();
    ctx.translate(578 + pose.x + xOffset, 348 + pose.y + idleY + yOffset);
    ctx.rotate(-0.5 + pose.angle + angleOffset + idleAngle);
    ctx.scale(baseScale, baseScale);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = visual.glow;
    ctx.shadowBlur = 18 + Math.min(24, config.level * 0.9);
    ctx.filter = visual.filter;
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      SWORD_ATLAS_CELL_SIZE,
      SWORD_ATLAS_CELL_SIZE,
      -128,
      -248,
      256,
      256
    );
    ctx.restore();
  };

  if (pose.afterimage > 0) {
    drawFrame(0.28, pose.afterimage * 0.13, 13, 8);
    drawFrame(0.14, pose.afterimage * 0.24, 6, 4);
  }
  drawFrame(0, 1);

  if (config.level >= 5 && !reducedMotion) {
    const sparkCount = Math.min(5, 1 + Math.floor(config.level / 5));
    ctx.save();
    ctx.fillStyle = visual.accent;
    ctx.shadowColor = visual.glow;
    ctx.shadowBlur = 9;
    for (let index = 0; index < sparkCount; index += 1) {
      const orbit = time * (0.0012 + index * 0.00008) + index * 1.7;
      const x = 575 + pose.x + Math.cos(orbit) * (28 + index * 4);
      const y = 226 + pose.y + Math.sin(orbit * 1.4) * (56 + index * 3);
      const size = 1.5 + (index % 2);
      ctx.globalAlpha = 0.36 + (index % 3) * 0.16;
      ctx.beginPath();
      ctx.moveTo(x, y - size * 2);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size * 2);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '보상 처리 오류';
}

export const CombatCanvas: React.FC<CombatCanvasProps> = ({ profile, onAttackHit, onBossKilled }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Partial<Record<'arena' | 'imp' | 'swords' | 'bosses' | 'materials', HTMLImageElement>>>({});
  const callbacksRef = useRef({ onAttackHit, onBossKilled });
  const configRef = useRef<CombatConfig | null>(null);
  const hpRef = useRef(1);
  const rewardRef = useRef('아직 획득한 전투 보상이 없습니다.');
  const lastDropRef = useRef<CatalystDropResult | null>(null);
  const lastManualBossHitAtRef = useRef(Number.NEGATIVE_INFINITY);
  const reducedMotionRef = useRef(false);
  const performHitRef = useRef<(damage: number, x: number, y: number, isTap: boolean) => void>(() => undefined);
  const visualRef = useRef<VisualState>({
    autoElapsed: 0,
    swingPhase: 0,
    flash: 0,
    shakeUntil: 0,
    particles: [],
    texts: [],
    arcs: [],
    dropBurst: null
  });
  const initialHuntTarget = `${profile.runStartTime}:${profile.currentLevel}`;
  const [monsterHp, setMonsterHp] = useState(1);
  const [lastReward, setLastReward] = useState('아직 획득한 전투 보상이 없습니다.');
  const [lastDrop, setLastDrop] = useState<CatalystDropResult | null>(null);
  const [locallyClaimedBoss, setLocallyClaimedBoss] = useState<number | null>(null);
  const [huntState, setHuntState] = useState<{ target: string; mode: HuntMode }>(() => ({
    target: initialHuntTarget,
    mode: profile.currentLevel >= 10 && profile.currentLevel <= 19 ? 'boss' : 'normal'
  }));

  callbacksRef.current = { onAttackHit, onBossKilled };

  const currentStage = SWORD_STAGES[profile.currentLevel] || SWORD_STAGES[0];
  const series = SWORD_SERIES_LIST.find(item => item.id === profile.currentSeriesId) || SWORD_SERIES_LIST[0];
  const boss = BOSS_LIST.find(item => item.milestone === profile.currentLevel) || null;
  const repeatableBoss = Boolean(boss?.catalyst);
  const huntTarget = `${profile.runStartTime}:${profile.currentLevel}`;
  const huntMode: HuntMode = huntState.target === huntTarget
    ? huntState.mode
    : repeatableBoss ? 'boss' : 'normal';
  const bossClaimed = Boolean(
    boss && (
      profile.claimedBossMilestonesThisRun.includes(boss.milestone)
      || locallyClaimedBoss === boss.milestone
    )
  );
  const isBoss = Boolean(boss && (repeatableBoss ? huntMode === 'boss' : !bossClaimed));
  const catalyst = repeatableBoss && boss ? boss.catalyst : null;
  const normalMaxHp = (profile.currentLevel + 1) * 150;
  const baseGoldReward = (profile.currentLevel + 1) * 15;
  const visibleNormalGold = Math.round(baseGoldReward * series.goldBonusMultiplier);
  const maxHp = isBoss && boss ? boss.maxHp : normalMaxHp;
  const targetName = isBoss && boss ? boss.name : '용광로 임프';
  const targetKey = `${huntTarget}:${isBoss ? boss?.id : 'imp'}`;
  const isDestroyed = profile.currentCrackCount >= 3;

  const config: CombatConfig = {
    level: profile.currentLevel,
    seriesId: profile.currentSeriesId,
    attackPower: currentStage.attackPower,
    swordColor: currentStage.color,
    swordGlow: currentStage.glowColor,
    destroyed: isDestroyed,
    isBoss,
    repeatableBoss,
    huntMode,
    bossId: boss?.id ?? null,
    bossAtlasCell: isBoss ? boss?.atlasCell ?? null : null,
    bossMilestone: boss?.milestone ?? null,
    bossClaimed,
    catalyst,
    catalystPity: catalyst ? profile.catalystPity[catalyst.id] || 0 : 0,
    catalystInventory: catalyst ? profile.catalystInventory[catalyst.id] || 0 : 0,
    activeCatalystCharges: catalyst ? profile.activeCatalystCharges[catalyst.id] || 0 : 0,
    targetName,
    maxHp,
    normalMaxHp,
    baseGoldReward,
    visibleGoldReward: isBoss
      ? boss && !bossClaimed ? Math.round(boss.rewardGold * series.goldBonusMultiplier) : 0
      : visibleNormalGold,
    visibleEssenceReward: isBoss && boss && !bossClaimed ? boss.rewardEssences : 0,
    targetKey
  };
  configRef.current = config;

  useEffect(() => {
    setLocallyClaimedBoss(null);
    setHuntState({
      target: huntTarget,
      mode: profile.currentLevel >= 10 && profile.currentLevel <= 19 ? 'boss' : 'normal'
    });
    lastDropRef.current = null;
    setLastDrop(null);
    lastManualBossHitAtRef.current = Number.NEGATIVE_INFINITY;
  }, [huntTarget, profile.currentLevel]);

  useEffect(() => {
    hpRef.current = maxHp;
    setMonsterHp(maxHp);
    visualRef.current.autoElapsed = 0;
    visualRef.current.texts = [];
    visualRef.current.arcs = [];
    lastManualBossHitAtRef.current = Number.NEGATIVE_INFINITY;
  }, [targetKey, maxHp]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      reducedMotionRef.current = media.matches;
    };
    updatePreference();
    media.addEventListener('change', updatePreference);
    return () => media.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    let disposed = false;
    const loadImage = (
      key: 'arena' | 'imp' | 'swords' | 'bosses' | 'materials',
      source: string
    ) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!disposed) imagesRef.current[key] = image;
      };
      image.onerror = () => {
        if (!disposed) delete imagesRef.current[key];
      };
      image.src = source;
    };

    loadImage('arena', GAME_IMAGES.forgeArena);
    loadImage('imp', GAME_IMAGES.forgeImp);
    loadImage('swords', GAME_IMAGES.swordLevelAtlas);
    loadImage('bosses', GAME_IMAGES.forgeBossAtlas);
    loadImage('materials', GAME_IMAGES.forgeMaterialAtlas);
    return () => {
      disposed = true;
    };
  }, []);

  performHitRef.current = (damage, x, y, isTap) => {
    const activeConfig = configRef.current;
    if (!activeConfig || activeConfig.destroyed) return;

    const visual = visualRef.current;
    const reducedMotion = reducedMotionRef.current;
    const particleCount = reducedMotion ? 4 : isTap ? 15 : 9;
    const now = performance.now();

    visual.swingPhase = 0.01;
    visual.flash = reducedMotion ? 0.34 : 1;
    visual.shakeUntil = reducedMotion ? now : now + (isTap ? 125 : 78);
    visual.arcs.push({
      x,
      y,
      angle: isTap ? -0.7 : -0.42,
      life: reducedMotion ? 100 : 185,
      maxLife: reducedMotion ? 100 : 185,
      color: activeConfig.swordColor
    });
    visual.texts.push({
      x,
      y: y - 38,
      value: `-${damage.toLocaleString()}`,
      color: isTap ? '#ffe0a6' : '#ffb36a',
      life: reducedMotion ? 360 : 720,
      maxLife: reducedMotion ? 360 : 720
    });

    for (let index = 0; index < particleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 85 + Math.random() * (isTap ? 260 : 180);
      visual.particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 52,
        life: 260 + Math.random() * 360,
        maxLife: 620,
        size: 2 + Math.random() * 5,
        color: index % 3 === 0 ? '#fff1b8' : index % 2 === 0 ? '#ff8a32' : '#c74d25',
        debris: index % 4 === 0
      });
    }

    const nextHp = Math.max(0, hpRef.current - damage);
    hpRef.current = nextHp;
    setMonsterHp(nextHp);

    if (nextHp > 0) return;

    if (activeConfig.isBoss && activeConfig.bossMilestone !== null) {
      try {
        const reward = callbacksRef.current.onBossKilled(activeConfig.bossMilestone);
        const rewardParts: string[] = [];
        if (reward.firstRewardGranted) {
          rewardParts.push(`최초 보상 +${reward.goldGained.toLocaleString()} G · 정수 +${reward.essencesGained.toLocaleString()}`);
          visual.texts.push({
            x: TARGET_X,
            y: 76,
            value: `+${reward.goldGained.toLocaleString()} G  ✦ ${reward.essencesGained}`,
            color: '#77e0b5',
            life: reducedMotion ? 700 : 1450,
            maxLife: reducedMotion ? 700 : 1450
          });
        }

        const drop = reward.catalystDrop;
        lastDropRef.current = drop;
        setLastDrop(drop);
        if (drop && activeConfig.catalyst) {
          if (drop.dropped) {
            const dropReason = drop.reason === 'PITY'
              ? '천장 확정'
              : drop.reason === 'FIRST_DISCOVERY'
                ? '최초 발견'
                : '재료 드롭';
            rewardParts.push(`${dropReason} · ${activeConfig.catalyst.name} +${drop.quantityGained}`);
            visual.dropBurst = {
              atlasCell: activeConfig.catalyst.atlasCell,
              name: activeConfig.catalyst.name,
              life: reducedMotion ? 720 : 1650,
              maxLife: reducedMotion ? 720 : 1650
            };
            visual.texts.push({
              x: TARGET_X,
              y: 116,
              value: `${activeConfig.catalyst.name} 획득!`,
              color: '#9df0ca',
              life: reducedMotion ? 720 : 1580,
              maxLife: reducedMotion ? 720 : 1580
            });
            for (let index = 0; index < (reducedMotion ? 8 : 24); index += 1) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 95 + Math.random() * 210;
              visual.particles.push({
                x: TARGET_X,
                y: TARGET_Y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 100,
                life: 420 + Math.random() * 520,
                maxLife: 940,
                size: 2 + Math.random() * 4,
                color: index % 2 === 0 ? '#9df0ca' : '#e5fff2',
                debris: false
              });
            }
          } else {
            rewardParts.push(
              `${activeConfig.catalyst.name} 미획득 · 천장 ${drop.pityAfter}/${activeConfig.catalyst.pityThreshold}`
            );
          }
        }

        if (rewardParts.length === 0) rewardParts.push('최초 격파 보상은 이미 수령했습니다.');
        const rewardText = rewardParts.join(' · ');
        rewardRef.current = rewardText;
        setLastReward(rewardText);

        if (reward.firstRewardGranted) setLocallyClaimedBoss(activeConfig.bossMilestone);
        const nextBossConfig: CombatConfig = {
          ...activeConfig,
          bossClaimed: activeConfig.bossClaimed || reward.firstRewardGranted,
          catalystPity: drop?.pityAfter ?? activeConfig.catalystPity,
          catalystInventory: drop?.inventoryAfter ?? activeConfig.catalystInventory
        };

        if (activeConfig.repeatableBoss) {
          configRef.current = nextBossConfig;
          hpRef.current = activeConfig.maxHp;
          setMonsterHp(activeConfig.maxHp);
        } else {
          configRef.current = {
            ...nextBossConfig,
            isBoss: false,
            huntMode: 'normal',
            bossAtlasCell: null,
            targetName: '용광로 임프',
            maxHp: activeConfig.normalMaxHp,
            visibleGoldReward: Math.round(activeConfig.baseGoldReward * series.goldBonusMultiplier),
            visibleEssenceReward: 0
          };
          hpRef.current = activeConfig.normalMaxHp;
          setMonsterHp(activeConfig.normalMaxHp);
        }
      } catch (error: unknown) {
        const rewardText = errorMessage(error);
        rewardRef.current = rewardText;
        setLastReward(rewardText);
        visual.texts.push({
          x: TARGET_X,
          y: 82,
          value: rewardText,
          color: '#ff8b78',
          life: 1200,
          maxLife: 1200
        });
        hpRef.current = activeConfig.maxHp;
        setMonsterHp(activeConfig.maxHp);
      }
      return;
    }

    try {
      const goldGained = callbacksRef.current.onAttackHit(activeConfig.baseGoldReward);
      const rewardText = `임프 처치 · +${goldGained.toLocaleString()} G`;
      rewardRef.current = rewardText;
      setLastReward(rewardText);
      visual.texts.push({
        x: TARGET_X,
        y: 98,
        value: `◆ +${goldGained.toLocaleString()} G`,
        color: '#f5c56a',
        life: reducedMotion ? 560 : 1050,
        maxLife: reducedMotion ? 560 : 1050
      });
    } catch (error: unknown) {
      const rewardText = errorMessage(error);
      rewardRef.current = rewardText;
      setLastReward(rewardText);
    }

    hpRef.current = activeConfig.maxHp;
    setMonsterHp(activeConfig.maxHp);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame = 0;
    let previousTime = performance.now();
    let active = true;

    const render = (time: number) => {
      if (!active) return;
      const elapsedMs = Math.min(50, Math.max(0, time - previousTime));
      const elapsedSeconds = elapsedMs / 1000;
      previousTime = time;
      const activeConfig = configRef.current;
      const visual = visualRef.current;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const arena = imagesRef.current.arena;
      if (arena?.complete && arena.naturalWidth > 0) {
        drawImageCover(ctx, arena, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        drawForgeFallback(ctx);
      }

      const shade = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      shade.addColorStop(0, 'rgba(8, 7, 7, 0.3)');
      shade.addColorStop(0.58, 'rgba(7, 5, 4, 0.08)');
      shade.addColorStop(1, 'rgba(5, 4, 4, 0.54)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (activeConfig) {
        if (activeConfig.destroyed) {
          visual.autoElapsed = 0;
          visual.swingPhase = 0;
        } else {
          visual.autoElapsed += elapsedMs;
          visual.swingPhase += elapsedSeconds * 2.2;
          if (visual.autoElapsed >= AUTO_ATTACK_INTERVAL) {
            visual.autoElapsed %= AUTO_ATTACK_INTERVAL;
            performHitRef.current(activeConfig.attackPower, TARGET_X, TARGET_Y, false);
          }
        }

        const shakeActive = time < visual.shakeUntil;
        const shakeX = shakeActive ? (Math.random() - 0.5) * 9 : 0;
        const shakeY = shakeActive ? (Math.random() - 0.5) * 7 : 0;
        ctx.save();
        ctx.translate(shakeX, shakeY);

        const floorGlow = ctx.createRadialGradient(TARGET_X, 330, 10, TARGET_X, 330, 205);
        floorGlow.addColorStop(0, activeConfig.isBoss ? 'rgba(209, 68, 42, 0.34)' : 'rgba(230, 118, 40, 0.28)');
        floorGlow.addColorStop(1, 'rgba(18, 8, 4, 0)');
        ctx.fillStyle = floorGlow;
        ctx.fillRect(130, 220, 460, 190);

        if (activeConfig.isBoss && activeConfig.bossMilestone !== null) {
          const bosses = imagesRef.current.bosses;
          if (
            activeConfig.bossAtlasCell !== null
            && bosses?.complete
            && bosses.naturalWidth > 0
          ) {
            drawBossAtlasCell(
              ctx,
              bosses,
              activeConfig.bossAtlasCell,
              time,
              reducedMotionRef.current,
              activeConfig.destroyed
            );
          } else {
            drawBoss(ctx, activeConfig.bossMilestone);
          }
        } else {
          const imp = imagesRef.current.imp;
          if (imp?.complete && imp.naturalWidth > 0) {
            const bob = activeConfig.destroyed || reducedMotionRef.current ? 0 : Math.sin(time * 0.003) * 4;
            ctx.drawImage(imp, TARGET_X - 106, TARGET_Y - 120 + bob, 212, 212);
          } else {
            drawImpFallback(ctx);
          }
        }

        const swords = imagesRef.current.swords;
        if (swords?.complete && swords.naturalWidth > 0) {
          drawSwordSprite(
            ctx,
            swords,
            activeConfig,
            visual.swingPhase,
            time,
            reducedMotionRef.current
          );
        } else {
          drawSwordFallback(ctx, activeConfig, visual.swingPhase);
        }

        visual.arcs = visual.arcs.filter(arc => {
          arc.life -= elapsedMs;
          if (arc.life <= 0) return false;
          const progress = 1 - arc.life / arc.maxLife;
          ctx.save();
          ctx.globalAlpha = 1 - progress;
          ctx.strokeStyle = progress < 0.45 ? '#fff5cf' : arc.color;
          ctx.lineWidth = 16 - progress * 10;
          ctx.shadowColor = arc.color;
          ctx.shadowBlur = 22;
          ctx.beginPath();
          ctx.arc(arc.x, arc.y, 78 + progress * 45, arc.angle - 1.05, arc.angle + 1.12);
          ctx.stroke();
          ctx.restore();
          return true;
        });

        visual.particles = visual.particles.filter(particle => {
          particle.life -= elapsedMs;
          if (particle.life <= 0) return false;
          particle.x += particle.vx * elapsedSeconds;
          particle.y += particle.vy * elapsedSeconds;
          particle.vy += 320 * elapsedSeconds;
          const alpha = Math.min(1, particle.life / Math.min(240, particle.maxLife));
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = particle.color;
          ctx.translate(particle.x, particle.y);
          ctx.rotate(particle.debris ? time * 0.012 : 0);
          if (particle.debris) {
            ctx.fillRect(-particle.size, -particle.size / 2, particle.size * 2, particle.size);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          return true;
        });

        if (visual.dropBurst) {
          drawMaterialDropBurst(
            ctx,
            imagesRef.current.materials,
            visual.dropBurst,
            elapsedMs,
            reducedMotionRef.current
          );
          if (visual.dropBurst.life <= 0) visual.dropBurst = null;
        }

        visual.texts = visual.texts.filter(text => {
          text.life -= elapsedMs;
          if (text.life <= 0) return false;
          const progress = 1 - text.life / text.maxLife;
          ctx.save();
          ctx.globalAlpha = Math.min(1, text.life / 220);
          ctx.fillStyle = text.color;
          ctx.strokeStyle = 'rgba(19, 10, 7, 0.9)';
          ctx.lineWidth = 7;
          ctx.textAlign = 'center';
          ctx.font = '900 25px system-ui, sans-serif';
          const y = text.y - progress * 46;
          ctx.strokeText(text.value, text.x, y);
          ctx.fillText(text.value, text.x, y);
          ctx.restore();
          return true;
        });

        if (visual.flash > 0.01) {
          ctx.save();
          ctx.globalAlpha = visual.flash * 0.62;
          const flash = ctx.createRadialGradient(TARGET_X, TARGET_Y, 0, TARGET_X, TARGET_Y, 118);
          flash.addColorStop(0, '#fff5d7');
          flash.addColorStop(0.23, '#ff9a3c');
          flash.addColorStop(1, 'rgba(255, 92, 30, 0)');
          ctx.fillStyle = flash;
          ctx.fillRect(TARGET_X - 130, TARGET_Y - 130, 260, 260);
          ctx.restore();
          visual.flash *= reducedMotionRef.current ? 0.52 : 0.76;
        }

        ctx.restore();

        if (activeConfig.destroyed) {
          ctx.fillStyle = 'rgba(10, 7, 7, 0.77)';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.strokeStyle = '#d75a42';
          ctx.lineWidth = 3;
          ctx.strokeRect(22, 22, CANVAS_WIDTH - 44, CANVAS_HEIGHT - 44);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffb39d';
          ctx.font = '900 34px system-ui, sans-serif';
          ctx.fillText('검 파괴 · 사냥 중단', CANVAS_WIDTH / 2, 186);
          ctx.fillStyle = '#ddd0c5';
          ctx.font = '600 21px system-ui, sans-serif';
          ctx.fillText('아래에서 정산하거나 1회 복구하세요', CANVAS_WIDTH / 2, 226);
        }
      }

      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    const renderGameToText = () => {
      const activeConfig = configRef.current;
      return JSON.stringify({
        coordinateSystem: {
          origin: 'top-left',
          xAxis: 'right',
          yAxis: 'down',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT
        },
        level: activeConfig?.level ?? 0,
        huntMode: activeConfig?.huntMode ?? 'normal',
        sword: {
          seriesId: activeConfig?.seriesId ?? 'kingdom',
          spriteCell: getSwordAtlasCell(activeConfig?.level ?? 0),
          attackMotion: resolveSwordPose(
            visualRef.current.swingPhase,
            reducedMotionRef.current
          ).phase
        },
        monster: {
          type: activeConfig?.isBoss ? 'boss' : 'monster',
          bossId: activeConfig?.isBoss ? activeConfig.bossId : null,
          name: activeConfig?.targetName ?? 'unknown',
          hp: Math.max(0, hpRef.current),
          maxHp: activeConfig?.maxHp ?? 0,
          center: { x: TARGET_X, y: TARGET_Y }
        },
        destroyed: activeConfig?.destroyed ?? false,
        attackPower: activeConfig?.attackPower ?? 0,
        claimedStatus: {
          milestone: activeConfig?.bossMilestone ?? null,
          claimedThisRun: activeConfig?.bossClaimed ?? false
        },
        catalyst: activeConfig?.catalyst ? {
          id: activeConfig.catalyst.id,
          name: activeConfig.catalyst.name,
          dropChance: activeConfig.catalyst.dropRate,
          pity: {
            current: activeConfig.catalystPity,
            threshold: activeConfig.catalyst.pityThreshold
          },
          inventory: activeConfig.catalystInventory,
          activeCharges: activeConfig.activeCatalystCharges
        } : null,
        manualAttackCooldownMs: activeConfig?.isBoss
          ? Math.max(0, Math.ceil(
            BOSS_MANUAL_ATTACK_COOLDOWN - (performance.now() - lastManualBossHitAtRef.current)
          ))
          : 0,
        lastDrop: lastDropRef.current,
        visibleReward: {
          gold: activeConfig?.visibleGoldReward ?? 0,
          essences: activeConfig?.visibleEssenceReward ?? 0,
          lastEarned: rewardRef.current
        }
      });
    };

    window.render_game_to_text = renderGameToText;
    return () => {
      if (window.render_game_to_text === renderGameToText) {
        delete window.render_game_to_text;
      }
    };
  }, []);

  const performManualHit = (x: number, y: number) => {
    const activeConfig = configRef.current;
    if (!activeConfig || activeConfig.destroyed) return;

    const now = performance.now();
    if (
      activeConfig.isBoss
      && now - lastManualBossHitAtRef.current < BOSS_MANUAL_ATTACK_COOLDOWN
    ) return;

    if (activeConfig.isBoss) lastManualBossHitAtRef.current = now;
    performHitRef.current(Math.round(activeConfig.attackPower * 1.5), x, y, true);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDestroyed) return;
    const rectangle = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rectangle.left) * (CANVAS_WIDTH / rectangle.width);
    const y = (event.clientY - rectangle.top) * (CANVAS_HEIGHT / rectangle.height);
    performManualHit(x, y);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!isDestroyed) {
      performManualHit(TARGET_X, TARGET_Y);
    }
  };

  const handleHuntModeChange = (mode: HuntMode) => {
    if (!repeatableBoss || mode === huntMode) return;
    setHuntState({ target: huntTarget, mode });
    setLastReward(mode === 'boss' ? '보스 추적을 시작합니다.' : '일반 사냥으로 전환했습니다.');
    rewardRef.current = mode === 'boss' ? '보스 추적을 시작합니다.' : '일반 사냥으로 전환했습니다.';
  };

  const hpPercent = Math.max(0, Math.min(100, (monsterHp / maxHp) * 100));
  const rewardSummary = isBoss && boss
    ? catalyst
      ? bossClaimed
        ? `${catalyst.name} ${catalyst.dropRate}%`
        : `최초 ${config.visibleGoldReward.toLocaleString()} G + 재료 ${catalyst.dropRate}%`
      : `${config.visibleGoldReward.toLocaleString()} G + 정수 ${boss.rewardEssences}`
    : `${visibleNormalGold.toLocaleString()} G / 처치`;

  return (
    <section className={`combat-card${isDestroyed ? ' is-destroyed' : ''}`} aria-labelledby="combat-title">
      <div className="combat-card__heading">
        <div>
          <span className="section-kicker">STAGE {profile.currentLevel}</span>
          <h2 id="combat-title">{targetName}</h2>
        </div>
        <div className={isBoss ? 'combat-reward combat-reward--boss' : 'combat-reward'}>
          <small>{isBoss ? 'BOSS REWARD' : 'HUNT REWARD'}</small>
          <strong>{rewardSummary}</strong>
        </div>
      </div>

      {repeatableBoss && catalyst && (
        <div className="hunt-mode-control">
          <div>
            <small>HUNT MODE</small>
            <strong>{huntMode === 'boss' ? `${boss?.name} 추적` : '용광로 임프 사냥'}</strong>
          </div>
          <div className="hunt-mode-toggle" role="group" aria-label="사냥 대상 선택">
            <button
              type="button"
              className={huntMode === 'normal' ? 'is-active' : ''}
              aria-pressed={huntMode === 'normal'}
              onClick={() => handleHuntModeChange('normal')}
            >
              일반
            </button>
            <button
              type="button"
              className={huntMode === 'boss' ? 'is-active' : ''}
              aria-pressed={huntMode === 'boss'}
              onClick={() => handleHuntModeChange('boss')}
            >
              보스 추적
            </button>
          </div>
        </div>
      )}

      {bossClaimed && boss && (
        <div className="claimed-banner" role="status">
          {repeatableBoss
            ? '최초 격파 보상 수령 완료 · 반복 처치의 재료 판정은 계속됩니다'
            : '보스 보상 수령 완료 · 이번 런에서는 일반 적이 출현합니다'}
        </div>
      )}

      {repeatableBoss && catalyst && (
        <div className={huntMode === 'boss' ? 'catalyst-hunt-hud is-active' : 'catalyst-hunt-hud'}>
          <MaterialSprite atlasCell={catalyst.atlasCell} size={56} />
          <div className="catalyst-hunt-hud__identity">
            <small>REQUIRED CATALYST</small>
            <strong>{catalyst.name}</strong>
            <span>{huntMode === 'boss' ? '처치할 때마다 독립 드롭 판정' : '보스 추적 모드에서 획득 가능'}</span>
          </div>
          <dl>
            <div><dt>드롭</dt><dd>{catalyst.dropRate}%</dd></div>
            <div><dt>천장</dt><dd>{profile.catalystPity[catalyst.id] || 0}/{catalyst.pityThreshold}</dd></div>
            <div><dt>보유</dt><dd>{profile.catalystInventory[catalyst.id] || 0}</dd></div>
            <div><dt>충전</dt><dd>{profile.activeCatalystCharges[catalyst.id] || 0}</dd></div>
          </dl>
          <div className={bossClaimed ? 'catalyst-hunt-hud__first is-claimed' : 'catalyst-hunt-hud__first'}>
            {bossClaimed
              ? '최초 보상 수령 완료'
              : `최초 보상 ${config.visibleGoldReward.toLocaleString()} G · 정수 ${boss?.rewardEssences || 0}`}
          </div>
          {lastDrop && (
            <div className={lastDrop.dropped ? 'catalyst-hunt-hud__last is-drop' : 'catalyst-hunt-hud__last'}>
              {lastDrop.dropped
                ? `최근 획득 +${lastDrop.quantityGained} · 보유 ${lastDrop.inventoryAfter}`
                : `최근 미획득 · 천장 ${lastDrop.pityAfter}/${catalyst.pityThreshold}`}
            </div>
          )}
        </div>
      )}

      <div className="combat-hp" aria-label={`${targetName} 체력 ${Math.max(0, monsterHp)} / ${maxHp}`}>
        <div className="combat-hp__labels">
          <span>{isBoss ? '보스 내구도' : '적 체력'}</span>
          <strong>{Math.max(0, monsterHp).toLocaleString()} / {maxHp.toLocaleString()}</strong>
        </div>
        <div className="combat-hp__track">
          <div
            className={isBoss ? 'combat-hp__fill combat-hp__fill--boss' : 'combat-hp__fill'}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      <div className="combat-canvas-shell">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="combat-canvas"
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={isDestroyed ? -1 : 0}
          aria-disabled={isDestroyed}
          aria-label={isDestroyed ? '검이 파괴되어 전투가 중단되었습니다' : `${targetName} 공격하기`}
        />
      </div>

      <div className="combat-feedback" role="status" aria-live="polite">
        <span className="combat-feedback__spark" aria-hidden="true">✦</span>
        <span>{lastReward}</span>
        <small>
          {isDestroyed
            ? '자동·탭 공격 및 보상 지급 중단'
            : isBoss
              ? '자동 공격 중 · 보스 강타는 0.9초마다 사용 가능'
              : '자동 공격 중 · 화면을 탭하면 강타'}
        </small>
      </div>
    </section>
  );
};
