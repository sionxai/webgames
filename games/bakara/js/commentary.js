/* ============================================
   Game Commentary System
   바카라 게임 해설 - 초보자를 위한 3줄 해설
   ============================================ */

class Commentary {
    /**
     * Generate 3-line commentary for the round
     * @param {Object} result - Game result from BaccaratGame.playRound()
     * @param {string} betType - Player's bet type ('player', 'banker', 'tie')
     * @param {number} payout - Player's payout
     * @returns {Object} { lines: string[], icon: string }
     */
    static generate(result, betType, payout) {
        const { playerHand, bankerHand, playerValue, bankerValue, isNatural } = result;
        const gameResult = result.result;

        const lines = [];

        // === LINE 1: Initial hand description ===
        lines.push(this.getInitialHandLine(playerHand, bankerHand, playerValue, bankerValue));

        // === LINE 2: Third card rule explanation ===
        lines.push(this.getThirdCardLine(playerHand, bankerHand, playerValue, bankerValue, isNatural));

        // === LINE 3: Result & betting outcome ===
        lines.push(this.getResultLine(gameResult, playerValue, bankerValue, betType, payout));

        return {
            lines,
            resultClass: this.getResultClass(gameResult, betType, payout)
        };
    }

    // LINE 1: Initial hands
    static getInitialHandLine(playerHand, bankerHand, playerValue, bankerValue) {
        const p1 = this.cardName(playerHand[0]);
        const p2 = this.cardName(playerHand[1]);
        const b1 = this.cardName(bankerHand[0]);
        const b2 = this.cardName(bankerHand[1]);

        const pInitial = (playerHand[0].value + playerHand[1].value) % 10;
        const bInitial = (bankerHand[0].value + bankerHand[1].value) % 10;

        return `📋 플레이어 [${p1} + ${p2}] = ${pInitial}점 vs 뱅커 [${b1} + ${b2}] = ${bInitial}점으로 시작`;
    }

    // LINE 2: Third card rules
    static getThirdCardLine(playerHand, bankerHand, playerValue, bankerValue, isNatural) {
        const pInitial = (playerHand[0].value + playerHand[1].value) % 10;
        const bInitial = (bankerHand[0].value + bankerHand[1].value) % 10;
        const playerDrew = playerHand.length > 2;
        const bankerDrew = bankerHand.length > 2;

        // Case 1: Natural (8 or 9)
        if (isNatural) {
            if (pInitial >= 8 && bInitial >= 8) {
                return `🃏 양쪽 모두 내추럴! 플레이어 ${pInitial}, 뱅커 ${bInitial} — 추가 카드 없이 바로 승부!`;
            } else if (pInitial >= 8) {
                return `🃏 플레이어 내추럴 ${pInitial}! 8 이상이면 추가 카드 없이 즉시 승리 판정됩니다.`;
            } else {
                return `🃏 뱅커 내추럴 ${bInitial}! 8 이상이면 추가 카드 없이 즉시 승리 판정됩니다.`;
            }
        }

        // Case 2: No third cards drawn
        if (!playerDrew && !bankerDrew) {
            return `🃏 플레이어 ${pInitial}(6~7은 스탠드), 뱅커 ${bInitial}(6~7은 스탠드) — 둘 다 추가 카드 없음.`;
        }

        // Case 3: Only player drew
        if (playerDrew && !bankerDrew) {
            const p3 = this.cardName(playerHand[2]);
            const p3val = playerHand[2].value;
            return `🃏 플레이어 ${pInitial}점(0~5)이라 ${p3} 추가. 뱅커 ${bInitial}점(6~7)으로 스탠드.`;
        }

        // Case 4: Only banker drew (player stood at 6-7)
        if (!playerDrew && bankerDrew) {
            const b3 = this.cardName(bankerHand[2]);
            return `🃏 플레이어 ${pInitial}점(6~7)으로 스탠드. 뱅커 ${bInitial}점(0~5)이라 ${b3} 추가.`;
        }

        // Case 5: Both drew
        if (playerDrew && bankerDrew) {
            const p3 = this.cardName(playerHand[2]);
            const b3 = this.cardName(bankerHand[2]);
            const p3val = playerHand[2].value;

            const bankerReason = this.getBankerDrawReason(bInitial, p3val);
            return `🃏 플레이어 ${pInitial}점이라 ${p3} 추가. 뱅커 ${bInitial}점에 상대 3번째 카드(${p3val})로 ${bankerReason} → ${b3} 추가.`;
        }

        // Case 6: Player drew but banker didn't
        if (playerDrew && !bankerDrew) {
            const p3 = this.cardName(playerHand[2]);
            const p3val = playerHand[2].value;
            const bankerReason = this.getBankerStandReason(bInitial, p3val);
            return `🃏 플레이어 ${pInitial}점이라 ${p3} 추가. 뱅커는 ${bankerReason} 스탠드.`;
        }

        return `🃏 바카라 규칙에 따라 카드가 배분되었습니다.`;
    }

