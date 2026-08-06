import { useEffect, useRef, useState } from 'react';
import type { Rng } from './core/rng';
import { BattleScreen } from './components/BattleScreen';
import { DeckEditor } from './components/DeckEditor';
import { EndScreen } from './components/EndScreen';
import { HomeScreen } from './components/HomeScreen';
import { RewardScreen } from './components/RewardScreen';
import {
  completeRunFailClosed, createDefaultProfile, loadProfile, saveProfile,
  type BonpuriProfile, type StorageAdapter,
} from './services/profile';
import { chooseReward, endRunTurn, playRunCard, skipReward, startMiniRun, type MiniRunState } from './run/miniRun';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

type Screen = 'home' | 'deck' | 'run' | 'result';
type ResultState = { won: boolean; acquired: string[]; pack: string[]; error?: string };

const storage: StorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

// 렌더 밖에서 딱 한 번 수행한다.
// loadProfile은 구 스키마를 만나면 변환 결과를 저장하는 부작용이 있다. 렌더 본문에서 부르면
// StrictMode의 이중 마운트에서 두 번째 호출이 '이미 변환된' 값을 읽어 migrated 플래그를 잃는다.
const initialLoad = loadProfile(storage);

export default function App() {
  const rng = useRef<Rng>(Math.random).current;
  const loaded = initialLoad;
  const [profile, setProfile] = useState<BonpuriProfile>(() => loaded.ok && loaded.profile ? loaded.profile : createDefaultProfile());
  const [notice, setNotice] = useState(() => {
    if (!loaded.ok) return `${loaded.error} 기본 기록으로 시작합니다.`;
    return loaded.migrated ? '덱 규격이 50장으로 바뀌어 시작 덱을 기본값으로 되돌렸습니다. 보관함은 그대로입니다.' : '';
  });
  const [screen, setScreen] = useState<Screen>('home');
  const [run, setRun] = useState<MiniRunState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const finalized = useRef<MiniRunState | null>(null);

  useEffect(() => {
    if (!run || (run.phase !== 'won' && run.phase !== 'lost') || finalized.current === run) return;
    finalized.current = run;
    const completed = completeRunFailClosed(storage, profile, run.acquiredCardIds, run.phase === 'won', rng);
    if (completed.ok) {
      setProfile(completed.profile);
      setResult({ won: run.phase === 'won', acquired: run.acquiredCardIds, pack: completed.pack });
    } else {
      setResult({
        won: run.phase === 'won',
        acquired: run.acquiredCardIds,
        pack: [],
        error: '기록을 저장하지 못했습니다. 획득 카드가 보관되지 않았습니다.',
      });
    }
    setScreen('result');
  }, [profile, rng, run, storage]);

  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify({
      mode: screen,
      runPhase: run?.phase,
      battle: run?.battleNumber,
      hp: run?.playerHp,
      hand: run?.battle?.hand.map((card, index) => ({ index, name: card.name, cost: card.cost })),
      rewards: run?.rewards.map((card, index) => ({ index, name: card.name })),
      coordinateSystem: 'DOM flow; top to bottom',
    });
    window.advanceTime = () => undefined;
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [run, screen]);

  const start = (deck = profile.startingDeck) => {
    setRun(startMiniRun(rng, deck));
    setResult(null);
    setScreen('run');
  };
  const persist = (candidate: BonpuriProfile) => {
    const saved = saveProfile(storage, candidate);
    if (saved.ok) { setProfile(candidate); setNotice(''); }
    return saved;
  };
  if (screen === 'home') return <HomeScreen profile={profile} notice={notice} onStart={() => start()} onEdit={() => setScreen('deck')} />;
  if (screen === 'deck') return <DeckEditor profile={profile} onBack={() => setScreen('home')}
    onSave={(deck) => persist({ ...profile, startingDeck: deck })} onStart={start} />;
  if (screen === 'result' && result) return <EndScreen won={result.won} acquiredCardIds={result.acquired}
    pack={result.pack} saveError={result.error} onHome={() => { setRun(null); setScreen('home'); }} />;
  if (!run) return null;
  if (run.phase === 'reward') return <RewardScreen rewards={run.rewards} hp={run.playerHp}
    onChoose={(index) => setRun((state) => state ? chooseReward(state, index, rng) : state)}
    onSkip={() => setRun((state) => state ? skipReward(state, rng) : state)} />;
  if (!run.battle) return null;
  const toggleRules = () => {
    const candidate = { ...profile, rulesPanelOpen: !profile.rulesPanelOpen };
    const saved = persist(candidate);
    if (!saved.ok) setNotice(saved.error);
  };
  return <BattleScreen battle={run.battle} battleNumber={run.battleNumber}
    rulesPanelOpen={profile.rulesPanelOpen} onToggleRules={toggleRules}
    onPlay={(index) => setRun((state) => state ? playRunCard(state, index, rng) : state)}
    onEndTurn={() => setRun((state) => state ? endRunTurn(state, rng) : state)} />;
}
