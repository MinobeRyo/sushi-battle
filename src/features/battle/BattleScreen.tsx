import type { Card } from '../../types'
import type { SideMenuId } from '../../data/sideMenus'
import { useEffect, useRef, useState } from 'react'
import { playGameSound, prepareGameAudio } from '../../audio/gameSounds'
import { useBattleGame } from './useBattleGame'
import { calcFieldDmg, FIELD_MAX, REORDER_BUDGET, REORDER_SECONDS } from './battleEngine'
import { C, R } from './battlePresentation'
import { ComboStatusBar } from './BattleStatus'
import { AnimatePresence, motion } from 'framer-motion'
import { HandSushi, CardDetailSheet } from './BattleCards'
import { PlayerStatusPanel } from './PlayerStatusPanel'
import { BattleTable } from './BattleTable'
import { DraftScreenThree } from '../draft/DraftScreenThree'
import { ComboCutIn } from './ComboCutIn'
import { BattleStatusDialog } from './BattleStatusDialog'
import { BattleSideMenuSlot } from '../side-menu/BattleSideMenuSlot'
import type { BattleSideStatus } from './battleStatusModel'
import './BattleScreen.css'

export function BattleScreen({
  deck,
  p2Deck,
  sideMenu,
  p2SideMenu,
  mode = 'cpu',
  onBack,
}: {
  deck: Card[]
  p2Deck?: Card[]
  sideMenu?: SideMenuId | null
  p2SideMenu?: SideMenuId | null
  mode?: 'cpu' | 'two_player'
  onBack?: () => void
}) {
  const game = useBattleGame({ deck, p2Deck, mode, sideMenu, p2SideMenu, onSummon: () => playGameSound('cardPlay') })
  return <BattleBoard game={game} mode={mode} onBack={onBack} />
}

export type BattleController = ReturnType<typeof useBattleGame>

