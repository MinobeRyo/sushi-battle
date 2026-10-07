import { useState } from 'react'
import { NAMAHAM_CARD, getCardById } from '../../data/cards'
import { createRareCorn, createUnluckyCard } from '../../data/cardVariants'
import { canReorderSideMenu } from '../../data/sideMenus'
import { SushiArt } from '../../components/SushiArt'
import SushiModelViewer from '../catalog/SushiModelViewer'
import { getCardEffectDescription } from '../battle/battlePresentation'
import { calcFieldDmg, toField } from '../battle/battleEngine'
import { DefensePrompt } from '../battle/DefensePrompt'
import { BattleScreen } from '../battle/BattleScreen'
import { DeckInspector } from '../battle/DeckInspector'
import { summarizeDeck } from '../../game/deckSummary'
import { createMatch, transitionMatch } from '../../game/matchEngine'
import type { MatchState } from '../../game/types'
import { StaffHelpModal } from '../draft/StaffHelpModal'
import { ShinkansenOrderModal } from '../draft/ShinkansenOrderModal'
import { createDraftState, orderOmakase, orderShinkansen, purchaseSideMenu } from '../draft/draftEngine'
import type { OrderCategory } from '../draft/ShinkansenOrderModal'
import './ImprovementsDemo.css'

const card = (id: string) => getCardById(id)!
const MODELS = [
  { card: card('ikura_gunkan'), note: '単色の土台をなくし、丸い粒だけで盛り付け' },
  { card: card('tobiko_gunkan'), note: '小さな粒を密に盛り付け。単色の土台はありません' },
  { card: card('tekka_maki'), note: '白いシャリは断面だけ。側面を海苔で覆いました' },
  { card: card('natto_maki'), note: '上の糸を取り除き、側面も海苔で覆いました' },
  { card: card('futomaki'), note: '太巻きの側面の白いはみ出しを修正' },
  { card: card('tuna_gunkan'), note: '淡いピンクのほぐしたツナ。きゅうりは付けません' },
  { card: card('tuna_salad_gunkan'), note: '比較用のツナサラダ軍艦' },
  { card: createUnluckyCard(card('ikura_gunkan')), note: '横倒しの軍艦。攻撃は通常の半分' },
  { card: createUnluckyCard(card('salmon')), note: 'シャリの横にネタが落ちた寿司。攻撃は半分' },
  { card: createRareCorn(250), note: 'レアな横向きマヨコーン。2AP・攻撃12' },
  { card: card('aigamo'), note: '場にいる間、生ハムの攻撃＋2。合鴨同士は重複なし' },
]
const CHANGED_IDS = ['ebi_gunkan', 'ikura_gunkan', 'tobiko_gunkan', 'aigamo', 'cheese', 'botan_ebi', 'tamago', 'seafood_gunkan', 'takowasa']
const TABS = ['3Dモデル', 'カード効果', '防御・山札', '注文・遊び方'] as const
type Tab = typeof TABS[number]

function makeDefense(id: string, seafood: boolean): MatchState {
  const state = createMatch({ deck: Array(8).fill(card('tamago')), p2Deck: Array(8).fill(card('tamago')), mode: 'two_player', matchId: 'improvements-demo' }, () => .99)
  state.players[1].field = (seafood ? ['ika', 'tako', 'ebi'] : ['maguro', 'salmon', 'uni_gunkan']).map((id, index) => toField(card(id), `demo-attack-${index}`))
  state.players[2].field = [{ ...toField(card(id), 'demo-defense'), defenseState: 'ready' }]
  state.players[2].belly = 50
  state.players[2].gari = 2
  const amount = calcFieldDmg(state.players[1].field, {}, 0, 50)
  state.phase = 'defending'
  state.pendingAttack = { attackerId: 1, defenderId: 2, amount: seafood ? Math.floor(amount / 2) + 7 : amount,
    source: seafood ? 'summon' : 'end_turn', defenseCardId: 'demo-defense',
    ...(seafood ? { kaisenReattack: true, fixedDamage: 7 } : {}) }
  return state
}

