"use client";
import { SOUNDS } from "../shared/sounds";

const STORAGE_KEY = "dadadak_muted";
const PEAK = 0.25;
const SAMPLE_RATE = 44_100;
const LENGTH_SEC = 0.08;

type AudioContextCtor = typeof AudioContext;
type OfflineAudioContextCtor = typeof OfflineAudioContext;

let audioContext: AudioContext | null = null;
let renderPromise: Promise<void> | null = null;
const buffers = new Map<string, AudioBuffer>();
let mutedValue: boolean | null = null;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? null;
}

function getOfflineAudioContextCtor(): OfflineAudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return window.OfflineAudioContext ?? null;
}

function readMuted(): boolean {
  if (mutedValue != null) return mutedValue;
  if (typeof window === "undefined") return false;
  mutedValue = window.localStorage.getItem(STORAGE_KEY) === "1";
  return mutedValue;
}

function envelopeAt(t: number, duration: number): number {
  const attack = 0.002;
  const release = Math.min(0.018, duration * 0.45);
  if (t < attack) return t / attack;
  if (t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

function normalize(buffer: AudioBuffer): AudioBuffer {
  const data = buffer.getChannelData(0);
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max <= 0) return buffer;
  const gain = PEAK / max;
  for (let i = 0; i < data.length; i++) data[i] *= gain;
  return buffer;
}

function noiseBuffer(ctx: BaseAudioContext, duration: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    data[i] = (Math.random() * 2 - 1) * envelopeAt(t, duration);
  }
  return buffer;
}

function addSine(
  ctx: BaseAudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  gainValue: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(destination);
  osc.start(start);
  osc.stop(start + duration);
}

function addSquare(
  ctx: BaseAudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  gainValue: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(destination);
  osc.start(start);
  osc.stop(start + duration);
}

function addNoise(
  ctx: BaseAudioContext,
  destination: AudioNode,
  start: number,
  duration: number,
  gainValue: number,
  filterType: BiquadFilterType,
  frequency: number
) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noiseBuffer(ctx, duration);
  filter.type = filterType;
  filter.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(start);
  source.stop(start + duration);
}

function buildSound(ctx: OfflineAudioContext, id: string) {
  const out = ctx.destination;
  switch (id) {
    case "bubble":
      addSine(ctx, out, 180, 0, 0.03, 0.45);
      addNoise(ctx, out, 0, 0.026, 0.18, "lowpass", 420);
      break;
    case "membrane":
      addNoise(ctx, out, 0, 0.06, 0.42, "lowpass", 600);
      break;
    case "pantograph":
      addNoise(ctx, out, 0, 0.012, 0.45, "highpass", 3_000);
      break;
    case "red":
      addSine(ctx, out, 200, 0, 0.02, 0.34);
      addNoise(ctx, out, 0, 0.022, 0.1, "lowpass", 500);
      break;
    case "brown":
      addNoise(ctx, out, 0, 0.008, 0.42, "highpass", 2_500);
      addSine(ctx, out, 300, 0.008, 0.025, 0.32);
      break;
    case "blue":
      addNoise(ctx, out, 0, 0.01, 0.58, "highpass", 4_000);
      addSine(ctx, out, 1_200, 0.004, 0.014, 0.38);
      break;
    case "silver":
      addNoise(ctx, out, 0, 0.008, 0.45, "highpass", 3_500);
      break;
    case "optical":
      addSquare(ctx, out, 1_200, 0, 0.012, 0.28);
      break;
    case "topre":
      addSine(ctx, out, 150, 0, 0.04, 0.38);
      addNoise(ctx, out, 0, 0.038, 0.18, "lowpass", 360);
      break;
    default:
      addNoise(ctx, out, 0, 0.015, 0.3, "highpass", 2_500);
  }
}

async function renderAll(): Promise<void> {
  const OfflineCtor = getOfflineAudioContextCtor();
  if (!OfflineCtor) return;
  await Promise.all(
    SOUNDS.map(async (sound) => {
      const ctx = new OfflineCtor(1, Math.ceil(SAMPLE_RATE * LENGTH_SEC), SAMPLE_RATE);
      buildSound(ctx, sound.id);
      buffers.set(sound.id, normalize(await ctx.startRendering()));
    })
  );
}

export async function initSound(): Promise<void> {
  if (typeof window === "undefined") return;
  const AudioCtor = getAudioContextCtor();
  if (!AudioCtor) return;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === "suspended") await audioContext.resume();
  if (!renderPromise) renderPromise = renderAll();
  await renderPromise;
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, pitch: number) {
  const source = ctx.createBufferSource();
  const jitter = 0.97 + Math.random() * 0.06;
  source.buffer = buffer;
  source.playbackRate.value = pitch * jitter;
  source.connect(ctx.destination);
  source.start();
}

export function playClick(soundId: string, opts: { pitch?: number } = {}) {
  if (readMuted()) return;
  const ctx = audioContext;
  const buffer = buffers.get(soundId);
  if (!ctx || !buffer) {
    void initSound().then(() => {
      const readyContext = audioContext;
      const readyBuffer = buffers.get(soundId);
      if (!readMuted() && readyContext && readyBuffer) {
        playBuffer(readyContext, readyBuffer, opts.pitch ?? 1);
      }
    });
    return;
  }
  playBuffer(ctx, buffer, opts.pitch ?? 1);
}

export function setMuted(muted: boolean) {
  mutedValue = muted;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  window.dispatchEvent(new CustomEvent("dadadak:muted", { detail: muted }));
}

export function isMuted(): boolean {
  return readMuted();
}
