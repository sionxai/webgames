import { useState } from 'react';
import { createStartingDeck } from '../core/cards';
import { rewardCards } from '../content/cards';
import { DEFAULT_STARTING_DECK, type BonpuriProfile, validateStartingDeck } from '../services/profile';
import { CardView } from './CardView';

const basicTemplates = createStartingDeck().filter((card, index, cards) =>
  cards.findIndex((candidate) => candidate.name === card.name) === index);

export function DeckEditor({ profile, onSave, onBack, onStart }: {
  profile: BonpuriProfile;
  onSave: (deck: string[]) => { ok: true } | { ok: false; error: string };
  onBack: () => void;
  onStart: (deck: string[]) => void;
}) {
  const [deck, setDeck] = useState([...profile.startingDeck]);
  const [error, setError] = useState('');
  const cards = [...basicTemplates, ...rewardCards.filter((card) => (profile.collection[card.id] ?? 0) > 0)];
  const count = (id: string) => deck.filter((candidate) => candidate === id).length;
  const change = (next: string[]) => {
    if (next.length < 50) {
      setDeck(next);
      setError('');
      return;
    }
    const result = validateStartingDeck(next, profile.collection);
    if (result.ok) {
      const saved = onSave(next);
      if (saved.ok) { setDeck(next); setError(''); } else setError(saved.error);
      if (!saved.ok) setDeck([...profile.startingDeck]);
    } else setError(result.error);
  };
  const remove = (id: string, amount: number) => {
    let remaining = amount;
    change(deck.filter((candidate) => candidate !== id || remaining-- <= 0));
  };
  const add = (id: string, amount: number) => change([...deck, ...Array<string>(amount).fill(id)]);
  const maxCount = (id: string) => ['sinkal', 'neokgarim', 'saseol'].includes(id)
    ? 50
    : Math.min(4, profile.collection[id] ?? 0);
  const canAdd = (id: string, amount: number) =>
    deck.length + amount <= 50 && count(id) + amount <= maxCount(id);
  const fillDefaults = () => {
    const missing = 50 - deck.length;
    if (missing <= 0) return;
    const sinkal = Math.ceil(missing * 5 / 9);
    change([...deck, ...Array<string>(sinkal).fill('sinkal'), ...Array<string>(missing - sinkal).fill('neokgarim')]);
  };
  const validation = validateStartingDeck(deck, profile.collection);
  return <main className="deck-editor">
    <header><button className="text-button" onClick={onBack}>← 본향</button>
      <b className={deck.length === 50 ? '' : 'deck-count-invalid'}>{deck.length} / 50장</b></header>
    <h1>시작 덱 편집</h1>
    <div className="deck-list panel">{cards.map((card) => {
      const id = card.id.split('#')[0];
      const owned = profile.collection[id] ?? 0;
      return <div className="deck-row" key={id}>
        <CardView card={card} disabled />
        <div><b>덱 {count(id)}장</b><small>{['sinkal', 'neokgarim', 'saseol'].includes(id) ? '무제한' : `보유 ${owned}장`}</small>
          <div className="deck-controls">
            <button onClick={() => remove(id, 5)} disabled={count(id) < 5}>−5</button>
            <button onClick={() => remove(id, 1)} disabled={count(id) === 0}>−1</button>
            <button onClick={() => add(id, 1)} disabled={!canAdd(id, 1)}>＋1</button>
            <button onClick={() => add(id, 5)} disabled={!canAdd(id, 5)}>＋5</button>
          </div>
        </div>
      </div>;
    })}</div>
    {error && <p className="notice" role="alert">{error}</p>}
    {!validation.ok && <p className="notice">{validation.error}</p>}
    <button className="secondary" onClick={() => change([...DEFAULT_STARTING_DECK])}>기본 덱으로 되돌리기</button>
    <button className="secondary" disabled={deck.length >= 50} onClick={fillDefaults}>남는 자리 기본 카드로 채우기</button>
    <button className="primary" disabled={!validation.ok} onClick={() => onStart(deck)}>이 덱으로 런 시작</button>
  </main>;
}
