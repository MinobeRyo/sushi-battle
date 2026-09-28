import type { Card } from '../../types'
import { useBattleGame } from './useBattleGame'
import { calcFieldDmg, FIELD_MAX, REORDER_BUDGET, REORDER_SECONDS } from './battleEngine'
import { C, R } from './battlePresentation'
import { BellyGauge, ComboStatusBar } from './BattleStatus'
import { AnimatePresence, motion } from 'framer-motion'
import { FieldSushi, HandSushi, CardDetailSheet } from './BattleCards'
import { DraftScreenThree } from '../draft/DraftScreenThree'
import { ComboCutIn } from './ComboCutIn'
import './BattleScreen.css'

export function BattleScreen({
  deck,
  p2Deck,
  mode = 'cpu',
  onBack,
}: {
  deck: Card[]
  p2Deck?: Card[]
  mode?: 'cpu' | 'two_player'
  onBack?: () => void
}) {
  const game = useBattleGame({ deck, p2Deck, mode })
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
    playCard, endTurn, handlePassReady, handleReorderComplete, restart,
  } = game

  // ── 表示用計算 ────────────────────────────────────────────────────────────
  const isPlayerTurn = s.phase === 'player'
  const previewDmg = calcFieldDmg(s.pField, s.pAttackBuff, s.pKiretaStack, s.cBelly, { nikuMatsuri: s.pNikuMatsuri })

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
  const opponentEmoji = mode !== 'cpu' ? '👤' : '💻'
  const activeLabel = mode !== 'cpu' ? `P${s.activePlayer}` : 'あなた'

  const winnerLabel = mode !== 'cpu'
    ? (s.winner === 'player' ? `P${s.activePlayer}の勝利！` : `P${s.activePlayer === 1 ? 2 : 1}の勝利！`)
    : (s.winner === 'player' ? '勝利！' : '敗北…')

  return (
    <div className="battle-viewport">
    <div className="battle-board" style={{
      height: '100%',
      background: C.bgMain, color: C.txtPri,
      overflow: 'hidden', userSelect: 'none', position: 'relative',
    }}>

      {/* ══ 相手エリア ══ */}
      <div className="battle-side battle-opponent">
        <div className="battle-status battle-opponent-status">
          <span className="battle-avatar" style={{ fontSize: R.flg, flexShrink: 0 }}>{opponentEmoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}><BellyGauge value={s.cBelly} label={`${opponentLabel} お腹`} flip /></div>
          <div className="battle-opponent-combos" style={{ flexShrink: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end', overflow: 'hidden' }}>
            <ComboStatusBar compact inline st={{
              summonedIds: s.cSummonedIds, combosFired: s.cCombosFired, field: s.cField,
              attackBuff: s.cAttackBuff, drawBonus: s.cDrawBonus,
              kireta: s.cKiretaStack, kiretaSpent: s.cKiretaSpent, nikuMatsuri: s.cNikuMatsuri,
            }} />
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <p style={{ fontSize: R.fxs, color: C.txtMut }}>手札 {s.cHandCount} 枚</p>
            <p style={{ fontSize: R.fxs, color: C.txtMut }}>山札 {s.cDeckCount} 枚</p>
          </div>
        </div>
        <div className="battle-field battle-opponent-field" style={{
          background: C.bgAreaCpu, border: `1px solid ${C.fieldBorder}`,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <span className="battle-field-label" style={{ position: 'absolute', top: 'clamp(7px, 0.8vh, 11px)', left: 'clamp(12px, 1.2vw, 18px)', fontSize: R.fxs, color: C.txtMut, fontWeight: 700, letterSpacing: 1 }}>{opponentLabel} の机</span>
          <AnimatePresence>
            {s.cField.map(c => (
              <FieldSushi key={c.fid} card={c} isEnemy
                onSelect={() => setInspect({ card: c, canPlay: false, remainingTurns: c.turnsLeft })}
              />
            ))}
          </AnimatePresence>
          {s.cField.length === 0 && <span style={{ fontSize: R.fsm, color: C.apEmpty }}>空</span>}
        </div>
        <AnimatePresence>
          {floats.filter(f => f.target === 'cpu').map(f => (
            <motion.div key={f.id}
              initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.8 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: R.flg, fontWeight: 900, color: '#dc2626', textShadow: '0 0 24px rgba(220,38,38,0.7)', pointerEvents: 'none', zIndex: 20, letterSpacing: 1 }}
            >-{f.dmg}</motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {s.flash === 'cpu' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.35, 0] }} transition={{ duration: 0.5 }}
              style={{ position: 'absolute', inset: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10, borderRadius: 12 }} />
          )}
        </AnimatePresence>
      </div>

      {/* ══ カウンター席 ══ */}
      <div className="battle-counter" style={{
        background: C.counter,
        borderTop: `2px solid ${C.counterTop}`, borderBottom: `2px solid ${C.counterBot}`,
        position: 'relative',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25, backgroundImage: 'repeating-linear-gradient(90deg,transparent,transparent 80px,rgba(255,255,255,0.5) 80px,rgba(255,255,255,0.5) 82px)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 5, background: 'rgba(0,0,0,0.12)', transform: 'translateY(-50%)', borderRadius: 2 }} />
        {/* 狭い画面ではラベルを畳んでコンボ進捗の幅を確保する */}
        <span className="battle-counter-label hidden sm:inline" style={{ fontSize: R.fsm, color: '#5c3a0a', fontWeight: 700, zIndex: 1, textShadow: '0 1px 2px rgba(255,255,255,0.4)', flexShrink: 0 }}>🍵 カウンター席</span>
        {/* コンボ進捗（切れ味スタックもここに含む） */}
        <div style={{ flex: 1, minWidth: 0, zIndex: 1, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
          <ComboStatusBar inline onGold st={{
            summonedIds: s.pSummonedIds, combosFired: s.pCombosFired, field: s.pField,
            attackBuff: s.pAttackBuff, drawBonus: s.pDrawBonus,
            kireta: s.pKiretaStack, kiretaSpent: s.pKiretaSpent, nikuMatsuri: s.pNikuMatsuri,
          }} />
        </div>
        {previewDmg > 0 && (
          <motion.span initial={{ scale: 0.7 }} animate={{ scale: 1 }}
            style={{ zIndex: 1, fontSize: R.fsm, color: '#fff', fontWeight: 800, background: '#dc2626', borderRadius: 8, padding: 'clamp(2px,0.3vh,5px) clamp(8px,1vw,14px)', boxShadow: '0 2px 8px rgba(220,38,38,0.4)' }}>
            ⚔ {previewDmg}
          </motion.span>
        )}
        <span style={{ zIndex: 1, fontSize: R.fsm, color: '#5c3a0a', fontWeight: 800, background: 'rgba(255,255,255,0.45)', borderRadius: 8, padding: 'clamp(2px,0.3vh,5px) clamp(8px,1vw,14px)' }}>T{s.turn}</span>
        <span style={{ zIndex: 1, fontSize: R.fsm, fontWeight: 700, color: isPlayerTurn ? '#7c2d12' : '#a89070' }}>{phaseLabel}</span>
      </div>

      {/* ══ プレイヤーエリア ══ */}
      <div className="battle-side battle-player">
        <div className="battle-field battle-player-field" style={{
          background: C.bgArea, border: `1px solid ${C.fieldBorder}`,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <span className="battle-field-label" style={{ position: 'absolute', top: 'clamp(7px, 0.8vh, 11px)', left: 'clamp(12px, 1.2vw, 18px)', fontSize: R.fxs, color: C.txtMut, fontWeight: 700, letterSpacing: 1 }}>
            {activeLabel} の机
          </span>
          <AnimatePresence>
            {s.pField.map(c => (
              <FieldSushi key={c.fid} card={c}
                onSelect={() => setInspect({ card: c, canPlay: false, remainingTurns: c.turnsLeft })}
              />
            ))}
          </AnimatePresence>
          {s.pField.length === 0 && <span style={{ fontSize: R.fsm, color: C.apEmpty, paddingTop: 'clamp(8px, 1vh, 16px)' }}>空</span>}
        </div>
        <div className="battle-status battle-player-status">
          <span className="battle-avatar" style={{ fontSize: R.flg, flexShrink: 0 }}>🍱</span>
          <div style={{ flex: 1 }}><BellyGauge value={s.pBelly} label={`${activeLabel} お腹`} /></div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', gap: 'clamp(3px, 0.4vw, 6px)', flexWrap: 'wrap', maxWidth: 'clamp(80px, 10vw, 160px)', justifyContent: 'flex-end' }}>
              {Array.from({ length: s.pMaxAP }, (_, i) => (
                <div key={i} style={{
                  width: R.dot, height: R.dot, maxWidth: 15, maxHeight: 15, borderRadius: '50%',
                  background: i < s.pAP ? C.ap : C.apEmpty,
                  border: `1px solid ${i < s.pAP ? C.apBorder : '#c4b4a0'}`,
                  boxShadow: i < s.pAP ? '0 0 6px rgba(217,119,6,0.6)' : 'none',
                }} />
              ))}
            </div>
            <span style={{ fontSize: R.fxs, color: C.txtSec, fontWeight: 600 }}>{s.pAP}/{s.pMaxAP} AP</span>
          </div>
        </div>
        <AnimatePresence>
          {floats.filter(f => f.target === 'player').map(f => (
            <motion.div key={f.id}
              initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.8 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: R.flg, fontWeight: 900, color: '#dc2626', textShadow: '0 0 24px rgba(220,38,38,0.7)', pointerEvents: 'none', zIndex: 20, letterSpacing: 1 }}
            >-{f.dmg}</motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {s.flash === 'player' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.3, 0] }} transition={{ duration: 0.5 }}
              style={{ position: 'absolute', inset: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10, borderRadius: 12 }} />
          )}
        </AnimatePresence>
      </div>

      {/* ══ アクションバー ══ */}
      <div className="battle-actions" style={{
        background: C.bgAction, borderTop: '1px solid #d4c4ae',
      }}>
        <button onClick={() => setShowLog(v => !v)}
          style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
          <p style={{ fontSize: R.fxs, color: C.txtSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📜 {s.log[0] ?? ''}
          </p>
        </button>
        <motion.button
          className="battle-end-turn"
          onClick={endTurn}
          disabled={!isPlayerTurn}
          whileTap={isPlayerTurn ? { scale: 0.91 } : {}}
          style={{
            flexShrink: 0, padding: 'clamp(9px, 1.2vh, 16px) clamp(18px, 2.5vw, 36px)',
            borderRadius: 999, fontSize: R.fsm, fontWeight: 800,
            background: isPlayerTurn ? C.btnEnd : '#d4c4ae',
            color: isPlayerTurn ? '#fff' : '#a89070',
            border: `1.5px solid ${isPlayerTurn ? C.btnEndBorder : '#c4b4a0'}`,
            cursor: isPlayerTurn ? 'pointer' : 'default',
            boxShadow: isPlayerTurn ? `0 0 20px ${C.btnEndGlow}` : 'none',
            outline: 'none',
          }}
        >
          {s.phase === 'animating' ? '攻撃中…' : s.phase === 'cpu' ? 'CPU思考中…' : 'ターン終了'}
        </motion.button>
      </div>

      {/* ══ 手札 ══ */}
      <div className="battle-hand" style={{
        background: C.bgHand, borderTop: '1px solid #ccc0a8',
        boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.08)',
      }}>
        {s.pHand.length === 0
          ? <p style={{ fontSize: R.fmd, color: C.txtMut }}>手札がありません</p>
          : s.pHand.map((card) => (
            <HandSushi key={card.instanceId} card={card}
              canPlay={isPlayerTurn && s.pAP >= card.cost && s.pField.length < FIELD_MAX}
              attackBuff={s.pAttackBuff}
              kiretaStack={s.pKiretaStack}
              isSelected={inspect?.card === card}
              onSelect={() => setInspect({
                card,
                canPlay: isPlayerTurn && s.pAP >= card.cost && s.pField.length < FIELD_MAX,
              })}
            />
          ))
        }
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
        {inspect && (
          <CardDetailSheet
            inspect={inspect}
            attackBuff={s.pAttackBuff}
            kiretaStack={s.pKiretaStack}
            onPlay={() => playCard(inspect.card)}
            onClose={() => setInspect(null)}
          />
        )}
      </AnimatePresence>

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
            style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div initial={{ scale: 0.4, y: 32 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 14, stiffness: 180 }} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 'clamp(60px, 12vw, 120px)', marginBottom: 16 }}>{s.winner === 'player' ? '🎉' : '😔'}</p>
              <p style={{ fontSize: 'clamp(24px, 4.5vw, 56px)', fontWeight: 700, color: '#fff', marginBottom: 8 }}>{winnerLabel}</p>
              <p style={{ fontSize: R.fmd, color: '#a89070', marginBottom: 32 }}>{s.turn} ターンで決着</p>
              <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', justifyContent: 'center' }}>
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
