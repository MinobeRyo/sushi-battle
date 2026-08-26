#!/usr/bin/env node
// すしバトル データシート生成スクリプト
//
//   node scripts/gen-datasheet.mjs
//   → docs/すしバトル_データシート.html を書き出す
//
// カードの数値・枚数・コンボの対象カードはすべて src/ から読み取って計算する。
// 手書きの数値はこのファイルに存在しない。カードやルールを変えたら再実行すること。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.SUSHI_ROOT ?? path.resolve(HERE, '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(ROOT, 'docs', 'すしバトル_データシート.html')

const read = p => fs.readFileSync(p, 'utf8')

// ─── src/data/cards.ts からカードを読み取る ──────────────────────────────────

function parseCards(source) {
  const body = source.slice(source.indexOf('export const CARDS'))
  const cards = []
  const re = /\{\s*\n\s*id: '([^']+)',(.*?)\n  \},/gs
  let m
  while ((m = re.exec(body)) !== null) {
    const [, id, fields] = m
    const str = k => {
      const mm = fields.match(new RegExp(`\\n\\s*${k}: (null|'[^']*')`))
      return mm ? (mm[1] === 'null' ? null : mm[1].slice(1, -1)) : null
    }
    const num = k => {
      const mm = fields.match(new RegExp(`\\n\\s*${k}: (\\d+)`))
      return mm ? Number(mm[1]) : 0
    }
    const list = k => {
      const mm = fields.match(new RegExp(`\\n\\s*${k}: \\[([^\\]]*)\\]`))
      if (!mm) return []
      return mm[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
    }
    cards.push({
      id,
      name: str('name'), base: str('base'), subBases: list('subBases'),
      topping: str('topping'), type: str('type'),
      cost: num('cost'), price: num('price'),
      attack: num('attack'), fullness: num('fullness'),
      effect: str('effect'), archetype: list('archetype'), lane: str('lane'),
    })
  }
  if (!cards.length) throw new Error('cards.ts からカードを1枚も読み取れませんでした')
  const declared = (body.match(/^ {4}id: '/gm) ?? []).length
  if (cards.length !== declared) {
    throw new Error(`読み取り漏れ: 宣言 ${declared}枚 に対し ${cards.length}枚しか解析できませんでした`)
  }
  return cards
}

// ─── 定数を BattleScreen / DraftScreenThree から読み取る ─────────────────────

function parseConst(source, name) {
  const m = source.match(new RegExp(`^const ${name} = (\\d+(?:\\.\\d+)?)`, 'm'))
  if (!m) throw new Error(`定数 ${name} が見つかりません`)
  return Number(m[1])
}

// ─── 派生値 ──────────────────────────────────────────────────────────────────

const turnsOf = c => (c.type === 'persist' ? Math.max(c.fullness, 2) : 1)
const allBases = c => [c.base, ...c.subBases]
const round2 = n => Math.round(n * 100) / 100

// ─── メイン ──────────────────────────────────────────────────────────────────

const cardsSrc = read(path.join(SRC, 'data/cards.ts'))
const battleSrc = read(path.join(SRC, 'features/battle/BattleScreen.tsx'))
const draftSrc = read(path.join(SRC, 'features/draft/DraftScreenThree.tsx'))

const cards = parseCards(cardsSrc)

const K = {
  MAX_BELLY: parseConst(battleSrc, 'MAX_BELLY'),
  HAND_LIMIT: parseConst(battleSrc, 'HAND_LIMIT'),
  FIELD_MAX: parseConst(battleSrc, 'FIELD_MAX'),
  INIT_AP: parseConst(battleSrc, 'INIT_AP'),
  DIGESTION_MAX: parseConst(battleSrc, 'DIGESTION_MAX'),
  CHAIN_BONUS: parseConst(battleSrc, 'CHAIN_BONUS'),
  DIGEST_BOOST: parseConst(battleSrc, 'DIGEST_BOOST'),
  MAKI_COMP_3: parseConst(battleSrc, 'MAKI_COMP_3'),
  MAKI_COMP_5: parseConst(battleSrc, 'MAKI_COMP_5'),
  OBA_REQUIRED: parseConst(battleSrc, 'OBA_REQUIRED'),
  KIRETA_MULT: parseConst(battleSrc, 'KIRETA_MULT'),
  NIKU_REQUIRED: parseConst(battleSrc, 'NIKU_REQUIRED'),
  REORDER_BUDGET: parseConst(battleSrc, 'REORDER_BUDGET'),
  REORDER_SECONDS: parseConst(battleSrc, 'REORDER_SECONDS'),
  DRAFT_SECONDS: parseConst(draftSrc, 'DRAFT_SECONDS'),
  INITIAL_BUDGET: parseConst(draftSrc, 'INITIAL_BUDGET'),
  SHINKANSEN_TOTAL: parseConst(draftSrc, 'SHINKANSEN_TOTAL'),
  GUNKAN_BOOST: parseConst(battleSrc, 'GUNKAN_BOOST'),
  KAISEN_REATTACK: parseConst(battleSrc, 'KAISEN_REATTACK'),
}

// 海鮮連鎖のトリガー base をコードから読み取る
const chainBases = (() => {
  const m = battleSrc.match(/const CHAIN_TRIGGER_BASES = new Set\(\[([^\]]*)\]\)/)
  if (!m) throw new Error('CHAIN_TRIGGER_BASES が見つかりません')
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
})()

// 効果キーワードの説明文（挙動の要約。該当カードは自動集計する）
const EFFECTS = {
  self_digest_5: '召喚時、自分のお腹 −5（消化促進）',
  digest_boost_2: `机にいる間、毎ターンの消化量 +${K.DIGEST_BOOST}`,
  digest_stop_1t: '召喚時、相手の消化を1ターン止める',
  kireta_stack: '召喚時、切れ味スタック +1',
  kireta_consume_x3: `切れ味スタックを全消費し、スタック数×${K.KIRETA_MULT}のダメージ`,
  kireta_consume_2_draw_2: '切れ味スタックを2消費して2枚ドロー（2未満なら不発・消費もしない）',
  belly_boost_60: '相手のお腹が60以上のとき 攻撃 +5',
  belly_boost_65: '相手のお腹が65以上のとき 攻撃 +6',
  belly_boost_70: '相手のお腹が70以上のとき 攻撃 +8',
  belly_boost_persist_50: '机にいる間、相手のお腹50以上で 攻撃 +2',
  chain_on_kaisen_summon: `base「${chainBases.join('・')}」を召喚するたび +${K.CHAIN_BONUS} の連鎖攻撃`,
  draw_1: '召喚時、カードを1枚引く',
  draw_2: '召喚時、カードを2枚引く',
  ap_next_1: '次のターンだけ AP +1',
  multi_base: 'base「マグロ」「えび」も兼ねる（赤身バフ・海鮮連鎖の対象）',
}

// コードに存在する効果キーが説明文から漏れていないか検査する
{
  const used = new Set(cards.map(c => c.effect).filter(Boolean))
  const missing = [...used].filter(e => !(e in EFFECTS))
  if (missing.length) throw new Error(`効果の説明文がありません: ${missing.join(', ')}`)
}

const ARCH = { akami: '赤身', makimono: '巻物', gunkan: '軍艦', hikari: '光り物', kaisen: '海鮮', niku: '肉寿司', general: '汎用' }

// コンボ定義。対象カードは関数で求めるので手書きしない。
const COMBOS = [
  {
    id: 'akami_mori', name: '赤身三種盛り！！！', emoji: '🐟', color: 'akami',
    trigger: '永続効果 · 1試合1回', state: 'impl',
    cond: 'マグロ・中トロ・大トロを各1回以上召喚（累積）',
    effect: '即時 <strong>+10</strong> ダメージ ／ 以降 base「マグロ」の攻撃 <strong>+2</strong>',
    lists: [
      ['成立に必要なカード', cs => cs.filter(c => ['maguro', 'chutoro', 'otoro'].includes(c.id))],
      ['バフを受けるカード（base マグロ）', cs => cs.filter(c => allBases(c).includes('マグロ'))],
    ],
    note: '成立判定はカードIDなので、他のマグロ系カードでは成立しません（恩恵だけ受けます）。永続バフを配るため1試合1回に固定しています。',
  },
  {
    id: 'maki_comp_3', name: '巻物コンプ！！！', emoji: '🌀', color: 'makimono',
    trigger: '永続効果 · 1試合1回', state: 'impl',
    cond: `机に巻物タグのカードが<strong>同時に${K.MAKI_COMP_3}枚</strong>`,
    effect: '以降のドロー枚数 <strong>+1</strong>',
    lists: [['判定に数えるカード（巻物タグ持ち）', cs => cs.filter(c => c.archetype.includes('makimono'))]],
    note: '即時型の軍艦も机にいる間は数えます。ダメージはありません。',
  },
  {
    id: 'maki_comp_5', name: '巻物フルコンプ！！！', emoji: '🍙', color: 'gunkan',
    trigger: '状態継続 · 条件を満たす間ずっと', state: 'impl',
    cond: `机に巻物タグのカードが<strong>同時に${K.MAKI_COMP_5}枚</strong>`,
    effect: `軍艦カードの攻撃 <strong>×${K.GUNKAN_BOOST}</strong>（端数切り捨て）`,
    lists: [['倍率を受けるカード（軍艦タグ）', cs => cs.filter(c => c.archetype.includes('gunkan'))]],
    note: '発動フラグを持たない状態判定なので、机が5枚を割ると効果も消えます。持続型の巻物は倍率を受けません。',
  },
  {
    id: 'hikari_zanmai', name: '光り物三昧！！！', emoji: '✨', color: 'hikari',
    trigger: '永続効果 · 1試合1回', state: 'impl',
    cond: `大葉トッピングのカードを累計 <strong>${K.OBA_REQUIRED}枚</strong> 召喚`,
    effect: '切れ味スタック <strong>+3</strong>',
    lists: [['大葉トッピングのカード', cs => cs.filter(c => c.topping === '大葉')]],
    note: '大葉カードは同APの通常版より攻撃が2低く定価も高いぶん、コンボで取り返す設計です。種類が少ないので同名カードの重複購入が前提になります。',
  },
  {
    id: 'umi_zanmai', name: '海の幸三昧！！！', emoji: '🌊', color: 'kaisen',
    trigger: '都度発動 · 何度でも', state: 'impl',
    cond: 'base「いか」と「たこ」が机で1組そろった瞬間（召喚時に判定）',
    effect: `場の海鮮カードが <strong>${K.KAISEN_REATTACK * 100}%</strong> の威力で再攻撃`,
    lists: [
      ['「いか」を名乗るカード', cs => cs.filter(c => allBases(c).includes('いか'))],
      ['「たこ」を名乗るカード', cs => cs.filter(c => allBases(c).includes('たこ'))],
      ['再攻撃する対象（海鮮タグ）', cs => cs.filter(c => c.archetype.includes('kaisen'))],
    ],
    note: '発動に使った2枚はペア消費済みになり、以後ペアの相手には選ばれません。海鮮タグと連鎖効果は残るので、再攻撃の対象にも連鎖の起爆装置にもなり続けます。机に残した持続いか・たこと次のターンに組むこともできます。えびはペア対象外です。',
  },
  {
    id: 'niku_matsuri', name: '肉祭り！！！', emoji: '🥩', color: 'niku',
    trigger: '都度発動 · ターンに1回', state: 'impl',
    cond: `同じターンに肉寿司アーキタイプを <strong>${K.NIKU_REQUIRED}枚</strong> 召喚`,
    effect: 'そのターンの終盤強化ボーナス（お腹条件のボーナス）を <strong>×2</strong>',
    lists: [['対象カード', cs => cs.filter(c => c.archetype.includes('niku'))]],
    note: '相手のお腹が条件に達していないと効果はありません。牛タン寿司だけ終盤強化ボーナスを持たないため恩恵を受けません。',
  },
  {
    id: 'kokyu_zanmai', name: '高級三昧', emoji: '💴', color: 'general',
    trigger: '未実装 · MVP対象外と決定済み', state: 'todo',
    cond: '500円皿を累計 <strong>3枚</strong> 召喚',
    effect: '全ステータス <strong>+1</strong>',
    lists: [['¥500以上のカード', cs => cs.filter(c => c.price >= 500)]],
    note: 'implementation_flow.md で「MVPには含めない（v1.1）」と決定済みです。',
  },
]

// ─── HTML 組み立て ───────────────────────────────────────────────────────────

const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))

