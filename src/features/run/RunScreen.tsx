import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../types'
import { BattleScreen, type BattleFinish } from '../battle/BattleScreen'
import { DraftScreenThree } from '../draft/DraftScreenThree'
import { SushiArt } from '../../components/SushiArt'
import { CardEffectText } from '../battle/CardEffectText'
import {
  ARCHETYPE_STARTERS, BOSS_NODE_ID, MAX_RUN_BELLY, RUN_ACT_COUNT, actInfo, actOf, STARTER_DECK, REST_DIGEST, RUN_ARCHETYPES, RUN_DRAW_PER_TURN, RUN_HAND_LIMIT, RUN_OPENING_HAND, RUN_START_AP, RUN_COLS, RUN_ROWS, SKIP_REWARD_GOLD,
  MIN_DECK_SIZE, aburiAtRest, aburiDeckId, canAburiDeckId, canRemoveCard, chooseBonus, chooseStartRelic, chooseReward, createRun, enterNode, findNode, finishBattle,
  finishShopLane, leaveShop, reachableNodeIds, removeCardAtShop, removeCost, runCard, runDeckCards, runMatchMods, takeRest,
  type RunArchetype, type RunBonusChoice, type RunNode, type RunState,
} from '../../game/run'
import { REGULAR_SKILL_BY_ID, RELIC_BY_ID, RELIC_GRADE_LABEL, type RelicId } from '../../data/runRelics'
import { SIDE_MENU_BY_ID } from '../../data/sideMenus'
import { ACT_BOSSES, ENEMY_CHARACTER_BY_ID, bossRules } from '../../data/runEnemies'
import { RUN_EVENT_BY_ID } from '../../data/runEvents'
import { eventChoiceBlocked, leaveEvent, resolveEvent } from '../../game/runEvents'
import { RunToolbar } from './RunToolbar'
import { clearRun, loadRun, saveRun } from './runStorage'
import './RunScreen.css'

