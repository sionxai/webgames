/* ============================================
   Statistics & Chart Manager
   ============================================ */

class StatsManager {
    constructor() {
        this.reset();
        this.charts = {};
    }

    reset() {
        this.rounds = [];
        this.balanceHistory = [];
        this.profitHistory = [];
        this.initialBalance = 0;
        this.peakBalance = 0;
        this.lowestBalance = Infinity;
        this.currentStreak = 0;
        this.maxWinStreak = 0;
        this.maxLossStreak = 0;
        this.totalBetAmount = 0;

        // Per bet-type stats
        this.betStats = {
            player: { count: 0, wins: 0, losses: 0, pushes: 0, totalBet: 0, totalPayout: 0 },
            banker: { count: 0, wins: 0, losses: 0, pushes: 0, totalBet: 0, totalPayout: 0 },
            tie: { count: 0, wins: 0, losses: 0, pushes: 0, totalBet: 0, totalPayout: 0 }
        };
    }

    setInitialBalance(balance) {
        this.initialBalance = balance;
        this.peakBalance = balance;
        this.lowestBalance = balance;
        this.balanceHistory = [balance];
        this.profitHistory = [0];
    }

    recordRound(data) {
        // data: { round, result, betType, betAmount, payout, balance, playerHand, bankerHand, playerValue, bankerValue }
        this.rounds.push(data);
        this.balanceHistory.push(data.balance);
        this.profitHistory.push(data.balance - this.initialBalance);

        // Update peak/lowest
        this.peakBalance = Math.max(this.peakBalance, data.balance);
        this.lowestBalance = Math.min(this.lowestBalance, data.balance);

        // Update total bet
        this.totalBetAmount += data.betAmount;

        // Update streaks
        if (data.payout > 0) {
            if (this.currentStreak >= 0) {
                this.currentStreak++;
            } else {
                this.currentStreak = 1;
            }
            this.maxWinStreak = Math.max(this.maxWinStreak, this.currentStreak);
        } else if (data.payout < 0) {
            if (this.currentStreak <= 0) {
                this.currentStreak--;
            } else {
                this.currentStreak = -1;
            }
            this.maxLossStreak = Math.max(this.maxLossStreak, Math.abs(this.currentStreak));
        }
        // Tie doesn't affect streak

        // Update per-type stats
        if (data.betType && this.betStats[data.betType]) {
            const stats = this.betStats[data.betType];
            stats.count++;
            stats.totalBet += data.betAmount;
            if (data.payout > 0) {
                stats.wins++;
                stats.totalPayout += data.payout;
            } else if (data.payout < 0) {
                stats.losses++;
                stats.totalPayout += data.payout;
            } else {
                stats.pushes++;
            }
        }
    }

    get totalRounds() {
        return this.rounds.length;
    }

    get totalWins() {
        return this.rounds.filter(r => r.payout > 0).length;
    }

    get totalLosses() {
        return this.rounds.filter(r => r.payout < 0).length;
    }

    get totalPushes() {
        return this.rounds.filter(r => r.payout === 0).length;
    }

    get winRate() {
        if (this.totalRounds === 0) return 0;
        const effectiveRounds = this.totalRounds - this.totalPushes;
        if (effectiveRounds === 0) return 0;
        return (this.totalWins / effectiveRounds) * 100;
    }

    get totalProfit() {
        return this.rounds.reduce((sum, r) => sum + r.payout, 0);
    }

    get roi() {
        if (this.totalBetAmount === 0) return 0;
        return (this.totalProfit / this.totalBetAmount) * 100;
    }

    get resultDistribution() {
        return {
            player: this.rounds.filter(r => r.result === 'player').length,
            banker: this.rounds.filter(r => r.result === 'banker').length,
            tie: this.rounds.filter(r => r.result === 'tie').length
        };
    }

    // Update all stat displays
    updateDisplay() {
        const setTextSafe = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setTextSafe('stat-total-rounds', this.totalRounds);
        setTextSafe('stat-win-rate', `${this.winRate.toFixed(1)}%`);

        const profitText = `₩${Math.abs(this.totalProfit).toLocaleString()}`;
        const profitEl = document.getElementById('stat-total-profit');
        if (profitEl) {
            profitEl.textContent = (this.totalProfit >= 0 ? '+' : '-') + profitText;
            profitEl.className = `stat-value ${this.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`;
        }

        setTextSafe('stat-roi', `${this.roi.toFixed(1)}%`);
        setTextSafe('stat-max-streak', this.maxWinStreak);
        setTextSafe('stat-max-loss-streak', this.maxLossStreak);
        setTextSafe('stat-peak-balance', `₩${this.peakBalance.toLocaleString()}`);
        setTextSafe('stat-lowest-balance', `₩${this.lowestBalance.toLocaleString()}`);

        this.updateDetailTable();
    }