export default function ImprovementsDemo() {
  const [tab, setTab] = useState<Tab>('3Dモデル')
  const [modelIndex, setModelIndex] = useState(0)
  const [view, setView] = useState<'angle' | 'top' | 'side'>('angle')
  const [zoom, setZoom] = useState(1)
  const [resetKey, setResetKey] = useState(0)
  const [guardId, setGuardId] = useState('cheese')
  const [seafood, setSeafood] = useState(false)
  const [defense, setDefense] = useState<MatchState | null>(null)
  const [defenseResult, setDefenseResult] = useState('')
  const [help, setHelp] = useState(false)
  const [order, setOrder] = useState<OrderCategory | null>(null)
  const [draft, setDraft] = useState(() => createDraftState(1500, 3600, Date.now()))
  const [orderNotice, setOrderNotice] = useState('')
  const [play, setPlay] = useState(false)
  const [ducks, setDucks] = useState(1)
  const [drawn, setDrawn] = useState(0)
  const model = MODELS[modelIndex]
  const sampleDeck = [...CHANGED_IDS.map(card), createRareCorn(250), createUnluckyCard(card('salmon')), NAMAHAM_CARD]
    .slice(drawn).map((c, index) => ({ ...c, instanceId: `sample-${index}` }))
  const hamField = [toField(NAMAHAM_CARD, 'sample-ham'), ...Array.from({ length: ducks }, (_, i) => toField(card('aigamo'), `duck-${i}`))]
  const hamAttack = calcFieldDmg(hamField, {}) - calcFieldDmg(hamField.filter(c => c.id !== 'namahamu'), {})

  if (play) return <BattleScreen deck={[...CHANGED_IDS.map(card), ...Array(3).fill(card('kappa_maki')), ...Array(2).fill(card('ika')), ...Array(2).fill(card('tako')), ...Array(2).fill(card('gyutan'))]}
    cpuBattleMode="weak" onBack={() => setPlay(false)} />

  return <main className="improvement-demo">
    <header className="improvement-demo__header">
      <a href={window.location.pathname} className="improvement-demo__brand">すしバトル</a>
      <span>改善チェック <b>試作版</b></span>
      <button onClick={() => setPlay(true)}>新カードで対戦</button>
    </header>
    <div className="improvement-demo__body">
      <div className="improvement-demo__intro"><p>NEW MENU / PLAY TEST</p><h1>すしバトル 改善デモ</h1><span>見た目も、遊びやすさも。一つずつ試せます。</span></div>
      <nav className="improvement-demo__tabs" aria-label="確認する修正点">
        {TABS.map((label, i) => <button key={label} aria-pressed={tab === label} onClick={() => setTab(label)}><small>0{i + 1}</small>{label}</button>)}
      </nav>

      {tab === '3Dモデル' && <section className="improvement-demo__models">
        <div className="improvement-demo__model-list" aria-label="モデルを選択">{MODELS.map((item, i) => <button key={`${item.card.id}-${i}`} aria-pressed={modelIndex === i} onClick={() => { setModelIndex(i); setZoom(1); setResetKey(v => v + 1) }}>
          <SushiArt card={item.card} size={64} /><span>{item.card.name}</span>{item.card.variant === 'rare_corn' && <b>レア</b>}
        </button>)}</div>
        <div className="improvement-demo__model-panel">
          <div className="improvement-demo__model-heading"><div><small>3D PREVIEW</small><h2>{model.card.name}</h2></div><span>AP {model.card.cost} / 攻撃 {model.card.attack}</span></div>
          <div className="improvement-demo__canvas"><SushiModelViewer card={model.card} autoRotate={false} view={view} resetKey={resetKey} zoom={zoom} onZoomChange={setZoom} onInteraction={() => {}} />
            <div className="improvement-demo__icon-preview"><SushiArt card={model.card} size={104} /><span>カードのアイコン</span></div>
          </div>
          <div className="improvement-demo__view-tools">{(['angle', 'side', 'top'] as const).map((v, i) => <button key={v} aria-pressed={view === v} onClick={() => { setView(v); setResetKey(k => k + 1) }}>{['斜め', '真横', '真上'][i]}</button>)}
            <label>拡大 <input aria-label="モデルの拡大率" type="range" min="0.75" max="1.6" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
          </div>
          <p className="improvement-demo__model-note">{model.note}</p><small className="improvement-demo__hint">ドラッグで回転できます。</small>
        </div>
      </section>}

      {tab === 'カード効果' && <section>
        <div className="improvement-demo__aura"><div><small>合鴨の重複チェック</small><h2>生ハムの攻撃 <strong>{hamAttack}</strong></h2><p>合鴨を2枚置いても、強化は＋2のままです。</p></div>
          <div>{[0, 1, 2].map(n => <button key={n} aria-pressed={ducks === n} onClick={() => setDucks(n)}>合鴨 {n}枚</button>)}</div>
        </div>
        <div className="improvement-demo__cards">{CHANGED_IDS.map(id => {
          const item = card(id)
          return <article key={id}><SushiArt card={item} size={100} /><h2>{item.name}</h2><div className="improvement-demo__stats"><span>AP <b>{item.cost}</b></span><span>攻撃 <b>{item.attack}</b></span>{item.type === 'persist' && <span>{item.fullness}ターン</span>}</div>
            <p>{getCardEffectDescription(item, 'short')}</p>{id === 'seafood_gunkan' && <small>海鮮タグを追加</small>}{id === 'takowasa' && <small>軍艦・巻物タグを追加</small>}</article>
        })}</div>
      </section>}

      {tab === '防御・山札' && <section className="improvement-demo__utilities">
        <article><small>DEFENSE</small><h2>防御をひとつの画面に</h2><p>ガリと防御カードを選び、受ける攻撃を確認。</p>
          <label className="improvement-demo__select-label">防御カード<select value={guardId} onChange={e => setGuardId(e.target.value)}><option value="cheese">チーズ / ランダム25%</option><option value="saba">サバ / ランダム50%</option><option value="iwashi_shoga">イワシ生姜 / 選んだ1体50%</option></select></label>
          <label className="improvement-demo__check"><input type="checkbox" checked={seafood} onChange={e => setSeafood(e.target.checked)} />海の幸三昧の再攻撃を試す</label>
          <button className="improvement-demo__primary" onClick={() => { setDefense(makeDefense(guardId, seafood)); setDefenseResult('') }}>防御画面を開く</button>
          <p className="improvement-demo__result" role="status">{defenseResult}</p>
        </article>
        <article><small>DECK</small><h2>残りの山札を確認</h2><p>カードの種類と枚数を確認できます。</p><div className="improvement-demo__deck"><span>山札</span><DeckInspector entries={summarizeDeck(sampleDeck)} count={sampleDeck.length} /></div>
          <div className="improvement-demo__actions"><button disabled={!sampleDeck.length} onClick={() => setDrawn(n => n + 1)}>1枚引く</button><button onClick={() => setDrawn(0)}>山札を戻す</button></div>
        </article>
      </section>}

      {tab === '注文・遊び方' && <section className="improvement-demo__utilities">
        <article className="improvement-demo__chef"><small>大将のおすすめ</small><h2>750円分が500円に！</h2><p>（たまにハズレ）</p><div className="improvement-demo__mystery"><span>?</span><span>?</span><span>?</span></div>
          <button className="improvement-demo__primary" onClick={() => setOrder('omakase')}>注文画面を開く</button><p role="status">残金 ¥{draft.budget.toLocaleString()} / {draft.deck.length}皿 / 注文あと{draft.shinkansenLeft}回{orderNotice && ` · ${orderNotice}`}</p>
          <button onClick={() => { setDraft(createDraftState(1500, 3600, Date.now())); setOrderNotice('') }}>注文をリセット</button>
        </article>
        <article><small>HOW TO PLAY</small><h2>最初に、バトルの流れ</h2><p>絵で流れを確認し、カードの効果は短い文で。</p><button className="improvement-demo__primary" onClick={() => setHelp(true)}>遊び方を開く</button>
          <div className="improvement-demo__side-rules"><h3>後半のサイド購入</h3><p>{canReorderSideMenu(null) ? '未購入 → 購入できます' : '未購入 → 購入不可'}</p><p>{canReorderSideMenu({ id: 'chawanmushi', status: 'used', turnsLeft: null, usedThisTurn: false, purchaseCount: 1 }) ? '使い切りを使用済み → もう1品' : '使用済み → 購入不可'}</p><small>サイドの購入は1試合で計2品まで。</small></div>
        </article>
      </section>}
      <footer className="improvement-demo__footer">試作値：とびこ 75% → 50% → 25% → 0% ／ レアマヨコーン 2AP・攻撃12 ／ 合鴨の強化は重複なし</footer>
    </div>

    {help && <StaffHelpModal onClose={() => setHelp(false)} />}
    {order && <ShinkansenOrderModal budget={draft.budget} initialCategory={order} sideMenu={draft.sideMenu} sideMenuEnabled
      remainingOrders={draft.shinkansenLeft} canOrderSushi={draft.shinkansenLeft > 0 && draft.deck.length < 20}
      omakaseCards={draft.omakaseCards} deckCount={draft.deck.length} onClose={() => setOrder(null)}
      onOrder={item => { const next = orderShinkansen(draft, `demo-${Date.now()}`, item, Date.now()); if (next.accepted) setDraft({ ...next.state, shinkansenPlate: null }) }}
      onOrderSideMenu={id => { const next = purchaseSideMenu(draft, id, Date.now()); if (next.accepted) setDraft(next.state) }}
      onOrderOmakase={() => { const next = orderOmakase(draft, Date.now(), Math.random); if (next.accepted) { setDraft(next.state); setOrderNotice('大将のおすすめを購入しました') } }} />}
    {defense?.pendingAttack && <DefensePrompt attack={defense.pendingAttack} belly={defense.players[2].belly} gari={defense.players[2].gari}
      defenseCard={defense.players[2].field[0]} enemyField={defense.players[1].field} attackBuff={{}} kiretaStack={0} ready
      onRespond={(useGari, useDefense, targetFieldId) => {
        const next = transitionMatch(defense, { type: 'respond_defense', playerId: 2, useGari, useDefense, targetFieldId })
        if (next.error) { setDefenseResult(`選択を確認してください：${next.error}`); return }
        const damage = next.events.filter(event => event.type === 'damage' && event.playerId === 2).reduce((sum, event) => sum + (event.type === 'damage' ? event.amount : 0), 0)
        setDefenseResult(`受けた攻撃 ${damage} / ガリ残り ${next.state.players[2].gari}個`)
        setDefense(null)
      }} />}
  </main>
}
