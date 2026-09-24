import { motion } from 'framer-motion'

// ─── 店員さんの解説モーダル（ビルド・コンボ説明） ─────────────────────────────

const BUILD_GUIDE = [
  { label: '赤身', color: '#dc2626', desc: 'マグロ・トロ系。即時攻撃の火力が高い主力ビルド。' },
  { label: '巻物', color: '#16a34a', desc: '持続型が中心。場に数ターン残ってじわじわ攻める。' },
  { label: '光り物', color: '#2563eb', desc: 'サバ・アジ・コハダ。低〜中コストで手数を出しやすい。' },
  { label: '海鮮', color: '#0891b2', desc: 'たこ・いか・えび系。小回りの利く効果持ちが多い。' },
  { label: '肉寿司', color: '#ea580c', desc: '和牛・カルビなど高コスト高火力のロマン枠。' },
  { label: '汎用', color: '#78716c', desc: 'たまご・サーモンなど低コスト。序盤のテンポと繋ぎに。' },
]

const COMBO_GUIDE = [
  { name: '赤身三種盛り', cond: 'マグロ・中トロ・大トロを各1回召喚', effect: '相手のお腹 +10／以降マグロ系の攻撃 +2' },
  { name: '巻物コンプ', cond: '巻物を5枚召喚', effect: '以降、毎ターンドロー +1' },
  { name: '高級三昧', cond: '500円皿を3枚召喚', effect: '全ステータス +1' },
  { name: '光り物 ※実装予定', cond: '大葉トッピング3枚', effect: '切れ味 ×1.5' },
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
          <button onClick={onClose} style={{ border: 'none', background: '#e7e2d8', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', color: '#78716c', fontWeight: 800 }}>✕</button>
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
          バトル中の召喚を裏でカウントし、条件を満たした瞬間に演出つきで発動します。同一ターンに揃える必要はありません。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {COMBO_GUIDE.map((c) => (
            <div key={c.name} style={{ borderRadius: 8, background: 'white', border: '1px solid #e0d9cc', padding: '6px 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#44403c' }}>{c.name}</span>
                <span style={{ fontSize: 8.5, color: '#a8a29e' }}>{c.cond}</span>
              </div>
              <p style={{ fontSize: 9.5, color: '#0891b2', fontWeight: 700, margin: '3px 0 0' }}>{c.effect}</p>
            </div>
          ))}
        </div>

        <div style={{ borderRadius: 8, background: '#fff3c4', border: '1px solid #f0e0b0', padding: '7px 10px' }}>
          <span style={{ fontSize: 9.5, color: '#78350f', fontWeight: 700, lineHeight: 1.6 }}>
            💡 店員のおすすめ：「鉄火巻き」はマグロ(赤身)かつ巻物なので、両方のビルドとコンボを同時に進められる繋ぎの万能カードです。
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}
