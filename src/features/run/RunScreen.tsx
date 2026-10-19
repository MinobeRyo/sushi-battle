import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../types'
import { BattleScreen, type BattleFinish } from '../battle/BattleScreen'
import { SushiArt } from '../../components/SushiArt'
import { CardEffectText } from '../battle/CardEffectText'
import {
  BOSS_NODE_ID, MAX_RUN_BELLY, REST_DIGEST, RUN_ARCHETYPES, RUN_COLS, RUN_ROWS, SKIP_REWARD_GOLD,
  aburiAtRest, aburiDeckId, canAburiDeckId, chooseBonus, chooseReward, createRun, enterNode, findNode, finishBattle,
  reachableNodeIds, runCard, runDeckCards, runMatchMods, takeRest,
  type RunArchetype, type RunBonusChoice, type RunNode, type RunState,
} from '../../game/run'
import { REGULAR_SKILL_BY_ID, RELIC_BY_ID, RELIC_GRADE_LABEL } from '../../data/runRelics'
import { SIDE_MENU_BY_ID } from '../../data/sideMenus'
import { clearRun, loadRun, saveRun } from './runStorage'
import './RunScreen.css'

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
      sideMenu={run.sideMenu}
      runMods={runMatchMods(run, node.enemy)}
      refillOnEmpty
      onFinish={(result: BattleFinish) => setRun(current => current && finishBattle(current, result.won, result.belly))} />
  }

  return (
    <main className="run-screen">
      <RunHeader run={run} onOpenDeck={() => setDeckOpen(true)} />
      <div className="run-body">
        {run.status === 'map' && <RunMap run={run} onEnter={id => setRun(enterNode(run, id))} />}
        {run.status === 'reward' && run.reward && <RunReward run={run} onChoose={id => setRun(chooseReward(run, id))}
          onBonus={choice => setRun(chooseBonus(run, choice))} />}
        {run.status === 'rest' && <RunRest run={run} onRest={() => setRun(takeRest(run))}
          onAburi={index => setRun(aburiAtRest(run, index))} />}
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
            <li>「常」の常連さんは得意技を持つ強敵です。勝つと器（ずっと効く道具）かサイドメニューももらえます。</li>
            <li>「茶」のお茶では、お腹を減らすか、寿司1枚を炙って強くできます。</li>
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
      {(run.relics.length > 0 || run.sideMenu) && <ul className="run-relics" aria-label="持っている器とサイドメニュー">
        {run.relics.map(id => {
          const relic = RELIC_BY_ID[id]
          return <li key={id} className="run-relic" data-grade={relic.grade} title={relic.text}>
            <b>器</b>{relic.name}<span className="run-relic-text">：{relic.text}</span>
          </li>
        })}
        {run.sideMenu && <li className="run-relic run-relic--side" title={SIDE_MENU_BY_ID[run.sideMenu].effect}>
          <b>一品</b>{SIDE_MENU_BY_ID[run.sideMenu].name}<span className="run-relic-text">：{SIDE_MENU_BY_ID[run.sideMenu].summary}</span>
        </li>}
      </ul>}
    </header>
  )
}

