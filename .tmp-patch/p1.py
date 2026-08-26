# -*- coding: utf-8 -*-
# すしバトル ルール改修パッチ その1：カードデータと型
import io, re, sys

SRC = sys.argv[1]

def patch(path, reps, count_check=True):
    p = SRC + '/' + path
    s = io.open(p, encoding='utf-8').read()
    for o, n in reps:
        c = s.count(o)
        if count_check and c != 1:
            raise SystemExit(f'[{path}] 一致{c}件: {o[:60]!r}')
        s = s.replace(o, n)
    io.open(p, 'w', encoding='utf-8').write(s)
    print(f'  patched {path}')

# ── types/index.ts : gunkan アーキタイプ ──────────────────────────────────────
patch('types/index.ts', [(
"""  | 'niku'       // 肉寿司
  | 'general'    // 汎用""",
"""  | 'niku'       // 肉寿司
  | 'gunkan'     // 軍艦（巻物コンプ5枚で攻撃1.5倍を受ける）
  | 'general'    // 汎用"""),
])

# ── data/cards.ts ───────────────────────────────────────────────────────────
cards_path = SRC + '/data/cards.ts'
s = io.open(cards_path, encoding='utf-8').read()

# 軍艦10枚に gunkan タグを追加
GUNKAN = ['tuna_salad_gunkan', 'corn_gunkan', 'seafood_gunkan', 'tuna_gunkan',
          'uni_gunkan', 'ikura_gunkan', 'negitoro_gunkan', 'tobiko_gunkan',
          'ebi_gunkan', 'kani_gunkan']

def add_gunkan(m):
    block = m.group(0)
    if "'gunkan'" in block:
        return block
    return re.sub(r"(archetype: \[)([^\]]*)(\])",
                  lambda a: a.group(1) + a.group(2) + ", 'gunkan'" + a.group(3),
                  block, count=1)

for cid in GUNKAN:
    pat = re.compile(r"\{\s*\n\s*id: '" + cid + r"',.*?\n  \},", re.S)
    if not pat.search(s):
        raise SystemExit(f'軍艦カードが見つかりません: {cid}')
    s = pat.sub(add_gunkan, s, count=1)

got = s.count("'gunkan'")
if got != len(GUNKAN):
    raise SystemExit(f'gunkan タグの付与数が想定と違います: {got} != {len(GUNKAN)}')

# 個別カードの数値・効果変更
single = [
    # かっぱ巻き: 攻撃 2→1、机にいる間 消化+2
    ("""    id: 'kappa_maki',
    name: 'かっぱ巻き',
    base: 'きゅうり',
    topping: null,
    type: 'persist',
    cost: 1,
    price: 100,
    attack: 2,
    fullness: 3,
    effect: null,""",
     """    id: 'kappa_maki',
    name: 'かっぱ巻き',
    base: 'きゅうり',
    topping: null,
    type: 'persist',
    cost: 1,
    price: 100,
    attack: 1,
    fullness: 3,
    effect: 'digest_boost_2', // 机にいる間、自分の消化量 +2"""),
    # 梅しそ巻き: お腹 -3 → -5
    ("""    effect: 'self_digest_3', // 自分のお腹 -3""",
     """    effect: 'self_digest_5', // 自分のお腹 -5"""),
    # 明太子: 2AP → 3AP、2枚ドロー
    ("""    id: 'mentaiko',
    name: '明太子',
    base: '明太子',
    topping: null,
    type: 'instant',
    cost: 2,
    price: 200,
    attack: 7,
    fullness: 0,
    effect: null,""",
     """    id: 'mentaiko',
    name: '明太子',
    base: '明太子',
    topping: null,
    type: 'instant',
    cost: 3,
    price: 200,
    attack: 7,
    fullness: 0,
    effect: 'draw_2', // 召喚時2枚ドロー"""),
    # シメサバ: 切れ味+1 → 切れ味2消費で2ドロー
    ("""    id: 'shime_saba',
    name: 'シメサバ',
    base: 'サバ',
    topping: null,
    type: 'instant',
    cost: 3,
    price: 200,
    attack: 10,
    fullness: 0,
    effect: 'kireta_stack',""",
     """    id: 'shime_saba',
    name: 'シメサバ',
    base: 'サバ',
    topping: null,
    type: 'instant',
    cost: 3,
    price: 200,
    attack: 10,
    fullness: 0,
    effect: 'kireta_consume_2_draw_2', // 切れ味2を消費して2枚ドロー"""),
    # コハダ: ×2 → ×3
    ("""    effect: 'kireta_consume_x2', // 切れ味スタック全消費×2ダメージ""",
     """    effect: 'kireta_consume_x3', // 切れ味スタック全消費×3ダメージ"""),
]
for o, n in single:
    c = s.count(o)
    if c != 1:
        raise SystemExit(f'[cards.ts] 一致{c}件: {o[:60]!r}')
    s = s.replace(o, n)

io.open(cards_path, 'w', encoding='utf-8').write(s)
print('  patched data/cards.ts')
print('パッチ1 完了')
