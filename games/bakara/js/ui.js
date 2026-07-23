/* ============================================
   UI Manager
   ============================================ */

class UIManager {
    constructor() {
        this.selectedChipValue = 10000;
        this.selectedBetTarget = null;
        this.bets = { player: 0, banker: 0, tie: 0 };
        this.betHistory = []; // for undo
        this.lastBets = null; // for rebet

        this.beadRoadData = [];
        this.beadRoadCol = 0;
        this.beadRoadRow = 0;
    }

    // Format currency
    formatMoney(amount) {
        return '₩' + Math.floor(amount).toLocaleString();
    }

    // Update balance display
    updateBalance(balance) {
        const el = document.getElementById('player-balance');
        if (el) {
            el.textContent = this.formatMoney(balance);
            el.classList.add('balance-pulse');
            setTimeout(() => el.classList.remove('balance-pulse'), 300);
        }
    }

    // Update current bet display
    updateCurrentBet() {
        const total = this.bets.player + this.bets.banker + this.bets.tie;
        const el = document.getElementById('current-bet');
        if (el) el.textContent = this.formatMoney(total);

        document.getElementById('bet-player-amount').textContent = this.formatMoney(this.bets.player);
        document.getElementById('bet-tie-amount').textContent = this.formatMoney(this.bets.tie);
        document.getElementById('bet-banker-amount').textContent = this.formatMoney(this.bets.banker);

        // Update selected state
        ['player', 'tie', 'banker'].forEach(type => {
            const btn = document.getElementById(`bet-${type}`);
            btn.classList.toggle('selected', this.bets[type] > 0);
        });

        // Enable/disable deal button
        const dealBtn = document.getElementById('btn-deal');
        if (dealBtn) dealBtn.disabled = total === 0;
    }

    // Add bet
    addBet(target, amount) {
        this.betHistory.push({ target, amount });
        this.bets[target] += amount;
        this.updateCurrentBet();
    }

    // Undo last bet
    undoBet() {
        const last = this.betHistory.pop();
        if (last) {
            this.bets[last.target] -= last.amount;
            if (this.bets[last.target] < 0) this.bets[last.target] = 0;
            this.updateCurrentBet();
        }
    }

    // Clear all bets
    clearBets() {
        this.bets = { player: 0, banker: 0, tie: 0 };
        this.betHistory = [];
        this.updateCurrentBet();
    }

    // Save current bets for rebet
    saveBets() {
        const total = this.bets.player + this.bets.banker + this.bets.tie;
        if (total > 0) {
            this.lastBets = { ...this.bets };
        }
    }

    // Rebet
    rebet(currentBalance) {
        if (!this.lastBets) return false;
        const total = this.lastBets.player + this.lastBets.banker + this.lastBets.tie;
        if (total > currentBalance) return false;

        this.bets = { ...this.lastBets };
        this.updateCurrentBet();
        return true;
    }

    getTotalBet() {
        return this.bets.player + this.bets.banker + this.bets.tie;
    }

    // Get the bet type (for simple single-type bets)
    getPrimaryBetType() {
        if (this.bets.player > 0) return 'player';
        if (this.bets.banker > 0) return 'banker';
        if (this.bets.tie > 0) return 'tie';
        return null;
    }

    // Render cards with animation
    async renderCards(playerHand, bankerHand, speed = 1) {
        const playerContainer = document.getElementById('player-cards');
        const bankerContainer = document.getElementById('banker-cards');
        const playerScore = document.getElementById('player-score');
        const bankerScore = document.getElementById('banker-score');

        playerContainer.innerHTML = '';
        bankerContainer.innerHTML = '';
        playerScore.textContent = '-';
        bankerScore.textContent = '-';
        playerScore.classList.remove('active');
        bankerScore.classList.remove('active');

        const delay = Math.max(100, 400 / speed);

        // Deal initial 4 cards with animation
        // Player card 1
        playerContainer.innerHTML += renderCard(playerHand[0]);
        await this.wait(delay);

        // Banker card 1
        bankerContainer.innerHTML += renderCard(bankerHand[0]);
        await this.wait(delay);

        // Player card 2
        playerContainer.innerHTML += renderCard(playerHand[1]);
        await this.wait(delay);

        // Banker card 2
        bankerContainer.innerHTML += renderCard(bankerHand[1]);
        await this.wait(delay);

        // Show scores for initial hands
        const pv2 = BaccaratGame.handValue(playerHand.slice(0, 2));
        const bv2 = BaccaratGame.handValue(bankerHand.slice(0, 2));
        playerScore.textContent = pv2;
        bankerScore.textContent = bv2;
        playerScore.classList.add('active');
        bankerScore.classList.add('active');

        await this.wait(delay);

        // Third cards
        if (playerHand.length > 2) {
            playerContainer.innerHTML += renderCard(playerHand[2], true);
            await this.wait(delay);
        }

        if (bankerHand.length > 2) {
            bankerContainer.innerHTML += renderCard(bankerHand[2], true);
            await this.wait(delay);
        }

        // Update final scores
        const pvFinal = BaccaratGame.handValue(playerHand);
        const bvFinal = BaccaratGame.handValue(bankerHand);
        playerScore.textContent = pvFinal;
        bankerScore.textContent = bvFinal;
    }

