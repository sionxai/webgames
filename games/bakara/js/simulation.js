/* ============================================
   Strategy Battle Simulation
   모든 전략을 동일 조건으로 시뮬레이션하여 비교
   ============================================ */

class StrategyBattle {
    constructor() {
        this.strategies = [
            'gods-eye',
            'hybrid-beast',
            'card-counting', 'streak-follow', 'contrarian',
            'martingale', 'grand-martingale', 'paroli',
            'fibonacci', 'dalembert', '1326',
            'labouchere', 'oscar-grind', 'flat'
        ];

        this.strategyNames = {
            'gods-eye': '👁️ 신의 눈 (치트)',
            'hybrid-beast': '🦁 하이브리드 비스트',
            'card-counting': '🧠 카드 카운팅',
            'streak-follow': '🔥 패턴 추종',
            'contrarian': '🔄 역발상',
            'martingale': '📈 마틴게일',
            'grand-martingale': '📈📈 그랜드 마틴게일',
            'paroli': '🔄 파롤리',
            'fibonacci': '🐚 피보나치',
            'dalembert': '⚖️ 달랑베르',
            '1326': '🎯 1-3-2-6',
            'labouchere': '✂️ 라부셰르',
            'oscar-grind': '🎰 오스카 그라인드',
            'flat': '📊 플랫 베팅'
        };

        this.results = null;
    }

    /**
     * Advanced strategy: Card Counting
     * Tracks remaining cards in shoe to estimate banker/player advantage.
     * Uses this info to:
     * 1. Dynamically choose banker or player
     * 2. Adjust bet size using Kelly Criterion
     */
    createCardCounter(baseBet) {
        return {
            // Track all 10 ranks (A=1, 2-9, 10/J/Q/K=0)
            cardsSeen: new Array(10).fill(0), // index = card value (0-9)
            totalSeen: 0,
            totalCards: 416, // 8 decks

            // Record a card that was dealt
            recordCard(card) {
                const val = card.value; // 0-9
                this.cardsSeen[val]++;
                this.totalSeen++;
            },

            // Record all cards from a round result
            recordRound(roundResult) {
                for (const card of roundResult.playerHand) {
                    this.recordCard(card);
                }
                for (const card of roundResult.bankerHand) {
                    this.recordCard(card);
                }
            },

            // Calculate estimated banker edge based on remaining shoe
            // High cards (6-9) slightly favor Player
            // Low cards (1-5) slightly favor Banker
            calculateEdge() {
                const remaining = this.totalCards - this.totalSeen;
                if (remaining < 20) return { side: 'banker', edge: 0.0106 };

                let highRemaining = 0; // 6,7,8,9
                let lowRemaining = 0;  // 1,2,3,4,5

                const cardsPerValue = (this.totalCards / 13); // ~32 per value

                for (let v = 6; v <= 9; v++) {
                    highRemaining += (cardsPerValue - this.cardsSeen[v]);
                }
                for (let v = 1; v <= 5; v++) {
                    lowRemaining += (cardsPerValue - this.cardsSeen[v]);
                }

                const highRatio = highRemaining / remaining;
                const lowRatio = lowRemaining / remaining;

                // Base edges: Banker=1.06%, Player=1.24%
                // High card ratio above normal → slight Player advantage
                // Low card ratio above normal → slight Banker advantage
                const normalRatio = 5 / 13; // ~0.385
                const deviation = (lowRatio - highRatio);

                // The edge shift in baccarat card counting is TINY (0.01-0.04%)
                if (deviation > 0.03) {
                    return { side: 'banker', edge: 0.0106 + deviation * 0.1 };
                } else if (deviation < -0.03) {
                    return { side: 'player', edge: 0.0124 + Math.abs(deviation) * 0.1 };
                }
                return { side: 'banker', edge: 0.0106 };
            },

            // Kelly Criterion bet sizing
            getKellyBet(balance, baseBet) {
                const { edge } = this.calculateEdge();
                // Kelly fraction = edge / odds (simplified for ~1:1 payout)
                const kellyFraction = Math.max(0.01, Math.min(edge * 2, 0.05));
                const kellyBet = Math.floor(balance * kellyFraction);
                // Clamp between baseBet and 5x baseBet
                return Math.max(baseBet, Math.min(kellyBet, baseBet * 5));
            },

            getBetTarget() {
                return this.calculateEdge().side;
            }
        };
    }