const rows = cards.map(c => ({
  ...c,
  turns: turnsOf(c),
  total: c.attack * turnsOf(c),
  apEff: round2((c.attack * turnsOf(c)) / c.cost),
  yenEff: round2(((c.attack * turnsOf(c)) / c.price) * 100),
}))

const archCounts = Object.keys(ARCH).map(a => ({
  key: a, label: ARCH[a], n: cards.filter(c => c.archetype.includes(a)).length,
})).sort((x, y) => y.n - x.n)

const comboHtml = COMBOS.map(k => {
  const lists = k.lists.map(([label, fn]) => {
    const hit = fn(cards)
    return `<dt>${esc(label)}</dt><dd>${hit.length ? `<strong>${hit.length}枚</strong> — ${hit.map(c => esc(c.name)).join(' · ')}` : '<span class="dash">該当なし</span>'}</dd>`
  }).join('')
  return `
    <article class="combo${k.state === 'todo' ? ' todo' : ''}" style="--c:var(--${k.color})">
      <h4><span>${k.emoji}</span>${esc(k.name)}</h4>
      <span class="trig${k.state === 'todo' ? ' todo' : ''}">${esc(k.trigger)}</span>
      <dl>
        <dt>条件</dt><dd>${k.cond}</dd>
        <dt>効果</dt><dd>${k.effect}</dd>
        ${lists}
        <dt>備考</dt><dd>${esc(k.note)}</dd>
      </dl>
    </article>`
}).join('')