    // Show result
    showResult(result, payout) {
        const display = document.getElementById('result-display');
        const textEl = document.getElementById('result-text');
        const amountEl = document.getElementById('result-amount');

        display.classList.remove('hidden');

        const resultNames = {
            'player': 'PLAYER WIN',
            'banker': 'BANKER WIN',
            'tie': 'TIE'
        };

        textEl.textContent = resultNames[result];
        textEl.className = 'result-text';
        textEl.classList.add(`${result}-win`);

        if (payout > 0) {
            amountEl.textContent = `+${this.formatMoney(payout)}`;
            amountEl.className = 'result-amount win';
        } else if (payout < 0) {
            amountEl.textContent = this.formatMoney(payout);
            amountEl.className = 'result-amount lose';
        } else {
            amountEl.textContent = '푸시 (무승부)';
            amountEl.className = 'result-amount';
        }
    }

    hideResult() {
        document.getElementById('result-display').classList.add('hidden');
    }

    // Clear cards
    clearCards() {
        document.getElementById('player-cards').innerHTML = '';
        document.getElementById('banker-cards').innerHTML = '';
        document.getElementById('player-score').textContent = '-';
        document.getElementById('banker-score').textContent = '-';
        document.getElementById('player-score').classList.remove('active');
        document.getElementById('banker-score').classList.remove('active');
    }

    // Update round display
    updateRound(roundNumber) {
        document.getElementById('round-number').textContent = roundNumber;
    }

    // Update shoe display
    updateShoe(remaining, total) {
        const percent = (remaining / total) * 100;
        document.getElementById('shoe-progress').style.width = `${percent}%`;
        document.getElementById('shoe-count').textContent = remaining;
    }

    // Update scoreboard
    updateScoreboard(results, stats) {
        document.getElementById('score-player').textContent = stats.player;
        document.getElementById('score-banker').textContent = stats.banker;
        document.getElementById('score-tie').textContent = stats.tie;

        this.updateBeadRoad(results);
    }

    updateBeadRoad(results) {
        const grid = document.getElementById('bead-road');
        grid.innerHTML = '';

        // Bead road: fill column by column, 6 rows each
        const maxCols = 40;
        const rows = 6;

        for (let i = 0; i < results.length && i < maxCols * rows; i++) {
            const col = Math.floor(i / rows);
            const row = i % rows;
            const cell = document.createElement('div');
            cell.className = `road-cell ${results[i]}`;

            const labels = { 'player': 'P', 'banker': 'B', 'tie': 'T' };
            cell.textContent = labels[results[i]];
            cell.style.gridColumn = col + 1;
            cell.style.gridRow = row + 1;
            grid.appendChild(cell);
        }
    }

    // Update AI player displays
    updateAIPlayer(id, player, result) {
        const balanceEl = document.getElementById(`ai${id}-balance`);
        const betEl = document.getElementById(`ai${id}-bet`);
        const container = document.getElementById(`ai-player-${id}`);

        if (balanceEl) balanceEl.textContent = this.formatMoney(player.balance);
        if (betEl) betEl.textContent = player.betDisplay;

        if (container) {
            container.classList.remove('winner', 'loser');
            if (result !== undefined) {
                const won = player.currentBet === result;
                const isTie = result === 'tie';
                if (won) container.classList.add('winner');
                else if (!isTie) container.classList.add('loser');
            }
        }
    }

    // Update auto running bar
    updateAutoBar(strategy, profit, timeInfo) {
        document.getElementById('auto-strategy-name').textContent = strategy.displayName;
        document.getElementById('auto-round-count').textContent = strategy.roundsPlayed;

        const profitEl = document.getElementById('auto-profit');
        profitEl.textContent = (profit >= 0 ? '+' : '') + this.formatMoney(profit);
        profitEl.className = profit >= 0 ? 'profit-positive' : 'profit-negative';

        document.getElementById('auto-next-bet').textContent = this.formatMoney(strategy.currentBet);

        // Time display
        if (timeInfo) {
            document.getElementById('auto-elapsed').textContent = this.formatTime(timeInfo.elapsed);
            document.getElementById('auto-eta').textContent = timeInfo.eta || '--:--';
        }
    }

    // Format milliseconds to M:SS or H:MM:SS
    formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        if (hours > 0) {
            return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    // History
    addHistoryItem(data) {
        const list = document.getElementById('history-list');

        // Remove empty state
        const empty = list.querySelector('.empty-state');
        if (empty) empty.remove();

        const resultLabels = { 'player': '플레이어', 'banker': '뱅커', 'tie': '타이' };
        const betLabels = { 'player': '플레이어', 'banker': '뱅커', 'tie': '타이' };

        const item = document.createElement('div');
        item.className = 'history-item';

        const profitClass = data.payout > 0 ? 'profit-positive' : (data.payout < 0 ? 'profit-negative' : '');
        const profitText = data.payout >= 0 ? `+${this.formatMoney(data.payout)}` : this.formatMoney(data.payout);

        item.innerHTML = `
            <span class="history-round">R${data.round}</span>
            <span class="history-result ${data.result}">${resultLabels[data.result]}</span>
            <span class="history-bet">${betLabels[data.betType] || '-'} ${this.formatMoney(data.betAmount)}</span>
            <span class="history-profit ${profitClass}">${profitText}</span>
        `;

        list.insertBefore(item, list.firstChild);
    }

    // Modal management
    showModal(id) {
        document.getElementById(id).classList.remove('hidden');
    }

    hideModal(id) {
        document.getElementById(id).classList.add('hidden');
    }

    // Set betting UI state
    setBettingEnabled(enabled) {
        document.querySelectorAll('.chip').forEach(c => c.style.pointerEvents = enabled ? 'auto' : 'none');
        document.querySelectorAll('.bet-option').forEach(b => b.style.pointerEvents = enabled ? 'auto' : 'none');
        document.getElementById('btn-clear').disabled = !enabled;
        document.getElementById('btn-undo').disabled = !enabled;
        document.getElementById('btn-rebet').disabled = !enabled;
    }

    // Utility
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
