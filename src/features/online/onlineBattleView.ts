import type { PublicMatch } from '../../network/protocol'
import type { BattleView, ViewPhase } from '../battle/types'

// サーバーから本人に公開された情報だけで対戦画面を作る。
export function toOnlineBattleView(match: PublicMatch, phase: ViewPhase): BattleView {
  const p = match.you
  const c = match.opponent
  return {
    pHand: p.hand, pField: p.field, pDeckCount: p.deckCount, pBelly: p.belly,
    pAP: p.ap, pMaxAP: p.maxAP, pGari: p.gari, pSummonedIds: p.summonedIds, pSummonedArch: p.summonedArch,
    pDrawBonus: p.drawBonus, pAttackBuff: p.attackBuff, pCombosFired: p.combosFired,
    pKiretaStack: p.kiretaStack, pThisTurnBases: p.thisTurnBases, pThisTurnArch: p.thisTurnArch,
    pDigestStopTurns: p.digestStopTurns, pApNextBonus: p.apNextBonus,
    pNikuMatsuri: p.nikuMatsuri, pSacrificedThisTurn: p.sacrificedThisTurn ?? 0, pKiretaSpent: p.kiretaSpent,
    pSideMenu: p.sideMenu,
    cHandCount: c.handCount, cField: c.field, cDeckCount: c.deckCount, cBelly: c.belly,
    cAP: c.ap, cMaxAP: c.maxAP, cGari: c.gari, cThisTurnArch: c.thisTurnArch,
    cSummonedIds: c.summonedIds, cSummonedArch: c.summonedArch,
    cDrawBonus: c.drawBonus, cAttackBuff: c.attackBuff, cCombosFired: c.combosFired,
    cKiretaStack: c.kiretaStack, cDigestStopTurns: c.digestStopTurns,
    cApNextBonus: c.apNextBonus, cNikuMatsuri: c.nikuMatsuri, cSacrificedThisTurn: c.sacrificedThisTurn ?? 0, cKiretaSpent: c.kiretaSpent,
    cSideMenu: c.sideMenu,
    activePlayer: p.id, turn: match.turn, phase, pendingAttack: match.pendingAttack, passToPlayerId: null,
    winner: match.winnerId === null ? null : match.winnerId === p.id ? 'player' : 'cpu',
    log: match.log, flash: null,
  }
}