    // LINE 3: Result explanation
    static getResultLine(gameResult, playerValue, bankerValue, betType, payout) {
        const resultNames = { player: '플레이어', banker: '뱅커', tie: '타이' };
        const betNames = { player: '플레이어', banker: '뱅커', tie: '타이' };

        if (gameResult === 'tie') {
            if (betType === 'tie') {
                return `🏆 ${playerValue} vs ${bankerValue} 동점! 타이 배팅 적중! 8배 배당 획득! 💰`;
            } else if (betType) {
                return `🏆 ${playerValue} vs ${bankerValue} 동점! 타이 결과 — ${betNames[betType]} 배팅은 푸시(환불)됩니다.`;
            }
            return `🏆 ${playerValue} vs ${bankerValue} 동점! 타이(무승부) 결과입니다.`;
        }

        const winner = resultNames[gameResult];
        const diff = Math.abs(playerValue - bankerValue);
        const closeMatch = diff <= 1 ? ' 아슬아슬한 승부!' : '';

        if (!betType) {
            return `🏆 ${winner} 승리! (${playerValue} vs ${bankerValue})${closeMatch}`;
        }

        if (payout > 0) {
            if (betType === 'banker' && gameResult === 'banker') {
                return `🏆 ${winner} ${playerValue > bankerValue ? bankerValue : bankerValue}점으로 승리! 뱅커 배팅 적중! (5% 커미션 차감 후 지급)${closeMatch} 💰`;
            }
            return `🏆 ${winner} ${gameResult === 'player' ? playerValue : bankerValue}점으로 승리! ${betNames[betType]} 배팅 적중!${closeMatch} 💰`;
        } else if (payout < 0) {
            const loser = gameResult === 'player' ? '뱅커' : '플레이어';
            return `😔 ${winner} ${gameResult === 'player' ? playerValue : bankerValue}점으로 승리. ${betNames[betType]} 배팅 실패 — ${loser}가 ${gameResult === 'player' ? bankerValue : playerValue}점으로 패배.${closeMatch}`;
        } else {
            return `🏆 ${playerValue} vs ${bankerValue} — 타이! ${betNames[betType]} 배팅은 환불됩니다.`;
        }
    }

    // Helper: Banker third card draw reason
    static getBankerDrawReason(bankerInitial, playerThirdValue) {
        const reasons = {
            0: '0~2점은 무조건 드로',
            1: '0~2점은 무조건 드로',
            2: '0~2점은 무조건 드로',
            3: `3점이고 상대 3번째가 8이 아니면 드로`,
            4: `4점이고 상대 3번째가 2~7이면 드로`,
            5: `5점이고 상대 3번째가 4~7이면 드로`,
            6: `6점이고 상대 3번째가 6~7이면 드로`,
        };
        return reasons[bankerInitial] || '규칙에 의해 드로';
    }

    // Helper: Banker stand reason
    static getBankerStandReason(bankerInitial, playerThirdValue) {
        if (bankerInitial === 7) return '7점이라';
        if (bankerInitial === 6 && (playerThirdValue < 6 || playerThirdValue > 7)) {
            return `6점인데 상대 3번째(${playerThirdValue})가 6~7이 아니라`;
        }
        if (bankerInitial === 5 && (playerThirdValue < 4 || playerThirdValue > 7)) {
            return `5점인데 상대 3번째(${playerThirdValue})가 4~7이 아니라`;
        }
        if (bankerInitial === 4 && (playerThirdValue < 2 || playerThirdValue > 7)) {
            return `4점인데 상대 3번째(${playerThirdValue})가 2~7이 아니라`;
        }
        if (bankerInitial === 3 && playerThirdValue === 8) {
            return `3점인데 상대 3번째가 8이라`;
        }
        return `${bankerInitial}점으로 규칙에 의해`;
    }

    // Helper: Card display name
    static cardName(card) {
        const suitSymbols = { '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣' };
        return `${card.suit}${card.rank}`;
    }

    // Helper: Get result CSS class
    static getResultClass(gameResult, betType, payout) {
        if (payout > 0) return 'commentary-win';
        if (payout < 0) return 'commentary-lose';
        return 'commentary-push';
    }
}