    /**
     * Advanced strategy: Streak Following
     * Tracks recent results and follows winning trends.
     * If a side is on a streak, bet on that side.
     */
    createStreakFollower() {
        return {
            history: [],
            streakCount: 0,
            currentSide: 'banker',

            recordResult(result) {
                if (result === 'tie') return;
                this.history.push(result);

                if (this.history.length < 2) {
                    this.currentSide = 'banker';
                    return;
                }

                // Count current streak
                const last = this.history[this.history.length - 1];
                let streak = 1;
                for (let i = this.history.length - 2; i >= 0; i--) {
                    if (this.history[i] === last) streak++;
                    else break;
                }
                this.streakCount = streak;

                // Follow streak if 2+ in a row
                if (streak >= 2) {
                    this.currentSide = last;
                } else {
                    // No clear streak — default to banker (lower house edge)
                    this.currentSide = 'banker';
                }
            },

            getBetTarget() {
                return this.currentSide;
            },

            // Bet more aggressively during longer streaks
            getBetMultiplier() {
                if (this.streakCount >= 5) return 3;
                if (this.streakCount >= 3) return 2;
                return 1;
            }
        };
    }

    /**
     * Advanced strategy: Contrarian
     * Bets against the current trend, expecting regression to the mean.
     * If one side has won more, bet on the other.
     */
    createContrarian() {
        return {
            playerWins: 0,
            bankerWins: 0,
            history: [],

            recordResult(result) {
                if (result === 'player') this.playerWins++;
                else if (result === 'banker') this.bankerWins++;
                if (result !== 'tie') this.history.push(result);
            },

            getBetTarget() {
                if (this.history.length < 3) return 'banker';

                // Look at last 10 results
                const recent = this.history.slice(-10);
                const recentBanker = recent.filter(r => r === 'banker').length;
                const recentPlayer = recent.length - recentBanker;

                // Bet against the dominant side
                if (recentBanker > recentPlayer + 2) return 'player';
                if (recentPlayer > recentBanker + 2) return 'banker';

                // Default to banker
                return 'banker';
            },

            // Conservative betting
            getBetMultiplier() {
                return 1;
            }
        };
    }

    /**
     * Hybrid Beast: Grand Martingale + Paroli
     * Win → Paroli ride (double immediately, 4-win cycle)
     * Lose → Grand Martingale (bet×2 + baseBet)
     * Flow: Win1=2x, Win2=4x, Win3=8x, Win4=reset
     */
    createHybridBeast(baseBet) {
        return {
            baseBet,
            currentBet: baseBet,
            consecutiveWins: 0,

            recordResult(result) {
                // no-op, we use onWin/onLoss directly
            },

            onWin() {
                this.consecutiveWins++;

                if (this.consecutiveWins < 4) {
                    // Paroli phase: baseBet-anchored progression
                    // Prevents GM recovery bet from inflating Paroli
                    this.currentBet = this.baseBet * Math.pow(2, this.consecutiveWins);
                } else {
                    // 4-win cycle complete → take profit, reset
                    this.currentBet = this.baseBet;
                    this.consecutiveWins = 0;
                }
            },

            onLoss() {
                if (this.consecutiveWins > 0) {
                    // Was in Paroli phase → reset to base before Grand Martingale
                    this.currentBet = this.baseBet;
                }
                this.consecutiveWins = 0;
                // Grand Martingale: double + base
                this.currentBet = this.currentBet * 2 + this.baseBet;
            },

            getBetAmount(balance) {
                return Math.min(this.currentBet, balance);
            },

            getBetTarget() {
                return null;
            },

            getBetMultiplier() {
                return this.currentBet / this.baseBet;
            }
        };
    }

