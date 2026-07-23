/* ============================================
   Baccarat Game Logic
   ============================================ */

class BaccaratGame {
    constructor(deckCount = 8) {
        this.shoe = new Shoe(deckCount);
        this.playerHand = [];
        this.bankerHand = [];
        this.roundNumber = 0;
        this.results = []; // 'player', 'banker', 'tie'
        this.state = 'betting'; // 'betting', 'dealing', 'result'
    }

    reset(deckCount) {
        this.shoe = new Shoe(deckCount || this.shoe.deckCount);
        this.playerHand = [];
        this.bankerHand = [];
        this.roundNumber = 0;
        this.results = [];
        this.state = 'betting';
    }

    newRound() {
        if (this.shoe.needsReshuffle()) {
            this.shoe.init();
        }
        this.playerHand = [];
        this.bankerHand = [];
        this.roundNumber++;
        this.state = 'dealing';
    }

    // Calculate hand value (Baccarat: only ones digit)
    static handValue(cards) {
        const total = cards.reduce((sum, card) => sum + card.value, 0);
        return total % 10;
    }

    // Deal initial 4 cards
    dealInitial() {
        // Baccarat deal order: Player, Banker, Player, Banker
        this.playerHand.push(this.shoe.draw());
        this.bankerHand.push(this.shoe.draw());
        this.playerHand.push(this.shoe.draw());
        this.bankerHand.push(this.shoe.draw());
    }

    // Check for natural (8 or 9)
    hasNatural() {
        const pv = BaccaratGame.handValue(this.playerHand);
        const bv = BaccaratGame.handValue(this.bankerHand);
        return pv >= 8 || bv >= 8;
    }

    // Player third card rule
    shouldPlayerDraw() {
        const pv = BaccaratGame.handValue(this.playerHand);
        // Player stands on 6 or 7, draws on 0-5
        return pv <= 5;
    }

    // Banker third card rule
    shouldBankerDraw(playerThirdCard) {
        const bv = BaccaratGame.handValue(this.bankerHand);

        // If player didn't draw, banker draws on 0-5
        if (playerThirdCard === null) {
            return bv <= 5;
        }

        const ptv = playerThirdCard.value;

        switch (bv) {
            case 0: case 1: case 2:
                return true;
            case 3:
                return ptv !== 8;
            case 4:
                return ptv >= 2 && ptv <= 7;
            case 5:
                return ptv >= 4 && ptv <= 7;
            case 6:
                return ptv === 6 || ptv === 7;
            case 7:
                return false;
            default:
                return false;
        }
    }

    // Play the round automatically
    playRound() {
        this.dealInitial();

        let playerThirdCard = null;

        // Check for natural
        if (this.hasNatural()) {
            return this.determineWinner();
        }

        // Player third card
        if (this.shouldPlayerDraw()) {
            playerThirdCard = this.shoe.draw();
            this.playerHand.push(playerThirdCard);
        }

        // Banker third card
        if (this.shouldBankerDraw(playerThirdCard)) {
            this.bankerHand.push(this.shoe.draw());
        }

        return this.determineWinner();
    }

    // Determine winner
    determineWinner() {
        const pv = BaccaratGame.handValue(this.playerHand);
        const bv = BaccaratGame.handValue(this.bankerHand);

        let result;
        if (pv > bv) {
            result = 'player';
        } else if (bv > pv) {
            result = 'banker';
        } else {
            result = 'tie';
        }

        this.results.push(result);
        this.state = 'result';

        return {
            result,
            playerValue: pv,
            bankerValue: bv,
            playerHand: [...this.playerHand],
            bankerHand: [...this.bankerHand],
            isNatural: this.playerHand.length === 2 && this.bankerHand.length === 2 && (pv >= 8 || bv >= 8)
        };
    }

    // Calculate payout
    static calculatePayout(betType, betAmount, result) {
        if (result === 'tie') {
            if (betType === 'tie') {
                return betAmount * 8; // 1:8 payout
            }
            // Push on tie for player/banker bets
            return 0;
        }

        if (betType === result) {
            if (betType === 'banker') {
                return betAmount * 0.95; // 5% commission
            }
            return betAmount; // 1:1  payout
        }

        return -betAmount; // Loss
    }

    // Get scoreboard stats
    getStats() {
        return {
            player: this.results.filter(r => r === 'player').length,
            banker: this.results.filter(r => r === 'banker').length,
            tie: this.results.filter(r => r === 'tie').length,
            total: this.results.length
        };
    }
}

/* ============================================
   AI Player
   ============================================ */

class AIPlayer {
    constructor(name, emoji, startBalance = 1000000) {
        this.name = name;
        this.emoji = emoji;
        this.balance = startBalance;
        this.startBalance = startBalance;
        this.currentBet = null;
        this.currentBetAmount = 0;
        this.wins = 0;
        this.losses = 0;
        this.consecutiveWins = 0;
        this.consecutiveLosses = 0;
    }

    // AI decides where and how much to bet
    placeBet() {
        if (this.balance <= 0) {
            this.currentBet = null;
            this.currentBetAmount = 0;
            return;
        }

        // Simple AI strategies for atmosphere
        const strategies = ['player', 'banker'];
        // AI slightly favors banker (statistically correct)
        this.currentBet = Math.random() < 0.55 ? 'banker' : 'player';

        // Bet sizing based on streak
        let baseBet = Math.max(10000, Math.floor(this.startBalance * 0.01));

        if (this.consecutiveWins >= 2) {
            baseBet *= 2; // Double up on streaks
        } else if (this.consecutiveLosses >= 3) {
            baseBet = Math.max(10000, Math.floor(baseBet * 0.5)); // Reduce on losing streak
        }

        // Random variation
        const variation = 1 + (Math.random() - 0.5) * 0.4;
        baseBet = Math.floor(baseBet * variation);

        // Cap at balance
        this.currentBetAmount = Math.min(baseBet, this.balance);

        // Round to nearest 1000
        this.currentBetAmount = Math.floor(this.currentBetAmount / 1000) * 1000;
        if (this.currentBetAmount === 0) this.currentBetAmount = Math.min(1000, this.balance);
    }

    // Process result
    processResult(result) {
        if (!this.currentBet || this.currentBetAmount === 0) return 0;

        const payout = BaccaratGame.calculatePayout(this.currentBet, this.currentBetAmount, result);
        this.balance += payout;

        if (payout > 0) {
            this.wins++;
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
        } else if (payout < 0) {
            this.losses++;
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
        }
        // Tie doesn't affect streaks

        return payout;
    }

    reset(balance) {
        this.balance = balance || this.startBalance;
        this.currentBet = null;
        this.currentBetAmount = 0;
        this.wins = 0;
        this.losses = 0;
        this.consecutiveWins = 0;
        this.consecutiveLosses = 0;
    }

    get betDisplay() {
        if (!this.currentBet || !this.currentBetAmount) return '-';
        const target = this.currentBet === 'player' ? 'P' : 'B';
        return `${target} ₩${this.currentBetAmount.toLocaleString()}`;
    }
}