const kwHtml = Object.entries(EFFECTS).map(([key, desc]) => {
  const users = cards.filter(c => c.effect === key)
  return `<div><code>${esc(key)}</code><p>${esc(desc)}<br><span class="users">${
    users.length ? `${users.length}枚 — ${users.map(c => esc(c.name)).join(' · ')}` : '該当なし'
  }</span></p></div>`
}).join('')

const stat = (label, value, note) =>
  `<div class="stat"><dt>${esc(label)}</dt><dd>${esc(value)}<span class="note">${esc(note)}</span></dd></div>`

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>すしバトル データシート</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap">
<style>
:root{
  --bg:#f2f1ec; --surface:#fff; --surface-2:#eceae3;
  --ink:#191c1e; --ink-2:#4b524f; --muted:#787f79;
  --rule:#dcdad0; --rule-2:#c9c6b9;
  --accent:#1e3f70; --accent-ink:#1e3f70; --accent-soft:#dfe6f0;
  --warn:#8a5a10; --warn-soft:#f6ecd8;
  --shadow:0 1px 0 rgba(25,28,30,.05), 0 6px 18px -12px rgba(25,28,30,.35);
  --akami:#b23a2c; --makimono:#2f7d4f; --hikari:#2b5fb8;
  --kaisen:#0d7280; --niku:#9a5518; --general:#6c6558;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#12151a; --surface:#191d24; --surface-2:#20252d;
    --ink:#e9eae5; --ink-2:#b4bab6; --muted:#8b938f;
    --rule:#2a3038; --rule-2:#3a424c;
    --accent:#93b6e6; --accent-ink:#a9c7f0; --accent-soft:#1d2a3d;
    --warn:#e0b361; --warn-soft:#2c2415;
    --shadow:0 1px 0 rgba(0,0,0,.3), 0 8px 22px -14px rgba(0,0,0,.9);
    --akami:#e4776a; --makimono:#6cc38e; --hikari:#7ba7ee;
    --kaisen:#4ebccb; --niku:#d9985a; --general:#a9a294;
  }
}
:root[data-theme="dark"]{
  --bg:#12151a; --surface:#191d24; --surface-2:#20252d;
  --ink:#e9eae5; --ink-2:#b4bab6; --muted:#8b938f;
  --rule:#2a3038; --rule-2:#3a424c;
  --accent:#93b6e6; --accent-ink:#a9c7f0; --accent-soft:#1d2a3d;
  --warn:#e0b361; --warn-soft:#2c2415;
  --shadow:0 1px 0 rgba(0,0,0,.3), 0 8px 22px -14px rgba(0,0,0,.9);
  --akami:#e4776a; --makimono:#6cc38e; --hikari:#7ba7ee;
  --kaisen:#4ebccb; --niku:#d9985a; --general:#a9a294;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;
  font-size:15px;line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px 96px}
