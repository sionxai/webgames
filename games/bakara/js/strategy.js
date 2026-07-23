/* ============================================
   Auto-Betting Strategies
   9 strategies: Martingale, Grand Martingale, Paroli,
   Fibonacci, D'Alembert, 1-3-2-6, Labouchère,
   Oscar's Grind, Flat Betting
   ============================================ */

class AutoBettingStrategy {
    constructor(type, baseBet, target, stopCondition, targetAmount, targetRounds) {
        this.type = type;
        this.baseBet = baseBet;
        this.target = target; // 'player' or 'banker'
        this.stopCondition = stopCondition; // 'target', 'allin', 'rounds'
        this.targetAmount = targetAmount;
        this.targetRounds = targetRounds;

        this.currentBet = baseBet;
        this.roundsPlayed = 0;
        this.consecutiveWins = 0;
        this.consecutiveLosses = 0;
        this.totalProfit = 0;
        this.isRunning = false;
        this.isPaused = false;

        // Strategy-specific state
        this.fibSequence = [1, 1]; // Fibonacci
        this.fibIndex = 0;

        this.dalembertLevel = 0; // D'Alembert

        this.progressionIndex = 0; // 1-3-2-6
        this.progression1326 = [1, 3, 2, 6];

        this.labouchereList = []; // Labouchère

        this.oscarGrindLevel = 1; // Oscar's Grind
        this.oscarSessionProfit = 0;
    }

    get displayName() {
        const names = {
            'martingale': '마틴게일',
            'grand-martingale': '그랜드 마틴게일',
            'hybrid-beast': '하이브리드 비스트',
            'paroli': '파롤리',
            'fibonacci': '피보나치',
            'dalembert': '달랑베르',
            '1326': '1-3-2-6',
            'labouchere': '라부셰르',
            'oscar-grind': '오스카 그라인드',
            'flat': '플랫 베팅'
        };
        return names[this.type] || this.type;
    }

    // Calculate next bet based on last result
    calculateNextBet(lastResult, currentBalance) {
        this.roundsPlayed++;

        const won = lastResult === this.target;
        const isTie = lastResult === 'tie';

        if (isTie) {
            // On tie, repeat the same bet
            return this.currentBet;
        }

        switch (this.type) {
            case 'martingale':
                return this.martingaleNext(won);
            case 'grand-martingale':
                return this.grandMartingaleNext(won);
            case 'hybrid-beast':
                return this.hybridBeastNext(won);
            case 'paroli':
                return this.paroliNext(won);
            case 'fibonacci':
                return this.fibonacciNext(won);
            case 'dalembert':
                return this.dalembertNext(won);
            case '1326':
                return this.system1326Next(won);
            case 'labouchere':
                return this.labouchereNext(won);
            case 'oscar-grind':
                return this.oscarGrindNext(won, currentBalance);
            case 'flat':
                return this.flatNext();
            default:
                return this.baseBet;
        }
    }