    /**
     * Run battle simulation
     * @param {Object} config
     * @param {number} config.startBalance - Starting balance
     * @param {number} config.baseBet - Base bet unit
     * @param {number} config.maxRounds - Max rounds (0 = unlimited)
     * @param {number} config.targetBalance - Target balance to stop (0 = unlimited)
     * @param {string} config.betTarget - 'player' or 'banker'
     * @param {number} config.deckCount - Number of decks in shoe
     * @returns {Object} results
     */
    run(config) {
        const {
            startBalance = 1000000,
            baseBet = 10000,
            maxRounds = 50,
            targetBalance = 100000000,
            betTarget = 'banker',
            deckCount = 8,
            maxBet = 0,
            godsEye = false
        } = config;

        // Create a single shoe for fair comparison
        const game = new BaccaratGame(deckCount);

        // Filter strategies based on godsEye toggle
        const activeStrategies = godsEye
            ? this.strategies
            : this.strategies.filter(s => s !== 'gods-eye');

        // Create strategy instances
        const runners = activeStrategies.map(type => {
            const isGodsEye = type === 'gods-eye';
            const isAdvanced = ['card-counting', 'streak-follow', 'contrarian', 'hybrid-beast'].includes(type);
            const strategy = new AutoBettingStrategy(
                (isGodsEye || isAdvanced) ? 'flat' : type, baseBet, betTarget,
                'target', targetBalance, maxRounds
            );
            strategy.start();

            const runner = {
                type,
                name: this.strategyNames[type],
                strategy,
                isGodsEye,
                isAdvanced,
                advancedHandler: null,
                balance: startBalance,
                history: [startBalance],
                alive: true,
                endRound: 0,
                endReason: '',
                peakBalance: startBalance,
                lowestBalance: startBalance,
                wins: 0,
                losses: 0,
                ties: 0,
                maxWinStreak: 0,
                maxLoseStreak: 0,
                currentWinStreak: 0,
                currentLoseStreak: 0,
                totalBetAmount: 0
            };

            // Attach advanced handlers
            if (type === 'card-counting') runner.advancedHandler = this.createCardCounter(baseBet);
            if (type === 'streak-follow') runner.advancedHandler = this.createStreakFollower();
            if (type === 'contrarian') runner.advancedHandler = this.createContrarian();
            if (type === 'hybrid-beast') runner.advancedHandler = this.createHybridBeast(baseBet);

            return runner;
        });

        // Run simulation
        let round = 0;
        const maxSafeRounds = maxRounds > 0 ? maxRounds : 500;

        while (round < maxSafeRounds) {
            // Check if all strategies are done
            const aliveCount = runners.filter(r => r.alive).length;
            if (aliveCount === 0) break;

            // Deal one round (same cards for everyone)
            game.newRound();
            const result = game.playRound();

            round++;

            // Apply result to each strategy
            for (const runner of runners) {
                if (!runner.alive) {
                    runner.history.push(runner.balance);
                    continue;
                }

                // Calculate bet amount
                let betAmount = runner.strategy.currentBet;

                // Advanced strategies: adjust bet size
                if (runner.type === 'card-counting') {
                    betAmount = runner.advancedHandler.getKellyBet(runner.balance, baseBet);
                } else if (runner.type === 'streak-follow') {
                    betAmount = baseBet * runner.advancedHandler.getBetMultiplier();
                } else if (runner.type === 'hybrid-beast') {
                    betAmount = runner.advancedHandler.getBetAmount(runner.balance);
                }

                betAmount = Math.min(betAmount, runner.balance);

                // Apply max bet limit (0 = unlimited)
                if (maxBet > 0) {
                    betAmount = Math.min(betAmount, maxBet);
                }

                // Sync beast handler's internal state with actual capped bet
                if (runner.type === 'hybrid-beast' && runner.advancedHandler) {
                    runner.advancedHandler.currentBet = betAmount;
                }
                // Also sync regular strategy's internal bet when capped
                if (betAmount < runner.strategy.currentBet) {
                    runner.strategy.currentBet = betAmount;
                }

                if (betAmount <= 0 || runner.balance < baseBet) {
                    runner.alive = false;
                    runner.endRound = round;
                    runner.endReason = '💀 파산';
                    runner.history.push(runner.balance);
                    continue;
                }

                runner.totalBetAmount += betAmount;

                // Determine bet target
                let actualBetTarget = betTarget;
                if (runner.isGodsEye) {
                    actualBetTarget = result.result === 'tie' ? betTarget : result.result;
                } else if (runner.advancedHandler && runner.advancedHandler.getBetTarget()) {
                    actualBetTarget = runner.advancedHandler.getBetTarget();
                }

                // Calculate payout
                const payout = BaccaratGame.calculatePayout(actualBetTarget, betAmount, result.result);
                runner.balance += payout;

                // Track stats
                if (payout > 0) {
                    runner.wins++;
                    runner.currentWinStreak++;
                    runner.currentLoseStreak = 0;
                    runner.maxWinStreak = Math.max(runner.maxWinStreak, runner.currentWinStreak);
                } else if (payout < 0) {
                    runner.losses++;
                    runner.currentLoseStreak++;
                    runner.currentWinStreak = 0;
                    runner.maxLoseStreak = Math.max(runner.maxLoseStreak, runner.currentLoseStreak);
                } else {
                    runner.ties++;
                }

                runner.peakBalance = Math.max(runner.peakBalance, runner.balance);
                runner.lowestBalance = Math.min(runner.lowestBalance, runner.balance);
                runner.history.push(runner.balance);

                // Calculate next bet
                if (!runner.isAdvanced) {
                    runner.strategy.calculateNextBet(result.result, runner.balance);
                }

                // Update advanced handlers with round data
                if (runner.type === 'card-counting') {
                    runner.advancedHandler.recordRound(result);
                } else if (runner.type === 'hybrid-beast') {
                    if (payout > 0) runner.advancedHandler.onWin();
                    else if (payout < 0) runner.advancedHandler.onLoss();
                    runner.advancedHandler.recordResult(result.result);
                } else if (runner.type === 'streak-follow' || runner.type === 'contrarian') {
                    runner.advancedHandler.recordResult(result.result);
                }

                // Check stop conditions
                if (runner.balance <= 0) {
                    runner.alive = false;
                    runner.endRound = round;
                    runner.endReason = '💀 파산';
                } else if (targetBalance > 0 && targetBalance > startBalance && runner.balance >= targetBalance) {
                    runner.alive = false;
                    runner.endRound = round;
                    runner.endReason = '🎉 목표 달성!';
                } else if (maxRounds > 0 && round >= maxRounds) {
                    runner.endRound = round;
                    runner.endReason = '⏱️ 라운드 완료';
                }
            }
        }

        // Mark remaining alive ones
        for (const runner of runners) {
            if (runner.alive) {
                runner.endRound = round;
                runner.endReason = '⏱️ 라운드 완료';
            }
        }

        // Sort by final balance (descending)
        runners.sort((a, b) => b.balance - a.balance);

        // Assign ranks
        runners.forEach((r, i) => {
            r.rank = i + 1;
            r.profit = r.balance - startBalance;
            r.roi = ((r.balance - startBalance) / startBalance * 100).toFixed(1);
        });

        this.results = {
            runners,
            config: { startBalance, baseBet, maxRounds, targetBalance, betTarget, deckCount, maxBet },
            totalRounds: round
        };

        return this.results;
    }