export function RunScreen({ onExit }: { onExit: () => void }) {
  const [saved, setSaved] = useState<RunState | null>(() => loadRun())
  const [run, setRun] = useState<RunState | null>(null)
  const [deckOpen, setDeckOpen] = useState(false)
  // 試合前の顔見せを済ませたマス（訪れた順番つき）。再開時はもう一度見せる。
  const [introDone, setIntroDone] = useState<string | null>(null)
  const [laneOpen, setLaneOpen] = useState(false)
  // アドレスに #debug を付けたときだけ、デバッグメニューを出す。
  const [debug] = useState(() => window.location.hash.includes('debug'))
  const debugPanel = run ? <RunToolbar run={run} debug={debug} onChange={next => { setIntroDone(null); setLaneOpen(false); setRun(next) }} /> : null

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
    const battleKey = `${node.id}:${run.visited.length}`
    if (introDone !== battleKey) {
      return <main className="run-screen">
        <RunHeader run={run} onOpenDeck={() => setDeckOpen(true)} />
        <div className="run-body"><EncounterIntro run={run} node={node} onStart={() => setIntroDone(battleKey)} /></div>
        {deckOpen && <DeckDialog cards={runDeckCards(run)} onClose={() => setDeckOpen(false)} />}
        {debugPanel}
      </main>
    }
    const gimmick = node.enemy.character ? ENEMY_CHARACTER_BY_ID[node.enemy.character].gimmick : {}
    return <>{debugPanel}<BattleScreen
      key={battleKey}
      deck={runDeckCards(run)}
      cpuDeckId={node.enemy.cpuDeckId}
      initialBelly={{ 1: run.belly, ...(gimmick.initialBelly ? { 2: gimmick.initialBelly } : {}) }}
      maxBelly={{ 2: node.enemy.maxBelly }}
      sideMenu={run.sideMenu}
      runMods={runMatchMods(run, node.enemy)}
      refillOnEmpty
      openingHand={{ 1: RUN_OPENING_HAND, ...(gimmick.openingHand ? { 2: gimmick.openingHand } : {}) }}
      startAP={{ 1: RUN_START_AP, ...(gimmick.startAP ? { 2: gimmick.startAP } : {}) }}
      drawBonus={{ 1: RUN_DRAW_PER_TURN - 1, ...(gimmick.drawBonus ? { 2: gimmick.drawBonus } : {}) }}
      extraGari={{ 1: run.nextBattleGari ?? 0, 2: gimmick.extraGari ?? 0 }}
      handLimit={{ 1: RUN_HAND_LIMIT }}
      allowDiscard
      onFinish={(result: BattleFinish) => setRun(current => current && finishBattle(current, result.won, result.belly))} /></>
  }

  if (run.status === 'shop' && laneOpen && !run.shop?.laneDone) {
    return <div className="run-lane">
      <p className="run-lane-banner">🍣 回転レーンで買い物中 · 持ち金 ¥{run.gold.toLocaleString()}</p>
      <div className="run-lane-body">
        <DraftScreenThree mode="reorder" initialBudget={run.gold} seconds={60} sideMenuEnabled finishLabel="お会計する"
          onComplete={(cards, sideMenu, budgetLeft) => {
            setLaneOpen(false)
            setRun(current => current && finishShopLane(current, cards, sideMenu, budgetLeft ?? current.gold))
          }} />
      </div>
    </div>
  }

  return (
    <main className="run-screen">
      <RunHeader run={run} onOpenDeck={() => setDeckOpen(true)} />
      <div className="run-body">
        {run.status === 'start_relic' && <RunStartRelic run={run} onChoose={id => setRun(chooseStartRelic(run, id))} />}
        {run.status === 'map' && <RunMap run={run} onEnter={id => setRun(enterNode(run, id))} />}
        {run.status === 'reward' && run.reward && <RunReward run={run} onChoose={id => setRun(chooseReward(run, id))}
          onBonus={choice => setRun(chooseBonus(run, choice))} />}
        {run.status === 'event' && <RunEvent run={run} onChoose={choice => setRun(resolveEvent(run, choice))}
          onLeave={() => setRun(leaveEvent(run))} />}
        {run.status === 'shop' && <RunShop run={run} onOpenLane={() => setLaneOpen(true)}
          onRemove={index => setRun(removeCardAtShop(run, index))} onLeave={() => setRun(leaveShop(run))} />}
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
      {debugPanel}
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
            <p>{RUN_ARCHETYPES.find(item => item.id === saved.archetype)?.name}・{actOf(saved)}幕 {saved.visited.length}軒目まで・お腹 {saved.belly}・デッキ {saved.deck.length}枚</p>
          </div>
          <button type="button" className="run-primary" onClick={onResume}>再開する</button>
        </section>}
        <section className="run-panel" aria-labelledby="run-archetype-heading">
          <h2 id="run-archetype-heading">{saved ? '新しく始める' : '最初の系統を選ぶ'}</h2>
          <p className="run-note">汎用10枚に、選んだ系統の寿司（3〜4枚）を足して始めます。{saved && '新しく始めると、続きのデータは消えます。'}</p>
          <div className="run-archetypes" role="radiogroup" aria-label="系統">
            {RUN_ARCHETYPES.map(item => (
              <button type="button" key={item.id} role="radio" aria-checked={archetype === item.id}
                className="run-archetype" onClick={() => setArchetype(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
          <StarterDeckPreview archetype={archetype} />
          <button type="button" className="run-primary" onClick={() => onStart(archetype)}>この系統ではしごを始める</button>
        </section>
        <section className="run-panel run-rules" aria-label="遊び方">
          <h2>遊び方</h2>
          <ul>
            <li>地図で次の店を選び、下から上へ進みます。最後は大将との勝負です。</li>
            <li>お腹は試合をまたいで持ち越します。勝つと半分に消化し、100になったら終わりです。</li>
            <li>勝つたびに寿司を3枚から1枚もらえます。山札が尽きたら「おかわり」で使った寿司が戻ります。</li>
            <li>はしごの試合は最初の手札{RUN_OPENING_HAND}枚、毎ターン{RUN_DRAW_PER_TURN}枚引き、手札は{RUN_HAND_LIMIT}枚まで、APは{RUN_START_AP}から始まります。</li>
            <li>「常」の常連さんは得意技を持つ強敵です。勝つと器（ずっと効く道具）かサイドメニューももらえます。</li>
            <li>はじめに器（ずっと効く道具）を3つから1つもらえます。</li>
            <li>「茶」のお茶では、お腹を減らすか、寿司1枚を炙って強くできます。</li>
            <li>「？」はハプニング、「買」は買い物（回転レーンで寿司を買う・寿司を下げてもらう）です。</li>
            <li>全{RUN_ACT_COUNT}幕（回転寿司→立ち食い寿司→回らない名店）。各幕の最後にボスがいて、倒すと器と寿司をもらって次の幕へ。最後の大将に勝てばクリアです。</li>
            <li>大食い客は一人ひとり癖があります。ボスは専用ルールで待ち構えています。</li>
          </ul>
        </section>
        <button type="button" className="run-text-button" onClick={onExit}>← お品書きへ戻る</button>
      </div>
    </main>
  )
}

/** 選んだ系統の初期デッキ13枚。系統の3枚を先に、汎用10枚を後に並べる。 */
function StarterDeckPreview({ archetype }: { archetype: RunArchetype }) {
  const groups = useMemo(() => {
    const entries = [
      ...ARCHETYPE_STARTERS[archetype].map(id => ({ id, own: true })),
      ...STARTER_DECK.map(id => ({ id, own: false })),
    ]
    const map = new Map<string, { card: Card; own: boolean; count: number }>()
    for (const { id, own } of entries) {
      const card = runCard(id)
      if (!card) continue
      const entry = map.get(id)
      if (entry) entry.count += 1
      else map.set(id, { card, own, count: 1 })
    }
    return [...map.values()]
  }, [archetype])
  const name = RUN_ARCHETYPES.find(item => item.id === archetype)?.name
  return (
    <div className="run-starter" aria-live="polite">
      <h3 className="run-subheading">{name}の初期デッキ（{STARTER_DECK.length + ARCHETYPE_STARTERS[archetype].length}枚）</h3>
      <ul className="run-starter-list">
        {groups.map(({ card, own, count }) => (
          <li key={card.id} data-own={own ? 'true' : undefined} title={card.effect ? undefined : '特殊効果なし'}>
            <span className="run-deck-art"><SushiArt card={card} size={40} /></span>
            <span className="run-starter-name">{card.name}{count > 1 && <b> ×{count}</b>}{own && <em>{name}</em>}</span>
            <span className="run-deck-meta">AP {card.cost}・攻 {card.attack}{card.type === 'persist' ? `・持続${card.fullness}` : ''}</span>
            <span className="run-starter-effect">{card.effect ? <CardEffectText card={card} variant="short" /> : '特殊効果なし'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RunHeader({ run, onOpenDeck }: { run: RunState; onOpenDeck: () => void }) {
  const current = findNode(run, run.currentNodeId)
  const act = actOf(run)
  const floor = `${act}幕 ${current ? (current.id === BOSS_NODE_ID ? actInfo(act).boss.name : `${current.row + 1}軒目`) : '入口'}`
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
  event: { mark: '？', name: 'ハプニング' },
  shop: { mark: '買', name: '買い物' },
  boss: { mark: '将', name: '幕のボス' },
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
      <p className="run-map-act">{actOf(run)}幕「{actInfo(actOf(run)).name}」<span>全{RUN_ACT_COUNT}幕・最後に{actInfo(actOf(run)).boss.name}</span></p>
      <p className="run-map-hint" role="status">{run.currentNodeId === null ? '最初の店を選んでください' : '次の店を選んでください'}</p>
      <div className="run-map" ref={mapRef} style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
          {run.nodes.filter(node => !node.debug).flatMap(node => node.next.map(nextId => {
            const next = byId.get(nextId)!
            const walked = pathEdges.has(`${node.id}>${nextId}`)
            return <line key={`${node.id}>${nextId}`} x1={nodeX(node)} y1={nodeY(node)} x2={nodeX(next)} y2={nodeY(next)}
              className={walked ? 'run-map-edge run-map-edge--walked' : 'run-map-edge'} />
          }))}
        </svg>
        {run.nodes.filter(node => !node.debug).map(node => {
          const label = NODE_LABEL[node.kind]
          const canEnter = reachable.includes(node.id)
          const state = node.id === run.currentNodeId ? 'current' : visited.has(node.id) ? 'visited' : canEnter ? 'open' : 'closed'
          return (
            <button type="button" key={node.id}
              className={`run-node run-node--${node.kind}`} data-state={state}
              style={{ left: `${nodeX(node) / MAP_W * 100}%`, top: `${nodeY(node) / MAP_H * 100}%` }}
              disabled={!canEnter} onClick={() => onEnter(node.id)}
              title={node.enemy?.skill ? `得意技「${REGULAR_SKILL_BY_ID[node.enemy.skill].name}」：${REGULAR_SKILL_BY_ID[node.enemy.skill].text}` : undefined}
              aria-label={`${node.kind === 'boss' ? '幕のボス ' : `${node.row + 1}軒目 `}${node.enemy?.label ?? label.name}${node.enemy?.skill ? `（得意技：${REGULAR_SKILL_BY_ID[node.enemy.skill].name}）` : ''}${state === 'visited' || state === 'current' ? '（通過済み）' : canEnter ? '（入れる）' : ''}`}>
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

function RelicChoiceCard({ id, onTake }: { id: RelicId; onTake: () => void }) {
  const relic = RELIC_BY_ID[id]
  return (
    <article className="run-reward-card run-bonus-card" data-grade={relic.grade}>
      <p className="run-bonus-grade">{RELIC_GRADE_LABEL[relic.grade]}・{RUN_ARCHETYPES.find(item => item.id === relic.archetype)?.name ?? '汎用'}</p>
      <h3>{relic.name}</h3>
      <p className="run-reward-effect">{relic.text}</p>
      <button type="button" className="run-primary" onClick={onTake}>この器をもらう</button>
    </article>
  )
}

/** 系統を選んだ直後、地図の前に器を3つから1つ受け取る。 */
function RunStartRelic({ run, onChoose }: { run: RunState; onChoose: (id: RelicId) => void }) {
  return (
    <section className="run-panel run-reward" aria-labelledby="run-start-relic-heading">
      <h2 id="run-start-relic-heading">はしごの前に、器をひとつ</h2>
      <p className="run-note">大将からの心づけです。器はラン中ずっと効きます。1つ選んでから最初の店へ向かいます。</p>
      <div className="run-reward-list">
        {(run.startRelicIds ?? []).map(id => <RelicChoiceCard key={id} id={id} onTake={() => onChoose(id)} />)}
      </div>
    </section>
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
        <h2 id="run-bonus-heading">{reward.actClear ? `${actInfo(actOf(run)).boss.name}からの心づけ` : '常連さんからのおみやげ'}</h2>
        <p className="run-note">器（ずっと効く道具）を1つ、またはサイドメニューを1品選びます。サイドメニューは毎試合持ち込め、今の一品と入れ替わります。</p>
        <h3 className="run-subheading">器</h3>
        <div className="run-reward-list">
          {(reward.relicIds ?? []).map(id => <RelicChoiceCard key={id} id={id} onTake={() => onBonus({ relic: id })} />)}
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
      <h2 id="run-reward-heading">{reward.actClear ? `${actOf(run)}幕クリア！ 報酬を選ぶ` : '勝利！ 報酬を選ぶ'}</h2>
      {reward.actClear && <p className="run-note">選び終えると {actOf(run) + 1}幕「{actInfo(actOf(run) + 1).name}」へ進みます。敵の満腹ラインと炙りの割合が上がります。</p>}
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

/** 試合前の顔見せ。相手の名前・ひと言・癖を見せてから勝負に入る。 */
function EncounterIntro({ run, node, onStart }: { run: RunState; node: RunNode; onStart: () => void }) {
  const enemy = node.enemy!
  const character = enemy.character ? ENEMY_CHARACTER_BY_ID[enemy.character] : null
  const boss = enemy.boss ? ACT_BOSSES.find(item => item.id === enemy.boss) : undefined
  const isBoss = node.kind === 'boss'
  const skill = enemy.skill ? REGULAR_SKILL_BY_ID[enemy.skill] : null
  const name = boss?.name ?? character?.name ?? (skill ? '常連さん' : '大食い客')
  const line = boss?.line ?? character?.line ?? (skill ? 'いつもの席、空いてるかい？' : 'さあ、食べ比べといこうか。')
  const act = actOf(run)
  const traits = [
    ...(boss ? bossRules(boss) : []),
    ...(character ? [character.trait] : []),
    ...(skill ? [`得意技「${skill.name}」：${skill.text}`] : []),
    ...(boss ? [] : [`満腹ライン ${enemy.maxBelly}`]),
    ...(enemy.aburiRate ? [`デッキの${Math.round(enemy.aburiRate * 10)}割が炙り版`] : []),
  ]
  return (
    <section className={`run-panel run-encounter${isBoss ? ' run-encounter--boss' : ''}`} aria-labelledby="run-encounter-heading">
      <p className="run-rest-mark" aria-hidden="true">{isBoss ? '将' : skill ? '常' : '食'}</p>
      <p className="run-encounter-kicker">{act}幕「{actInfo(act).name}」・{isBoss ? (act >= RUN_ACT_COUNT ? 'はしごの締め' : '幕の締め') : `${node.row + 1}軒目`}・{enemy.label.split(' · ')[1] ?? 'おまかせ'}</p>
      <h2 id="run-encounter-heading">{name}があらわれた！</h2>
      <blockquote className="run-encounter-line">「{line}」</blockquote>
      <ul className="run-encounter-traits">{traits.map(text => <li key={text}>{text}</li>)}</ul>
      {run.nextBattleGari ? <p className="run-note">ガリ食べ放題の効果で、この試合はガリ +{run.nextBattleGari}。</p> : null}
      <button type="button" className="run-primary" onClick={onStart} autoFocus>勝負！</button>
    </section>
  )
}

function RunEvent({ run, onChoose, onLeave }: { run: RunState; onChoose: (choiceId: string) => void; onLeave: () => void }) {
  const event = run.event && RUN_EVENT_BY_ID[run.event.id]
  if (!event || !run.event) return null
  return (
    <section className="run-panel run-event" aria-labelledby="run-event-heading">
      <p className="run-rest-mark" aria-hidden="true">？</p>
      <h2 id="run-event-heading">{event.title}</h2>
      <p className="run-event-text">{event.text}</p>
      {run.event.result === undefined ? (
        <div className="run-rest-options">
          {event.choices.map(choice => {
            const blocked = eventChoiceBlocked(run, choice.id)
            return (
              <button type="button" key={choice.id} className="run-rest-option" disabled={!!blocked} onClick={() => onChoose(choice.id)}>
                <strong>{choice.label}</strong>
                <span>{blocked ?? choice.detail}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <p className="run-event-result" role="status">{run.event.result}</p>
          <button type="button" className="run-primary" onClick={onLeave} autoFocus>次の店へ</button>
        </>
      )}
    </section>
  )
}

function RunShop({ run, onOpenLane, onRemove, onLeave }: {
  run: RunState
  onOpenLane: () => void
  onRemove: (deckIndex: number) => void
  onLeave: () => void
}) {
  const [removing, setRemoving] = useState(false)
  const cost = removeCost(run)
  const canRemove = canRemoveCard(run)
  // 同じ寿司は1つにまとめ、最初に見つかった1枚を抜く。
  const options = useMemo(() => {
    const seen = new Set<string>()
    return run.deck.flatMap((id, index) => {
      if (seen.has(id)) return []
      seen.add(id)
      const card = runCard(id)
      return card ? [{ index, card, count: run.deck.filter(item => item === id).length }] : []
    }).sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name, 'ja'))
  }, [run.deck])
  if (removing) {
    return (
      <section className="run-panel run-aburi" aria-labelledby="run-remove-heading">
        <h2 id="run-remove-heading">どの寿司を下げてもらう？（¥{cost}）</h2>
        <p className="run-note">選んだ1枚がデッキから抜けます。弱い寿司を抜くと、強い寿司を引きやすくなります。</p>
        <ul className="run-aburi-list" aria-label="下げる寿司">
          {options.map(option => (
            <li key={option.index}>
              <button type="button" className="run-aburi-option" disabled={!canRemove}
                onClick={() => { onRemove(option.index); setRemoving(false) }}>
                <span className="run-deck-art"><SushiArt card={option.card} size={44} /></span>
                <span className="run-aburi-name">{option.card.name}{option.card.aburi && <span className="aburi-badge">炙り</span>}{option.count > 1 && <b> ×{option.count}</b>}</span>
                <span className="run-deck-meta">AP {option.card.cost}・攻 {option.card.attack}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="run-result-actions">
          <button type="button" className="run-secondary" onClick={() => setRemoving(false)}>戻る</button>
        </div>
      </section>
    )
  }
  return (
    <section className="run-panel run-shop" aria-labelledby="run-shop-heading">
      <p className="run-rest-mark" aria-hidden="true">買</p>
      <h2 id="run-shop-heading">回転寿司で腹ごしらえ</h2>
      <p className="run-note">持ち金 ¥{run.gold.toLocaleString()}。回転レーンは1回、下げてもらうのは持ち金がある限り何回でも使えます。</p>
      <div className="run-rest-options">
        <button type="button" className="run-rest-option" onClick={onOpenLane} disabled={run.shop?.laneDone || run.gold <= 0}>
          <strong>回転レーンで寿司を買う</strong>
          <span>{run.shop?.laneDone ? 'もう買い物を済ませました' : run.gold <= 0 ? '持ち金がありません' : '持ち金で60秒の買い物。特急・大将のおすすめ・サイドメニューも使えます'}</span>
        </button>
        <button type="button" className="run-rest-option" onClick={() => setRemoving(true)} disabled={!canRemove}>
          <strong>寿司を下げてもらう（¥{cost}）</strong>
          <span>{run.deck.length <= MIN_DECK_SIZE ? `デッキが${MIN_DECK_SIZE}枚以下なので下げられません` : run.gold < cost ? '持ち金が足りません' : 'デッキから1枚抜く。使うたびに50円値上がり'}</span>
        </button>
      </div>
      <button type="button" className="run-primary" onClick={onLeave}>店を出る</button>
    </section>
  )
}

function RunResult({ run, onRetry, onExit }: { run: RunState; onRetry: () => void; onExit: () => void }) {
  const won = run.status === 'won'
  return (
    <section className="run-panel run-result" aria-labelledby="run-result-heading">
      <p className="run-rest-mark" aria-hidden="true">{won ? '祝' : '満'}</p>
      <h2 id="run-result-heading">{won ? '大将に勝利！ はしご完走' : 'お腹いっぱい… はしご終了'}</h2>
      <p className="run-note">{actOf(run)}幕「{actInfo(actOf(run)).name}」まで進み、{run.battlesWon}勝。最後のデッキは{run.deck.length}枚、器は{run.relics.length}個でした。</p>
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
