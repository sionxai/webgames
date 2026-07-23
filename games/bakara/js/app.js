/* ============================================
   Main Application Controller
   ============================================ */

class BaccaratApp {
    constructor() {
        this.game = new BaccaratGame(8);
        this.ui = new UIManager();
        this.stats = new StatsManager();
        this.ai1 = new AIPlayer('AI - Alex', '🤖');
        this.ai2 = new AIPlayer('AI - Blake', '🤖');

        this.balance = 1000000;
        this.initialBalance = 1000000;
        this.maxBet = 500000;
        this.gameState = 'betting'; // 'betting', 'dealing', 'result'

        this.autoStrategy = null;
        this.autoTimer = null;
        this.autoSpeed = 1;
        this.isAutoRunning = false;
        this.trendAnalyzer = null;
        this._balanceSaveTimer = null; // Debounce timer for cloud save

        this.init();
    }

    init() {
        // Loading screen
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('fade-out');
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('app').classList.remove('hidden');
            }, 500);
        }, 1800);

        // Restore balance from localStorage (will be overridden by cloud if logged in)
        const savedBalance = localStorage.getItem('baccarat-balance');
        const savedInitialBalance = localStorage.getItem('baccarat-initial-balance');
        if (savedBalance) {
            this.balance = parseInt(savedBalance) || 1000000;
            this.initialBalance = parseInt(savedInitialBalance) || this.balance;
        }

        this.setupEventListeners();
        this.initGameUI(); // Initialize game UI without resetting balance

        // Save balance on page unload
        window.addEventListener('beforeunload', () => {
            this.saveBalanceLocally();
            // Attempt cloud save (best-effort, may not complete)
            if (this.firebaseManager?.user) {
                this.firebaseManager.saveBalanceToCloud();
            }
        });
    }

    // Initialize game UI elements (like resetGame but preserves balance)
    initGameUI() {
        const deckCount = parseInt(document.getElementById('setting-decks')?.value || '8');
        this.game.reset(deckCount);
        this.stats.reset();
        this.stats.setInitialBalance(this.balance);

        this.ai1.reset(this.balance);
        this.ai2.reset(this.balance);

        this.ui.updateBalance(this.balance);
        this.ui.updateRound(0);
        this.ui.updateShoe(this.game.shoe.remaining, this.game.shoe.total);
        this.ui.clearCards();
        this.ui.hideResult();
        this.ui.clearBets();
        this.ui.updateAIPlayer(1, this.ai1);
        this.ui.updateAIPlayer(2, this.ai2);
        this.ui.updateScoreboard([], this.game.getStats());
        this.ui.setBettingEnabled(true);
        this.updateMaxBetDisplay();

        document.getElementById('history-list').innerHTML = '<p class="empty-state">아직 게임 기록이 없습니다.</p>';
        this.gameState = 'betting';
    }

    resetGame() {
        const deckCount = parseInt(document.getElementById('setting-decks')?.value || '8');
        const balance = parseInt(document.getElementById('setting-balance')?.value || '1000000');
        const maxBet = parseInt(document.getElementById('setting-max-bet')?.value || '500000');

        this.balance = balance;
        this.initialBalance = balance;
        this.maxBet = maxBet; // 0 means unlimited
        this.game.reset(deckCount);
        this.stats.reset();
        this.stats.setInitialBalance(balance);

        this.ai1.reset(balance);
        this.ai2.reset(balance);

        this.ui.updateBalance(this.balance);
        this.ui.updateRound(0);
        this.ui.updateShoe(this.game.shoe.remaining, this.game.shoe.total);
        this.ui.clearCards();
        this.ui.hideResult();
        this.ui.clearBets();
        this.ui.updateAIPlayer(1, this.ai1);
        this.ui.updateAIPlayer(2, this.ai2);
        this.ui.updateScoreboard([], this.game.getStats());
        this.ui.setBettingEnabled(true);
        this.updateMaxBetDisplay();

        // Clear history
        document.getElementById('history-list').innerHTML = '<p class="empty-state">아직 게임 기록이 없습니다.</p>';

        this.gameState = 'betting';

        // Update saved balance to the new game's initial balance
        this.saveBalanceLocally();
    }

    updateMaxBetDisplay() {
        const el = document.getElementById('max-bet-display');
        if (el) {
            el.textContent = this.maxBet > 0 ? `최대: ₩${this.maxBet.toLocaleString()}` : '최대: 무제한';
        }
    }

    setupEventListeners() {
        // Preset chip system
        this.presets = this.loadPresets();
        this.presetEditMode = false;
        this.editingSlotIndex = null;
        this.editingSlotValue = 0;
        this.activeSetKey = '__default__';
        this.renderPresets();
        this.setupPresetListeners();
        this.renderSetSelector();
        this.setupSetListeners();
        // Auto-select the default chip value slot
        const defaultIndex = this.presets.indexOf(this.ui.selectedChipValue);
        if (defaultIndex >= 0) {
            document.querySelectorAll('.preset-slot')[defaultIndex]?.classList.add('selected');
        }

        // Bet options
        ['player', 'tie', 'banker'].forEach(target => {
            document.getElementById(`bet-${target}`).addEventListener('click', () => {
                if (this.gameState !== 'betting') return;
                const chipValue = this.ui.selectedChipValue;
                // Check balance limit
                if (chipValue > this.balance - this.ui.getTotalBet()) return;
                // Check max bet limit
                if (this.maxBet > 0) {
                    const newBetForTarget = this.ui.bets[target] + chipValue;
                    if (newBetForTarget > this.maxBet) return;
                }
                this.ui.addBet(target, chipValue);
            });
        });

        // Action buttons
        document.getElementById('btn-clear').addEventListener('click', () => this.ui.clearBets());
        document.getElementById('btn-undo').addEventListener('click', () => this.ui.undoBet());
        document.getElementById('btn-deal').addEventListener('click', () => this.playRound());
        document.getElementById('btn-next-round').addEventListener('click', () => {
            if (this.gameState !== 'result') return;
            this.prepareNextRound();
        });
        document.getElementById('btn-rebet').addEventListener('click', () => {
            if (this.gameState !== 'betting') return;
            this.ui.rebet(this.balance);
        });

        // Settings
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.ui.showModal('settings-modal');
        });

        document.getElementById('btn-new-game').addEventListener('click', () => {
            this.resetGame();
            this.ui.hideModal('settings-modal');
        });

        // Stats
        document.getElementById('btn-stats').addEventListener('click', () => {
            this.stats.updateDisplay();
            this.stats.renderCharts();
            this.ui.showModal('stats-modal');
        });

        // History
        document.getElementById('btn-history').addEventListener('click', () => {
            this.ui.showModal('history-modal');
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close || btn.closest('.modal')?.id;
                if (modalId) this.ui.hideModal(modalId);
            });
        });

        // Modal overlay close
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', () => {
                const modal = overlay.closest('.modal');
                if (modal) this.ui.hideModal(modal.id);
            });
        });

        // Scoreboard tabs
        document.querySelectorAll('.scoreboard-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.scoreboard-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.getElementById('bead-road').classList.toggle('hidden', tab.dataset.tab !== 'bead');
                document.getElementById('big-road').classList.toggle('hidden', tab.dataset.tab !== 'big');
            });
        });

        // Auto play
        this.setupAutoPlayListeners();

        // Battle simulation
        this.setupBattleListeners();

        // Trend advice button
        document.getElementById('btn-trend-advice').addEventListener('click', () => {
            this.showTrendAdvice();
        });
    }

    setupBattleListeners() {
        document.getElementById('btn-battle').addEventListener('click', () => {
            this.ui.showModal('battle-modal');
            // Reset to settings view
            document.getElementById('battle-settings').style.display = '';
            document.getElementById('battle-results').innerHTML = '';
        });

        document.getElementById('btn-battle-start').addEventListener('click', () => {
            const config = {
                startBalance: parseInt(document.getElementById('battle-balance').value),
                baseBet: parseInt(document.getElementById('battle-baseBet').value),
                maxRounds: parseInt(document.getElementById('battle-rounds').value),
                targetBalance: parseInt(document.getElementById('battle-target').value),
                betTarget: document.querySelector('input[name="battle-target-type"]:checked').value,
                deckCount: this.game.deckCount,
                maxBet: parseInt(document.getElementById('battle-maxBet').value),
                godsEye: document.getElementById('battle-godsEye').checked
            };

            // Hide settings, show loading
            document.getElementById('battle-settings').style.display = 'none';
            document.getElementById('battle-results').innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚡</div>
                    <div>시뮬레이션 진행 중...</div>
                </div>
            `;

            // Run simulation with slight delay for UI
            setTimeout(() => {
                const battle = new StrategyBattle();
                battle.run(config);
                battle.renderResults('battle-results');
            }, 100);
        });
    }

    setupAutoPlayListeners() {
        // Open auto modal
        document.getElementById('btn-auto-toggle').addEventListener('click', () => {
            this.ui.showModal('auto-modal');
        });

        // Strategy selection
        document.querySelectorAll('.strategy-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.strategy-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
            });
        });

        // Stop condition change
        document.getElementById('auto-stop-condition').addEventListener('change', (e) => {
            document.getElementById('target-amount-row').classList.toggle('hidden', e.target.value !== 'target');
            document.getElementById('target-rounds-row').classList.toggle('hidden', e.target.value !== 'rounds');
        });

        // Trend radio toggle description
        document.querySelectorAll('input[name="auto-target"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const trendDesc = document.getElementById('trend-description');
                if (trendDesc) {
                    trendDesc.classList.toggle('hidden', e.target.value !== 'trend');
                }
            });
        });

        // Speed slider
        document.getElementById('auto-speed').addEventListener('input', (e) => {
            document.getElementById('speed-value').textContent = `${e.target.value}x`;
        });

        // Start auto
        document.getElementById('btn-auto-start').addEventListener('click', () => {
            this.startAutoPlay();
        });

        // Show progression table
        document.getElementById('btn-show-progression').addEventListener('click', () => {
            this.showProgressionTable();
        });

        // Pause auto
        document.getElementById('btn-auto-pause').addEventListener('click', () => {
            if (this.autoStrategy?.isPaused) {
                this.resumeAutoPlay();
            } else {
                this.pauseAutoPlay();
            }
        });

        // Stop auto
        document.getElementById('btn-auto-stop').addEventListener('click', () => {
            this.stopAutoPlay('수동 중지');
        });

        // Speed controls in running bar
        document.getElementById('speed-up').addEventListener('click', () => {
            this.autoSpeed = Math.min(10, this.autoSpeed + 1);
            document.getElementById('current-speed').textContent = `${this.autoSpeed}x`;
        });

        document.getElementById('speed-down').addEventListener('click', () => {
            this.autoSpeed = Math.max(1, this.autoSpeed - 1);
            document.getElementById('current-speed').textContent = `${this.autoSpeed}x`;
        });
    }

    async playRound() {
        if (this.gameState !== 'betting') return;

        const totalBet = this.ui.getTotalBet();
        if (totalBet === 0) return;

        this.gameState = 'dealing';
        this.hideCommentary();
        this.ui.setBettingEnabled(false);
        this.ui.hideResult();
        this.ui.saveBets();

        // Deduct bet
        this.balance -= totalBet;
        this.ui.updateBalance(this.balance);

        // AI players bet
        this.ai1.placeBet();
        this.ai2.placeBet();
        this.ui.updateAIPlayer(1, this.ai1);
        this.ui.updateAIPlayer(2, this.ai2);

        // Deal and play
        this.game.newRound();
        this.ui.updateRound(this.game.roundNumber);
        const result = this.game.playRound();

        // Animate cards
        const speed = this.isAutoRunning ? this.autoSpeed : 1;
        await this.ui.renderCards(result.playerHand, result.bankerHand, speed);

        // Calculate player payout
        let totalPayout = 0;
        for (const betType of ['player', 'banker', 'tie']) {
            if (this.ui.bets[betType] > 0) {
                const p = BaccaratGame.calculatePayout(betType, this.ui.bets[betType], result.result);
                totalPayout += p;
            }
        }

        // Return bet + payout (if not loss)
        if (totalPayout >= 0) {
            this.balance += totalBet + totalPayout;
        } else {
            // Total loss - bet already deducted
            // payout is negative, totalBet is the bet already taken
            // The payout represents net: if loss, payout = -betAmount
            // We need to return the non-losing bets in case of multi-bet
            this.balance += totalBet + totalPayout;
        }

        this.ui.updateBalance(this.balance);

        // AI results
        const ai1Payout = this.ai1.processResult(result.result);
        const ai2Payout = this.ai2.processResult(result.result);
        this.ui.updateAIPlayer(1, this.ai1, result.result);
        this.ui.updateAIPlayer(2, this.ai2, result.result);

        // Show result
        this.ui.showResult(result.result, totalPayout);

        // Show commentary
        const betType = this.ui.getPrimaryBetType();
        this.showCommentary(result, betType, totalPayout);

        // Record stats
        this.stats.recordRound({
            round: this.game.roundNumber,
            result: result.result,
            betType: betType,
            betAmount: totalBet,
            payout: totalPayout,
            balance: this.balance,
            playerHand: result.playerHand,
            bankerHand: result.bankerHand,
            playerValue: result.playerValue,
            bankerValue: result.bankerValue
        });

        // Update scoreboard
        this.ui.updateScoreboard(this.game.results, this.game.getStats());

        // Update shoe
        this.ui.updateShoe(this.game.shoe.remaining, this.game.shoe.total);

        // Add to history
        this.ui.addHistoryItem({
            round: this.game.roundNumber,
            result: result.result,
            betType: betType,
            betAmount: totalBet,
            payout: totalPayout
        });

        // Update auto bar if running
        if (this.isAutoRunning && this.autoStrategy) {
            this.autoStrategy.totalProfit = this.balance - this.initialBalance;
            this.ui.updateAutoBar(this.autoStrategy, this.autoStrategy.totalProfit, this.getAutoTimeInfo());
        }

        this.gameState = 'result';

        // Save balance after each round
        this.saveBalanceLocally();
        this.debouncedCloudSave();

        if (this.isAutoRunning) {
            // Auto play: continue after delay
            const resultDelay = Math.max(200, 1500 / speed);
            await this.ui.wait(resultDelay);
            this.prepareNextRound();
        } else {
            // Manual play: show "다음 라운드" button and wait
            this.showNextRoundButton();
            // Don't auto-advance — player clicks 다음 라운드
        }

        return { result: result.result, payout: totalPayout };
    }

    showNextRoundButton() {
        // Hide betting controls, show next round button
        document.getElementById('btn-deal').classList.add('hidden');
        document.getElementById('btn-clear').classList.add('hidden');
        document.getElementById('btn-undo').classList.add('hidden');
        document.getElementById('btn-rebet').classList.add('hidden');
        document.getElementById('btn-next-round').classList.remove('hidden');
    }

    hideNextRoundButton() {
        document.getElementById('btn-next-round').classList.add('hidden');
        document.getElementById('btn-deal').classList.remove('hidden');
        document.getElementById('btn-clear').classList.remove('hidden');
        document.getElementById('btn-undo').classList.remove('hidden');
        document.getElementById('btn-rebet').classList.remove('hidden');
    }

    prepareNextRound() {
        this.ui.hideResult();
        this.ui.clearCards();
        this.ui.clearBets();
        this.hideNextRoundButton();
        // Commentary stays visible until next deal
        this.gameState = 'betting';
        this.ui.setBettingEnabled(true);
    }

    // Auto play
    startAutoPlay() {
        const strategyType = document.querySelector('.strategy-card.active')?.dataset.strategy || 'martingale';
        const target = document.querySelector('input[name="auto-target"]:checked')?.value || 'player';
        const baseBet = parseInt(document.getElementById('auto-base-bet').value) || 10000;
        const stopCondition = document.getElementById('auto-stop-condition').value;
        const targetAmount = parseInt(document.getElementById('auto-target-amount').value) || 2000000;
        const targetRounds = parseInt(document.getElementById('auto-target-rounds').value) || 100;
        this.autoSpeed = parseInt(document.getElementById('auto-speed').value) || 1;

        // For trend mode, use 'banker' as initial target (will be overridden per round)
        const initialTarget = target === 'trend' ? 'banker' : target;

        this.autoStrategy = new AutoBettingStrategy(
            strategyType, baseBet, initialTarget, stopCondition, targetAmount, targetRounds
        );
        this.autoStrategy.start();

        // Initialize trend analyzer if trend mode
        if (target === 'trend') {
            this.trendAnalyzer = new TrendAnalyzer();
            // Feed existing game history into analyzer
            for (const r of this.game.results) {
                this.trendAnalyzer.recordResult(r);
            }
            this.autoStrategy._isTrendMode = true;
        } else {
            this.trendAnalyzer = null;
            this.autoStrategy._isTrendMode = false;
        }

        this.isAutoRunning = true;
        this.autoStartTime = Date.now();

        // Update UI
        this.ui.hideModal('auto-modal');
        document.getElementById('auto-running-bar').classList.remove('hidden');
        document.getElementById('current-speed').textContent = `${this.autoSpeed}x`;
        this.ui.updateAutoBar(this.autoStrategy, 0);
        this.ui.setBettingEnabled(false);

        // Show/hide trend indicator in running bar
        const trendIndicator = document.getElementById('auto-trend-indicator');
        if (trendIndicator) {
            trendIndicator.classList.toggle('hidden', !this.trendAnalyzer);
        }

        // Start auto loop
        this.autoPlayLoop();
    }

    async autoPlayLoop() {
        if (!this.isAutoRunning || !this.autoStrategy || this.autoStrategy.isPaused) return;

        // Check stop condition
        if (this.autoStrategy.shouldStop(this.balance, this.initialBalance)) {
            const reason = this.autoStrategy.getStopReason(this.balance);
            this.stopAutoPlay(reason);
            return;
        }

        // Calculate bet
        let betAmount = this.autoStrategy.currentBet;
        betAmount = this.autoStrategy.capBet(this.balance);

        // Apply max bet limit
        if (this.maxBet > 0 && betAmount > this.maxBet) {
            betAmount = this.maxBet;
            this.autoStrategy.currentBet = betAmount;
        }

        if (betAmount <= 0) {
            this.stopAutoPlay('잔액 부족');
            return;
        }

        // Determine bet target (trend mode: analyze before each round)
        let currentTarget = this.autoStrategy.target;
        if (this.trendAnalyzer && this.autoStrategy._isTrendMode) {
            currentTarget = this.trendAnalyzer.analyze();
            this.autoStrategy.target = currentTarget;

            // Update trend indicator in running bar
            const trendLabel = document.getElementById('auto-trend-label');
            if (trendLabel) {
                trendLabel.textContent = this.trendAnalyzer.getLabel();
            }
        }

        // Set up bet
        this.ui.clearBets();
        this.ui.addBet(currentTarget, betAmount);

        // Play round
        const roundResult = await this.playRound();

        if (!roundResult) {
            this.stopAutoPlay('오류 발생');
            return;
        }

        // Record result for trend analyzer
        if (this.trendAnalyzer) {
            this.trendAnalyzer.recordResult(roundResult.result);
        }

        // Calculate next bet
        this.autoStrategy.calculateNextBet(roundResult.result, this.balance);
        this.autoStrategy.capBet(this.balance);

        // Update display
        this.autoStrategy.totalProfit = this.balance - this.initialBalance;
        this.ui.updateAutoBar(this.autoStrategy, this.autoStrategy.totalProfit, this.getAutoTimeInfo());

        // Schedule next round
        if (this.isAutoRunning && !this.autoStrategy.isPaused) {
            const delay = Math.max(100, 800 / this.autoSpeed);
            this.autoTimer = setTimeout(() => this.autoPlayLoop(), delay);
        }
    }

    pauseAutoPlay() {
        if (this.autoStrategy) {
            this.autoStrategy.pause();
            clearTimeout(this.autoTimer);
            const pauseBtn = document.getElementById('btn-auto-pause');
            pauseBtn.textContent = '▶ 재개';
            this.ui.setBettingEnabled(false);
        }
    }

    resumeAutoPlay() {
        if (this.autoStrategy) {
            this.autoStrategy.resume();
            const pauseBtn = document.getElementById('btn-auto-pause');
            pauseBtn.textContent = '⏸ 일시정지';
            this.autoPlayLoop();
        }
    }

    showTrendAdvice() {
        const analyzer = new TrendAnalyzer();
        const advice = analyzer.generateAdvice(this.game.results);

        const body = document.getElementById('advice-body');
        if (body) {
            body.innerHTML = advice.html;
        }

        this.ui.showModal('advice-modal');
    }

    showCommentary(result, betType, payout) {
        const section = document.getElementById('commentary-section');
        if (!section) return;

        const commentary = Commentary.generate(result, betType, payout);

        // Set lines
        commentary.lines.forEach((line, i) => {
            const el = document.getElementById(`commentary-line-${i + 1}`);
            if (el) el.textContent = line;
        });

        // Set theme class
        section.className = 'commentary-section ' + commentary.resultClass;
        section.classList.remove('hidden');

        // Re-trigger animations
        section.style.animation = 'none';
        section.offsetHeight; // force reflow
        section.style.animation = '';

        document.querySelectorAll('.commentary-line').forEach(el => {
            el.style.animation = 'none';
            el.offsetHeight;
            el.style.animation = '';
        });
    }

    hideCommentary() {
        const section = document.getElementById('commentary-section');
        if (section) section.classList.add('hidden');
    }

    stopAutoPlay(reason) {
        this.isAutoRunning = false;
        if (this.autoStrategy) {
            this.autoStrategy.stop();
        }
        clearTimeout(this.autoTimer);
        this.trendAnalyzer = null;

        document.getElementById('auto-running-bar').classList.add('hidden');
        this.ui.setBettingEnabled(true);

        const pauseBtn = document.getElementById('btn-auto-pause');
        if (pauseBtn) pauseBtn.textContent = '⏸ 일시정지';

        if (reason) {
            this.showNotification(reason);
        }
    }

    restartAutoTimer() {
        clearTimeout(this.autoTimer);
        if (this.isAutoRunning && !this.autoStrategy?.isPaused) {
            const delay = Math.max(100, 800 / this.autoSpeed);
            this.autoTimer = setTimeout(() => this.autoPlayLoop(), delay);
        }
    }

    getAutoTimeInfo() {
        if (!this.autoStartTime || !this.autoStrategy) return null;

        const elapsed = Date.now() - this.autoStartTime;
        const rounds = this.autoStrategy.roundsPlayed;
        let eta = null;

        if (rounds > 0) {
            const avgPerRound = elapsed / rounds;

            if (this.autoStrategy.stopCondition === 'rounds' && this.autoStrategy.targetRounds > 0) {
                const remaining = this.autoStrategy.targetRounds - rounds;
                if (remaining > 0) {
                    eta = this.ui.formatTime(avgPerRound * remaining);
                } else {
                    eta = '완료';
                }
            } else {
                // No fixed round target — show avg per round instead
                eta = `~${Math.round(avgPerRound / 1000 * 10) / 10}초/R`;
            }
        }

        return { elapsed, eta };
    }

    showProgressionTable() {
        const strategyCard = document.querySelector('.strategy-card.active');
        if (!strategyCard) return;
        const strategyType = strategyCard.dataset.strategy;
        const baseBet = parseInt(document.getElementById('auto-base-bet').value) || 10000;

        const strategyNames = {
            'martingale': '📈 마틴게일',
            'grand-martingale': '📈📈 그랜드 마틴게일',
            'hybrid-beast': '🦁 하이브리드 비스트',
            'paroli': '🔄 파롤리',
            'fibonacci': '🐚 피보나치',
            'dalembert': '⚖️ 달랑베르',
            '1326': '🎯 1-3-2-6',
            'labouchere': '✂️ 라부셰르',
            'oscar-grind': '🎰 오스카 그라인드',
            'flat': '📊 플랫 베팅'
        };

        // Simulate 10 consecutive wins
        const winSim = this.simulateProgression(strategyType, baseBet, true, 10);
        // Simulate 10 consecutive losses
        const loseSim = this.simulateProgression(strategyType, baseBet, false, 10);

        const fmt = (n) => '₩' + Math.floor(n).toLocaleString();

        // Build win table
        let html = '';

        // --- Win table ---
        html += `<div style="flex:1; min-width: 300px;">`;
        html += `<h3 style="color:#22c55e; margin:0 0 8px; font-size:14px;">🟢 연승 시 배팅 진행</h3>`;
        html += `<table class="progression-table">`;
        html += `<thead><tr><th>R</th><th>배팅액</th><th>수익</th><th>누적 손익</th></tr></thead><tbody>`;
        let cumWin = 0;
        winSim.forEach((r, i) => {
            cumWin += r.bet;
            html += `<tr>`;
            html += `<td>${i + 1}</td>`;
            html += `<td><strong>${fmt(r.bet)}</strong></td>`;
            html += `<td class="profit-positive">+${fmt(r.bet)}</td>`;
            html += `<td class="profit-positive">+${fmt(cumWin)}</td>`;
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;

        // --- Lose table ---
        html += `<div style="flex:1; min-width: 300px;">`;
        html += `<h3 style="color:#ef4444; margin:0 0 8px; font-size:14px;">🔴 연패 시 배팅 진행</h3>`;
        html += `<table class="progression-table">`;
        html += `<thead><tr><th>R</th><th>배팅액</th><th>손실</th><th>누적 손실</th></tr></thead><tbody>`;
        let cumLose = 0;
        loseSim.forEach((r, i) => {
            cumLose += r.bet;
            html += `<tr${cumLose > 1000000 ? ' class="danger-row"' : ''}>`;
            html += `<td>${i + 1}</td>`;
            html += `<td><strong>${fmt(r.bet)}</strong></td>`;
            html += `<td class="profit-negative">-${fmt(r.bet)}</td>`;
            html += `<td class="profit-negative">-${fmt(cumLose)}</td>`;
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;

        document.getElementById('progression-title').textContent =
            `${strategyNames[strategyType] || strategyType} 배팅 진행표 (기본 ${fmt(baseBet)})`;
        document.getElementById('progression-content').innerHTML = html;
        document.getElementById('progression-modal').classList.remove('hidden');
    }

    simulateProgression(strategyType, baseBet, isWin, rounds) {
        const s = new AutoBettingStrategy(strategyType, baseBet, 'banker', 'rounds', 0, 100);
        s.start();

        const result = [];
        for (let i = 0; i < rounds; i++) {
            result.push({ bet: s.currentBet });
            s.calculateNextBet(isWin ? 'banker' : 'player', 999999999);
        }
        return result;
    }

    // ============================================
    // Preset Chip System
    // ============================================

    loadPresets() {
        const saved = localStorage.getItem('baccarat-presets');
        if (saved) return JSON.parse(saved);
        // Default presets: match original 6 chips + common combos
        return [1000, 5000, 10000, 50000, 100000, 500000, 25000, 75000, 200000, 0];
    }

    savePresets() {
        localStorage.setItem('baccarat-presets', JSON.stringify(this.presets));
        // Also update the active set in sets storage
        if (this.activeSetKey && this.activeSetKey !== '__default__') {
            const sets = this.loadPresetSets();
            if (sets[this.activeSetKey]) {
                sets[this.activeSetKey].values = [...this.presets];
                this.savePresetSets(sets);
            }
        }
    }

    // ============================================
    // Preset Set Management
    // ============================================

    loadPresetSets() {
        const saved = localStorage.getItem('baccarat-preset-sets');
        return saved ? JSON.parse(saved) : {};
    }

    savePresetSets(sets) {
        localStorage.setItem('baccarat-preset-sets', JSON.stringify(sets));
    }

    renderSetSelector() {
        const select = document.getElementById('preset-set-select');
        const sets = this.loadPresetSets();
        const currentKey = this.activeSetKey || '__default__';

        select.innerHTML = '<option value="__default__">기본 세트</option>';
        Object.keys(sets).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = sets[key].name;
            if (key === currentKey) opt.selected = true;
            select.appendChild(opt);
        });
    }

    setupSetListeners() {
        const select = document.getElementById('preset-set-select');

        // Change set
        select.addEventListener('change', () => {
            const key = select.value;
            this.activeSetKey = key;
            if (key === '__default__') {
                this.presets = this.loadPresets();
            } else {
                const sets = this.loadPresetSets();
                if (sets[key]) {
                    this.presets = [...sets[key].values];
                    localStorage.setItem('baccarat-presets', JSON.stringify(this.presets));
                }
            }
            this.renderPresets();
            // Re-select default chip
            const defaultIndex = this.presets.indexOf(this.ui.selectedChipValue);
            if (defaultIndex >= 0) {
                document.querySelectorAll('.preset-slot')[defaultIndex]?.classList.add('selected');
            }
        });

        // Save as new set
        document.getElementById('btn-preset-set-save').addEventListener('click', () => {
            const name = prompt('세트 이름을 입력하세요:');
            if (!name || !name.trim()) return;
            const sets = this.loadPresetSets();
            const key = 'set_' + Date.now();
            sets[key] = { name: name.trim(), values: [...this.presets] };
            this.savePresetSets(sets);
            this.activeSetKey = key;
            this.renderSetSelector();
        });

        // Overwrite current set
        document.getElementById('btn-preset-set-overwrite').addEventListener('click', () => {
            if (!this.activeSetKey || this.activeSetKey === '__default__') {
                alert('기본 세트에는 덮어쓸 수 없습니다.\n먼저 "💾 저장"으로 새 세트를 만드세요.');
                return;
            }
            const sets = this.loadPresetSets();
            if (sets[this.activeSetKey]) {
                sets[this.activeSetKey].values = [...this.presets];
                this.savePresetSets(sets);
                alert(`"${sets[this.activeSetKey].name}" 세트에 저장되었습니다.`);
            }
        });

        // Delete set
        document.getElementById('btn-preset-set-delete').addEventListener('click', () => {
            if (!this.activeSetKey || this.activeSetKey === '__default__') {
                alert('기본 세트는 삭제할 수 없습니다.');
                return;
            }
            const sets = this.loadPresetSets();
            const setName = sets[this.activeSetKey]?.name || '';
            if (!confirm(`"${setName}" 세트를 삭제하시겠습니까?`)) return;
            delete sets[this.activeSetKey];
            this.savePresetSets(sets);
            this.activeSetKey = '__default__';
            this.presets = this.loadPresets();
            this.renderSetSelector();
            this.renderPresets();
        });
    }

    renderPresets() {
        const tray = document.getElementById('preset-tray');
        tray.innerHTML = '';

        this.presets.forEach((value, i) => {
            const slot = document.createElement('div');
            slot.className = `preset-slot${value === 0 ? ' empty' : ''}`;
            slot.dataset.index = i;

            // Slot number
            slot.innerHTML = `<span class="preset-slot-number">${i + 1}</span>`;

            // Chip stack
            const stack = document.createElement('div');
            stack.className = 'preset-chip-stack';
            if (value > 0) {
                this.buildChipStack(stack, value);
            } else {
                stack.innerHTML = '<span style="color:var(--text-muted); font-size:1.2rem;">+</span>';
            }
            slot.appendChild(stack);

            // Amount label
            const amtLabel = document.createElement('div');
            amtLabel.className = 'preset-amount';
            amtLabel.textContent = value > 0 ? this.formatChipAmount(value) : '빈칸';
            slot.appendChild(amtLabel);

            tray.appendChild(slot);
        });
    }

    buildChipStack(container, value) {
        const denoms = [
            { val: 500000, cls: 'chip-500k' },
            { val: 100000, cls: 'chip-100k' },
            { val: 50000, cls: 'chip-50k' },
            { val: 10000, cls: 'chip-10k' },
            { val: 5000, cls: 'chip-5k' },
            { val: 1000, cls: 'chip-1k' }
        ];

        let remaining = value;
        const chips = [];

        for (const d of denoms) {
            while (remaining >= d.val && chips.length < 8) {
                chips.push(d.cls);
                remaining -= d.val;
            }
        }

        // Render from bottom to top
        chips.reverse().forEach((cls, i) => {
            const chip = document.createElement('div');
            chip.className = `stacked-chip ${cls}`;
            chip.style.bottom = `${i * 5}px`;
            container.appendChild(chip);
        });
    }

    formatChipAmount(value) {
        if (value >= 1000000) return `₩${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `₩${Math.floor(value / 1000)}K`;
        return `₩${value}`;
    }

    setupPresetListeners() {
        // Edit toggle button
        const editBtn = document.getElementById('btn-preset-edit');
        editBtn.addEventListener('click', () => {
            this.presetEditMode = !this.presetEditMode;
            editBtn.textContent = this.presetEditMode ? '🔒 완료' : '✏️ 수정';
            editBtn.classList.toggle('editing', this.presetEditMode);
            document.getElementById('preset-editor').classList.toggle('hidden', !this.presetEditMode);

            if (!this.presetEditMode) {
                // Exiting edit mode → save and clear
                this.savePresets();
                this.renderPresets();
                this.editingSlotIndex = null;
                document.querySelectorAll('.preset-slot').forEach(s => s.classList.remove('editing-target'));
            } else {
                // Entering edit mode → select first slot
                this.selectSlotForEditing(0);
            }
        });

        // Preset slot click (delegate)
        document.getElementById('preset-tray').addEventListener('click', (e) => {
            const slot = e.target.closest('.preset-slot');
            if (!slot) return;
            const index = parseInt(slot.dataset.index);

            if (this.presetEditMode) {
                this.selectSlotForEditing(index);
            } else {
                // Use mode → set as selected chip value
                const value = this.presets[index];
                if (value > 0) {
                    this.ui.selectedChipValue = value;
                    // Persistent selection highlight
                    document.querySelectorAll('.preset-slot').forEach(s => s.classList.remove('selected'));
                    slot.classList.add('selected');
                }
            }
        });

        // Chip add buttons in editor
        document.querySelectorAll('.chip-add').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.editingSlotIndex === null) return;
                const chipVal = parseInt(btn.dataset.chip);
                this.editingSlotValue += chipVal;
                this.presets[this.editingSlotIndex] = this.editingSlotValue;
                document.getElementById('editing-slot-total').textContent = this.formatChipAmount(this.editingSlotValue);
                this.renderPresets();
                // Re-highlight editing slot
                const slots = document.querySelectorAll('.preset-slot');
                slots.forEach(s => s.classList.remove('editing-target'));
                slots[this.editingSlotIndex]?.classList.add('editing-target');
            });
        });

        // Clear slot button
        document.getElementById('btn-preset-clear-slot').addEventListener('click', () => {
            if (this.editingSlotIndex === null) return;
            this.editingSlotValue = 0;
            this.presets[this.editingSlotIndex] = 0;
            document.getElementById('editing-slot-total').textContent = '₩0';
            this.renderPresets();
            const slots = document.querySelectorAll('.preset-slot');
            slots.forEach(s => s.classList.remove('editing-target'));
            slots[this.editingSlotIndex]?.classList.add('editing-target');
        });

        // Confirm button
        document.getElementById('btn-preset-confirm').addEventListener('click', () => {
            this.presetEditMode = false;
            const editBtn = document.getElementById('btn-preset-edit');
            editBtn.textContent = '✏️ 수정';
            editBtn.classList.remove('editing');
            document.getElementById('preset-editor').classList.add('hidden');
            this.savePresets();
            this.renderPresets();
            this.editingSlotIndex = null;
        });
    }

    selectSlotForEditing(index) {
        this.editingSlotIndex = index;
        this.editingSlotValue = this.presets[index] || 0;
        document.getElementById('editing-slot-num').textContent = index + 1;
        document.getElementById('editing-slot-total').textContent =
            this.editingSlotValue > 0 ? this.formatChipAmount(this.editingSlotValue) : '₩0';

        // Highlight slot
        document.querySelectorAll('.preset-slot').forEach(s => s.classList.remove('editing-target'));
        document.querySelectorAll('.preset-slot')[index]?.classList.add('editing-target');
    }

    showNotification(message) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 9998;
            backdrop-filter: blur(5px);
        `;

        // Create notification
        const profitColor = this.balance >= this.initialBalance ? '#22c55e' : '#ef4444';
        const profitSign = this.balance >= this.initialBalance ? '+' : '';
        const profitAmount = this.balance - this.initialBalance;
        const totalRounds = this.stats.totalRounds;
        const winRate = this.stats.winRate.toFixed(1);

        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(17, 24, 39, 0.97);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 2rem 2.5rem;
            z-index: 9999;
            text-align: center;
            backdrop-filter: blur(20px);
            animation: modal-pop 0.3s ease-out;
            min-width: 320px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        `;
        notif.innerHTML = `
            <div style="font-size: 1.4rem; font-weight: 900; margin-bottom: 0.3rem; color: #f59e0b;">🎰 게임 종료</div>
            <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1rem;">${message}</div>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-bottom: 1rem;">
                <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 0.6rem 1rem; flex: 1;">
                    <div style="font-size: 0.65rem; color: #64748b; font-weight: 600;">최종 잔액</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: ${profitColor};">₩${this.balance.toLocaleString()}</div>
                </div>
                <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 0.6rem 1rem; flex: 1;">
                    <div style="font-size: 0.65rem; color: #64748b; font-weight: 600;">총 손익</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: ${profitColor};">${profitSign}₩${Math.abs(profitAmount).toLocaleString()}</div>
                </div>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-bottom: 1.5rem;">
                <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 0.6rem 1rem; flex: 1;">
                    <div style="font-size: 0.65rem; color: #64748b; font-weight: 600;">총 라운드</div>
                    <div style="font-size: 1rem; font-weight: 700; color: #f1f5f9;">${totalRounds}</div>
                </div>
                <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 0.6rem 1rem; flex: 1;">
                    <div style="font-size: 0.65rem; color: #64748b; font-weight: 600;">승률</div>
                    <div style="font-size: 1rem; font-weight: 700; color: #f1f5f9;">${winRate}%</div>
                </div>
            </div>
            <div style="display: flex; gap: 0.75rem;">
                <button id="notif-new-game" style="
                    flex: 1; padding: 0.7rem 1rem; border: none; border-radius: 10px;
                    background: linear-gradient(135deg, #f59e0b, #fbbf24); color: #1a1a2e;
                    font-weight: 800; font-size: 0.9rem; cursor: pointer; font-family: 'Inter', sans-serif;
                    transition: transform 0.15s ease;
                ">🔄 새 게임</button>
                <button id="notif-continue" style="
                    flex: 1; padding: 0.7rem 1rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
                    background: rgba(255,255,255,0.05); color: #94a3b8;
                    font-weight: 700; font-size: 0.9rem; cursor: pointer; font-family: 'Inter', sans-serif;
                    transition: all 0.15s ease;
                ">계속하기</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(notif);

        const close = () => {
            notif.remove();
            overlay.remove();
        };

        // New game button
        notif.querySelector('#notif-new-game').addEventListener('click', () => {
            close();
            this.resetGame();
        });

        // Continue button
        notif.querySelector('#notif-continue').addEventListener('click', () => {
            close();
        });

        // Hover effects
        notif.querySelector('#notif-new-game').addEventListener('mouseenter', (e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 4px 15px rgba(245, 158, 11, 0.4)';
        });
        notif.querySelector('#notif-new-game').addEventListener('mouseleave', (e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
        });
        notif.querySelector('#notif-continue').addEventListener('mouseenter', (e) => {
            e.target.style.borderColor = 'rgba(255,255,255,0.2)';
            e.target.style.color = '#f1f5f9';
        });
        notif.querySelector('#notif-continue').addEventListener('mouseleave', (e) => {
            e.target.style.borderColor = 'rgba(255,255,255,0.1)';
            e.target.style.color = '#94a3b8';
        });
    }

    // Save balance to localStorage
    saveBalanceLocally() {
        localStorage.setItem('baccarat-balance', this.balance.toString());
        localStorage.setItem('baccarat-initial-balance', this.initialBalance.toString());
    }

    // Debounced cloud save (every 5 rounds or 10 seconds)
    debouncedCloudSave() {
        if (!this.firebaseManager?.user) return;
        if (this._balanceSaveTimer) return; // Already scheduled

        this._balanceSaveTimer = setTimeout(() => {
            this._balanceSaveTimer = null;
            if (this.firebaseManager?.user) {
                this.firebaseManager.saveBalanceToCloud();
            }
        }, 10000); // Save at most every 10 seconds
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BaccaratApp();
});