    // ============================================
    // 1. Martingale: Double on loss, reset on win
    // ============================================
    martingaleNext(won) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            this.currentBet = this.baseBet;
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            this.currentBet = this.currentBet * 2;
        }
        return this.currentBet;
    }

    // ============================================
    // 2. Grand Martingale: Double + base on loss
    // ============================================
    grandMartingaleNext(won) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            this.currentBet = this.baseBet;
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            this.currentBet = this.currentBet * 2 + this.baseBet;
        }
        return this.currentBet;
    }

    // ============================================
    // 3. Paroli: Double on win, reset after 3 wins or loss
    // ============================================
    paroliNext(won) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            if (this.consecutiveWins >= 3) {
                this.consecutiveWins = 0;
                this.currentBet = this.baseBet;
            } else {
                this.currentBet = this.currentBet * 2;
            }
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            this.currentBet = this.baseBet;
        }
        return this.currentBet;
    }

    // ============================================
    // 4. Fibonacci: Bet follows Fibonacci sequence on loss
    //    Loss → move forward in sequence
    //    Win → move back 2 steps
    // ============================================
    fibonacciNext(won) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            // Move back 2 steps
            this.fibIndex = Math.max(0, this.fibIndex - 2);
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            // Move forward 1 step
            this.fibIndex++;
        }

        // Ensure fibonacci sequence is long enough
        while (this.fibSequence.length <= this.fibIndex) {
            const len = this.fibSequence.length;
            this.fibSequence.push(this.fibSequence[len - 1] + this.fibSequence[len - 2]);
        }

        this.currentBet = this.baseBet * this.fibSequence[this.fibIndex];
        return this.currentBet;
    }

    // ============================================
    // 5. D'Alembert: +1 unit on loss, -1 unit on win
    //    Simple and conservative progression
    // ============================================
    dalembertNext(won) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            this.dalembertLevel = Math.max(0, this.dalembertLevel - 1);
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            this.dalembertLevel++;
        }

        this.currentBet = this.baseBet * (1 + this.dalembertLevel);
        return this.currentBet;
    }

    // ============================================
    // 6. 1-3-2-6 System: Fixed progression on wins
    //    Win sequence: 1→3→2→6 units
    //    Any loss resets to start
    // ============================================
    system1326Next(won) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            this.progressionIndex++;
            if (this.progressionIndex >= 4) {
                // Completed cycle, reset
                this.progressionIndex = 0;
            }
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            // Any loss resets
            this.progressionIndex = 0;
        }

        this.currentBet = this.baseBet * this.progression1326[this.progressionIndex];
        return this.currentBet;
    }

    // ============================================
    // 7. Labouchère (Cancellation System):
    //    Start with a number list (e.g., [1,2,3,4])
    //    Bet = first + last number
    //    Win → remove first & last
    //    Loss → add the bet to end
    //    Complete when list is empty
    // ============================================
    labouchereNext(won) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            // Remove first and last
            if (this.labouchereList.length > 0) {
                this.labouchereList.shift();
            }
            if (this.labouchereList.length > 0) {
                this.labouchereList.pop();
            }
            // If list is empty, cycle is complete → reset
            if (this.labouchereList.length === 0) {
                this.labouchereList = [1, 2, 3, 4];
            }
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            // Add losing bet units to end
            const betUnits = this.labouchereList.length >= 2
                ? this.labouchereList[0] + this.labouchereList[this.labouchereList.length - 1]
                : (this.labouchereList[0] || 1);
            this.labouchereList.push(betUnits);
        }

        // Calculate next bet
        if (this.labouchereList.length >= 2) {
            this.currentBet = this.baseBet * (this.labouchereList[0] + this.labouchereList[this.labouchereList.length - 1]);
        } else if (this.labouchereList.length === 1) {
            this.currentBet = this.baseBet * this.labouchereList[0];
        } else {
            this.currentBet = this.baseBet;
        }

        return this.currentBet;
    }

    // ============================================
    // 8. Oscar's Grind:
    //    Goal: win exactly 1 unit per cycle
    //    Loss → same bet
    //    Win → increase by 1 unit (but don't exceed 1 unit profit)
    //    Reset when session profit reaches 1 unit
    // ============================================
    oscarGrindNext(won, currentBalance) {
        if (won) {
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
            this.oscarSessionProfit += this.currentBet;

            if (this.oscarSessionProfit >= this.baseBet) {
                // Goal achieved! Reset session
                this.oscarSessionProfit = 0;
                this.oscarGrindLevel = 1;
                this.currentBet = this.baseBet;
            } else {
                // Increase by 1 unit, but cap so profit doesn't exceed 1 unit
                this.oscarGrindLevel++;
                this.currentBet = this.baseBet * this.oscarGrindLevel;
                // Cap: don't bet more than needed to reach 1 unit profit
                const maxBet = this.baseBet - this.oscarSessionProfit;
                if (this.currentBet > maxBet && maxBet > 0) {
                    this.currentBet = maxBet;
                }
            }
        } else {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            this.oscarSessionProfit -= this.currentBet;
            // Keep same bet level on loss
        }

        return this.currentBet;
    }

    // ============================================
    // 9. Flat Betting: Always bet the same amount
    // ============================================
    flatNext() {
        this.currentBet = this.baseBet;
        return this.currentBet;
    }

    // ============================================
    // 10. Hybrid Beast: Grand Martingale + Paroli
    //     Win → Paroli ride (double immediately, 4-win cycle)
    //     Lose → Grand Martingale (double + base)
    //     Flow: Win1=2x, Win2=4x, Win3=8x, Win4=reset
    // ============================================
    hybridBeastNext(won) {
        if (won) {
            this.consecutiveWins = (this.consecutiveWins || 0) + 1;

            if (this.consecutiveWins < 4) {
                // Paroli phase: baseBet-anchored progression
                this.currentBet = this.baseBet * Math.pow(2, this.consecutiveWins);
            } else {
                // 4-win cycle complete → take profit, reset
                this.currentBet = this.baseBet;
                this.consecutiveWins = 0;
            }
        } else {
            // If was in Paroli phase, reset to base before Grand Martingale
            if (this.consecutiveWins > 0) {
                this.currentBet = this.baseBet;
            }
            // Grand Martingale phase: aggressive recovery
            this.consecutiveWins = 0;
            this.currentBet = this.currentBet * 2 + this.baseBet;
        }
        return this.currentBet;
    }

    // ============================================
    // Common Methods
    // ============================================

    shouldStop(currentBalance, initialBalance) {
        if (!this.isRunning || this.isPaused) return true;

        switch (this.stopCondition) {
            case 'target':
                if (currentBalance >= this.targetAmount) {
                    return true;
                }
                break;
            case 'allin':
                if (currentBalance <= 0) {
                    return true;
                }
                break;
            case 'rounds':
                if (this.roundsPlayed >= this.targetRounds) {
                    return true;
                }
                break;
        }

        if (currentBalance < this.baseBet) {
            return true;
        }

        return false;
    }

    getStopReason(currentBalance) {
        if (currentBalance <= 0 || currentBalance < this.baseBet) return '잔액 부족 (파산)';
        if (this.stopCondition === 'target' && currentBalance >= this.targetAmount) return '목표 금액 달성! 🎉';
        if (this.stopCondition === 'rounds' && this.roundsPlayed >= this.targetRounds) return '지정 라운드 완료';
        if (this.isPaused) return '일시 정지';
        if (!this.isRunning) return '수동 중지';
        return '알 수 없음';
    }

    capBet(currentBalance) {
        this.currentBet = Math.min(this.currentBet, currentBalance);
        this.currentBet = Math.floor(this.currentBet / 1000) * 1000;
        if (this.currentBet === 0 && currentBalance >= 1000) {
            this.currentBet = 1000;
        }
        return this.currentBet;
    }

    start() {
        this.isRunning = true;
        this.isPaused = false;
        this.currentBet = this.baseBet;
        this.roundsPlayed = 0;
        this.consecutiveWins = 0;
        this.consecutiveLosses = 0;
        this.totalProfit = 0;

        // Reset strategy-specific state
        this.fibSequence = [1, 1];
        this.fibIndex = 0;
        this.dalembertLevel = 0;
        this.progressionIndex = 0;
        this.labouchereList = [1, 2, 3, 4];
        this.oscarGrindLevel = 1;
        this.oscarSessionProfit = 0;
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    stop() {
        this.isRunning = false;
        this.isPaused = false;
    }
}

