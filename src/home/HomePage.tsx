import React, { useState } from 'react';
import { GAMES, GameEntry } from './games';
import { LegalDocsModal } from '../components/portal/LegalDocsModal';
import { Gamepad2, Hourglass, Play, ScrollText, ShieldCheck, Smartphone, Trophy, Zap } from 'lucide-react';

function GameCard({ game }: { game: GameEntry }) {
  if (game.status === 'coming-soon') {
    return (
      <div className="game-card game-card--soon">
        <div className="game-card__thumb game-card__thumb--empty" aria-hidden="true">
          <Hourglass size={26} />
        </div>
        <div className="game-card__body">
          <span className="genre-chip genre-chip--muted">{game.genre}</span>
          <h3>{game.title}</h3>
          <p>{game.description}</p>
        </div>
      </div>
    );
  }

  return (
    <a className="game-card" href={game.path}>
      <div
        className="game-card__thumb"
        style={game.thumbnail ? { backgroundImage: `url(${game.thumbnail})` } : undefined}
        aria-hidden="true"
      />
      <div className="game-card__body">
        <span className="genre-chip">{game.genre}</span>
        <h3>{game.title}</h3>
        <p>{game.description}</p>
        <span className="play-cta play-cta--small">
          <Play size={14} aria-hidden="true" />
          바로 플레이
        </span>
      </div>
    </a>
  );
}

export function HomePage() {
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const featured = GAMES.find(game => game.status === 'live');
  const liveCount = GAMES.filter(game => game.status === 'live').length;

  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-brand">
          <span className="portal-brand__mark" aria-hidden="true">
            <Gamepad2 size={22} />
          </span>
          <div>
            <p className="portal-eyebrow">INSTANT WEB GAMES</p>
            <h1>WEBGAMES</h1>
          </div>
        </div>
        <p className="portal-tagline">설치·가입 없이 브라우저에서 바로 즐기는 웹게임 모음</p>
      </header>

      <main className="portal-main">
        {featured && (
          <section className="hero" aria-labelledby="hero-title">
            <a
              className="hero-card"
              href={featured.path}
              style={featured.thumbnail ? { backgroundImage: `url(${featured.thumbnail})` } : undefined}
            >
              <div className="hero-card__shade" aria-hidden="true" />
              <div className="hero-card__body">
                <span className="genre-chip genre-chip--hero">{featured.genre}</span>
                <h2 id="hero-title">{featured.title}</h2>
                <p>{featured.tagline}</p>
                <span className="play-cta">
                  <Play size={16} aria-hidden="true" />
                  바로 플레이
                </span>
              </div>
            </a>
          </section>
        )}

        <section className="value-strip" aria-label="포털 특징">
          <div className="value-item">
            <Zap size={17} aria-hidden="true" />
            <div>
              <strong>즉시 플레이</strong>
              <span>설치·가입 없음</span>
            </div>
          </div>
          <div className="value-item">
            <Smartphone size={17} aria-hidden="true" />
            <div>
              <strong>모바일 최적화</strong>
              <span>폰·태블릿·PC 대응</span>
            </div>
          </div>
          <div className="value-item">
            <Trophy size={17} aria-hidden="true" />
            <div>
              <strong>기록 도전</strong>
              <span>랭킹·수집 요소</span>
            </div>
          </div>
        </section>

        <div className="ad-slot" aria-label="광고 영역">
          <span className="ad-slot__badge">AD</span>
          <p>광고 영역 — 광고 네트워크 승인 후 코드가 삽입됩니다</p>
        </div>

        <section className="game-list" aria-labelledby="games-title">
          <div className="section-head">
            <h2 id="games-title">모든 게임</h2>
            <span className="section-head__count">{liveCount}개 플레이 가능</span>
          </div>
          <div className="game-grid">
            {GAMES.map(game => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      </main>

      <footer className="portal-footer">
        <div className="portal-footer__links">
          <button type="button" onClick={() => setLegalTab('terms')}>
            <ScrollText size={14} aria-hidden="true" />
            이용약관
          </button>
          <button type="button" onClick={() => setLegalTab('privacy')}>
            <ShieldCheck size={14} aria-hidden="true" />
            개인정보처리방침
          </button>
        </div>
        <p className="portal-footer__copy">© 2026 WEBGAMES. All rights reserved.</p>
      </footer>

      {legalTab && <LegalDocsModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
}
