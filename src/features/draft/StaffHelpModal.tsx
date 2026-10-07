import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import { SideMenuArt } from '../side-menu/SideMenuArt'
import { GENERATED_CARDS, getCardById } from '../../data/cards'
import { SIDE_MENUS } from '../../data/sideMenus'
import { useCompactLandscape } from '../../hooks/useCompactLandscape'
import { ScreenPager } from '../../components/ScreenPager'
import { COMBO_META, GUNKAN_BOOST, MAKI_COMP_3, MAKI_COMP_5, OBA_REQUIRED } from '../battle/battleEngine'
import './StaffHelpModal.css'

// ─── 遊び方のお品書き（ビルド・コンボ・サイドメニュー） ──────────────────

const getHelpCard = (id: string) => getCardById(id) ?? GENERATED_CARDS.find(card => card.id === id)

const HELP_SPREADS = [
  {
    kind: 'flow', sideMenuOffset: 0,
    title: '遊びの流れ', footer: '寿司を集めて、食べさせる',
    running: ['まずは寿司を集めよう', '相手を満腹にしよう'],
    intro: ['好きな寿司でデッキを作る。', '先に相手のお腹をいっぱいに！'],
  },
  {
    kind: 'builds', sideMenuOffset: 0,
    title: '寿司の系統', footer: '基本のお品書き',
    running: ['赤身・巻物・光り物', '海鮮・肉寿司・汎用'],
    intro: ['寿司のAPを払って召喚。ターン終了で攻撃。', '持続の寿司は場に残り、毎ターン攻撃。'],
  },
  {
    kind: 'combos', sideMenuOffset: 0,
    title: '名物合わせ盛り', footer: '合わせ技のお品書き',
    running: ['赤身と巻物の組み合わせ', '光り物・海鮮・肉寿司の組み合わせ'],
    intro: ['巻物には軍艦も含みます。', '条件を揃えるとコンボ（役）が発動。'],
  },
  ...Array.from({ length: Math.ceil(SIDE_MENUS.length / 6) }, (_, index) => ({
    kind: 'sideMenus', sideMenuOffset: index * 6,
    title: 'サイドメニュー', footer: 'もう一品のお品書き',
    running: index === 0 ? ['揚げ物の一品', '麺・汁物・蒸し物'] : ['こだわりの一品', '注文と使い方'],
    intro: ['注文枠を1回使用。特急・大将と共通3回。', '0APで使用。未購入・使い切り使用後は後半も購入可。'],
  })),
]

const BUILD_GUIDE = [
  { label: '赤身', cardId: 'maguro', specialty: '三種を揃える', desc: 'マグロ・中トロ・大トロで追加効果解放。' },
  { label: '巻物', cardId: 'kappa_maki', specialty: '机に並べる', desc: '3枚でドロー、5枚で軍艦を強化。' },
  { label: '光り物', cardId: 'saba', specialty: '切れ味を貯める', desc: '攻撃・ドロー・防御に使えます。' },
  { label: '海鮮', cardId: 'ika', specialty: '連鎖で攻める', desc: 'いか＋たこのペアで再攻撃。' },
  { label: '肉寿司', cardId: 'wagyu', specialty: '生ハムを活用', desc: '残して攻撃、または生贄で強化。' },
  { label: '汎用', cardId: 'tamago', specialty: '頼れる定番', desc: '回復・ドロー・除去で支えます。' },
]

const COMBO_GUIDE = [
  {
    id: 'akami_mori', timing: '1試合に1回', cards: ['maguro', 'chutoro', 'otoro'],
    cond: 'マグロ・中トロ・大トロを各1回召喚。',
    effect: '追加効果解放！',
    note: '相手のお腹＋10・マグロ系の攻撃＋2。詳細は各カードへ。',
  },
  {
    id: 'maki_comp_3', timing: '1試合に1回', cards: ['kappa_maki', 'negitoro_maki', 'ikura_gunkan'],
    cond: `机に巻物${MAKI_COMP_3}枚（軍艦もOK）。`,
    effect: '以降、ターン終了時に＋1枚ドロー。',
  },
  {
    id: 'maki_comp_5', timing: '条件を満たす間', cards: ['uni_gunkan', 'ikura_gunkan', 'negitoro_gunkan'],
    cond: `机に巻物${MAKI_COMP_5}枚（軍艦もOK）。`,
    effect: `揃っている間、軍艦の攻撃×${GUNKAN_BOOST}。`,
  },
  {
    id: 'hikari_zanmai', timing: '1試合に1回', cards: ['saba', 'aji', 'kohada'],
    cond: `大葉つきを合計${OBA_REQUIRED}枚召喚。`,
    effect: '切れ味＋3。光り物の攻撃アップ。',
  },
  {
    id: 'umi_zanmai', timing: '新しいペアごと', cards: ['ika', 'tako', 'ebi'],
    cond: '机に未使用のいか＋たこ。',
    effect: '海鮮の攻撃50％で再攻撃。',
    note: '通常のえび1枚ごとに＋7。',
  },
  {
    id: 'niku_matsuri', timing: '各ターンに1回', cards: ['namahamu', 'karubi', 'wagyu'],
    cond: '同じターンに生ハム2体を生贄。',
    effect: '5ダメージ・生ハムを山札に1枚。',
    note: '以降、全生ハムの攻撃＋1（累積）。',
  },
]