    /**
     * Render results into the modal
     */
    renderResults(containerId) {
        const container = document.getElementById(containerId);
        if (!container || !this.results) return;

        const { runners, config, totalRounds } = this.results;

        // Build HTML
        let html = '';

        // Summary header
        const maxBetLabel = config.maxBet > 0 ? `₩${config.maxBet.toLocaleString()}` : '♾️ 무제한';
        html += `
        <div class="battle-summary" style="grid-template-columns: repeat(5, 1fr);">
            <div class="battle-summary-item">
                <span class="battle-label">시작 잔액</span>
                <span class="battle-value">₩${config.startBalance.toLocaleString()}</span>
            </div>
            <div class="battle-summary-item">
                <span class="battle-label">기본 배팅</span>
                <span class="battle-value">₩${config.baseBet.toLocaleString()}</span>
            </div>
            <div class="battle-summary-item">
                <span class="battle-label">최대 배팅</span>
                <span class="battle-value" style="color: ${config.maxBet > 0 ? '#f97316' : '#22c55e'}">${maxBetLabel}</span>
            </div>
            <div class="battle-summary-item">
                <span class="battle-label">총 라운드</span>
                <span class="battle-value">${totalRounds}R</span>
            </div>
            <div class="battle-summary-item">
                <span class="battle-label">배팅 대상</span>
                <span class="battle-value">${config.betTarget === 'banker' ? '뱅커' : '플레이어'}</span>
            </div>
        </div>`;

        // Chart
        html += `<div class="battle-chart-container"><canvas id="battle-chart"></canvas></div>`;

        // Ranking table
        html += `
        <div class="battle-table-container">
            <table class="battle-table">
                <thead>
                    <tr>
                        <th>순위</th>
                        <th>전략</th>
                        <th>최종 잔액</th>
                        <th>손익</th>
                        <th>ROI</th>
                        <th>승/패</th>
                        <th>최대연승</th>
                        <th>최고잔액</th>
                        <th>최저잔액</th>
                        <th>종료</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const r of runners) {
            const profitClass = r.profit >= 0 ? 'positive' : 'negative';
            const medalEmoji = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}`;

            html += `
                    <tr class="battle-row ${r.profit >= 0 ? 'row-win' : 'row-lose'}">
                        <td class="rank-cell">${medalEmoji}</td>
                        <td class="name-cell">${r.name}</td>
                        <td class="balance-cell">₩${r.balance.toLocaleString()}</td>
                        <td class="profit-cell ${profitClass}">${r.profit >= 0 ? '+' : ''}₩${r.profit.toLocaleString()}</td>
                        <td class="roi-cell ${profitClass}">${r.roi}%</td>
                        <td class="wl-cell">${r.wins}W ${r.losses}L</td>
                        <td>${r.maxWinStreak}연승</td>
                        <td>₩${r.peakBalance.toLocaleString()}</td>
                        <td>₩${r.lowestBalance.toLocaleString()}</td>
                        <td class="reason-cell">${r.endReason}</td>
                    </tr>`;
        }

