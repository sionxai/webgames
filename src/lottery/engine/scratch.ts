import type { Balance } from "../types";

export interface ScratchProgress {
  revealed: number;
  removedArea: number;
  requiredArea: number;
  speed: number;
  verdict: string;
}

export interface ScratchController {
  destroy(): void;
  resize(): void;
  completeForTesting(): void;
  advance(ms: number): void;
}

type Options = {
  host: HTMLElement;
  foil: HTMLCanvasElement;
  cells: HTMLElement[];
  balance: Balance;
  toolIndex: number;
  initialReveal: number;
  initialRemovedArea: number;
  initialRequiredArea: number;
  onProgress(progress: ScratchProgress): void;
  onComplete(progress: ScratchProgress): void;
};

type CellRect = { x: number; y: number; w: number; h: number };

export function createScratchEngine(options: Options): ScratchController {
  const { host, foil, balance } = options;
  const context = foil.getContext("2d");
  const logicalWidth = balance.scratch.logicalWidth;
  const logicalHeight = balance.scratch.logicalHeight;
  let dpr = 1;
  let ready = false;
  let columns = 0;
  let rows = 0;
  let coverage: Float32Array | null = null;
  let passes: Uint8Array | null = null;
  let mask: Uint8Array | null = null;
  let cellOwners: Int16Array | null = null;
  let cellIndexes: number[][] = [];
  let cellRemaining: Float32Array | null = null;
  let cellAreas: Float32Array | null = null;
  let revealedCells: Uint8Array | null = null;
  let maskCells = 0;
  let removedArea = Math.max(0, options.initialRemovedArea);
  let down = false;
  let completed = false;
  let lastX = 0;
  let lastY = 0;
  let lastMoveAt = 0;
  let speed = 0;
  let slowMs = 0;
  let gumming = false;
  let lastFrameAt = performance.now();
  let lastRafAt = performance.now();
  let raf = 0;
  let interval = 0;
  const cellSize = balance.scratch.coverageCell;
  const tool = balance.scratch.tools[Math.min(options.toolIndex, balance.scratch.tools.length - 1)];

  const cellRects = (): CellRect[] => {
    const hostRect = host.getBoundingClientRect();
    if (hostRect.width <= 0 || hostRect.height <= 0) return [];
    return options.cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return {
        x: (rect.left - hostRect.left) * logicalWidth / hostRect.width,
        y: (rect.top - hostRect.top) * logicalHeight / hostRect.height,
        w: rect.width * logicalWidth / hostRect.width,
        h: rect.height * logicalHeight / hostRect.height,
      };
    });
  };

  const buildMask = () => {
    if (!coverage || !passes) return;
    const rects = cellRects();
    mask = new Uint8Array(columns * rows);
    cellOwners = new Int16Array(columns * rows);
    cellOwners.fill(-1);
    cellIndexes = rects.map(() => []);
    cellRemaining = new Float32Array(rects.length);
    cellAreas = new Float32Array(rects.length);
    revealedCells = new Uint8Array(rects.length);
    maskCells = 0;
    rects.forEach((rect, cellIndex) => {
      const x0 = Math.max(0, Math.floor(rect.x / cellSize));
      const x1 = Math.min(columns - 1, Math.floor((rect.x + rect.w) / cellSize));
      const y0 = Math.max(0, Math.floor(rect.y / cellSize));
      const y1 = Math.min(rows - 1, Math.floor((rect.y + rect.h) / cellSize));
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
        const index = y * columns + x;
        if (!mask![index]) {
          mask![index] = 1;
          maskCells += 1;
          cellOwners![index] = cellIndex;
          cellIndexes[cellIndex].push(index);
          cellRemaining![cellIndex] += 1;
          cellAreas![cellIndex] += 1;
        }
      }
    });
    if (options.initialReveal > 0 && coverage && mask && context) {
      let cellsToRestore = Math.floor(maskCells * Math.min(options.initialReveal, balance.autoCompleteReveal - Number.EPSILON));
      for (let index = 0; index < mask.length && cellsToRestore > 0; index += 1) {
        if (!mask[index]) continue;
        coverage[index] = 0;
        const column = index % columns;
        const row = Math.floor(index / columns);
        context.clearRect(column * cellSize, row * cellSize, cellSize, cellSize);
        const cellIndex = cellOwners![index];
        if (cellIndex >= 0) cellRemaining![cellIndex] -= 1;
        cellsToRestore -= 1;
      }
    }
    revealTouchedCells(new Set(cellIndexes.map((_, index) => index)));
  };

  const revealCell = (cellIndex: number, rects: CellRect[]) => {
    if (!coverage || !cellRemaining || !revealedCells || !context || revealedCells[cellIndex]) return;
    cellIndexes[cellIndex].forEach((index) => { coverage![index] = 0; });
    removedArea += Math.max(0, cellRemaining[cellIndex]) * cellSize * cellSize;
    cellRemaining[cellIndex] = 0;
    revealedCells[cellIndex] = 1;
    const rect = rects[cellIndex];
    if (rect) {
      context.globalCompositeOperation = "destination-out";
      context.clearRect(rect.x, rect.y, rect.w, rect.h);
    }
  };

  const revealTouchedCells = (touchedCells: Set<number>) => {
    // 타입 좁힘은 이 문장 안에서만 유지된다 — 아래 콜백까지 가져가려면 지역 상수로 캡처해야 한다.
    const remaining = cellRemaining;
    const areas = cellAreas;
    const revealed = revealedCells;
    if (!remaining || !areas || !revealed) return;
    const rects = cellRects();
    const threshold = balance.cellRevealThreshold;
    touchedCells.forEach((cellIndex) => {
      if (revealed[cellIndex] || areas[cellIndex] <= 0) return;
      const removedRatio = 1 - remaining[cellIndex] / areas[cellIndex];
      if (removedRatio >= threshold) revealCell(cellIndex, rects);
    });
  };

  const paintFoil = () => {
    if (!context || !ready) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, logicalWidth, logicalHeight);
    context.fillStyle = "#8c96a5";
    cellRects().forEach((rect) => {
      const gradient = context.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      gradient.addColorStop(0, "#727b89");
      gradient.addColorStop(0.5, "#ccd3dc");
      gradient.addColorStop(1, "#7b8492");
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(rect.x, rect.y, rect.w, rect.h, 5);
      context.fill();
    });
  };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !context) {
      ready = false;
      return;
    }
    const nextDpr = Math.min(devicePixelRatio || 1, 2);
    if (ready && nextDpr === dpr) return;
    dpr = nextDpr;
    foil.width = Math.round(logicalWidth * dpr);
    foil.height = Math.round(logicalHeight * dpr);
    columns = Math.ceil(logicalWidth / cellSize);
    rows = Math.ceil(logicalHeight / cellSize);
    coverage = new Float32Array(columns * rows);
    passes = new Uint8Array(columns * rows);
    coverage.fill(1);
    ready = true;
    paintFoil();
    buildMask();
  };

  const judge = () => {
    if (gumming) return { multiplier: balance.scratch.cutSlow, verdict: "뭉침" };
    if (speed < tool.vMin) return { multiplier: balance.scratch.cutGood, verdict: "느림" };
    if (speed <= tool.vMax) return { multiplier: balance.scratch.cutGood, verdict: "적정" };
    if (speed <= tool.vMax * balance.scratch.overSpeedMultiplier) return { multiplier: balance.scratch.cutOver, verdict: "과속" };
    return { multiplier: balance.scratch.cutBad, verdict: "심한 과속" };
  };

  const stamp = (x: number, y: number, power: number) => {
    if (!context || !coverage || !passes || !mask || !cellOwners || !cellRemaining || !revealedCells || !ready) return 0;
    const radius = tool.radius;
    if (![x, y, radius, power].every(Number.isFinite) || radius <= 0 || power <= 0) return 0;
    context.globalCompositeOperation = "destination-out";
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(0,0,0,${power})`);
    gradient.addColorStop(balance.scratch.gradientMiddleStop, `rgba(0,0,0,${power * balance.scratch.gradientMiddleAlpha})`);
    gradient.addColorStop(balance.scratch.gradientOuterStop, `rgba(0,0,0,${power * balance.scratch.gradientOuterAlpha})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    let removed = 0;
    const x0 = Math.max(0, Math.floor((x - radius) / cellSize));
    const x1 = Math.min(columns - 1, Math.floor((x + radius) / cellSize));
    const y0 = Math.max(0, Math.floor((y - radius) / cellSize));
    const y1 = Math.min(rows - 1, Math.floor((y + radius) / cellSize));
    const touchedCells = new Set<number>();
    for (let row = y0; row <= y1; row += 1) for (let column = x0; column <= x1; column += 1) {
      const index = row * columns + column;
      if (!mask[index]) continue;
      const cellIndex = cellOwners[index];
      if (cellIndex < 0 || revealedCells[cellIndex]) continue;
      const distance = Math.hypot(column * cellSize + cellSize / 2 - x, row * cellSize + cellSize / 2 - y);
      if (distance > radius) continue;
      const falloff = Math.max(0, 1 - Math.pow(distance / radius, balance.scratch.falloffExponent));
      const alpha = power * falloff;
      if (alpha < balance.scratch.minimumStampAlpha) continue;
      const before = coverage[index];
      coverage[index] = before * (1 - alpha);
      removed += (before - coverage[index]) * cellSize * cellSize;
      cellRemaining[cellIndex] += coverage[index] - before;
      touchedCells.add(cellIndex);
      if (alpha > balance.scratch.passStampAlpha && passes[index] < 255) passes[index] += 1;
    }
    revealTouchedCells(touchedCells);
    return removed;
  };

  const deposit = (x: number, y: number) => {
    if (!context || !coverage || !mask || !cellOwners || !cellRemaining || !revealedCells || !ready) return;
    const radius = tool.radius * balance.scratch.gumRadiusMultiplier;
    const depositAlpha = balance.scratch.gumDepositAlpha;
    if (![x, y, radius, depositAlpha].every(Number.isFinite) || radius <= 0 || depositAlpha <= 0) return;
    context.globalCompositeOperation = "source-over";
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(206,214,224,${depositAlpha})`);
    gradient.addColorStop(1, "rgba(206,214,224,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    const x0 = Math.max(0, Math.floor((x - radius) / cellSize));
    const x1 = Math.min(columns - 1, Math.floor((x + radius) / cellSize));
    const y0 = Math.max(0, Math.floor((y - radius) / cellSize));
    const y1 = Math.min(rows - 1, Math.floor((y + radius) / cellSize));
    for (let row = y0; row <= y1; row += 1) for (let column = x0; column <= x1; column += 1) {
      const index = row * columns + column;
      if (!mask[index]) continue;
      const cellIndex = cellOwners[index];
      if (cellIndex < 0 || revealedCells[cellIndex]) continue;
      const distance = Math.hypot(column * cellSize + cellSize / 2 - x, row * cellSize + cellSize / 2 - y);
      if (distance > radius) continue;
      const addition = depositAlpha * Math.max(0, 1 - Math.pow(distance / radius, balance.scratch.falloffExponent));
      const before = coverage[index];
      coverage[index] = Math.min(
        1 - (1 - coverage[index]) * (1 - addition),
        balance.scratch.gumCoverageCeiling,
      );
      cellRemaining[cellIndex] += coverage[index] - before;
    }
  };

  const stroke = (x: number, y: number, distance: number) => {
    const verdict = judge();
    const power = tool.cut * verdict.multiplier;
    if (gumming && distance < balance.scratch.gumMaxMovement) deposit(x, y);
    const step = Math.max(balance.scratch.minimumStampStep, tool.radius / balance.scratch.stampStepDivisor);
    const count = distance > 0 ? Math.min(Math.ceil(distance / step), balance.scratch.maxInterpolatedStamps) : 1;
    for (let index = 1; index <= count; index += 1) {
      const ratio = count === 1 ? 1 : index / count;
      removedArea += stamp(lastX + (x - lastX) * ratio, lastY + (y - lastY) * ratio, power);
    }
  };

  const toLocal = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: (event.clientX - rect.left) * logicalWidth / rect.width, y: (event.clientY - rect.top) * logicalHeight / rect.height };
  };

  const pointerDown = (event: PointerEvent) => {
    if (completed || !ready) return;
    const point = toLocal(event);
    if (!point) return;
    try { host.setPointerCapture(event.pointerId); } catch { /* unsupported pointer capture */ }
    down = true;
    lastX = point.x;
    lastY = point.y;
    lastMoveAt = performance.now();
    speed = 0;
    slowMs = 0;
    gumming = false;
    stroke(point.x, point.y, 0);
  };

  const pointerMove = (event: PointerEvent) => {
    const point = toLocal(event);
    if (!point || !down || completed) return;
    const now = performance.now();
    const elapsed = Math.max(balance.scratch.minimumPointerDeltaMs, now - lastMoveAt);
    const distance = Math.hypot(point.x - lastX, point.y - lastY);
    speed += ((distance / elapsed * 1000) - speed) * balance.scratch.speedEma;
    if (speed < tool.vMin) {
      slowMs += elapsed;
      gumming = slowMs >= balance.scratch.slowDwellMs;
    } else {
      slowMs = 0;
      gumming = false;
    }
    stroke(point.x, point.y, distance);
    lastX = point.x;
    lastY = point.y;
    lastMoveAt = now;
  };

  const pointerUp = (event: PointerEvent) => {
    down = false;
    gumming = false;
    slowMs = 0;
    try { host.releasePointerCapture(event.pointerId); } catch { /* no capture */ }
  };

  const update = () => {
    if (!coverage || !mask || maskCells <= 0) return;
    let remaining = 0;
    for (let index = 0; index < coverage.length; index += 1) if (mask[index]) remaining += coverage[index];
    const revealed = Math.min(1, Math.max(options.initialReveal, 1 - remaining / maskCells));
    const requiredArea = Math.max(options.initialRequiredArea, maskCells * cellSize * cellSize);
    const progress = {
      revealed, removedArea: Math.max(options.initialRemovedArea, removedArea), requiredArea,
      speed: down ? speed : 0, verdict: down ? judge().verdict : "대기",
    };
    options.onProgress(progress);
    if (!completed && revealed >= balance.autoCompleteReveal) {
      completed = true;
      options.onComplete(progress);
    }
  };

  const frame = (now: number) => {
    lastRafAt = now;
    if (now - lastFrameAt >= balance.scratch.frameReportIntervalMs) {
      update();
      lastFrameAt = now;
    }
    raf = requestAnimationFrame(frame);
  };

  const observer = new ResizeObserver(() => resize());
  observer.observe(host);
  host.addEventListener("pointerdown", pointerDown);
  host.addEventListener("pointermove", pointerMove);
  host.addEventListener("pointerup", pointerUp);
  host.addEventListener("pointercancel", pointerUp);
  resize();
  raf = requestAnimationFrame(frame);
  interval = window.setInterval(() => {
    const now = performance.now();
    if (now - lastRafAt > balance.scratch.watchdogMs) update();
  }, Math.max(
    balance.scratch.minimumWatchdogIntervalMs,
    Math.floor(balance.scratch.watchdogMs / balance.scratch.watchdogIntervalDivisor),
  ));

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(interval);
      observer.disconnect();
      host.removeEventListener("pointerdown", pointerDown);
      host.removeEventListener("pointermove", pointerMove);
      host.removeEventListener("pointerup", pointerUp);
      host.removeEventListener("pointercancel", pointerUp);
    },
    resize,
    completeForTesting() {
      if (!coverage || !mask || !revealedCells || !cellRemaining) return;
      for (let index = 0; index < coverage.length; index += 1) if (mask[index]) coverage[index] = 0;
      revealedCells.fill(1);
      cellRemaining.fill(0);
      removedArea = maskCells * cellSize * cellSize;
      update();
    },
    advance() {
      update();
    },
  };
}