export function BattleBoard({ game, mode, onBack, canRestart = true, restartLabel = 'もう一回' }: {
  game: BattleController
  mode: 'cpu' | 'two_player' | 'online'
  onBack?: () => void
  canRestart?: boolean
  restartLabel?: string
}) {
  const {
    s, showLog, setShowLog, comboAnim, floats, inspect, setInspect, reorderStep,
    playCard, useSideMenu, endTurn, handlePassReady, handleReorderComplete, restart,
  } = game
  const handRef = useRef<HTMLElement>(null)
  const [statusSide, setStatusSide] = useState<'player' | 'opponent' | null>(null)
  // 状態ダイアログより優先して、双方のコンボ演出を見せる。
  useEffect(() => { if (comboAnim) setStatusSide(null) }, [comboAnim])

  // ── 表示用計算 ────────────────────────────────────────────────────────────
  const isPlayerTurn = s.phase === 'player'
  const previewDmg = calcFieldDmg(s.pField, s.pAttackBuff, s.pKiretaStack, s.cBelly, { nikuMatsuri: s.pNikuMatsuri })
  const opponentDmg = calcFieldDmg(s.cField, s.cAttackBuff, s.cKiretaStack, s.pBelly, { nikuMatsuri: s.cNikuMatsuri })

  const phaseLabel = s.phase === 'player' ? 'あなたのターン'
    : s.phase === 'animating' ? '攻撃中…'
    : s.phase === 'pass' ? 'ターン終了'
    : s.phase === 'reorder' ? '追加注文中…'
    : s.phase === 'waiting' ? '相手のターン'
    : s.phase === 'syncing' ? '通信待ち…'
    : s.phase === 'over' ? '対戦終了'
    : 'CPU思考中…'

  const opponentLabel = mode !== 'cpu'
    ? `P${s.activePlayer === 1 ? 2 : 1}`
    : 'CPU'
  const activeLabel = mode !== 'cpu' ? `P${s.activePlayer}` : 'あなた'

  const sideStatus = (opponent: boolean): BattleSideStatus => opponent ? {
    summonedIds: s.cSummonedIds, combosFired: s.cCombosFired, field: s.cField,
    attackBuff: s.cAttackBuff, drawBonus: s.cDrawBonus, kiretaStack: s.cKiretaStack,
    kiretaSpent: s.cKiretaSpent, nikuMatsuri: s.cNikuMatsuri,
    digestStopTurns: s.cDigestStopTurns, apNextBonus: s.cApNextBonus, thisTurnArch: s.cThisTurnArch,
    sideMenu: s.cSideMenu,
  } : {
    summonedIds: s.pSummonedIds, combosFired: s.pCombosFired, field: s.pField,
    attackBuff: s.pAttackBuff, drawBonus: s.pDrawBonus, kiretaStack: s.pKiretaStack,
    kiretaSpent: s.pKiretaSpent, nikuMatsuri: s.pNikuMatsuri,
    digestStopTurns: s.pDigestStopTurns, apNextBonus: s.pApNextBonus, thisTurnArch: s.pThisTurnArch,
    sideMenu: s.pSideMenu,
  }

  const playerStatus = {
    summonedIds: s.pSummonedIds, combosFired: s.pCombosFired, field: s.pField,
    attackBuff: s.pAttackBuff, drawBonus: s.pDrawBonus,
    kireta: s.pKiretaStack, kiretaSpent: s.pKiretaSpent, nikuMatsuri: s.pNikuMatsuri,
    thisTurnArch: s.pThisTurnArch,
    sideMenu: s.pSideMenu,
  }
  const opponentStatus = {
    summonedIds: s.cSummonedIds, combosFired: s.cCombosFired, field: s.cField,
    attackBuff: s.cAttackBuff, drawBonus: s.cDrawBonus,
    kireta: s.cKiretaStack, kiretaSpent: s.cKiretaSpent, nikuMatsuri: s.cNikuMatsuri,
    thisTurnArch: s.cThisTurnArch,
    sideMenu: s.cSideMenu,
  }
  const playBlockedReason = (card: Card) => {
    if (!isPlayerTurn) return s.phase === 'syncing' ? '通信を待っています' : '自分のターンに召喚できます'
    if (s.pField.length >= FIELD_MAX) return '机がいっぱいです（8枚まで）'
    const currentCard = 'instanceId' in card ? s.pHand.find(item => item.instanceId === card.instanceId) : undefined
    if (!currentCard) return 'このカードは手札にありません'
    if (s.pAP < currentCard.cost) return `APがあと${currentCard.cost - s.pAP}必要です`
    return undefined
  }
  const currentInspect = inspect && inspect.remainingTurns === undefined
    ? { ...inspect, canPlay: !playBlockedReason(inspect.card) && (mode !== 'online' || inspect.canPlay), playBlockedReason: playBlockedReason(inspect.card) }
    : inspect

  const winnerLabel = mode !== 'cpu'
    ? (s.winner === 'player' ? `P${s.activePlayer}の勝利！` : `P${s.activePlayer === 1 ? 2 : 1}の勝利！`)
    : (s.winner === 'player' ? '勝利！' : '敗北…')

  return (
    <div className="battle-viewport" onPointerDownCapture={prepareGameAudio} onKeyDownCapture={prepareGameAudio}>
    <div className="battle-board" style={{ background: C.bgMain, color: C.txtPri }}>
      <div className="battle-layout">
        <header className="battle-overview">
          <div className="battle-phase-bar">
            <span className="battle-turn-number">ターン {s.turn}</span>
            <strong role="status">{phaseLabel}</strong>
            <span className="battle-phase-hint">お腹が100で負け</span>
          </div>
          <div className="battle-status-grid">
            <PlayerStatusPanel label={`相手 · ${opponentLabel}`} isOpponent
              belly={s.cBelly} ap={s.cAP} maxAP={s.cMaxAP} fieldDamage={opponentDmg}
              handCount={s.cHandCount} deckCount={s.cDeckCount} {...opponentStatus}
              digestStopTurns={s.cDigestStopTurns} apNextBonus={s.cApNextBonus} />
            <PlayerStatusPanel label={mode === 'cpu' ? 'あなた' : `あなた · ${activeLabel}`}
              belly={s.pBelly} ap={s.pAP} maxAP={s.pMaxAP} fieldDamage={previewDmg}
              handCount={s.pHand.length} deckCount={s.pDeckCount} {...playerStatus}
              digestStopTurns={s.pDigestStopTurns} apNextBonus={s.pApNextBonus} />
          </div>
        </header>

        <div className="battle-arena" role="region" aria-label="机と手札" tabIndex={0}>
          <div className="battle-side-menus">
            <BattleSideMenuSlot label={opponentLabel} menu={s.cSideMenu} />
            <BattleSideMenuSlot label={activeLabel} menu={s.pSideMenu} canAct={isPlayerTurn}
              ap={s.pAP} maxAP={s.pMaxAP} onUse={useSideMenu} />
          </div>
          <div className="battle-tables">
            <BattleTable label={opponentLabel} cards={s.cField} isEnemy
              attackBuff={s.cAttackBuff} kiretaStack={s.cKiretaStack} enemyBelly={s.pBelly} nikuMatsuri={s.cNikuMatsuri}
              floats={floats.filter(item => item.target === 'cpu')} flash={s.flash === 'cpu'}
              onShowStatus={() => setStatusSide('opponent')}
              onInspect={(card, actualAttack) => setInspect({ card, canPlay: false, remainingTurns: card.turnsLeft, actualAttack, owner: 'opponent' })}>
              <ComboStatusBar st={opponentStatus} />
            </BattleTable>
            <BattleTable label={activeLabel} cards={s.pField}
              attackBuff={s.pAttackBuff} kiretaStack={s.pKiretaStack} enemyBelly={s.cBelly} nikuMatsuri={s.pNikuMatsuri}
              floats={floats.filter(item => item.target === 'player')} flash={s.flash === 'player'}
              onShowStatus={() => setStatusSide('player')}
              onInspect={(card, actualAttack) => setInspect({ card, canPlay: false, remainingTurns: card.turnsLeft, actualAttack, owner: 'player' })}>
              <ComboStatusBar st={playerStatus} />
            </BattleTable>
          </div>
          <section className="battle-hand-section" ref={handRef} aria-label="手札エリア" tabIndex={-1}>
            <header className="battle-table-heading">
              <h2>あなたの手札 <span>{s.pHand.length}枚</span></h2>
              <span>カードを押して召喚</span>
            </header>
            <div className="battle-hand" role="region" aria-label="手札" tabIndex={0}>
              {s.pHand.length === 0
                ? <p className="battle-empty-field">手札がありません</p>
                : s.pHand.map(card => <HandSushi key={card.instanceId} card={card}
                  canPlay={!playBlockedReason(card)} attackBuff={s.pAttackBuff} kiretaStack={s.pKiretaStack}
                  isSelected={inspect?.card === card}
                  onSelect={() => setInspect({ card, canPlay: !playBlockedReason(card), playBlockedReason: playBlockedReason(card) })} />)}
            </div>
          </section>
        </div>

        <footer className="battle-actions">
          <button className="battle-hand-jump" onClick={() => {
            handRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
            handRef.current?.focus({ preventScroll: true })
          }}>手札へ <strong>{s.pHand.length}枚</strong></button>
          <button className="battle-log-button" onClick={() => setShowLog(value => !value)} aria-expanded={showLog}>
            <span>ログ</span><span className="battle-log-preview">{s.log[0] ?? ''}</span>
          </button>
          <motion.button className="battle-end-turn" onClick={endTurn} disabled={!isPlayerTurn}
            whileTap={isPlayerTurn ? { scale: 0.97 } : {}}>
            {isPlayerTurn ? 'ターン終了' : phaseLabel}
          </motion.button>
        </footer>
      </div>

      {/* ══ バトルログ ══ */}
      <AnimatePresence>
        {showLog && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
              background: 'rgba(250,246,239,0.97)', borderTop: '1px solid #d4c4ae',
              padding: 'clamp(12px, 2vh, 20px) clamp(14px, 2vw, 24px)',
              overflowY: 'auto', zIndex: 30, boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: R.fmd, color: C.txtSec, fontWeight: 700 }}>バトルログ</span>
              <button onClick={() => setShowLog(false)} style={{ fontSize: R.flg, color: C.txtMut, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            {s.log.map((msg, i) => (
              <p key={i} style={{ fontSize: R.fsm, lineHeight: 1.8, color: msg.startsWith('──') ? C.apEmpty : msg.startsWith('🎉') ? '#b45309' : C.txtSec }}>{msg}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ カード詳細シート ══ */}
      <AnimatePresence>
        {currentInspect && (
          <CardDetailSheet
            inspect={currentInspect}
            attackBuff={currentInspect.owner === 'opponent' ? s.cAttackBuff : s.pAttackBuff}
            kiretaStack={currentInspect.owner === 'opponent' ? s.cKiretaStack : s.pKiretaStack}
            onPlay={() => { if (currentInspect?.canPlay) playCard(currentInspect.card) }}
            onClose={() => setInspect(null)}
          />
        )}
      </AnimatePresence>

      {statusSide && <BattleStatusDialog
        label={statusSide === 'opponent' ? opponentLabel : activeLabel}
        status={sideStatus(statusSide === 'opponent')}
        ap={statusSide === 'opponent' ? s.cAP : s.pAP}
        maxAP={statusSide === 'opponent' ? s.cMaxAP : s.pMaxAP}
        handCount={statusSide === 'opponent' ? s.cHandCount : s.pHand.length}
        deckCount={statusSide === 'opponent' ? s.cDeckCount : s.pDeckCount}
        onClose={() => setStatusSide(null)}
      />}

      {/* ══ コンボ演出 ══ */}
      <AnimatePresence mode="wait">
        {comboAnim && <ComboCutIn key={comboAnim.key} combo={comboAnim} />}
      </AnimatePresence>

      {/* ══ パス画面（二人対戦） ══ */}
      <AnimatePresence>
        {s.phase === 'pass' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 50,
              background: 'rgba(0,0,0,0.88)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              style={{ textAlign: 'center' }}
            >
              <p style={{ fontSize: 'clamp(48px, 8vw, 80px)', marginBottom: 16 }}>🍣</p>
              <p style={{ fontSize: 'clamp(20px, 3.5vw, 32px)', fontWeight: 900, color: '#fde68a', marginBottom: 8 }}>
                P{s.activePlayer === 1 ? 2 : 1} の番です
              </p>
              <p style={{ fontSize: R.fmd, color: '#a8a29e', marginBottom: 32, lineHeight: 1.7 }}>
                デバイスを P{s.activePlayer === 1 ? 2 : 1} に渡してください
              </p>
              <motion.button
                onClick={handlePassReady}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  padding: 'clamp(12px, 2vh, 20px) clamp(32px, 5vw, 64px)',
                  background: C.btnEnd, border: `2px solid ${C.btnEndBorder}`,
                  borderRadius: 999, fontSize: R.fmd, fontWeight: 800,
                  color: '#fff', cursor: 'pointer',
                  boxShadow: `0 0 28px ${C.btnEndGlow}`,
                }}
              >
                準備完了 →
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ 追加注文タイム ══ */}
      {s.phase === 'reorder' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: '#1c0c04', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            flexShrink: 0, textAlign: 'center', padding: '8px 12px',
            background: 'linear-gradient(90deg,#7c2d12,#ea580c,#7c2d12)',
            color: '#fff', fontWeight: 800, fontSize: R.fsm,
          }}>
            🍽 追加注文タイム！ 軍資金 ¥{REORDER_BUDGET.toLocaleString()} で山札を補充
            {mode !== 'cpu' && `（P${reorderStep === 'p' ? s.activePlayer : s.activePlayer === 1 ? 2 : 1} の番）`}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DraftScreenThree
              key={reorderStep}
              mode="reorder"
              onComplete={handleReorderComplete}
              initialBudget={REORDER_BUDGET}
              seconds={REORDER_SECONDS}
              playerNum={mode !== 'cpu'
                ? (reorderStep === 'p' ? s.activePlayer : (s.activePlayer === 1 ? 2 : 1))
                : undefined}
            />
          </div>
        </div>
      )}

      {/* ══ ゲームオーバー ══ */}
      <AnimatePresence>
        {s.winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="battle-result"
            style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div initial={{ scale: 0.4, y: 32 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 14, stiffness: 180 }} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 'clamp(60px, 12vw, 120px)', marginBottom: 16 }}>{s.winner === 'player' ? '🎉' : '😔'}</p>
              <p style={{ fontSize: 'clamp(24px, 4.5vw, 56px)', fontWeight: 700, color: '#fff', marginBottom: 8 }}>{winnerLabel}</p>
              <p style={{ fontSize: R.fmd, color: '#a89070', marginBottom: 32 }}>{s.turn} ターンで決着</p>
              <div className="battle-result-actions" style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', justifyContent: 'center' }}>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  onClick={restart}
                  disabled={!canRestart}
                  style={{ padding: 'clamp(12px, 1.5vh, 20px) clamp(28px, 4vw, 56px)', borderRadius: 999, fontSize: R.fmd, fontWeight: 800, background: C.btnEnd, color: '#fff', border: `1.5px solid ${C.btnEndBorder}`, cursor: 'pointer', boxShadow: `0 0 24px ${C.btnEndGlow}` }}
                >{restartLabel}</motion.button>
                {onBack && (
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={onBack}
                    style={{ padding: 'clamp(12px, 1.5vh, 20px) clamp(28px, 4vw, 56px)', borderRadius: 999, fontSize: R.fmd, fontWeight: 700, background: 'rgba(255,255,255,0.12)', color: '#ccc', border: '1.5px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                  >{mode === 'online' ? '部屋を退出' : 'タイトルへ'}</motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
  )
}
