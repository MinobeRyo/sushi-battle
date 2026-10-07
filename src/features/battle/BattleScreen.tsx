import type { Card } from '../../types'
import type { SideMenuId } from '../../data/sideMenus'
import type { CpuBattleMode } from '../../data/cpuDecks'
import { INBOUND_DON_SACRIFICE_BONUS, canReorderSideMenu } from '../../data/sideMenus'
import { useEffect, useState } from 'react'
import { useCompactLandscape } from '../../hooks/useCompactLandscape'
import { playGameSound, prepareGameAudio } from '../../audio/gameSounds'
import { useBattleGame } from './useBattleGame'
import { useBattleHandNavigation } from './useBattleHandNavigation'
import { calcFieldDmg, countNamahamu, getSacrificeLimit, getDefenseCost, MAKI_COMP_5, makimonoCount, hasNamahamuAura, FIELD_MAX, REORDER_BUDGET, REORDER_SECONDS } from './battleEngine'
import { C, R } from './battlePresentation'
import { ComboStatusBar } from './BattleStatus'
import { AnimatePresence, motion } from 'framer-motion'
import { HandSushi, CardDetailSheet } from './BattleCards'
import { CardEffectText } from './CardEffectText'
import { PlayerStatusPanel } from './PlayerStatusPanel'
import { DeckInspector } from './DeckInspector'
import { BattleTable } from './BattleTable'
import { DraftScreenThree } from '../draft/DraftScreenThree'
import { ComboCutIn } from './ComboCutIn'
import { DefensePrompt } from './DefensePrompt'
import { HikariDefensePrompt } from './HikariDefensePrompt'
import { BattleStatusDialog } from './BattleStatusDialog'
import { BattleSideMenuSlot } from '../side-menu/BattleSideMenuSlot'
import type { BattleSideStatus } from './battleStatusModel'
import { cardAttackBuff } from './battleStatusModel'
import './BattleScreen.css'
import './BattleLandscape.css'

