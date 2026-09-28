import type { MatchState, PlayerId } from '../../game/types'
import { otherPlayer } from '../../game/matchEngine'
import type { BattleView, ViewPhase } from './types'

// 自分・相手を表示時に選ぶだけで、MatchState内のP1/P2は入れ替えない。
// 全手札を扱うローカル画面用。将来の通信では本人向けに隠した状態を別途作る。
export function toBattleView(match: MatchState, viewer: PlayerId, phase: ViewPhase,
  flash: 'player' | 'cpu' | null): BattleView {
  const p = match.players[viewer]
  const c = match.players[otherPlayer(viewer)]
  return {
    pHand: p.hand, pField: p.field, pDeckCount: p.deck.length, pBelly: p.belly,
    pAP: p.ap, pMaxAP: p.maxAP, pSummonedIds: p.summonedIds, pSummonedArch: p.summonedArch,
    pDrawBonus: p.drawBonus, pAttackBuff: p.attackBuff, pCombosFired: p.combosFired,
    pKiretaStack: p.kiretaStack, pThisTurnBases: p.thisTurnBases, pThisTurnArch: p.thisTurnArch,
    pDigestStopTurns: p.digestStopTurns, pApNextBonus: p.apNextBonus,
    pNikuMatsuri: p.nikuMatsuri, pKiretaSpent: p.kiretaSpent,
    cHandCount: c.hand.length, cField: c.field, cDeckCount: c.deck.length, cBelly: c.belly,
    cAP: c.ap, cMaxAP: c.maxAP, cThisTurnArch: c.thisTurnArch,
    cSummonedIds: c.summonedIds, cSummonedArch: c.summonedArch,
    cDrawBonus: c.drawBonus, cAttackBuff: c.attackBuff, cCombosFired: c.combosFired,
    cKiretaStack: c.kiretaStack, cDigestStopTurns: c.digestStopTurns,
    cApNextBonus: c.apNextBonus, cNikuMatsuri: c.nikuMatsuri, cKiretaSpent: c.kiretaSpent,
    activePlayer: viewer,
    turn: phase === 'pass' ? match.turn - 1 : match.turn,
    phase, winner: match.winnerId === null ? null : match.winnerId === viewer ? 'player' : 'cpu',
    log: match.log, flash,
  }
}
