/* ============================================
   Card & Deck System
   ============================================ */

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.suitName = SUIT_NAMES[suit];
        this.isRed = suit === '♥' || suit === '♦';
    }

    get value() {
        if (this.rank === 'A') return 1;
        if (['10', 'J', 'Q', 'K'].includes(this.rank)) return 0;
        return parseInt(this.rank);
    }

    get displayRank() {
        return this.rank;
    }

    get colorClass() {
        return this.isRed ? 'red' : 'black';
    }
}

class Shoe {
    constructor(deckCount = 8) {
        this.deckCount = deckCount;
        this.cards = [];
        this.dealt = 0;
        this.init();
    }

    init() {
        this.cards = [];
        for (let d = 0; d < this.deckCount; d++) {
            for (const suit of SUITS) {
                for (const rank of RANKS) {
                    this.cards.push(new Card(suit, rank));
                }
            }
        }
        this.shuffle();
        this.dealt = 0;
    }

    shuffle() {
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw() {
        if (this.dealt >= this.cards.length) {
            this.init();
        }
        return this.cards[this.dealt++];
    }

    get remaining() {
        return this.cards.length - this.dealt;
    }

    get total() {
        return this.cards.length;
    }

    get percentRemaining() {
        return (this.remaining / this.total) * 100;
    }

    // Cut card - reshuffle when about 25% of shoe is left
    needsReshuffle() {
        return this.remaining < this.total * 0.25;
    }
}

// Card HTML rendering
function renderCard(card, isThird = false) {
    if (!card) return '';
    
    const thirdClass = isThird ? 'third-card' : '';
    
    return `
        <div class="playing-card ${card.colorClass} ${thirdClass}">
            <div class="card-corner top-left">
                <span class="card-rank">${card.displayRank}</span>
                <span class="card-suit-small">${card.suit}</span>
            </div>
            <span class="card-suit-center">${card.suit}</span>
            <div class="card-corner bottom-right">
                <span class="card-rank">${card.displayRank}</span>
                <span class="card-suit-small">${card.suit}</span>
            </div>
        </div>
    `;
}

function renderCardBack(isThird = false) {
    const thirdClass = isThird ? 'third-card' : '';
    return `<div class="playing-card face-down ${thirdClass}"></div>`;
}