export function BattleScreen({
  deck,
  p2Deck,
  sideMenu,
  p2SideMenu,
  mode = 'cpu',
  cpuBattleMode = 'random',
  onBack,
}: {
  deck: Card[]
  p2Deck?: Card[]
  sideMenu?: SideMenuId | null
  p2SideMenu?: SideMenuId | null
  mode?: 'cpu' | 'two_player'
  cpuBattleMode?: CpuBattleMode
  onBack?: () => void
}) {
  const game = useBattleGame({ deck, p2Deck, mode, cpuBattleMode, sideMenu, p2SideMenu, onSummon: () => playGameSound('cardPlay') })
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
    playCard, useSideMenu, endTurn, respondDefense, respondReaction, handlePassReady, handleReorderComplete, restart,
  } = game
  const { layoutRef, arenaRef, handRef, actionsRef, handInView, toggleHand } = useBattleHandNavigation()
  const isCompact = useCompactLandscape()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [statusSide, setStatusSide] = useState<'player' | 'opponent' | null>(null)
  // 状態ダイアログより優先して、双方のコンボ演出を見せる。
  useEffect(() => { if (comboAnim) setStatusSide(null) }, [comboAnim])
  useEffect(() => { if (s.pendingAttack || s.pendingReaction) setStatusSide(null) }, [s.pendingAttack, s.pendingReaction])

  // ── 表示用計算 ────────────────────────────────────────────────────────────
  const isPlayerTurn = s.phase === 'player'
  const isReactionDefender = s.pendingReaction?.defenderId === s.activePlayer
  const isDefender = s.pendingAttack?.defenderId === s.activePlayer
  const previewDmg = calcFieldDmg(s.pField, s.pAttackBuff, s.pKiretaStack, s.cBelly, { nikuMatsuri: s.pNikuMatsuri })
  const opponentDmg = calcFieldDmg(s.cField, s.cAttackBuff, s.cKiretaStack, s.pBelly, { nikuMatsuri: s.cNikuMatsuri })

  const phaseLabel = s.phase === 'player' ? 'あなたのターン'
    : s.phase === 'reacting' ? '光り物の防御を選んでください'
    : s.phase === 'defending' ? '防御を選んでください'
    : s.phase === 'animating' ? '攻撃中…'
    : s.phase === 'pass' ? 'プレイヤー交代'
    : s.phase === 'reorder' ? '追加注文中…'
    : s.phase === 'syncing' ? '通信待ち…'
    : s.pendingReaction && !isReactionDefender ? '相手が光り物の防御を選択中…'
    : s.pendingAttack && !isDefender ? '相手が防御を選択中…'
    : s.phase === 'waiting' ? '相手のターン'
    : s.phase === 'over' ? '対戦終了'
    : 'CPU思考中…'

  const opponentLabel = mode !== 'cpu'
    ? `P${s.activePlayer === 1 ? 2 : 1}`
    : s.cDeckLabel ? `CPU · ${s.cDeckLabel}` : 'CPU'
  const activeLabel = mode !== 'cpu' ? `P${s.activePlayer}` : 'あなた'

  const sideStatus = (opponent: boolean): BattleSideStatus => opponent ? {
    summonedIds: s.cSummonedIds, combosFired: s.cCombosFired, field: s.cField,
    attackBuff: s.cAttackBuff, drawBonus: s.cDrawBonus, kiretaStack: s.cKiretaStack,
    kiretaSpent: s.cKiretaSpent, nikuMatsuri: s.cNikuMatsuri,
    digestStopTurns: s.cDigestStopTurns, apNextBonus: s.cApNextBonus, thisTurnArch: s.cThisTurnArch,
    sideMenu: s.cSideMenu, sacrificedThisTurn: s.cSacrificedThisTurn,
  } : {
    summonedIds: s.pSummonedIds, combosFired: s.pCombosFired, field: s.pField,
    attackBuff: s.pAttackBuff, drawBonus: s.pDrawBonus, kiretaStack: s.pKiretaStack,
    kiretaSpent: s.pKiretaSpent, nikuMatsuri: s.pNikuMatsuri,
    digestStopTurns: s.pDigestStopTurns, apNextBonus: s.pApNextBonus, thisTurnArch: s.pThisTurnArch,
    sideMenu: s.pSideMenu, sacrificedThisTurn: s.pSacrificedThisTurn,
  }

  const playerStatus = {
    summonedIds: s.pSummonedIds, combosFired: s.pCombosFired, field: s.pField,
    attackBuff: s.pAttackBuff, drawBonus: s.pDrawBonus,
    kireta: s.pKiretaStack, kiretaSpent: s.pKiretaSpent, nikuMatsuri: s.pNikuMatsuri,
    thisTurnArch: s.pThisTurnArch,
    sideMenu: s.pSideMenu, sacrificedThisTurn: s.pSacrificedThisTurn,
  }
  const opponentStatus = {
    summonedIds: s.cSummonedIds, combosFired: s.cCombosFired, field: s.cField,
    attackBuff: s.cAttackBuff, drawBonus: s.cDrawBonus,
    kireta: s.cKiretaStack, kiretaSpent: s.cKiretaSpent, nikuMatsuri: s.cNikuMatsuri,
    thisTurnArch: s.cThisTurnArch,
    sideMenu: s.cSideMenu, sacrificedThisTurn: s.cSacrificedThisTurn,
  }
  const playBlockedReason = (card: Card) => {
    if (!isPlayerTurn) return s.phase === 'syncing' ? '通信を待っています' : '自分のターンに召喚できます'
    const currentCard = 'instanceId' in card ? s.pHand.find(item => item.instanceId === card.instanceId) : undefined
    if (!currentCard) return 'このカードは手札にありません'
    const availableSacrifices = Math.min(getSacrificeLimit(currentCard), countNamahamu(s.pField))
    if (s.pField.length - availableSacrifices >= FIELD_MAX) return '机がいっぱいです（8枚まで）'
    if (s.pAP < currentCard.cost) return `APがあと${currentCard.cost - s.pAP}必要です`
    return undefined
  }
  const currentInspect = inspect && inspect.remainingTurns === undefined
    ? { ...inspect, canPlay: !playBlockedReason(inspect.card) && (mode !== 'online' || inspect.canPlay), playBlockedReason: playBlockedReason(inspect.card) }
    : inspect
  const selectedCard = currentInspect?.card
  const selectedOwnerIsOpponent = currentInspect?.owner === 'opponent'
  const selectedAttack = selectedCard ? currentInspect?.actualAttack ?? selectedCard.attack
    + cardAttackBuff(selectedCard, selectedOwnerIsOpponent ? s.cAttackBuff : s.pAttackBuff)
    + (selectedCard.archetype.includes('hikari') ? selectedOwnerIsOpponent ? s.cKiretaStack : s.pKiretaStack : 0)
    + (selectedCard.base === '生ハム' && hasNamahamuAura(selectedOwnerIsOpponent ? s.cField : s.pField) ? 2 : 0) : 0
  // 生贄・対象指定・防御予約は、従来の詳細シートで選んでから確定する。
  const needsPlayOptions = !!selectedCard && (getDefenseCost(selectedCard) > 0
    || selectedCard.effect === 'destroy_enemy_persist_1'
    || (getSacrificeLimit(selectedCard) > 0 && countNamahamu(s.pField) > 0))

  const winnerLabel = mode !== 'cpu'
    ? (s.winner === 'player' ? `P${s.activePlayer}の勝利！` : `P${s.activePlayer === 1 ? 2 : 1}の勝利！`)
    : (s.winner === 'player' ? '勝利！' : '敗北…')

  return (
    <div className="battle-viewport" onPointerDownCapture={prepareGameAudio} onKeyDownCapture={prepareGameAudio}>
    <div className="battle-board" style={{ background: C.bgMain, color: C.txtPri }}>
      <div className="battle-layout" ref={layoutRef} inert={s.phase === 'pass'}>
        <header className="battle-overview">
          <div className="battle-phase-bar">
            <span className="battle-turn-number">ターン {s.turn}</span>
            <strong role="status">{phaseLabel}</strong>
            <span className="battle-phase-hint">お腹が100で負け</span>
          </div>
          <div className="battle-status-grid">
            <PlayerStatusPanel label={`相手 · ${opponentLabel}`} isOpponent
              gari={s.cGari}
              belly={s.cBelly} ap={s.cAP} maxAP={s.cMaxAP} fieldDamage={opponentDmg}
              handCount={s.cHandCount} deckCount={s.cDeckCount} {...opponentStatus}
              compactControl={<button type="button" onClick={() => setStatusSide('opponent')}>状態・コンボ</button>}
              digestStopTurns={s.cDigestStopTurns} apNextBonus={s.cApNextBonus} />
            <PlayerStatusPanel label={mode === 'cpu' ? 'あなた' : `あなた · ${activeLabel}`}
              gari={s.pGari}
              belly={s.pBelly} ap={s.pAP} maxAP={s.pMaxAP} fieldDamage={previewDmg}
              handCount={s.pHand.length} deckCount={s.pDeckCount} {...playerStatus}
              compactControl={<><ComboStatusBar st={playerStatus} inline hideKireta /><button type="button" onClick={() => setStatusSide('player')}>状態・コンボ</button></>}
              deckControl={['player', 'cpu', 'waiting', 'animating', 'syncing'].includes(s.phase) && !s.pendingAttack && !s.pendingReaction && !comboAnim
                ? <DeckInspector key={`${s.activePlayer}:${s.turn}:${s.phase}`} entries={s.pDeckSummary} count={s.pDeckCount} />
                : undefined}
              digestStopTurns={s.pDigestStopTurns} apNextBonus={s.pApNextBonus} />
          </div>
        </header>

        <div className="battle-arena" ref={arenaRef} role="region" aria-label="机と手札" tabIndex={0}>
          <div className="battle-tables">
            <div className="battle-player-area">
              <BattleTable label={opponentLabel} cards={s.cField} combosFired={s.cCombosFired} isEnemy
                attackBuff={s.cAttackBuff} kiretaStack={s.cKiretaStack} enemyBelly={s.pBelly} nikuMatsuri={s.cNikuMatsuri}
                floats={floats.filter(item => item.target === 'cpu')} flash={s.flash === 'cpu'}
                onShowStatus={() => setStatusSide('opponent')}
                onInspect={(card, actualAttack) => setInspect({ card, canPlay: false, remainingTurns: card.turnsLeft, actualAttack, owner: 'opponent' })}>
                <ComboStatusBar st={opponentStatus} />
              </BattleTable>
              <BattleSideMenuSlot label={opponentLabel} menu={s.cSideMenu}
                detailsResetKey={`${s.phase}:${s.turn}:${s.activePlayer}`} />
            </div>
            <div className="battle-player-area">
              <BattleTable label={activeLabel} cards={s.pField} combosFired={s.pCombosFired}
                attackBuff={s.pAttackBuff} kiretaStack={s.pKiretaStack} enemyBelly={s.cBelly} nikuMatsuri={s.pNikuMatsuri}
                floats={floats.filter(item => item.target === 'player')} flash={s.flash === 'player'}
                onShowStatus={() => setStatusSide('player')}
                onInspect={(card, actualAttack) => setInspect({ card, canPlay: false, remainingTurns: card.turnsLeft, actualAttack, owner: 'player' })}>
                <ComboStatusBar st={playerStatus} />
              </BattleTable>
              <BattleSideMenuSlot label={activeLabel} menu={s.pSideMenu} canAct={isPlayerTurn}
                ap={s.pAP} maxAP={s.pMaxAP} onUse={useSideMenu}
                detailsResetKey={`${s.phase}:${s.turn}:${s.activePlayer}`} />
            </div>
          </div>
          <section className="battle-hand-section" ref={handRef} aria-label="手札エリア" tabIndex={-1}>
            <header className="battle-table-heading">
              <h2>あなたの手札 <span>{s.pHand.length}枚</span></h2>
              <span>{isPlayerTurn ? isCompact ? '選んで右から召喚' : 'カードを押して召喚' : 'カードを押して詳細を確認'}</span>
            </header>
            <div className="battle-hand" role="region" aria-label="手札" tabIndex={0}>
              {s.pHand.length === 0
                ? <p className="battle-empty-field">手札がありません</p>
                : s.pHand.map(card => <HandSushi key={card.instanceId} card={card} combosFired={s.pCombosFired}
                  namahamuBoost={hasNamahamuAura(s.pField)}
                  canPlay={!playBlockedReason(card)} attackBuff={s.pAttackBuff} kiretaStack={s.pKiretaStack}
                  isSelected={inspect?.card === card}
                  onSelect={() => {
                    setDetailsOpen(false)
                    setInspect({ card, canPlay: !playBlockedReason(card), playBlockedReason: playBlockedReason(card) })
                  }} />)}
            </div>
          </section>
        </div>

        <footer className="battle-actions" ref={actionsRef}>
          <div className="battle-compact-phase battle-compact-only">
            <span>ターン {s.turn}</span><strong role={isCompact ? 'status' : undefined}>{phaseLabel}</strong>
          </div>
          <section className="battle-selection battle-compact-only" aria-label="選択中のカード" aria-live="polite">
            {currentInspect ? <>
              <span>選択中</span>
              <h2>{currentInspect.card.name}</h2>
              <p>{currentInspect.card.type === 'persist' ? '持続' : '即時'} · 攻撃 {selectedAttack}</p>
              {currentInspect.card.type === 'persist' && <p>{currentInspect.remainingTurns !== undefined ? `残り ${currentInspect.remainingTurns}` : currentInspect.card.fullness} ターン</p>}
              <p><CardEffectText card={currentInspect.card} variant="short" combosFired={selectedOwnerIsOpponent ? s.cCombosFired : s.pCombosFired} /></p>
              {currentInspect.playBlockedReason && <small>{currentInspect.playBlockedReason}</small>}
            </> : <><span>カードを選択</span><p>手札をタップして<br />ここから召喚できます</p></>}
          </section>
          <button className="battle-quick-play battle-compact-only" disabled={!currentInspect?.canPlay}
            onClick={() => {
              if (!currentInspect?.canPlay) return
              if (needsPlayOptions) setDetailsOpen(true)
              else playCard(currentInspect.card)
            }}>
            <strong>{needsPlayOptions ? '召喚方法を選ぶ' : '召喚する'}</strong><span>{currentInspect ? `AP −${currentInspect.card.cost}` : '手札を選んでください'}</span>
          </button>
          <button className="battle-selection-detail battle-compact-only" disabled={!currentInspect} onClick={() => setDetailsOpen(true)}>詳細</button>
          <button className="battle-hand-jump" onClick={toggleHand}>
            {handInView ? '盤面へ戻る' : <>手札へ <strong>{s.pHand.length}枚</strong></>}
          </button>
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
        {currentInspect && (!isCompact || detailsOpen || currentInspect.remainingTurns !== undefined) && (
          <CardDetailSheet
            key={'instanceId' in currentInspect.card ? String(currentInspect.card.instanceId) : currentInspect.card.id}
            inspect={currentInspect}
            fieldCards={currentInspect.owner === 'opponent' ? s.cField : s.pField}
            combosFired={currentInspect.owner === 'opponent' ? s.cCombosFired : s.pCombosFired}
            enemyFieldCards={s.cField}
            enemyCardAttack={card => calcFieldDmg([card], s.cAttackBuff, s.cKiretaStack, s.pBelly, {
              gunkanBoost: makimonoCount(s.cField) >= MAKI_COMP_5,
              namahamuBoost: hasNamahamuAura(s.cField),
            })}
            sacrificeAttackBonus={s.pSideMenu?.id === 'inbound_don' && s.pSideMenu.status === 'active' ? INBOUND_DON_SACRIFICE_BONUS : 0}
            attackBuff={currentInspect.owner === 'opponent' ? s.cAttackBuff : s.pAttackBuff}
            kiretaStack={currentInspect.owner === 'opponent' ? s.cKiretaStack : s.pKiretaStack}
            kiretaSpent={s.pKiretaSpent}
            onPlay={(count, targetFieldId, reserveDefense) => { if (currentInspect?.canPlay) playCard(currentInspect.card, count, targetFieldId, reserveDefense) }}
            onClose={() => {
              setDetailsOpen(false)
              if (!isCompact || currentInspect.remainingTurns !== undefined) setInspect(null)
            }}
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

      {s.pendingReaction && isReactionDefender && (s.phase === 'reacting' || s.phase === 'syncing') && (
        <HikariDefensePrompt reaction={s.pendingReaction}
          defenseCard={s.pField.find(card => card.fid === s.pendingReaction!.defenseCardId)}
          enemyField={s.cField} attackBuff={s.cAttackBuff} kiretaStack={s.cKiretaStack} enemyBelly={s.pBelly}
          ready={s.phase === 'reacting'} onRespond={respondReaction}
          onLeave={mode === 'online' ? onBack : undefined} />
      )}

      {s.pendingAttack && isDefender && (s.phase === 'defending' || s.phase === 'syncing') && (
        <DefensePrompt attack={s.pendingAttack} belly={s.pBelly} gari={s.pGari}
          key={`${s.turn}:${s.pendingAttack.attackerId}:${s.pendingAttack.source}:${s.pendingAttack.amount}:${s.pendingAttack.defenseCardId ?? ''}`}
          defenseCard={s.pField.find(card => card.fid === s.pendingAttack!.defenseCardId)}
          enemyField={s.cField} attackBuff={s.cAttackBuff} kiretaStack={s.cKiretaStack}
          ready={s.phase === 'defending'} onRespond={respondDefense}
          onLeave={mode === 'online' ? onBack : undefined} />
      )}

      {/* ══ パス画面（二人対戦） ══ */}
      <AnimatePresence>
        {s.phase === 'pass' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 50,
              background: '#1c130c',
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
                P{s.passToPlayerId} {s.pendingAttack || s.pendingReaction ? 'の防御です' : 'の番です'}
              </p>
              <p style={{ fontSize: R.fmd, color: '#a8a29e', marginBottom: 32, lineHeight: 1.7 }}>
                デバイスを P{s.passToPlayerId} に渡してください
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
              sideMenuEnabled={canReorderSideMenu(s.pSideMenu)}
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
