import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../types'
import { CARDS } from '../../data/cards'
import { BattleScreen, type BattleFinish } from '../battle/BattleScreen'
import { SushiArt } from '../../components/SushiArt'
import { CardEffectText } from '../battle/CardEffectText'
import {
  BOSS_NODE_ID, MAX_RUN_BELLY, REST_DIGEST, RUN_ARCHETYPES, RUN_DRAW_PER_TURN, RUN_OPENING_HAND, RUN_COLS, RUN_ROWS, SKIP_REWARD_GOLD,
  chooseReward, createRun, enterNode, findNode, finishBattle, reachableNodeIds, runDeckCards, takeRest,
  type RunArchetype, type RunNode, type RunState,
} from '../../game/run'
import { clearRun, loadRun, saveRun } from './runStorage'
import './RunScreen.css'

const cardById = new Map(CARDS.map(card => [card.id, card]))

export function RunScreen({ onExit }: { onExit: () => void }) {
  const [saved, setSaved] = useState<RunState | null>(() => loadRun())
  const [run, setRun] = useState<RunState | null>(null)
  const [deckOpen, setDeckOpen] = useState(false)

  // 進むたびに保存する。決着したランは「続きから」に残さない。
  useEffect(() => {
    if (!run) return
    if (run.status === 'won' || run.status === 'lost') clearRun()
    else saveRun(run)
  }, [run])

  if (!run) {
    return <RunStart saved={saved} onExit={onExit}
      onResume={() => { setRun(saved); setSaved(null) }}
      onStart={archetype => { setRun(createRun(archetype)); setSaved(null) }} />
  }

  const node = findNode(run, run.currentNodeId)

  if (run.status === 'battle' && node?.enemy) {
    return <BattleScreen
      key={`${node.id}:${run.visited.length}`}
      deck={runDeckCards(run)}
      cpuDeckId={node.enemy.cpuDeckId}
      initialBelly={{ 1: run.belly, 2: node.enemy.initialBelly }}
      refillOnEmpty
      openingHand={{ 1: RUN_OPENING_HAND }}
      drawBonus={{ 1: RUN_DRAW_PER_TURN - 1 }}
      onFinish={(result: BattleFinish) => setRun(current => current && finishBattle(current, result.won, result.belly))} />
  }

  return (
    <main className="run-screen">
      <RunHeader run={run} onOpenDeck={() => setDeckOpen(true)} />
      <div className="run-body">
        {run.status === 'map' && <RunMap run={run} onEnter={id => setRun(enterNode(run, id))} />}
        {run.status === 'reward' && run.reward && <RunReward run={run} onChoose={id => setRun(chooseReward(run, id))} />}
        {run.status === 'rest' && <RunRest run={run} onRest={() => setRun(takeRest(run))} />}
        {(run.status === 'won' || run.status === 'lost') && <RunResult run={run} onExit={onExit}
          onRetry={() => setRun(null)} />}
      </div>
      {run.status === 'map' && <footer className="run-footer">
        <button type="button" className="run-text-button" onClick={onExit}>中断してお品書きへ</button>
        <span>進むたびに自動で保存されます</span>
      </footer>}
      {deckOpen && <DeckDialog cards={runDeckCards(run)} onClose={() => setDeckOpen(false)} />}
    </main>
  )
}

