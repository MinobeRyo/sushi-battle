import { useRef, useReducer } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CARDS } from '../../data/cards'
import type { Card } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldCard = Card & { fid: string; turnsLeft: number }

type Phase = 'player' | 'animating' | 'cpu' | 'over'

type S = {
  pHand: Card[]; pField: FieldCard[]; pDeck: Card[]
  pBelly: number; pAP: number; pMaxAP: number
  // 召喚累計（役判定用）
  pSummonedIds: string[]        // 召喚したcard.idの履歴
  pSummonedBases: Record<string, number> // base別召喚回数
  pDrawBonus: number            // 毎ターン追加ドロー枚数（役効果）
  cHand: Card[]; cField: FieldCard[]; cDeck: Card[]
  cBelly: number
  turn: number; phase: Phase; winner: 'player' | 'cpu' | null
  log: string[]
  flash: 'cpu' | 'player' | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BELLY = 100
const HAND_LIMIT = 7
const FIELD_MAX = 8
const INIT_AP = 3
const DIGESTION = 5  // ターン開始時のお腹回復量

const CARD_EMOJI: Record<string, string> = {
  'マグロ': '🐟', 'サーモン': '🐠', 'えび': '🦐', 'いか': '🦑', 'たこ': '🐙',
  'たまご': '🥚', 'きゅうり': '🥒', 'かんぴょう': '🌿', 'サバ': '🐡',
  'アジ': '🐟', 'コハダ': '🐡', 'イワシ': '🐟', '和牛': '🥩', 'カルビ': '🥩',
  'うに': '🌟', 'いくら': '🔴', 'とびこ': '🟠', 'コーン': '🌽',
  'シーフード': '🦞', 'なす': '🍆', '明太子': '🔴', 'チーズ': '🧀',
  '納豆': '🫘', 'うめ': '🍑', 'アボカド': '🥑', 'かに': '🦀',
  'ネギトロ': '🐟', '太巻き': '🌿',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let fidN = 0
const toField = (c: Card): FieldCard => ({
  ...c,
  fid: `${c.id}-${++fidN}`,
  turnsLeft: c.type === 'persistent' ? Math.max(c.fullness, 2) : 1,
})

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function cardEmoji(card: Card): string {
  return CARD_EMOJI[card.base] ?? '🍣'
}

// ── CPU ───────────────────────────────────────────────────────────────────────

function getCpuDeck(): Card[] {
  const ids = [
    'tamago', 'salmon', 'ebi', 'mentaiko', 'cheese', 'wasabi_nasu',
    'corn_gunkan', 'seafood_gunkan', 'botan_ebi',
  ]
  const found = ids.map(id => CARDS.find(c => c.id === id)).filter(Boolean) as Card[]
  const extra = CARDS.filter(c => c.lane === 'general' && !found.some(f => f.id === c.id))
  return shuffled([...found, ...extra]).slice(0, 15)
}

function cpuChoose(hand: Card[], ap: number): Card[] {
  const sorted = [...hand].sort((a, b) => b.attack - a.attack)
  const played: Card[] = []
  let rem = ap
  for (const c of sorted) {
    if (c.cost <= rem && played.length < FIELD_MAX) { played.push(c); rem -= c.cost }
  }
  return played
}

// ── Initial state ─────────────────────────────────────────────────────────────

function initState(deck: Card[]): S {
  const pDeck = shuffled(deck.length > 0 ? deck : CARDS.filter(c => c.lane === 'general').slice(0, 10))
  const cpuAll = shuffled(getCpuDeck())
  return {
    pHand: pDeck.slice(0, 5), pField: [], pDeck: pDeck.slice(5),
    pBelly: 0, pAP: INIT_AP, pMaxAP: INIT_AP,
    pSummonedIds: [], pSummonedBases: {}, pDrawBonus: 0,
    cHand: cpuAll.slice(0, 5), cField: [], cDeck: cpuAll.slice(5),
    cBelly: 0,
    turn: 1, phase: 'player', winner: null,
    log: ['─── バトル開始! ターン1 ───'],
    flash: null,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BellyGauge({ value, label }: { value: number; label: string }) {
  const pct = Math.min(value / MAX_BELLY, 1)
  const col = pct < 0.4 ? '#22c55e' : pct < 0.7 ? '#f59e0b' : '#ef4444'
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-stone-400">{label}</span>
        <span style={{ color: col }} className="font-bold tabular-nums">{value}/{MAX_BELLY}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#1c1917' }}>
        <motion.div className="h-full rounded-full" animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.4 }} style={{ background: col }} />
      </div>
    </div>
  )
}

function FieldSlot({ card }: { card: FieldCard }) {
  const isPersist = card.type === 'persistent'
  return (
    <motion.div initial={{ scale: 0, y: -16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0, opacity: 0 }}
      className="flex flex-col items-center rounded-lg p-1.5 flex-shrink-0"
      style={{
        width: 58,
        background: isPersist ? '#0c1a0c' : '#1c1208',
        border: `1.5px solid ${isPersist ? '#15803d' : '#92400e'}`,
      }}>
      <span className="text-lg leading-none">{cardEmoji(card)}</span>
      <span className="text-[8px] text-stone-300 font-bold text-center mt-0.5 leading-tight"
        style={{ maxWidth: 54 }}>{card.name.slice(0, 7)}</span>
      <div className="flex gap-1 mt-0.5">
        <span className="text-[8px] text-red-400 font-bold">⚔{card.attack}</span>
        {isPersist && <span className="text-[8px] text-green-400 font-bold">×{card.turnsLeft}</span>}
      </div>
    </motion.div>
  )
}

function HandCard({ card, canPlay, onPlay }: { card: Card; canPlay: boolean; onPlay: () => void }) {
  return (
    <motion.button onClick={canPlay ? onPlay : undefined} whileTap={canPlay ? { scale: 0.93 } : {}}
      className="flex-shrink-0 flex flex-col rounded-lg overflow-hidden"
      style={{
        width: 56, height: 82,
        background: canPlay ? '#1c1208' : '#0c0a09',
        border: `2px solid ${canPlay ? '#92400e' : '#292524'}`,
        opacity: canPlay ? 1 : 0.38,
        cursor: canPlay ? 'pointer' : 'default',
      }}>
      <div className="flex items-center justify-between px-1.5 pt-1">
        <span className="text-[9px] text-amber-400 font-bold">{card.cost}AP</span>
        <span className="text-[8px]">{card.type === 'instant' ? '⚡' : '🔄'}</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-xl">{cardEmoji(card)}</div>
      <div className="pb-1 px-1">
        <p className="text-[8px] text-stone-300 font-bold text-center leading-tight">{card.name.slice(0, 6)}</p>
        <p className="text-[8px] text-red-400 font-bold text-center">⚔{card.attack}</p>
      </div>
    </motion.button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function BattleScreen({ deck }: { deck: Card[] }) {
  const ref = useRef<S>(initState(deck))
  const [, tick] = useReducer(n => n + 1, 0)
  const s = ref.current

  const set = (patch: Partial<S>) => { Object.assign(ref.current, patch); tick() }
  const addLog = (msg: string) => { ref.current.log = [msg, ...ref.current.log].slice(0, 30) }

  const draw = (hand: Card[], deck: Card[], n: number): [Card[], Card[]] => {
    const drawn = deck.slice(0, n)
    return [[...hand, ...drawn].slice(0, HAND_LIMIT), deck.slice(n)]
  }

  const checkWin = (pBelly: number, cBelly: number): boolean => {
    if (pBelly >= MAX_BELLY) { set({ winner: 'cpu', phase: 'over' }); return true }
    if (cBelly >= MAX_BELLY) { set({ winner: 'player', phase: 'over' }); return true }
    return false
  }

  const playCard = (card: Card) => {
    const { pAP, pField, pHand, phase, pSummonedIds, pSummonedBases } = ref.current
    if (phase !== 'player') return
    if (pAP < card.cost) return
    if (pField.length >= FIELD_MAX) return

    const newField = [...pField, toField(card)]
    const newHand = pHand.filter(c => c !== card)
    const newIds = [...pSummonedIds, card.id]
    const newBases = { ...pSummonedBases, [card.base]: (pSummonedBases[card.base] ?? 0) + 1 }

    addLog(`あなた: ${cardEmoji(card)}${card.name} 召喚 (${card.cost}AP / ⚔${card.attack})`)
    set({ pField: newField, pHand: newHand, pAP: pAP - card.cost, pSummonedIds: newIds, pSummonedBases: newBases })
  }

  const endTurn = () => {
    if (ref.current.phase !== 'player') return
    set({ phase: 'animating' })

    setTimeout(() => {
      const { pField, cBelly, pDeck, pHand, pDrawBonus, turn } = ref.current

      // 全フィールドカードが攻撃
      const totalDmg = pField.reduce((sum, c) => sum + c.attack, 0)
      addLog(`あなたの攻撃: ${totalDmg}ダメージ → CPU`)
      const newCBelly = cBelly + totalDmg
      set({ flash: 'cpu', cBelly: newCBelly })
      setTimeout(() => set({ flash: null }), 500)

      if (checkWin(ref.current.pBelly, newCBelly)) return

      // 即時型を除去、持続型のターンを減らす
      const newPField = pField
        .map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 }))
        .filter(c => c.turnsLeft > 0)

      // ドロー（通常1枚 + 役ボーナス）
      const [h1, d1] = draw(pHand, pDeck, 1 + pDrawBonus)
      set({ pField: newPField, pHand: h1, pDeck: d1, phase: 'cpu' })
      addLog('CPU のターン')

      setTimeout(() => {
        // CPU ターン開始: 消化-5
        const { cHand, cField, cBelly: cb2, pBelly, cDeck } = ref.current
        const cpuBellyAfterDigest = Math.max(0, cb2 - DIGESTION)
        if (cpuBellyAfterDigest < cb2) addLog(`CPU 消化: お腹 −${DIGESTION}`)

        const newTurn = turn + 1
        const cpuMaxAP = Math.min(INIT_AP + newTurn - 1, 10)
        const toPlay = cpuChoose(cHand, cpuMaxAP)

        let newCField = [...cField]
        if (toPlay.length > 0) {
          addLog(`CPU: ${toPlay.map(c => c.name).join('・')} 召喚`)
          newCField = [...cField, ...toPlay.map(toField)].slice(0, FIELD_MAX)
        } else {
          addLog('CPU: パス')
        }

        const cpuDmg = newCField.reduce((sum, c) => sum + c.attack, 0)
        addLog(`CPU攻撃: ${cpuDmg}ダメージ → あなた`)
        const newPBelly = pBelly + cpuDmg
        set({ flash: 'player', cBelly: cpuBellyAfterDigest, pBelly: newPBelly })
        setTimeout(() => set({ flash: null }), 500)

        if (checkWin(newPBelly, ref.current.cBelly)) return

        // CPU フィールド処理、ドロー
        const nextCField = newCField
          .map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 }))
          .filter(c => c.turnsLeft > 0)
        const newCHand = cHand.filter(c => !toPlay.includes(c))
        const [nextCHand, nextCDeck] = draw(newCHand, cDeck, 1)

        // プレイヤーターン開始: 消化-5
        const { pBelly: pb2, pField: pf2 } = ref.current
        const pBellyAfterDigest = Math.max(0, pb2 - DIGESTION)
        if (pBellyAfterDigest < pb2) addLog(`あなた 消化: お腹 −${DIGESTION}`)

        const nextMaxAP = Math.min(INIT_AP + newTurn - 1, 10)
        addLog(`─── ターン${newTurn} 開始 (AP最大${nextMaxAP}) ───`)
        set({
          cField: nextCField, cHand: nextCHand, cDeck: nextCDeck,
          pBelly: pBellyAfterDigest,
          turn: newTurn, pAP: nextMaxAP, pMaxAP: nextMaxAP,
          phase: 'player',
        })
      }, 1000)
    }, 200)
  }

  const isPlayerTurn = s.phase === 'player'
  const phaseText = {
    player: 'カードを出してターン終了',
    animating: '攻撃中...',
    cpu: 'CPU思考中...',
    over: s.winner === 'player' ? '🎉 勝利!' : '😔 敗北...',
  }[s.phase]

  return (
    <div className="h-full flex flex-col overflow-hidden select-none"
      style={{ background: '#0d0d0d', color: '#e7e5e4' }}>

      {/* CPU area */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2"
        style={{ background: '#1a0e06', borderBottom: '1px solid #292524' }}>
        <BellyGauge value={s.cBelly} label={`💻 CPU お腹　手札${s.cHand.length}枚`} />
        <div className="relative mt-2 flex gap-1.5 min-h-[70px] items-center">
          <AnimatePresence>
            {s.cField.map(c => <FieldSlot key={c.fid} card={c} />)}
          </AnimatePresence>
          {s.cField.length === 0 && <span className="text-stone-700 text-xs">フィールドは空</span>}
          {s.flash === 'cpu' && (
            <motion.div className="absolute inset-0 rounded-lg pointer-events-none z-10 flex items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: [0, 0.7, 0] }} transition={{ duration: 0.5 }}
              style={{ background: '#ef4444' }}>
              <span className="text-3xl">💥</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5"
        style={{ background: '#111', borderBottom: '1px solid #1c1917' }}>
        <span className="text-stone-600 text-xs">ターン {s.turn}</span>
        <span className="text-amber-500 text-xs font-bold">{phaseText}</span>
        <div className="flex items-center gap-2">
          <span className="text-sky-400 text-xs font-bold">{s.pAP}/{s.pMaxAP} AP</span>
          <motion.button onClick={endTurn} disabled={!isPlayerTurn}
            whileTap={isPlayerTurn ? { scale: 0.93 } : {}}
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{
              background: isPlayerTurn ? '#b45309' : '#292524',
              color: isPlayerTurn ? '#fef3c7' : '#57534e',
              cursor: isPlayerTurn ? 'pointer' : 'default',
            }}>
            ターン終了
          </motion.button>
        </div>
      </div>

      {/* Player field */}
      <div className="flex-shrink-0 px-3 py-2 relative"
        style={{ borderBottom: '1px solid #1c1917' }}>
        <div className="relative flex gap-1.5 min-h-[70px] items-center flex-wrap">
          <AnimatePresence>
            {s.pField.map(c => <FieldSlot key={c.fid} card={c} />)}
          </AnimatePresence>
          {s.pField.length === 0 && <span className="text-stone-700 text-xs">フィールドは空</span>}
          {s.flash === 'player' && (
            <motion.div className="absolute inset-0 rounded-lg pointer-events-none z-10 flex items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: [0, 0.7, 0] }} transition={{ duration: 0.5 }}
              style={{ background: '#ef4444' }}>
              <span className="text-3xl">💥</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Player belly */}
      <div className="flex-shrink-0 px-3 py-2" style={{ borderBottom: '1px solid #1c1917' }}>
        <BellyGauge value={s.pBelly} label="🍱 あなたのお腹" />
      </div>

      {/* Battle log */}
      <div className="flex-1 overflow-y-auto px-3 py-1.5 min-h-0">
        {s.log.map((msg, i) => (
          <p key={i} className={`text-[11px] py-0.5 ${
            msg.startsWith('─') ? 'text-stone-500 font-bold' : 'text-stone-600'
          }`}>{msg}</p>
        ))}
      </div>

      {/* Player hand */}
      <div className="flex-shrink-0 flex gap-2 px-3 py-2 overflow-x-auto"
        style={{ background: '#1a0e06', borderTop: '1px solid #292524' }}>
        {s.pHand.length === 0
          ? <p className="text-stone-600 text-xs py-1">手札がありません</p>
          : s.pHand.map((card, i) => (
            <HandCard key={`${card.id}-${i}`} card={card}
              canPlay={isPlayerTurn && s.pAP >= card.cost && s.pField.length < FIELD_MAX}
              onPlay={() => playCard(card)} />
          ))}
      </div>

      {/* Game over */}
      <AnimatePresence>
        {s.winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)' }}>
            <div className="text-center">
              <p className="text-7xl mb-4">{s.winner === 'player' ? '🎉' : '😔'}</p>
              <p className="text-3xl font-bold mb-3">{s.winner === 'player' ? '勝利!' : '敗北...'}</p>
              <p className="text-stone-400 text-sm">リロードで再挑戦</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