header.masthead{border-bottom:1px solid var(--rule);background:var(--surface)}
.masthead .wrap{padding-top:44px;padding-bottom:28px}
.kicker{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;color:var(--muted);margin:0 0 10px}
h1{font-family:"Shippori Mincho B1",serif;font-weight:800;font-size:clamp(30px,5vw,46px);
  letter-spacing:.02em;line-height:1.25;margin:0;text-wrap:balance}
.sub{margin:12px 0 0;color:var(--ink-2);max-width:64ch}
.meta{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px 10px;
  font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--muted)}
.meta code{background:var(--surface-2);border:1px solid var(--rule);border-radius:4px;padding:2px 7px;color:var(--ink-2)}
nav.toc{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--bg) 90%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--rule)}
nav.toc .wrap{display:flex;gap:4px;overflow-x:auto;padding-top:0;padding-bottom:0}
nav.toc a{flex:0 0 auto;padding:12px;font-size:13px;font-weight:500;color:var(--ink-2);
  text-decoration:none;border-bottom:2px solid transparent}
nav.toc a:hover{color:var(--accent-ink);border-bottom-color:var(--rule-2)}
nav.toc a:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:3px}
section{margin-top:56px;scroll-margin-top:60px}
h2{font-family:"Shippori Mincho B1",serif;font-weight:600;font-size:23px;margin:0 0 6px;
  letter-spacing:.02em;display:flex;align-items:baseline;gap:12px}
