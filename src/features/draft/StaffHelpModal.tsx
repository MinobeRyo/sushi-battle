import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import { SideMenuArt } from '../side-menu/SideMenuArt'
import { GENERATED_CARDS, getCardById } from '../../data/cards'
import { SIDE_MENUS } from '../../data/sideMenus'
import { COMBO_META, GUNKAN_BOOST, MAKI_COMP_3, MAKI_COMP_5, OBA_REQUIRED } from '../battle/battleEngine'
import './StaffHelpModal.css'

// ─── 遊び方のお品書き（ビルド・コンボ・サイドメニュー） ──────────────────

const getHelpCard = (id: string) => getCardById(id) ?? GENERATED_CARDS.find(card => card.id === id)

const HELP_SPREADS = [
  {
    kind: 'builds', sideMenuOffset: 0,
    title: '寿司の系統', footer: '基本のお品書き',
    running: ['赤身・巻物・光り物', '海鮮・肉寿司・汎用'],
    intro: ['同じ系統を集めてデッキに軸を。', '系統はカード左上のラベルで確認。'],
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
    intro: ['初回のレーン・タブレットで1品まで。価格は各品に記載。', '寿司20枚・特急3回とは別枠。自分のターンに0APで設置・使用。'],
  })),
  {
    kind: 'meat', sideMenuOffset: 0,
    title: '肉寿司と生ハム', footer: '肉寿司のお品書き',
    running: ['生ハムを用意する', '生贄で攻撃を強める'],
    intro: ['生成した生ハムも机の8枠を使います。', '生贄の数は召喚時に選べます。'],
  },
]

const BUILD_GUIDE = [
  { label: '赤身', cardId: 'maguro', specialty: '攻撃力で勝負', desc: 'マグロ・トロ系。高い攻撃力と三種盛りの強化で攻めます。' },
  { label: '巻物', cardId: 'kappa_maki', specialty: '揃えて強く', desc: '持続型を机に残して揃えます。軍艦も巻物に数えます。' },
  { label: '光り物', cardId: 'saba', specialty: '切れ味を重ねる', desc: 'サバ・アジなどで切れ味を貯め、攻撃や効果に使います。' },
  { label: '海鮮', cardId: 'ika', specialty: '連鎖を楽しむ', desc: 'いか・たこ・えび系。召喚の連鎖や海の幸三昧を狙います。' },
  { label: '肉寿司', cardId: 'wagyu', specialty: '生ハムを活用', desc: '牛タン・ローストビーフで生ハムを作り、カルビ・和牛の生贄にして攻撃を強化。' },
  { label: '汎用', cardId: 'tamago', specialty: '頼れる定番', desc: 'たまご・サーモンなど。低コストの攻撃やドローで支えます。' },
]

const COMBO_GUIDE = [
  {
    id: 'akami_mori', timing: '1試合に1回', cards: ['maguro', 'chutoro', 'otoro'],
    cond: 'マグロ・中トロ・大トロを各1回召喚（累計）。',
    effect: '相手のお腹 +10。以降、マグロ系の攻撃 +2。',
  },
  {
    id: 'maki_comp_3', timing: '1試合に1回', cards: ['kappa_maki', 'negitoro_maki', 'ikura_gunkan'],
    cond: `自分の机に巻物を同時に${MAKI_COMP_3}枚。`,
    effect: '以降、自分のターン終了時にドロー +1。',
    note: '巻物が減っても追加ドローは継続。',
  },
  {
    id: 'maki_comp_5', timing: '条件を満たす間', cards: ['uni_gunkan', 'ikura_gunkan', 'negitoro_gunkan'],
    cond: `自分の机に巻物を同時に${MAKI_COMP_5}枚。`,
    effect: `巻物${MAKI_COMP_5}枚以上の間、軍艦の攻撃 ×${GUNKAN_BOOST}。`,
  },
  {
    id: 'hikari_zanmai', timing: '1試合に1回', cards: ['saba', 'aji', 'kohada'],
    cond: `大葉つきを累計${OBA_REQUIRED}枚召喚（同じカードも可）。`,
    effect: '切れ味 +3。光り物の攻撃に加算。',
    note: '切れ味は一部のカード効果で消費。',
  },
  {
    id: 'umi_zanmai', timing: '新しいペアごと', cards: ['ika', 'tako', 'ebi'],
    cond: '自分の机に未ペアの「いか」系＋「たこ」系。',
    effect: '机の海鮮が50%の威力で再攻撃。',
    note: 'ペアは1枚1回。成立後も机に残ります。',
  },
  {
    id: 'niku_matsuri', timing: '各ターンに1回', cards: ['namahamu', 'karubi', 'wagyu'],
    cond: '同じターンに生ハムを合計2体生贄に。',
    effect: '即時5ダメージ。ガリでは防げません。',
    note: 'カルビ・和牛で使った合計。次のターンには再発動できます。',
  },
]