const NODE_LABEL: Record<RunNode['kind'], { mark: string; name: string }> = {
  battle: { mark: '食', name: '大食い客' },
  regular: { mark: '常', name: '常連さん' },
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
              title={node.enemy?.skill ? `得意技「${REGULAR_SKILL_BY_ID[node.enemy.skill].name}」：${REGULAR_SKILL_BY_ID[node.enemy.skill].text}` : undefined}
              aria-label={`${node.kind === 'boss' ? '' : `${node.row + 1}軒目 `}${node.enemy?.label ?? label.name}${node.enemy?.skill ? `（得意技：${REGULAR_SKILL_BY_ID[node.enemy.skill].name}）` : ''}${state === 'visited' || state === 'current' ? '（通過済み）' : canEnter ? '（入れる）' : ''}`}>
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

function CardSummary({ card }: { card: Card }) {
  return <>
    <div className="run-reward-art"><SushiArt card={card} size="100%" /></div>
    <h3>{card.name}{card.aburi && <span className="aburi-badge">炙り</span>}</h3>
    <p className="run-reward-stats">
      <span>AP {card.cost}</span><span>攻撃 {card.attack}</span>
      <span>{card.type === 'persist' ? `持続${card.fullness}` : '瞬間'}</span>
    </p>
    <p className="run-reward-effect">{card.effect || card.aburi ? <CardEffectText card={card} variant="short" /> : '特殊効果なし'}</p>
  </>
}

function RewardCard({ card, onTake }: { card: Card; onTake: () => void }) {
  return (
    <article className="run-reward-card" data-aburi={card.aburi ? 'true' : undefined}>
      <CardSummary card={card} />
      <button type="button" className="run-primary" onClick={onTake}>この寿司をもらう</button>
    </article>
  )
}

function RunReward({ run, onChoose, onBonus }: {
  run: RunState
  onChoose: (cardId: string | null) => void
  onBonus: (choice: RunBonusChoice) => void
}) {
  const reward = run.reward!
  if (reward.cardDone) {
    return (
      <section className="run-panel run-reward" aria-labelledby="run-bonus-heading">
        <h2 id="run-bonus-heading">常連さんからのおみやげ</h2>
        <p className="run-note">器（ずっと効く道具）を1つ、またはサイドメニューを1品選びます。サイドメニューは毎試合持ち込め、今の一品と入れ替わります。</p>
        <h3 className="run-subheading">器</h3>
        <div className="run-reward-list">
          {(reward.relicIds ?? []).map(id => {
            const relic = RELIC_BY_ID[id]
            return (
              <article key={id} className="run-reward-card run-bonus-card" data-grade={relic.grade}>
                <p className="run-bonus-grade">{RELIC_GRADE_LABEL[relic.grade]}・{RUN_ARCHETYPES.find(item => item.id === relic.archetype)?.name ?? '汎用'}</p>
                <h3>{relic.name}</h3>
                <p className="run-reward-effect">{relic.text}</p>
                <button type="button" className="run-primary" onClick={() => onBonus({ relic: id })}>この器をもらう</button>
              </article>
            )
          })}
        </div>
        <h3 className="run-subheading">サイドメニュー</h3>
        <div className="run-reward-list">
          {(reward.sideMenuIds ?? []).map(id => {
            const menu = SIDE_MENU_BY_ID[id]
            return (
              <article key={id} className="run-reward-card run-bonus-card">
                <p className="run-bonus-grade">{menu.category}{run.sideMenu === id && '・持っている'}</p>
                <h3>{menu.name}</h3>
                <p className="run-reward-effect">{menu.effect}</p>
                <button type="button" className="run-secondary" onClick={() => onBonus({ sideMenu: id })}>
                  {run.sideMenu && run.sideMenu !== id ? `${SIDE_MENU_BY_ID[run.sideMenu].name}と入れ替える` : 'この一品をもらう'}
                </button>
              </article>
            )
          })}
        </div>
        <button type="button" className="run-text-button" onClick={() => onBonus(null)}>何ももらわずに次へ</button>
      </section>
    )
  }
  const hasBonus = Boolean(reward.relicIds?.length || reward.sideMenuIds?.length)
  return (
    <section className="run-panel run-reward" aria-labelledby="run-reward-heading">
      <h2 id="run-reward-heading">勝利！ 報酬を選ぶ</h2>
      <p className="run-note">持ち金 ＋¥{reward.gold.toLocaleString()}。お腹は半分に消化して {run.belly} になりました。寿司を1枚選んでデッキに加えます。{hasBonus && 'このあと器かサイドメニューも選べます。'}</p>
      <div className="run-reward-list">
        {reward.cardIds.map(id => ({ id, card: runCard(id) })).filter((item): item is { id: string; card: Card } => !!item.card)
          .map(({ id, card }) => <RewardCard key={id} card={card} onTake={() => onChoose(id)} />)}
      </div>
      <button type="button" className="run-secondary" onClick={() => onChoose(null)}>もらわない（持ち金 ＋¥{SKIP_REWARD_GOLD}）</button>
    </section>
  )
}

function RunRest({ run, onRest, onAburi }: { run: RunState; onRest: () => void; onAburi: (deckIndex: number) => void }) {
  const [choosing, setChoosing] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  // 同じ寿司は1つにまとめ、最初に見つかった1枚を炙る。
  const options = useMemo(() => {
    const seen = new Set<string>()
    return run.deck.flatMap((id, index) => {
      if (seen.has(id) || !canAburiDeckId(id)) return []
      seen.add(id)
      const card = runCard(id)
      const aburi = runCard(aburiDeckId(id))
      return card && aburi ? [{ index, card, aburi, count: run.deck.filter(item => item === id).length }] : []
    }).sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name, 'ja'))
  }, [run.deck])
  const picked = options.find(option => option.index === selected)
  if (!choosing) {
    return (
      <section className="run-panel run-rest" aria-labelledby="run-rest-heading">
        <p className="run-rest-mark" aria-hidden="true">茶</p>
        <h2 id="run-rest-heading">お茶でひと休み</h2>
        <p className="run-note">どちらか1つを選べます。</p>
        <div className="run-rest-options">
          <button type="button" className="run-rest-option" onClick={onRest}>
            <strong>熱いあがりを飲む</strong>
            <span>お腹 −{REST_DIGEST}（{run.belly} → {Math.max(0, run.belly - REST_DIGEST)}）</span>
          </button>
          <button type="button" className="run-rest-option run-rest-option--aburi" onClick={() => setChoosing(true)} disabled={options.length === 0}>
            <strong>寿司を1枚炙ってもらう</strong>
            <span>{options.length === 0 ? '炙れる寿司がありません' : '数値も効果も大きく強くなる（1枚1回まで）'}</span>
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="run-panel run-aburi" aria-labelledby="run-aburi-heading">
      <h2 id="run-aburi-heading">どの寿司を炙る？</h2>
      <p className="run-note">選んだ1枚が炙り版になります。同じ寿司が何枚かあるときは、そのうち1枚だけです。</p>
      <ul className="run-aburi-list" role="radiogroup" aria-label="炙る寿司">
        {options.map(option => (
          <li key={option.index}>
            <button type="button" role="radio" aria-checked={selected === option.index} className="run-aburi-option"
              onClick={() => setSelected(option.index)}>
              <span className="run-deck-art"><SushiArt card={option.card} size={44} /></span>
              <span className="run-aburi-name">{option.card.name}{option.count > 1 && <b> ×{option.count}</b>}</span>
              <span className="run-deck-meta">攻 {option.card.attack} → <b>{option.aburi.attack}</b></span>
            </button>
          </li>
        ))}
      </ul>
      {picked && <div className="run-aburi-preview" aria-live="polite">
        <article className="run-reward-card"><CardSummary card={picked.card} /></article>
        <span className="run-aburi-arrow" aria-hidden="true">→</span>
        <article className="run-reward-card" data-aburi="true"><CardSummary card={picked.aburi} /></article>
      </div>}
      <div className="run-result-actions">
        <button type="button" className="run-primary" disabled={!picked} onClick={() => picked && onAburi(picked.index)}>
          {picked ? `${picked.card.name}を炙る` : '寿司を選んでください'}
        </button>
        <button type="button" className="run-secondary" onClick={() => { setChoosing(false); setSelected(null) }}>戻る</button>
      </div>
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
      const key = card.aburi ? aburiDeckId(card.id) : card.id
      const entry = map.get(key)
      if (entry) entry.count += 1
      else map.set(key, { card, count: 1 })
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
            <li key={card.aburi ? aburiDeckId(card.id) : card.id} data-aburi={card.aburi ? 'true' : undefined}>
              <span className="run-deck-art"><SushiArt card={card} size={44} /></span>
              <span className="run-deck-name">{card.name}{card.aburi && <span className="aburi-badge">炙り</span>}{count > 1 && <b> ×{count}</b>}</span>
              <span className="run-deck-meta">AP {card.cost}・攻 {card.attack}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