h2 .n{font-family:"JetBrains Mono",monospace;font-size:12px;font-weight:400;color:var(--accent-ink);letter-spacing:.1em}
h3{font-family:"Shippori Mincho B1",serif;font-weight:600;font-size:17px;margin:0}
.subhead{display:flex;align-items:baseline;gap:10px;margin:34px 0 12px}
.subhead span{font-size:12px;color:var(--muted)}
.lede{color:var(--ink-2);margin:0 0 20px;max-width:70ch;font-size:14px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:10px}
.stat{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:13px 15px}
.stat dt{font-size:11.5px;color:var(--muted);margin:0}
.stat dd{margin:2px 0 0;font-family:"JetBrains Mono",monospace;font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}
.stat .note{display:block;font-family:"Zen Kaku Gothic New",sans-serif;font-size:11.5px;
  font-weight:400;color:var(--muted);line-height:1.5;margin-top:2px}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;
  padding:12px;border:1px solid var(--rule);border-radius:8px;background:var(--surface)}
.controls .label{font-size:11.5px;color:var(--muted);letter-spacing:.06em;margin-right:2px}
button.chip{font:inherit;font-size:12.5px;font-weight:500;padding:5px 12px;border-radius:999px;
  cursor:pointer;border:1px solid var(--rule-2);background:var(--surface);color:var(--ink-2);
  transition:background .12s,color .12s,border-color .12s}
button.chip:hover{border-color:var(--accent);color:var(--accent-ink)}
button.chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
input.search{font:inherit;font-size:13px;padding:5px 11px;border-radius:6px;
  border:1px solid var(--rule-2);background:var(--surface);color:var(--ink);min-width:150px;flex:1 1 150px}
input.search:focus-visible{outline:2px solid var(--accent);outline-offset:0}

/* 表：この箱自体を縦スクロールさせ、その中でヘッダーを固定する。
   （縦スクロールできない箱で position:sticky + top を使うと、
     ヘッダーが押し下げられて1行目を覆い隠す） */
.tablewrap{overflow:auto;max-height:78vh;border:1px solid var(--rule);border-radius:8px;
  background:var(--surface);box-shadow:var(--shadow)}
table{border-collapse:separate;border-spacing:0;width:100%;min-width:880px;font-size:13.5px}
thead th{position:sticky;top:0;z-index:2;background:var(--surface-2);
  text-align:left;font-weight:700;font-size:11.5px;letter-spacing:.05em;color:var(--ink-2);
  padding:9px 12px;border-bottom:1px solid var(--rule-2);white-space:nowrap}
thead th.sortable{cursor:pointer;user-select:none}
thead th.sortable:hover{color:var(--accent-ink)}
thead th .arrow{opacity:.35;font-size:9px;margin-left:3px}
thead th[aria-sort] .arrow{opacity:1;color:var(--accent-ink)}
tbody td{padding:8px 12px;border-bottom:1px solid var(--rule);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:var(--surface-2)}
.num{font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.name{font-weight:500;white-space:nowrap}
.name small{display:block;font-weight:400;font-size:10.5px;color:var(--muted);line-height:1.3}
.tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:4px;
  white-space:nowrap;border:1px solid currentColor}
.tag.akami{color:var(--akami)} .tag.makimono{color:var(--makimono)}
.tag.hikari{color:var(--hikari)} .tag.kaisen{color:var(--kaisen)}
.tag.niku{color:var(--niku)} .tag.general{color:var(--general)}
.tags{display:flex;gap:4px;flex-wrap:wrap}
.type-pill{font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;white-space:nowrap}
.type-instant{background:var(--accent-soft);color:var(--accent-ink)}
.type-persist{background:var(--warn-soft);color:var(--warn)}
.bar{display:flex;align-items:center;gap:7px;justify-content:flex-end}
.bar i{display:block;height:6px;border-radius:2px;background:var(--accent);opacity:.55;flex:0 0 auto}
.eff{font-size:12px;color:var(--ink-2);line-height:1.5;min-width:210px}
.eff .k{font-family:"JetBrains Mono",monospace;font-size:10.5px;color:var(--muted);display:block}
.dash{color:var(--muted)}
.combos{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}
.combo{border:1px solid var(--rule);border-radius:10px;background:var(--surface);padding:16px 18px;
  box-shadow:var(--shadow);position:relative;overflow:hidden}