const MEAT_GUIDE = [
  { cardId: 'gyutan', title: '牛タン寿司', timing: '2AP・攻撃5', desc: '召喚時、生ハムを1体生成。', note: '寿司を置いた後の空き枠だけ生成します。' },
  { cardId: 'roast_beef', title: 'ローストビーフ寿司', timing: '4AP・攻撃10', desc: '召喚時、生ハムを最大2体生成。', note: '空きが1枠なら1体、0枠なら生成なし。' },
  { cardId: 'namahamu', title: '生ハム', timing: '攻撃1・3ターン持続', desc: '生成したターンを含む自分の3ターン攻撃。', note: '生成専用。購入やデッキ編成はできません。' },
  { cardId: 'karubi', title: 'カルビ寿司', timing: '3AP・攻撃9', desc: '生ハムを0〜1体生贄に。1体で攻撃＋7。', note: '強化は召喚したターンだけ有効です。' },
  { cardId: 'wagyu', title: '和牛にぎり', timing: '4AP・攻撃12', desc: '生ハムを0〜2体生贄に。1体につき攻撃＋8。', note: '生贄なしでも召喚できます。' },
  { cardId: 'namahamu', title: '生贄の選び方', timing: '召喚時に数を選択', desc: '古い生ハムから退場し、机の枠が空きます。', note: '机が満杯でも、生贄で枠を空ければ召喚可能。' },
]

export function StaffHelpModal({ onClose }: { onClose: () => void }) {
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
              <div className="help-book-pages" id={`${pageId}-spread`}>
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
                      {currentSpread.kind === 'builds' ? (
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
                      ) : currentSpread.kind === 'sideMenus' ? (
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
                                <p className="help-menu-description">初回注文で1品だけ。購入後の交換や追加注文はできません。</p>
                              </article>
                              <article className="help-menu-combo">
                                <h3>自分の手番に</h3>
                                <p className="help-menu-description">0APで使用・設置。寿司の机8枠を使いません。</p>
                              </article>
                              <article className="help-menu-combo">
                                <h3>肉寿司のお供に</h3>
                                <p className="help-menu-description">インバウン丼は肉丼ウニのせ。自分の生ハムと生贄による強化を支えます。</p>
                              </article>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="help-menu-combo-list">
                          {MEAT_GUIDE.slice(side * 3, side * 3 + 3).map((item) => {
                            const card = getHelpCard(item.cardId)
                            return (
                              <article className="help-menu-combo" key={item.title}>
                                <div className="help-menu-platter" aria-hidden="true">{card && <SushiArt card={card} size="100%" />}</div>
                                <div className="help-menu-combo-heading">
                                  <h3>{item.title}</h3>
                                  <span className="help-menu-timing">{item.timing}</span>
                                </div>
                                <p className="help-menu-description">{item.desc}</p>
                                <p className="help-menu-note">{item.note}</p>
                              </article>
                            )
                          })}
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