function RunStart({ saved, onStart, onResume, onExit }: {
  saved: RunState | null
  onStart: (archetype: RunArchetype) => void
  onResume: () => void
  onExit: () => void
}) {
  const [archetype, setArchetype] = useState<RunArchetype>('akami')
  return (
    <main className="run-screen">
      <div className="run-body run-start">
        <header className="run-title">
          <p>ローグライク</p>
          <h1>寿司はしご</h1>
          <span>寿司屋をはしごして、最後に大将へ挑む</span>
        </header>
        {saved && <section className="run-panel run-resume" aria-label="続きから">
          <div>
            <h2>続きから</h2>
            <p>{RUN_ARCHETYPES.find(item => item.id === saved.archetype)?.name}・{saved.visited.length}軒目まで・お腹 {saved.belly}・デッキ {saved.deck.length}枚</p>
          </div>
          <button type="button" className="run-primary" onClick={onResume}>再開する</button>
        </section>}
        <section className="run-panel" aria-labelledby="run-archetype-heading">
          <h2 id="run-archetype-heading">{saved ? '新しく始める' : '最初の系統を選ぶ'}</h2>
          <p className="run-note">汎用10枚に、選んだ系統の寿司3枚を足した13枚で始めます。{saved && '新しく始めると、続きのデータは消えます。'}</p>
          <div className="run-archetypes" role="radiogroup" aria-label="系統">
            {RUN_ARCHETYPES.map(item => (
              <button type="button" key={item.id} role="radio" aria-checked={archetype === item.id}
                className="run-archetype" onClick={() => setArchetype(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
          <button type="button" className="run-primary" onClick={() => onStart(archetype)}>この系統ではしごを始める</button>
        </section>
        <section className="run-panel run-rules" aria-label="遊び方">
          <h2>遊び方</h2>
          <ul>
            <li>地図で次の店を選び、下から上へ進みます。最後は大将との勝負です。</li>
            <li>お腹は試合をまたいで持ち越します。勝つと半分に消化し、100になったら終わりです。</li>
            <li>勝つたびに寿司を3枚から1枚もらえます。山札が尽きたら「おかわり」で使った寿司が戻ります。</li>
            <li>はしごの試合は最初の手札{RUN_OPENING_HAND}枚、毎ターン{RUN_DRAW_PER_TURN}枚引きます。</li>
          </ul>
        </section>
        <button type="button" className="run-text-button" onClick={onExit}>← お品書きへ戻る</button>
      </div>
    </main>
  )
}

function RunHeader({ run, onOpenDeck }: { run: RunState; onOpenDeck: () => void }) {
  const current = findNode(run, run.currentNodeId)
  const floor = current ? (current.id === BOSS_NODE_ID ? '大将' : `${current.row + 1}軒目`) : '入口'
  return (
    <header className="run-header">
      <div className="run-stat">
        <span>場所</span><strong>{floor}</strong>
      </div>
      <div className="run-stat run-stat--belly">
        <span>お腹</span><strong>{run.belly}<small> / {MAX_RUN_BELLY}</small></strong>
        <i className="run-belly-bar" aria-hidden="true"><b style={{ width: `${Math.min(100, run.belly)}%` }} /></i>
      </div>
      <div className="run-stat">
        <span>持ち金</span><strong>¥{run.gold.toLocaleString()}</strong>
      </div>
      <button type="button" className="run-stat run-stat--deck" onClick={onOpenDeck} aria-label={`デッキ${run.deck.length}枚を見る`}>
        <span>デッキ</span><strong>{run.deck.length}枚</strong>
      </button>
    </header>
  )
}

const NODE_LABEL: Record<RunNode['kind'], { mark: string; name: string }> = {
  battle: { mark: '食', name: '大食い客' },
  rest: { mark: '茶', name: 'お茶' },
  boss: { mark: '将', name: '大将' },
}

const MAP_W = 300
const ROW_H = 68
const MAP_H = (RUN_ROWS + 1) * ROW_H + 24
const nodeX = (node: RunNode) => node.kind === 'boss' ? MAP_W / 2 : MAP_W / (RUN_COLS * 2) * (node.col * 2 + 1)
const nodeY = (node: RunNode) => 12 + ROW_H / 2 + (RUN_ROWS - node.row) * ROW_H

function RunMap({ run, onEnter }: { run: RunState; onEnter: (id: string) => void }) {
  const reachable = reachableNodeIds(run)
  const byId = useMemo(() => new Map(run.nodes.map(node => [node.id, node])), [run.nodes])
  const visited = new Set(run.visited)
  const pathEdges = new Set(run.visited.slice(1).map((id, index) => `${run.visited[index]}>${id}`))
  const mapRef = useRef<HTMLDivElement>(null)
  // 地図は下から上へ進むので、次に入れる店が見える位置まで送る。
  useEffect(() => {
    mapRef.current?.querySelector('[data-state="open"]')?.scrollIntoView({ block: 'center' })
  }, [run.currentNodeId])
  return (
    <section className="run-map-section" aria-label="はしごの地図">
      <p className="run-map-hint" role="status">{run.currentNodeId === null ? '最初の店を選んでください' : '次の店を選んでください'}</p>
      <div className="run-map" ref={mapRef} style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
          {run.nodes.flatMap(node => node.next.map(nextId => {
            const next = byId.get(nextId)!
            const walked = pathEdges.has(`${node.id}>${nextId}`)
            return <line key={`${node.id}>${nextId}`} x1={nodeX(node)} y1={nodeY(node)} x2={nodeX(next)} y2={nodeY(next)}
              className={walked ? 'run-map-edge run-map-edge--walked' : 'run-map-edge'} />
          }))}
        </svg>
        {run.nodes.map(node => {
          const label = NODE_LABEL[node.kind]
          const canEnter = reachable.includes(node.id)
          const state = node.id === run.currentNodeId ? 'current' : visited.has(node.id) ? 'visited' : canEnter ? 'open' : 'closed'
          return (
            <button type="button" key={node.id}
              className={`run-node run-node--${node.kind}`} data-state={state}
              style={{ left: `${nodeX(node) / MAP_W * 100}%`, top: `${nodeY(node) / MAP_H * 100}%` }}
              disabled={!canEnter} onClick={() => onEnter(node.id)}
              aria-label={`${node.kind === 'boss' ? '' : `${node.row + 1}軒目 `}${node.enemy?.label ?? label.name}${state === 'visited' || state === 'current' ? '（通過済み）' : canEnter ? '（入れる）' : ''}`}>
              <span aria-hidden="true">{label.mark}</span>
            </button>
          )
        })}
      </div>
      <ul className="run-map-legend" aria-label="凡例">
        {Object.values(NODE_LABEL).map(item => <li key={item.mark}><span aria-hidden="true">{item.mark}</span>{item.name}</li>)}
      </ul>
    </section>
  )
}

function RewardCard({ card, onTake }: { card: Card; onTake: () => void }) {
  return (
    <article className="run-reward-card">
      <div className="run-reward-art"><SushiArt card={card} size="100%" /></div>
      <h3>{card.name}</h3>
      <p className="run-reward-stats">
        <span>AP {card.cost}</span><span>攻撃 {card.attack}</span>
        <span>{card.type === 'persist' ? `持続${card.fullness}` : '瞬間'}</span>
      </p>
      <p className="run-reward-effect">{card.effect ? <CardEffectText card={card} variant="short" /> : '特殊効果なし'}</p>
      <button type="button" className="run-primary" onClick={onTake}>この寿司をもらう</button>
    </article>
  )
}

function RunReward({ run, onChoose }: { run: RunState; onChoose: (cardId: string | null) => void }) {
  const reward = run.reward!
  return (
    <section className="run-panel run-reward" aria-labelledby="run-reward-heading">
      <h2 id="run-reward-heading">勝利！ 報酬を選ぶ</h2>
      <p className="run-note">持ち金 ＋¥{reward.gold.toLocaleString()}。お腹は半分に消化して {run.belly} になりました。寿司を1枚選んでデッキに加えます。</p>
      <div className="run-reward-list">
        {reward.cardIds.map(id => cardById.get(id)).filter((card): card is Card => !!card)
          .map(card => <RewardCard key={card.id} card={card} onTake={() => onChoose(card.id)} />)}
      </div>
      <button type="button" className="run-secondary" onClick={() => onChoose(null)}>もらわない（持ち金 ＋¥{SKIP_REWARD_GOLD}）</button>
    </section>
  )
}

function RunRest({ run, onRest }: { run: RunState; onRest: () => void }) {
  return (
    <section className="run-panel run-rest" aria-labelledby="run-rest-heading">
      <p className="run-rest-mark" aria-hidden="true">茶</p>
      <h2 id="run-rest-heading">お茶でひと休み</h2>
      <p className="run-note">熱いあがりで、お腹を {REST_DIGEST} 減らします（{run.belly} → {Math.max(0, run.belly - REST_DIGEST)}）。</p>
      <button type="button" className="run-primary" onClick={onRest}>お茶を飲んで次へ</button>
    </section>
  )
}

function RunResult({ run, onRetry, onExit }: { run: RunState; onRetry: () => void; onExit: () => void }) {
  const won = run.status === 'won'
  return (
    <section className="run-panel run-result" aria-labelledby="run-result-heading">
      <p className="run-rest-mark" aria-hidden="true">{won ? '祝' : '満'}</p>
      <h2 id="run-result-heading">{won ? '大将に勝利！ はしご完走' : 'お腹いっぱい… はしご終了'}</h2>
      <p className="run-note">{run.visited.length}軒をめぐり、{run.battlesWon}勝。最後のデッキは{run.deck.length}枚でした。</p>
      <div className="run-result-actions">
        <button type="button" className="run-primary" onClick={onRetry}>もう一度はしごする</button>
        <button type="button" className="run-secondary" onClick={onExit}>お品書きへ</button>
      </div>
    </section>
  )
}

function DeckDialog({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, { card: Card; count: number }>()
    for (const card of cards) {
      const entry = map.get(card.id)
      if (entry) entry.count += 1
      else map.set(card.id, { card, count: 1 })
    }
    return [...map.values()].sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name, 'ja'))
  }, [cards])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="run-dialog-backdrop" onClick={onClose}>
      <div className="run-dialog" role="dialog" aria-modal="true" aria-labelledby="run-deck-heading" onClick={event => event.stopPropagation()}>
        <header>
          <h2 id="run-deck-heading">いまのデッキ {cards.length}枚</h2>
          <button type="button" className="run-text-button" onClick={onClose} autoFocus>閉じる</button>
        </header>
        <ul className="run-deck-list">
          {groups.map(({ card, count }) => (
            <li key={card.id}>
              <span className="run-deck-art"><SushiArt card={card} size={44} /></span>
              <span className="run-deck-name">{card.name}{count > 1 && <b> ×{count}</b>}</span>
              <span className="run-deck-meta">AP {card.cost}・攻 {card.attack}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