.combo::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c,var(--accent))}
.combo.todo{background:repeating-linear-gradient(135deg,var(--surface),var(--surface) 9px,var(--surface-2) 9px,var(--surface-2) 18px)}
.combo.todo h4{color:var(--muted)}
.combo h4{margin:0;font-family:"Shippori Mincho B1",serif;font-size:17px;font-weight:600;
  display:flex;align-items:center;gap:8px}
.combo .trig{display:inline-block;margin:8px 0 10px;font-size:10.5px;font-weight:700;letter-spacing:.05em;
  padding:1px 8px;border-radius:4px;background:var(--surface-2);color:var(--ink-2);border:1px solid var(--rule)}
.combo .trig.todo{background:var(--warn-soft);color:var(--warn);border-color:transparent}
.combo dl{margin:0;display:grid;grid-template-columns:92px 1fr;gap:7px 12px;font-size:12.5px}
.combo dt{color:var(--muted);font-size:11px;padding-top:2px;line-height:1.45}
.combo dd{margin:0;color:var(--ink-2)}
.kw{border:1px solid var(--rule);border-radius:8px;background:var(--surface);overflow:hidden}
.kw div{display:grid;grid-template-columns:200px 1fr;gap:16px;padding:10px 16px;
  border-bottom:1px solid var(--rule);font-size:13.5px}
.kw div:last-child{border-bottom:none}
.kw code{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--accent-ink)}
.kw p{margin:0;color:var(--ink-2)}
.kw .users{color:var(--muted);font-size:12px}
@media (max-width:640px){.kw div{grid-template-columns:1fr;gap:2px}}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--rule);font-size:12px;color:var(--muted)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>

<header class="masthead">
  <div class="wrap">
    <p class="kicker">すしバトル / 現状仕様</p>
    <h1>すしバトル データシート</h1>
    <p class="sub">カード全${cards.length}枚の性能と、実装済み・未実装のコンボ一覧です。数値・枚数・対象カードはすべて <code>src/</code> から読み取って生成しています。手入力の数字はありません。</p>
    <div class="meta">
      <code>scripts/gen-datasheet.mjs で生成</code>
      <code>${cards.length} cards</code>
      <code>${COMBOS.filter(k => k.state === 'impl').length} combos (+${COMBOS.filter(k => k.state === 'todo').length} 未実装)</code>
      <code>${Object.keys(EFFECTS).length} keywords</code>
    </div>
  </div>
</header>

<nav class="toc" aria-label="目次">
  <div class="wrap">
    <a href="#rules">基本ルール</a>
    <a href="#cards">カード性能表</a>
    <a href="#keywords">効果キーワード</a>
    <a href="#combos">コンボ</a>
  </div>
</nav>

<div class="wrap">

<section id="rules">
  <h2><span class="n">01</span>基本ルール</h2>
  <p class="lede">バトル画面とドラフト画面の定数です。すべてソースから読み取っています。</p>
  <dl class="stats">
    ${stat('敗北ライン', String(K.MAX_BELLY), 'お腹ゲージがこの値に到達した側の負け')}
    ${stat('初期AP / 上限', `${K.INIT_AP} → 10`, 'CPU戦は毎ターン+1、二人対戦は2ターンで+1')}
    ${stat('消化量', `2 → ${K.DIGESTION_MAX}`, `min(${K.DIGESTION_MAX}, 1+ラウンド)`)}
    ${stat('手札上限', String(K.HAND_LIMIT), '超過分は山札に残る')}
    ${stat('机の上限', String(K.FIELD_MAX), '満杯だと召喚不可')}
    ${stat('連鎖ボーナス', `+${K.CHAIN_BONUS}`, `連鎖カード1枚につき（base ${chainBases.join('・')} の召喚時）`)}
    ${stat('巻物コンプ①', `机に${K.MAKI_COMP_3}枚`, '以降ドロー+1（1試合1回）')}
    ${stat('巻物コンプ②', `机に${K.MAKI_COMP_5}枚`, `維持している間 軍艦の攻撃 ×${K.GUNKAN_BOOST}`)}
    ${stat('海鮮の再攻撃', `×${K.KAISEN_REATTACK}`, 'いか＋たこのペア成立時')}
    ${stat('消化ボーナス', `+${K.DIGEST_BOOST}`, 'digest_boost_2 のカード1枚につき')}
    ${stat('ドラフト', `¥${K.INITIAL_BUDGET.toLocaleString()} / ${K.DRAFT_SECONDS}秒`, 'デッキ上限20枚')}
    ${stat('追加注文タイム', `¥${K.REORDER_BUDGET.toLocaleString()} / ${K.REORDER_SECONDS}秒`, '両者の手札・山札が尽きたら発生')}
    ${stat('特急レーン', `×1.5 / ${K.SHINKANSEN_TOTAL}回`, '定価×1.5を50円単位で切り上げ')}
  </dl>

  <div class="subhead"><h3>アーキタイプ別の枚数</h3><span>カードデータから集計</span></div>
  <dl class="stats">
    ${archCounts.map(a => stat(a.label, `${a.n}枚`, `全${cards.length}枚中 ${Math.round(a.n / cards.length * 100)}%`)).join('\n    ')}
  </dl>

  <div class="subhead"><h3>ダメージ計算</h3><span>BattleScreen.tsx の calcFieldDmg</span></div>
  <div class="kw">
    <div><code>1枚あたりの攻撃力</code><p>（攻撃力 ＋ baseバフ〈subBases 含む・最大値1つ〉 ＋ 切れ味スタック〈光り物のみ〉 ＋ お腹条件ボーナス〈肉祭り中は×2〉）<br>机の巻物が${K.MAKI_COMP_5}枚以上なら、軍艦タグのカードは最後に <strong>×${K.GUNKAN_BOOST}</strong>（切り捨て）</p></div>
    <div><code>持続ターン</code><p>持続型は <code>max(満腹度, 2)</code> ターン机に残り、毎ターン攻撃。即時型は召喚したターンのみ</p></div>
    <div><code>総ダメージ（表の列）</code><p>攻撃力 × 持続ターン。バフ・ボーナスを含まない素の値</p></div>
  </div>
