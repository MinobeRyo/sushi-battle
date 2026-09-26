import { motion } from 'framer-motion'
import { COMBO_META, GUNKAN_BOOST, MAKI_COMP_3, MAKI_COMP_5, OBA_REQUIRED } from '../battle/battleEngine'

// ─── 店員さんの解説モーダル（ビルド・コンボ説明） ─────────────────────────────

const BUILD_GUIDE = [
  { label: '赤身', color: '#dc2626', desc: 'マグロ・トロ系です。高い攻撃力と、赤身三種盛りの強化で攻めます。' },
  { label: '巻物', color: '#16a34a', desc: '持続型を残し、机に枚数を揃えます。軍艦も巻物として数えます。' },
  { label: '光り物', color: '#2563eb', desc: 'サバ・アジなどで切れ味を貯め、攻撃を強化したり効果に使ったりします。' },
  { label: '海鮮', color: '#0891b2', desc: 'いか・たこ・えび系の召喚で、連鎖や海の幸三昧を狙います。' },
  { label: '肉寿司', color: '#ea580c', desc: '相手のお腹が増えると攻撃が強まるカードが多く、終盤に力を発揮します。' },
  { label: '汎用', color: '#78716c', desc: 'たまご・サーモンなどです。低コストの攻撃やドローでデッキを支えます。' },
]

const COMBO_GUIDE = [
  {
    id: 'akami_mori', timing: '1試合に1回',
    cond: '「マグロ」「中トロ」「大トロ」を各1回以上召喚します。ターンをまたいでも数えます。',
    effect: '相手のお腹 +10／以降、マグロ系の攻撃 +2',
  },
  {
    id: 'maki_comp_3', timing: '1試合に1回',
    cond: `自分の机に巻物を同時に${MAKI_COMP_3}枚揃えます。軍艦も含みます。`,
    effect: '以降、自分のターン終了時のドロー +1',
    note: '発動後は巻物が減っても、追加ドローは続きます。',
  },
  {
    id: 'maki_comp_5', timing: '条件を満たす間',
    cond: `自分の机に巻物を同時に${MAKI_COMP_5}枚揃えます。軍艦も含みます。`,
    effect: `机の巻物が${MAKI_COMP_5}枚以上ある間、軍艦の攻撃 ×${GUNKAN_BOOST}`,
  },
  {
    id: 'hikari_zanmai', timing: '1試合に1回',
    cond: `大葉トッピングのカードを累計${OBA_REQUIRED}枚召喚します。同じカードや別のターンの召喚も数えます。`,
    effect: '切れ味スタック +3',
    note: '切れ味は光り物の攻撃に加算され、一部のカード効果で消費します。',
  },
  {
    id: 'umi_zanmai', timing: '新しいペアごと',
    cond: '自分の机に、まだペアを組んでいない「いか」系と「たこ」系を揃えます。',
    effect: '机にある海鮮カードが50%の威力で再攻撃',
    note: '1枚につきペア成立は1回です。ペアになったカードも机に残ります。',
  },
  {
    id: 'niku_matsuri', timing: '各ターンに1回',
    cond: '同じターンに肉寿司を2枚召喚します。',
    effect: 'そのターン、肉寿司の終盤強化ボーナス ×2',
    note: '相手のお腹の量で増える分だけが2倍になります。',
  },
]

export function StaffHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, y: 14 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        style={{
          width: 420, maxWidth: '92%', maxHeight: '84%', overflowY: 'auto',
          borderRadius: 14, background: '#faf7f2', border: '2px solid #d5cec2',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)', padding: '14px 16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#44403c' }}>🧑‍🍳 店員さんの解説</span>
          <button onClick={onClose} aria-label="店員さんの解説を閉じる" style={{ border: 'none', background: '#e7e2d8', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', color: '#78716c', fontWeight: 800 }}>✕</button>
        </div>

        <p style={{ fontSize: 11, fontWeight: 800, color: '#b45309', margin: '0 0 6px' }}>■ ビルド（アーキタイプ）とは</p>
        <p style={{ fontSize: 10, color: '#57534e', margin: '0 0 8px', lineHeight: 1.6 }}>
          同じ系統の寿司を集めるとデッキに軸ができます。系統はカード左上のラベルで確認できます。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {BUILD_GUIDE.map((b) => (
            <div key={b.label} style={{ borderRadius: 8, background: 'white', border: `1px solid ${b.color}44`, padding: '6px 8px' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: b.color }}>● {b.label}</span>
              <p style={{ fontSize: 9, color: '#57534e', margin: '3px 0 0', lineHeight: 1.5 }}>{b.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, fontWeight: 800, color: '#b45309', margin: '0 0 6px' }}>■ コンボ（役）</p>
        <p style={{ fontSize: 10, color: '#57534e', margin: '0 0 8px', lineHeight: 1.6 }}>
          コンボごとに、累計の召喚数・机に同時にある枚数・同じターンの召喚数を確認します。条件と発動回数に合わせてカードを集めましょう。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {COMBO_GUIDE.map((c) => (
            <div key={c.id} style={{ borderRadius: 8, background: 'white', border: '1px solid #e0d9cc', padding: '8px 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '3px 8px' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#44403c' }}>{COMBO_META[c.id].name.replace(/！+$/, '')}</span>
                <span style={{ fontSize: 9, color: '#78716c' }}>{c.timing}</span>
              </div>
              <p style={{ fontSize: 10, color: '#57534e', margin: '5px 0 0', lineHeight: 1.6 }}>{c.cond}</p>
              <p style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, margin: '3px 0 0', lineHeight: 1.6 }}>{c.effect}</p>
              {c.note && <p style={{ fontSize: 9, color: '#78716c', margin: '3px 0 0', lineHeight: 1.6 }}>{c.note}</p>}
            </div>
          ))}
        </div>

      </motion.div>
    </motion.div>
  )
}