/* ============================================
   Trend Analyzer - 추세 분석 자동배팅 엔진
   3가지 분석 기법을 결합하여 배팅 대상을 동적으로 결정
   1. Streak Analysis (스트릭 추종)
   2. Chop Detection (쵸핑/반복 패턴 감지)
   3. Statistical Bias (통계적 편향 분석)
   ============================================ */
class TrendAnalyzer {
    constructor() {
        this.history = [];       // 전체 결과 기록 ('player' | 'banker')
        this.lastTarget = 'banker'; // 기본값: 뱅커 (하우스 엣지 낮음)
        this.confidence = 0;     // 신뢰도 (0~100)
        this.analysisLog = '';   // 마지막 분석 요약
    }

    // 결과 기록
    recordResult(result) {
        if (result === 'tie') return;
        this.history.push(result);
    }

    // 추세 분석 후 다음 배팅 대상 반환
    analyze() {
        const len = this.history.length;

        // 데이터 부족: 기본값(뱅커) 반환
        if (len < 3) {
            this.lastTarget = 'banker';
            this.confidence = 0;
            this.analysisLog = '데이터 수집 중...';
            return this.lastTarget;
        }

        // === 1. 스트릭 분석 (최근 연속 기록) ===
        const streakScore = this._analyzeStreak();

        // === 2. 쵸핑 패턴 감지 (P-B-P-B 교차 패턴) ===
        const chopScore = this._analyzeChop();

        // === 3. 통계적 편향 (최근 20판 비율) ===
        const biasScore = this._analyzeBias();

        // 가중 합산: 스트릭(40%) + 쵸핑(30%) + 편향(30%)
        const playerScore = streakScore.player * 0.4 + chopScore.player * 0.3 + biasScore.player * 0.3;
        const bankerScore = streakScore.banker * 0.4 + chopScore.banker * 0.3 + biasScore.banker * 0.3;

        // 최종 결정
        if (playerScore > bankerScore + 5) {
            this.lastTarget = 'player';
            this.confidence = Math.min(100, Math.round(playerScore - bankerScore));
        } else if (bankerScore > playerScore + 5) {
            this.lastTarget = 'banker';
            this.confidence = Math.min(100, Math.round(bankerScore - playerScore));
        } else {
            // 차이가 미미하면 뱅커 기본값 (하우스 엣지 이점)
            this.lastTarget = 'banker';
            this.confidence = 0;
        }

        this.analysisLog = `스트릭:P${streakScore.player}/B${streakScore.banker} | 쵸핑:P${chopScore.player}/B${chopScore.banker} | 편향:P${biasScore.player}/B${biasScore.banker} → ${this.lastTarget === 'player' ? '플레이어' : '뱅커'} (${this.confidence}%)`;

        return this.lastTarget;
    }