</section>

<section id="cards">
  <h2><span class="n">02</span>カード性能表</h2>
  <p class="lede">列見出しをクリックで並び替え。総ダメージは「攻撃力 × 持続ターン」、AP効率は「総ダメージ ÷ AP」、円効率は「総ダメージ ÷ 定価 × 100」です。</p>

  <div class="controls">
    <span class="label">ビルド</span>
    <button class="chip" data-filter="arch" data-value="all" aria-pressed="true">すべて</button>
    ${archCounts.map(a => `<button class="chip" data-filter="arch" data-value="${a.key}" aria-pressed="false">${a.label} (${a.n})</button>`).join('\n    ')}
    <input class="search" id="q" type="search" placeholder="カード名・効果で絞り込み" aria-label="カード検索">
  </div>
  <div class="controls">
    <span class="label">レーン</span>
    <button class="chip" data-filter="lane" data-value="all" aria-pressed="true">すべて</button>
    <button class="chip" data-filter="lane" data-value="general" aria-pressed="false">一般レーン</button>
    <button class="chip" data-filter="lane" data-value="build" aria-pressed="false">ビルドレーン</button>
    <span class="label" style="margin-left:auto" id="count"></span>
  </div>

  <div class="tablewrap">
    <table id="cardTable">
      <thead><tr>
        <th class="sortable" data-key="name">カード名<span class="arrow">▲▼</span></th>
        <th>ビルド</th>
        <th class="sortable" data-key="lane">レーン<span class="arrow">▲▼</span></th>
        <th class="sortable" data-key="type">型<span class="arrow">▲▼</span></th>
        <th class="sortable num" data-key="cost">AP<span class="arrow">▲▼</span></th>
        <th class="sortable num" data-key="price">定価<span class="arrow">▲▼</span></th>
        <th class="sortable num" data-key="attack">攻撃<span class="arrow">▲▼</span></th>
        <th class="sortable num" data-key="turns">持続<span class="arrow">▲▼</span></th>
        <th class="sortable num" data-key="total">総ダメ<span class="arrow">▲▼</span></th>
        <th class="sortable num" data-key="apEff">AP効率<span class="arrow">▲▼</span></th>
        <th class="sortable num" data-key="yenEff">円効率<span class="arrow">▲▼</span></th>
        <th>効果</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
</section>

<section id="keywords">
  <h2><span class="n">03</span>効果キーワード</h2>
  <p class="lede">カードの <code>effect</code> に設定されている ${Object.keys(EFFECTS).length} 種です。該当カードは自動集計しています。</p>
  <div class="kw">${kwHtml}</div>
</section>