        html += '</tbody></table></div>';

        container.innerHTML = html;

        // Draw chart
        this.drawChart(runners, totalRounds);
    }

    drawChart(runners, totalRounds) {
        const ctx = document.getElementById('battle-chart');
        if (!ctx) return;

        const colors = [
            '#FFD700',
            '#ff6b35',
            '#00e5ff', '#84cc16', '#d946ef',
            '#ef4444', '#f97316', '#22c55e',
            '#a855f7', '#3b82f6', '#f59e0b',
            '#ec4899', '#14b8a6', '#6b7280'
        ];

        const datasets = runners.map((r, i) => ({
            label: r.name.replace(/[^\w가-힣\s\-\.]/g, '').trim(),
            data: r.history,
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3
        }));

        const labels = Array.from({ length: totalRounds + 1 }, (_, i) => i);

        if (window.battleChart) {
            window.battleChart.destroy();
        }

        window.battleChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            font: { size: 11 },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        },
                        onClick: (e, legendItem, legend) => {
                            const chart = legend.chart;
                            const ci = legendItem.datasetIndex;
                            const allVisible = chart.data.datasets.every(
                                (ds, i) => !chart.getDatasetMeta(i).hidden
                            );
                            const onlyThisVisible = chart.data.datasets.every(
                                (ds, i) => i === ci ? !chart.getDatasetMeta(i).hidden : chart.getDatasetMeta(i).hidden
                            );

                            if (onlyThisVisible) {
                                // Already solo → restore all
                                chart.data.datasets.forEach((ds, i) => {
                                    chart.getDatasetMeta(i).hidden = false;
                                });
                            } else {
                                // Solo mode → hide all except clicked
                                chart.data.datasets.forEach((ds, i) => {
                                    chart.getDatasetMeta(i).hidden = i !== ci;
                                });
                            }
                            chart.update();
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ₩${ctx.parsed.y?.toLocaleString() || 0}`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '라운드', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        title: { display: true, text: '잔액 (₩)', color: '#64748b' },
                        ticks: {
                            color: '#64748b',
                            callback: v => `₩${(v / 10000).toFixed(0)}만`
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }
}