    // 스트릭 분석: 연속 추세 감지
    _analyzeStreak() {
        const last = this.history[this.history.length - 1];
        let streak = 1;
        for (let i = this.history.length - 2; i >= 0; i--) {
            if (this.history[i] === last) streak++;
            else break;
        }

        const score = { player: 50, banker: 50 };

        if (streak >= 4) {
            // 강한 스트릭 → 추종 (이 패턴이 지속될 확률 높음)
            if (last === 'player') { score.player = 85; score.banker = 15; }
            else { score.banker = 85; score.player = 15; }
        } else if (streak === 3) {
            // 보통 스트릭 → 약간 추종
            if (last === 'player') { score.player = 70; score.banker = 30; }
            else { score.banker = 70; score.player = 30; }
        } else if (streak === 2) {
            // 약한 스트릭
            if (last === 'player') { score.player = 60; score.banker = 40; }
            else { score.banker = 60; score.player = 40; }
        }

        return score;
    }

    // 쵸핑 패턴 분석: P-B-P-B 교차 감지
    _analyzeChop() {
        const score = { player: 50, banker: 50 };
        if (this.history.length < 6) return score;

        // 최근 6판의 교차 횟수 확인
        const recent = this.history.slice(-6);
        let alternations = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] !== recent[i - 1]) alternations++;
        }

        // 교차율 = alternations / (length - 1)
        const chopRate = alternations / (recent.length - 1);

        if (chopRate >= 0.8) {
            // 강한 쵸핑 패턴 → 마지막의 반대에 배팅
            const last = this.history[this.history.length - 1];
            if (last === 'player') { score.banker = 80; score.player = 20; }
            else { score.player = 80; score.banker = 20; }
        } else if (chopRate >= 0.6) {
            // 보통 쵸핑 패턴
            const last = this.history[this.history.length - 1];
            if (last === 'player') { score.banker = 65; score.player = 35; }
            else { score.player = 65; score.banker = 35; }
        }
        // chopRate < 0.6 → 교차 패턴이 약해서 점수 변동 없음

        return score;
    }

    // 통계적 편향: 최근 20판에서 치우친 쪽의 반대로 (회귀 기대)
    _analyzeBias() {
        const score = { player: 50, banker: 50 };
        const window = Math.min(20, this.history.length);
        const recent = this.history.slice(-window);

        const playerCount = recent.filter(r => r === 'player').length;
        const bankerCount = recent.length - playerCount;
        const ratio = playerCount / recent.length;

        // 이론 확률: 뱅커 ~50.68%, 플레이어 ~49.32% (타이 제외)
        if (ratio > 0.6) {
            // 플레이어 과다 → 뱅커 회귀 기대
            score.banker = 65 + Math.round((ratio - 0.6) * 100);
            score.player = 100 - score.banker;
        } else if (ratio < 0.4) {
            // 뱅커 과다 → 플레이어 회귀 기대... 하지만 뱅커 유리
            score.player = 55 + Math.round((0.4 - ratio) * 80);
            score.banker = 100 - score.player;
        }

        return score;
    }

    // 분석 결과 표시용 라벨 반환
    getLabel() {
        if (this.confidence === 0) return '📊 분석 중...';
        const arrow = this.lastTarget === 'player' ? '🔵' : '🔴';
        return `${arrow} ${this.lastTarget === 'player' ? '플레이어' : '뱅커'} (${this.confidence}%)`;
    }

    reset() {
        this.history = [];
        this.lastTarget = 'banker';
        this.confidence = 0;
        this.analysisLog = '';
    }

    /**
     * 수동 배팅용 상세 조언 리포트 생성
     * @param {string[]} gameResults - 게임 결과 배열 (from game.results)
     * @returns {Object} { html, target, confidence }
     */
    generateAdvice(gameResults) {
        // 히스토리를 임시로 세팅
        this.history = gameResults.filter(r => r !== 'tie');
        const target = this.analyze();
        const len = this.history.length;

        if (len < 3) {
            return {
                html: this._buildNoDataHTML(len),
                target: 'banker',
                confidence: 0
            };
        }

        const streakScore = this._analyzeStreak();
        const chopScore = this._analyzeChop();
        const biasScore = this._analyzeBias();

        const playerTotal = streakScore.player * 0.4 + chopScore.player * 0.3 + biasScore.player * 0.3;
        const bankerTotal = streakScore.banker * 0.4 + chopScore.banker * 0.3 + biasScore.banker * 0.3;

        const html = this._buildAdviceHTML({
            target, confidence: this.confidence,
            streakScore, chopScore, biasScore,
            playerTotal, bankerTotal,
            history: this.history, fullHistory: gameResults
        });

        return { html, target, confidence: this.confidence };
    }

    _buildNoDataHTML(count) {
        return `
            <div class="advice-section advice-insufficient">
                <div class="advice-icon-large">📊</div>
                <h3>데이터 부족</h3>
                <p>추세 분석을 위해 최소 <strong>3라운드</strong> 이상의 기록이 필요합니다.</p>
                <p class="advice-muted">현재 기록: ${count}라운드 (타이 제외)</p>
                <div class="advice-default-tip">
                    <span class="advice-tip-badge">💡 기본 조언</span>
                    <p>뱅커에 배팅하세요. 하우스 엣지가 1.06%로 플레이어(1.24%)보다 유리합니다.</p>
                </div>
            </div>
        `;
    }

    _buildAdviceHTML({ target, confidence, streakScore, chopScore, biasScore, playerTotal, bankerTotal, history, fullHistory }) {
        const isPlayer = target === 'player';
        const targetLabel = isPlayer ? '플레이어' : '뱅커';
        const targetColor = isPlayer ? '#3b82f6' : '#ef4444';
        const targetBg = isPlayer ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)';
        const targetEmoji = isPlayer ? '🔵' : '🔴';

        // 최근 결과 시각화 (마지막 20개)
        const recentResults = fullHistory.slice(-20);
        const patternDots = recentResults.map(r => {
            if (r === 'player') return '<span class="dot-p" title="플레이어">P</span>';
            if (r === 'banker') return '<span class="dot-b" title="뱅커">B</span>';
            return '<span class="dot-t" title="타이">T</span>';
        }).join('');

        // 스트릭 분석 세부
        const last = history[history.length - 1];
        let streak = 1;
        for (let i = history.length - 2; i >= 0; i--) {
            if (history[i] === last) streak++;
            else break;
        }
        const streakLabel = last === 'player' ? '플레이어' : '뱅커';
        const streakStrength = streak >= 4 ? '강한 추세' : streak === 3 ? '보통 추세' : streak === 2 ? '약한 추세' : '추세 없음';
        const streakIcon = streak >= 3 ? '🔥' : streak === 2 ? '📈' : '➖';

        // 쵸핑 분석 세부
        let chopRate = 0;
        let chopDesc = '패턴 불명확';
        let chopIcon = '➖';
        if (history.length >= 6) {
            const recent6 = history.slice(-6);
            let alt = 0;
            for (let i = 1; i < recent6.length; i++) {
                if (recent6[i] !== recent6[i - 1]) alt++;
            }
            chopRate = Math.round((alt / 5) * 100);
            if (chopRate >= 80) { chopDesc = '강한 교차 패턴 (P-B-P-B)'; chopIcon = '🔄'; }
            else if (chopRate >= 60) { chopDesc = '보통 교차 패턴'; chopIcon = '↔️'; }
            else { chopDesc = '교차 패턴 약함'; chopIcon = '➖'; }
        }

        // 편향 분석 세부
        const windowSize = Math.min(20, history.length);
        const biasRecent = history.slice(-windowSize);
        const pCount = biasRecent.filter(r => r === 'player').length;
        const bCount = biasRecent.length - pCount;
        const pPct = Math.round((pCount / biasRecent.length) * 100);
        const bPct = 100 - pPct;
        let biasDesc = '균형 상태';
        let biasIcon = '⚖️';
        if (pPct > 60) { biasDesc = '플레이어 과다 → 뱅커 회귀 기대'; biasIcon = '📉'; }
        else if (bPct > 60) { biasDesc = '뱅커 과다 → 약간의 회귀 기대'; biasIcon = '📈'; }

        // 확신도 바
        const confBarWidth = Math.max(5, confidence);
        const confLabel = confidence >= 30 ? '높은 확신' : confidence >= 15 ? '보통 확신' : confidence > 0 ? '낮은 확신' : '불확실';
        const confColor = confidence >= 30 ? '#22c55e' : confidence >= 15 ? '#f59e0b' : '#ef4444';

        return `
            <!-- 추천 결과 헤더 -->
            <div class="advice-recommendation" style="background:${targetBg}; border-color:${targetColor};">
                <div class="advice-rec-header">
                    <span class="advice-rec-emoji">${targetEmoji}</span>
                    <div>
                        <div class="advice-rec-label">추천 배팅</div>
                        <div class="advice-rec-target" style="color:${targetColor};">${targetLabel}</div>
                    </div>
                </div>
                <div class="advice-confidence">
                    <div class="advice-conf-label">${confLabel} <small>(${confidence}%)</small></div>
                    <div class="advice-conf-bar">
                        <div class="advice-conf-fill" style="width:${confBarWidth}%; background:${confColor};"></div>
                    </div>
                </div>
            </div>

            <!-- 최근 패턴 -->
            <div class="advice-section">
                <h4>📋 최근 패턴 (최근 ${recentResults.length}판)</h4>
                <div class="advice-pattern">${patternDots}</div>
                <div class="advice-pattern-stats">
                    <span>전체: ${fullHistory.length}R</span>
                    <span>P: ${fullHistory.filter(r => r === 'player').length}</span>
                    <span>B: ${fullHistory.filter(r => r === 'banker').length}</span>
                    <span>T: ${fullHistory.filter(r => r === 'tie').length}</span>
                </div>
            </div>

            <!-- 분석 상세 -->
            <div class="advice-section">
                <h4>🔍 분석 상세</h4>
                <div class="advice-factors">
                    <!-- 스트릭 분석 -->
                    <div class="advice-factor">
                        <div class="advice-factor-header">
                            <span>${streakIcon} 스트릭 분석</span>
                            <span class="advice-weight">가중치 40%</span>
                        </div>
                        <div class="advice-factor-body">
                            <p>현재 <strong>${streakLabel}</strong>가 <strong>${streak}연속</strong> → ${streakStrength}</p>
                            <div class="advice-factor-scores">
                                <span class="score-p">P: ${streakScore.player}점</span>
                                <span class="score-b">B: ${streakScore.banker}점</span>
                            </div>
                        </div>
                    </div>

                    <!-- 쵸핑 분석 -->
                    <div class="advice-factor">
                        <div class="advice-factor-header">
                            <span>${chopIcon} 쵸핑 패턴</span>
                            <span class="advice-weight">가중치 30%</span>
                        </div>
                        <div class="advice-factor-body">
                            <p>최근 6판 교차율: <strong>${chopRate}%</strong> → ${chopDesc}</p>
                            <div class="advice-factor-scores">
                                <span class="score-p">P: ${chopScore.player}점</span>
                                <span class="score-b">B: ${chopScore.banker}점</span>
                            </div>
                        </div>
                    </div>

                    <!-- 통계적 편향 -->
                    <div class="advice-factor">
                        <div class="advice-factor-header">
                            <span>${biasIcon} 통계 편향</span>
                            <span class="advice-weight">가중치 30%</span>
                        </div>
                        <div class="advice-factor-body">
                            <p>최근 ${windowSize}판: P ${pPct}% / B ${bPct}% → ${biasDesc}</p>
                            <div class="advice-factor-scores">
                                <span class="score-p">P: ${biasScore.player}점</span>
                                <span class="score-b">B: ${biasScore.banker}점</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 종합 점수 -->
            <div class="advice-section">
                <h4>📊 종합 점수</h4>
                <div class="advice-total-scores">
                    <div class="advice-total-bar">
                        <div class="advice-bar-label">🔵 플레이어</div>
                        <div class="advice-bar-track">
                            <div class="advice-bar-fill-p" style="width:${playerTotal}%;"></div>
                        </div>
                        <div class="advice-bar-value">${playerTotal.toFixed(1)}</div>
                    </div>
                    <div class="advice-total-bar">
                        <div class="advice-bar-label">🔴 뱅커</div>
                        <div class="advice-bar-track">
                            <div class="advice-bar-fill-b" style="width:${bankerTotal}%;"></div>
                        </div>
                        <div class="advice-bar-value">${bankerTotal.toFixed(1)}</div>
                    </div>
                </div>
            </div>

            <!-- 면책 조항 -->
            <div class="advice-disclaimer">
                ⚠️ 이 분석은 과거 패턴 기반의 참고용입니다. 바카라는 각 라운드가 독립적이며, 과거 결과가 미래를 보장하지 않습니다.
            </div>
        `;
    }
}