<section id="combos">
  <h2><span class="n">04</span>コンボ</h2>
  <p class="lede">実装済み ${COMBOS.filter(k => k.state === 'impl').length} 種、未実装 ${COMBOS.filter(k => k.state === 'todo').length} 種。発動の仕方は3種類あります — <strong>永続効果</strong>は1試合1回、<strong>都度発動</strong>は条件を満たすたび何度でも、<strong>状態継続</strong>は条件を満たしている間ずっと有効です。対象カードはカードデータから抽出しています。</p>
  <div class="combos">${comboHtml}</div>
</section>

<footer>
  すしバトル 内部リファレンス — <code>node scripts/gen-datasheet.mjs</code> で再生成できます。カードやルールを変えたら実行し直してください。
</footer>

</div>

<script>
const CARDS = ${JSON.stringify(rows)};
const ARCH = ${JSON.stringify(ARCH)};
const LANE = { general:'一般', build:'ビルド', shinkansen:'特急' };
const EFFECTS = ${JSON.stringify(EFFECTS)};

const maxTotal = Math.max(...CARDS.map(r => r.total));
let sortKey = 'cost', sortDir = 1;
const filters = { arch:'all', lane:'all', q:'' };
const tbody = document.querySelector('#cardTable tbody');
const countEl = document.getElementById('count');
const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

function render(){
  const q = filters.q.trim().toLowerCase();
  const list = CARDS.filter(r =>
    (filters.arch === 'all' || r.archetype.includes(filters.arch)) &&
    (filters.lane === 'all' || r.lane === filters.lane) &&
    (!q || r.name.toLowerCase().includes(q) || r.base.toLowerCase().includes(q) ||
      (r.subBases || []).some(b => b.toLowerCase().includes(q)) ||
      (r.effect && (r.effect.includes(q) || (EFFECTS[r.effect]||'').toLowerCase().includes(q))))
  );
  list.sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    const cmp = (typeof x === 'string') ? x.localeCompare(y, 'ja') : x - y;
    return cmp * sortDir || a.cost - b.cost;
  });
  countEl.textContent = list.length + ' / ' + CARDS.length + ' 枚';
  tbody.innerHTML = list.map(r => {
    const w = Math.max(2, Math.round(r.total / maxTotal * 40));
    const sub = r.subBases && r.subBases.length ? ' ＋ base ' + r.subBases.map(esc).join('・') : '';
    const top = r.topping ? ' ＋ ' + esc(r.topping) : '';
    return '<tr>' +
      '<td class="name">' + esc(r.name) + '<small>base ' + esc(r.base) + top + sub + '</small></td>' +
      '<td><div class="tags">' + r.archetype.map(a => '<span class="tag ' + a + '">' + ARCH[a] + '</span>').join('') + '</div></td>' +
      '<td>' + LANE[r.lane] + '</td>' +
      '<td><span class="type-pill type-' + r.type + '">' + (r.type === 'instant' ? '即時' : '持続') + '</span></td>' +
      '<td class="num">' + r.cost + '</td>' +
      '<td class="num">' + r.price.toLocaleString() + '</td>' +
      '<td class="num">' + r.attack + '</td>' +
      '<td class="num">' + (r.type === 'persist' ? r.turns + 'T' : '<span class="dash">—</span>') + '</td>' +
      '<td class="num"><span class="bar"><i style="width:' + w + 'px"></i>' + r.total + '</span></td>' +
      '<td class="num">' + r.apEff.toFixed(2) + '</td>' +
      '<td class="num">' + r.yenEff.toFixed(2) + '</td>' +
      '<td class="eff">' + (r.effect
        ? '<span class="k">' + esc(r.effect) + '</span>' + esc(EFFECTS[r.effect] || '')
        : '<span class="dash">—</span>') + '</td>' +
    '</tr>';
  }).join('');
}

document.querySelectorAll('button.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const g = btn.dataset.filter;
    filters[g] = btn.dataset.value;
    document.querySelectorAll('button.chip[data-filter="' + g + '"]').forEach(b =>
      b.setAttribute('aria-pressed', String(b === btn)));
    render();
  });
});
document.getElementById('q').addEventListener('input', e => { filters.q = e.target.value; render(); });
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const k = th.dataset.key;
    if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; }
    document.querySelectorAll('th.sortable').forEach(t => t.removeAttribute('aria-sort'));
    th.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
    render();
  });
});
render();
</script>
</body>
</html>
`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, html, 'utf8')
console.log(`生成しました: ${OUT}`)
console.log(`  カード ${cards.length}枚 / 効果 ${Object.keys(EFFECTS).length}種 / コンボ ${COMBOS.length}件`)
console.log(`  アーキタイプ: ${archCounts.map(a => `${a.label}${a.n}`).join(' / ')}`)