function BattleFlowGuide({ side }: { side: number }) {
  const maguro = getHelpCard('maguro')
  const maki = getHelpCard('kappa_maki')
  const tamago = getHelpCard('tamago')
  return side === 0 ? (
    <div className="help-flow">
      <article className="help-flow-step">
        <h3><span>1</span>寿司をとる</h3>
        <div className="help-flow-shopping">
          <strong>¥3,000<span>分</span></strong>
          <div className="help-flow-plates">{[maguro, maki, tamago].map(card => card && <SushiArt key={card.id} card={card} size="100%" />)}</div>
        </div>
        <p>好きな寿司を選ぼう！</p>
      </article>
      <div className="help-flow-down" aria-hidden="true">↓</div>
      <article className="help-flow-step">
        <h3><span>2</span>バトルに進む！</h3>
        <div className="help-flow-match" aria-hidden="true">
          <div><div className="help-flow-face"><i /><i /><b /></div><span>自分</span></div>
          <strong>VS</strong>
          <div><div className="help-flow-face"><i /><i /><b /></div><span>相手</span></div>
        </div>
      </article>
    </div>
  ) : (
    <div className="help-flow">
      <article className="help-flow-step">
        <h3><span>3</span>寿司を食べさせる！</h3>
        <div className="help-flow-illustration" aria-hidden="true">
          <div className="help-flow-card">{maguro && <SushiArt card={maguro} size="100%" />}<span>召喚</span></div>
          <span className="help-flow-arrow">→</span>
          <div className="help-flow-eat"><div className="help-flow-face"><i /><i /><b /></div><span>相手</span></div>
        </div>
        <p>寿司を出して、相手のお腹を満たそう。</p>
      </article>
      <div className="help-flow-down" aria-hidden="true">↓</div>
      <article className="help-flow-step help-flow-goal">
        <h3><span>4</span>先に満腹にして勝利！</h3>
        <div className="help-flow-fullness" aria-label="相手のお腹が100になると勝利">
          <strong>100</strong>
          <div className="help-flow-gauge"><span /></div>
          <b className="help-flow-win">勝利！</b>
        </div>
      </article>
    </div>
  )
}

export function StaffHelpModal({ onClose }: { onClose: () => void }) {
  return useCompactLandscape() ? <CompactHelpModal onClose={onClose} /> : <BookHelpModal onClose={onClose} />
}

function CompactHelpModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [section, setSection] = useState<'flow' | 'builds' | 'combos' | 'sides'>('flow')
  const [page, setPage] = useState(0)
  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  const pages = section === 'flow' ? 2 : section === 'sides' ? Math.ceil(SIDE_MENUS.length / 2) + 1 : 3
  const flow = [
    { title: '1. 寿司をとる', cardId: 'maguro', headline: '軍資金 ¥3,000', text: '流れる寿司を選び、20枚まで集めます。準備ができたらバトルへ。' },
    { title: '2. 寿司を召喚', cardId: 'tamago', headline: 'カードを選ぶ → 召喚', text: 'APを使って寿司を出します。即時はその場で攻撃、持続は机に残ります。' },
    { title: '3. ターン終了', cardId: 'kappa_maki', headline: '机の寿司で毎ターン攻撃', text: '召喚が終わったら「ターン終了」。持続の寿司が攻撃し、相手の番になります。' },
    { title: '4. 相手を満腹に', cardId: 'otoro', headline: '相手のお腹 100 で勝利', text: 'ガリは1個で攻撃を半減。切れ味やサイドメニューも活用しましょう。' },
  ]
  return (
    <dialog ref={dialogRef} className="compact-help" aria-labelledby="compact-help-title" onCancel={event => { event.preventDefault(); onClose() }}>
      <header><h2 id="compact-help-title">遊び方</h2><button autoFocus onClick={onClose} aria-label="遊び方を閉じる">閉じる ×</button></header>
      <nav className="compact-help-tabs" aria-label="遊び方の項目">
        {([['flow', '遊びの流れ'], ['builds', '寿司の系統'], ['combos', 'コンボ'], ['sides', 'サイドメニュー']] as const).map(([value, label]) => <button key={value} aria-pressed={section === value} onClick={() => { setSection(value); setPage(0) }}>{label}</button>)}
      </nav>
      <div className="compact-help-cards" key={`${section}-${page}`}>
        {section === 'flow' && flow.slice(page * 2, page * 2 + 2).map(step => <article key={step.title}><h3>{step.title}</h3><div className="compact-help-art"><SushiArt card={getHelpCard(step.cardId)!} size="100%" /></div><strong>{step.headline}</strong><p>{step.text}</p></article>)}
        {section === 'builds' && BUILD_GUIDE.slice(page * 2, page * 2 + 2).map(build => <article key={build.label}><h3>{build.label}</h3><div className="compact-help-art"><SushiArt card={getHelpCard(build.cardId)!} size="100%" /></div><strong>{build.specialty}</strong><p>{build.desc}</p></article>)}
        {section === 'combos' && COMBO_GUIDE.slice(page * 2, page * 2 + 2).map(combo => <article key={combo.id}><h3>{COMBO_META[combo.id].name.replace(/！+$/, '')}</h3><div className="compact-help-art">{combo.cards.map(id => <SushiArt key={id} card={getHelpCard(id)!} size="100%" />)}</div><small>{combo.timing}</small><p>{combo.cond}</p><strong>{combo.effect}</strong>{combo.note && <p>{combo.note}</p>}</article>)}
        {section === 'sides' && SIDE_MENUS.slice(page * 2, page * 2 + 2).map(menu => <article key={menu.id}><h3>{menu.name} <small>¥{menu.price}</small></h3><div className="compact-help-art"><SideMenuArt id={menu.id} /></div><strong>{menu.timing}</strong><p>{menu.effect}</p></article>)}
        {section === 'sides' && page === pages - 1 && <><article><h3>サイドの注文</h3><strong>特急・大将と共通で3回</strong><p>注文枠を1回使って購入します。寿司20枚の枠には含まれません。</p><p>未購入なら後半も購入できます。使い切りは使用後にもう一度、計2回まで。</p></article><article><h3>サイドの使い方</h3><strong>自分の番に0APで使用</strong><p>寿司の机8枠を使わずに設置できます。</p><p>大将のおすすめは750円分が500円に。たまにハズレもあります。</p></article></>}
      </div>
      <ScreenPager page={page} pages={pages} onPageChange={setPage} />
    </dialog>
  )
}

function BookHelpModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [spread, setSpread] = useState(0)
  const [turn, setTurn] = useState<1 | -1 | null>(null)
  const pageId = useId()
  const reducedMotion = useReducedMotion()
  const currentSpread = HELP_SPREADS[spread]

  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  const turnPage = (direction: 1 | -1) => {
    const next = spread + direction
    if (turn !== null || next < 0 || next >= HELP_SPREADS.length) return
    setSpread(next)
    if (!reducedMotion) setTurn(direction)
  }

  return (
    <motion.dialog
      ref={dialogRef}
      className="help-menu-overlay"
      aria-label="遊び方のお品書き"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={`help-book-stage ${bookOpen ? 'is-open' : 'is-closed'}`}>
        <button className="help-menu-close" onClick={onClose} aria-label="遊び方を閉じる" autoFocus>×</button>
        <AnimatePresence initial={false} mode="wait">
          {!bookOpen ? (
            <motion.button
              key="cover"
              className="help-book-cover"
              aria-label="お品書きの表紙を開く"
              onClick={() => { setSpread(0); setTurn(null); setBookOpen(true) }}
              initial={{ rotateY: reducedMotion ? 0 : -85, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: reducedMotion ? 0 : -105, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeInOut' }}
              style={{ transformOrigin: 'left center' }}
            >
              <span className="help-book-cover-eyebrow">寿司デッキバトル</span>
              <span className="help-book-cover-title">お品書き</span>
              <span className="help-book-cover-seal">遊び方</span>
              <span className="help-book-cover-open">表紙を開く <span aria-hidden="true">→</span></span>
            </motion.button>
          ) : (
            <motion.div
              key="pages"
              className="help-book-spread"
              initial={{ rotateY: reducedMotion ? 0 : 8, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: reducedMotion ? 0 : 8, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.25, ease: 'easeOut' }}
            >
              <div key={spread} className="help-book-pages" id={`${pageId}-spread`}>
                {[0, 1].map((side) => (
                  <section
                    key={side}
                    className={`help-book-page ${side === 0 ? 'help-book-page--builds' : 'help-book-page--combos'}`}
                    aria-labelledby={`${pageId}-${side}-heading`}
                  >
                    <div className="help-book-page-content">
                      <header className="help-book-page-heading">
                        <p className="help-book-running-title">{currentSpread.running[side]}</p>
                        <h2 id={`${pageId}-${side}-heading`}>{currentSpread.title}</h2>
                        <p className="help-menu-intro">{currentSpread.intro[side]}</p>
                      </header>
                      {currentSpread.kind === 'flow' ? (
                        <BattleFlowGuide side={side} />
                      ) : currentSpread.kind === 'builds' ? (
                        <div className="help-menu-builds">
                          {BUILD_GUIDE.slice(side * 3, side * 3 + 3).map((build) => {
                            const card = getHelpCard(build.cardId)
                            return (
                              <article className="help-menu-build" key={build.label}>
                                <div className="help-menu-dish">
                                  <div className="help-menu-art" aria-hidden="true">{card && <SushiArt card={card} size="100%" />}</div>
                                  <h3>{build.label}</h3>
                                </div>
                                <p className="help-menu-specialty">{build.specialty}</p>
                                <p className="help-menu-description">{build.desc}</p>
                              </article>
                            )
                          })}
                        </div>
                      ) : currentSpread.kind === 'combos' ? (
                        <div className="help-menu-combo-list">
                          {COMBO_GUIDE.slice(side * 3, side * 3 + 3).map((combo) => (
                            <article className="help-menu-combo" key={combo.id}>
                              <div className="help-menu-platter" aria-hidden="true">{combo.cards.map((cardId) => {
                                const card = getHelpCard(cardId)
                                return card ? <SushiArt key={cardId} card={card} size="100%" /> : null
                              })}</div>
                              <div className="help-menu-combo-heading">
                                <h3>{COMBO_META[combo.id].name.replace(/！+$/, '')}</h3>
                                <span className="help-menu-timing">{combo.timing}</span>
                              </div>
                              <p className="help-menu-description">{combo.cond}</p>
                              <p className="help-menu-effect">{combo.effect}</p>
                              {combo.note && <p className="help-menu-note">{combo.note}</p>}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="help-menu-combo-list">
                          {SIDE_MENUS.slice(currentSpread.sideMenuOffset + side * 3, currentSpread.sideMenuOffset + side * 3 + 3).map((menu) => (
                            <article className="help-menu-combo help-menu-side" key={menu.id}>
                              <div className="help-menu-platter" aria-hidden="true"><SideMenuArt id={menu.id} /></div>
                              <div className="help-menu-combo-heading">
                                <h3>{menu.name}</h3>
                                <span className="help-menu-timing">¥{menu.price.toLocaleString()}</span>
                              </div>
                              <p className="help-menu-description">{menu.effect}</p>
                              <p className="help-menu-note">{menu.timing}</p>
                            </article>
                          ))}
                          {currentSpread.sideMenuOffset + side * 3 >= SIDE_MENUS.length && (
                            <>
                              <article className="help-menu-combo">
                                <h3>専用の一枠</h3>
                                <p className="help-menu-description">未購入なら後半も購入可。使い切りは使用後にもう一度、計2回まで。</p>
                              </article>
                              <article className="help-menu-combo">
                                <h3>自分の手番に</h3>
                                <p className="help-menu-description">0APで使用・設置。寿司の机8枠を使いません。</p>
                              </article>
                              <article className="help-menu-combo">
                                <h3>大将のおすすめ</h3>
                                <p className="help-menu-description">750円分が500円に！（たまにハズレ）</p>
                              </article>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="help-book-page-bottom"><span>{currentSpread.footer}</span><span>{['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][spread * 2 + side] ?? spread * 2 + side + 1}</span></div>
                  </section>
                ))}
                {turn !== null && (
                  <motion.div
                    className="help-book-turning-leaf"
                    aria-hidden="true"
                    style={{ width: '50%', ...(turn === 1 ? { right: 0 } : { left: 0 }), transformOrigin: turn === 1 ? 'left center' : 'right center' }}
                    initial={{ rotateY: 0, opacity: 1 }}
                    animate={{ rotateY: turn === 1 ? -180 : 180, opacity: [1, 1, 0] }}
                    transition={{ duration: 0.48, ease: 'easeInOut', opacity: { times: [0, 0.85, 1], duration: 0.48 } }}
                    onAnimationComplete={() => setTurn(null)}
                  />
                )}
              </div>
              <footer className="help-book-controls">
                <button onClick={() => { setTurn(null); setBookOpen(false) }}>表紙に戻る</button>
                <nav className="help-book-pagination" aria-label="見開きをめくる">
                  <button disabled={spread === 0 || turn !== null} aria-controls={`${pageId}-spread`} onClick={() => turnPage(-1)} aria-label="前の見開きへ">← 前へ</button>
                  <span role="status">{spread + 1} / {HELP_SPREADS.length} <span>見開き</span></span>
                  <button disabled={spread === HELP_SPREADS.length - 1 || turn !== null} aria-controls={`${pageId}-spread`} onClick={() => turnPage(1)} aria-label="次の見開きへ">次へ →</button>
                </nav>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.dialog>
  )
}