    updateDetailTable() {
        const tbody = document.getElementById('stats-detail-body');
        if (!tbody) return;

        const makeRow = (label, getter) => {
            const p = getter(this.betStats.player);
            const b = getter(this.betStats.banker);
            const t = getter(this.betStats.tie);
            const total = getter({
                count: p.raw !== undefined ? this.betStats.player.count + this.betStats.banker.count + this.betStats.tie.count : 0,
                wins: this.betStats.player.wins + this.betStats.banker.wins + this.betStats.tie.wins,
                losses: this.betStats.player.losses + this.betStats.banker.losses + this.betStats.tie.losses,
                pushes: this.betStats.player.pushes + this.betStats.banker.pushes + this.betStats.tie.pushes,
                totalBet: this.betStats.player.totalBet + this.betStats.banker.totalBet + this.betStats.tie.totalBet,
                totalPayout: this.betStats.player.totalPayout + this.betStats.banker.totalPayout + this.betStats.tie.totalPayout
            });
            return `<tr><td style="text-align:left;font-weight:600">${label}</td><td>${p.display}</td><td>${b.display}</td><td>${t.display}</td><td style="font-weight:700">${total.display}</td></tr>`;
        };

        tbody.innerHTML = `
            ${makeRow('배팅 횟수', s => ({ display: s.count, raw: s.count }))}
            ${makeRow('승리', s => ({ display: s.wins, raw: s.wins }))}
            ${makeRow('패배', s => ({ display: s.losses, raw: s.losses }))}
            ${makeRow('푸시 (타이)', s => ({ display: s.pushes, raw: s.pushes }))}
            ${makeRow('적중률', s => {
            const eff = s.count - s.pushes;
            const rate = eff > 0 ? ((s.wins / eff) * 100).toFixed(1) + '%' : '-';
            return { display: rate };
        })}
            ${makeRow('총 배팅액', s => ({ display: '₩' + s.totalBet.toLocaleString() }))}
            ${makeRow('총 손익', s => {
            const p = s.totalPayout;
            const cls = p >= 0 ? 'profit-positive' : 'profit-negative';
            return { display: `<span class="${cls}">${p >= 0 ? '+' : ''}₩${Math.abs(p).toLocaleString()}</span>` };
        })}
        `;
    }

    // Chart rendering
    renderCharts() {
        this.renderBalanceChart();
        this.renderResultsChart();
        this.renderBetsChart();
        this.renderProfitChart();
    }

    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};
    }

    renderBalanceChart() {
        const ctx = document.getElementById('chart-balance');
        if (!ctx) return;

        if (this.charts.balance) this.charts.balance.destroy();

        const labels = this.balanceHistory.map((_, i) => i === 0 ? '시작' : `R${i}`);

        this.charts.balance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '잔액',
                    data: this.balanceHistory,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: this.balanceHistory.length > 50 ? 0 : 2,
                    borderWidth: 2
                }]
            },
            options: this.getChartOptions('₩')
        });
    }

    renderResultsChart() {
        const ctx = document.getElementById('chart-results');
        if (!ctx) return;

        if (this.charts.results) this.charts.results.destroy();

        const dist = this.resultDistribution;

        this.charts.results = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['플레이어', '뱅커', '타이'],
                datasets: [{
                    data: [dist.player, dist.banker, dist.tie],
                    backgroundColor: ['#3b82f6', '#ef4444', '#22c55e'],
                    borderColor: '#111827',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8', font: { size: 11 }, padding: 15 }
                    }
                }
            }
        });
    }

    renderBetsChart() {
        const ctx = document.getElementById('chart-bets');
        if (!ctx) return;

        if (this.charts.bets) this.charts.bets.destroy();

        const betTypes = ['player', 'banker', 'tie'];
        const labels = ['플레이어', '뱅커', '타이'];
        const wins = betTypes.map(t => this.betStats[t].wins);
        const losses = betTypes.map(t => this.betStats[t].losses);

        this.charts.bets = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: '승리',
                        data: wins,
                        backgroundColor: 'rgba(34, 197, 94, 0.7)',
                        borderColor: '#22c55e',
                        borderWidth: 1
                    },
                    {
                        label: '패배',
                        data: losses,
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: '#ef4444',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                ...this.getChartOptions(''),
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8', font: { size: 11 } }
                    }
                }
            }
        });
    }

    renderProfitChart() {
        const ctx = document.getElementById('chart-profit');
        if (!ctx) return;

        if (this.charts.profit) this.charts.profit.destroy();

        const labels = this.profitHistory.map((_, i) => i === 0 ? '시작' : `R${i}`);

        this.charts.profit = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '누적 수익',
                    data: this.profitHistory,
                    borderColor: this.totalProfit >= 0 ? '#22c55e' : '#ef4444',
                    backgroundColor: this.totalProfit >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: this.profitHistory.length > 50 ? 0 : 2,
                    borderWidth: 2
                }]
            },
            options: this.getChartOptions('₩')
        });
    }

    getChartOptions(prefix) {
        return {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => `${prefix}${ctx.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 10 }
                },
                y: {
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        callback: (v) => prefix + v.toLocaleString()
                    }
                }
            }
        };
    }
}
