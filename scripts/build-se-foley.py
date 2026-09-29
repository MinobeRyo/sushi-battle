"""試聴室のCC0原音の整音とオリジナル効果音の合成を行います。

必要な原音は public/audio/se-lab/SOURCES.md を参照してください。
Python標準ライブラリとffmpegを使い、ネットワーク通信は行いません。
"""

from array import array
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/audio/se-lab'
RATE = 44100
SOURCES = {
    'restaurant': {
        'folder': ROOT / '.cache/restaurant-foley/selected',
        'author': 'rubberduck',
        'title': '100 CC0 SFX',
        'url': 'https://opengameart.org/node/85570',
    },
    'water': {
        'folder': ROOT / '.cache/restaurant-foley/recordings',
        'author': 'Joseph SARDIN',
        'title': 'Hot Water in Mug #2 — BigSoundBank',
        'url': 'https://bigsoundbank.com/eau-chaude-dans-mug-2-s3312.html',
    },
    'tableglass': {
        'folder': ROOT / '.cache/restaurant-foley/recordings',
        'author': 'Joseph SARDIN',
        'title': 'Glass, Placed on Table — BigSoundBank',
        'url': 'https://bigsoundbank.com/verre-pose-sur-table-s1204.html',
    },
    'cards': {
        'folder': ROOT / '.cache/se-foley/casino/Audio',
        'author': 'Kenney',
        'title': 'Casino Audio',
        'url': 'https://kenney.nl/assets/casino-audio',
    },
}

# 表示名はゲーム中の用途。録音元で使われた器具の断定ではありません。
SOUNDS = [
    ('dish-light', '小皿のカチャッ', 'カチャ', '食器の触れ合う短い音。寿司を取る操作に。', 'table', '寿司を取る', 'restaurant', 'dishes_02.ogg'),
    ('dish-stack', '食器を重ねる', 'カチャリ', '食器が重なる、細かい接触音と余韻。', 'table', '皿を重ねる', 'restaurant', 'dishes_01.ogg'),
    ('glass-touch', 'グラスのコトッ', 'コトッ', 'グラスの接触音。軽い選択や小さな操作に。', 'table', '器を置く', 'restaurant', 'glass_01.ogg'),
    ('wood-counter', '木のカウンター', 'トコッ', '木の道具の乾いた音。落ち着いた押し心地。', 'table', '注文を選ぶ', 'restaurant', 'wooden_03.ogg'),
    ('glass-counter', 'グラスと木の卓', 'コトリ', 'グラスと木の卓上が触れる、身近な食卓の音。', 'table', '飲み物を置く', 'tableglass', 'glass_wooden_table_1204.mp3'),
    ('order-bell', '呼び出しベル', 'チリン', '実物のベルの響き。注文が届いた合図に。', 'service', '店員を呼ぶ', 'restaurant', 'bell_01.ogg'),
    ('order-short', '短い注文ベル', 'チン', '短く鳴るベル。注文確定や購入の合図に。', 'service', '注文を決定', 'restaurant', 'bell_02.ogg'),
    ('dish-serve', '配膳のカチャ', 'カチャッ', '別の食器テイク。品物を受け取る場面に。', 'service', '寿司を受け取る', 'restaurant', 'dishes_04.ogg'),
    ('kitchen-pot', '厨房のコトン', 'コトン', '鍋に触れる音。厨房らしい金属の質感。', 'service', '調理を始める', 'restaurant', 'pot_01.ogg'),
    ('hot-water', 'お湯を注ぐ', 'トクトク', 'マグへお湯を注ぐ実録。飲み物を用意する場面に。', 'service', 'お湯を注ぐ', 'water', 'hot_water_mug_3312.mp3'),
    ('card-draw', '一枚ドロー', 'シュッ', '紙がすべる音。山札から一枚引く操作に。', 'cards', 'カードを引く', 'cards', 'card-slide-1.ogg'),
    ('card-slide', 'カードをすべらせる', 'スッ', '別テイクの紙の摩擦音。カード選択に。', 'cards', '手札を選ぶ', 'cards', 'card-slide-4.ogg'),
    ('card-fan', '手札を広げる', 'サラッ', 'カードの束を扇状に広げる、連なる紙音。', 'cards', '手札を見る', 'cards', 'card-fan-1.ogg'),
    ('card-pack', 'パックを開ける', 'パリッ', '包装を開く音。新しいカードの入手に。', 'cards', 'パックを開ける', 'cards', 'cards-pack-open-2.ogg'),
    ('card-play', 'カードを場に出す', 'パシッ', '紙が卓上に着地する音。召喚や決定に。', 'battle', 'カードを出す', 'cards', 'card-place-1.ogg'),
    ('card-place', 'そっとカードを置く', 'パタッ', '軽くカードを置く、控えめな着地音。', 'battle', 'カードを置く', 'cards', 'card-place-4.ogg'),
    ('card-return', 'カードを戻す', 'ザッ', '束にカードを押し戻す、少し粗い紙の音。', 'battle', '手札に戻す', 'cards', 'card-shove-1.ogg'),
    ('card-shuffle', '手札シャッフル', 'シャララ', '束を混ぜる連続音。配り直しやデッキ操作に。', 'battle', '手札を混ぜる', 'cards', 'card-shuffle.ogg'),
]
COLORS = {'table': '#9e7154', 'service': '#b98d3e', 'cards': '#638a7d', 'battle': '#9b6269', 'tablet': '#7695a6', 'pop': '#cf8e68', 'dish': '#8b9b63'}


def prepare(path: Path, max_seconds: float | None = None, clip=None):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE),
        '-af', 'highpass=f=55,lowpass=f=14500', '-f', 'f32le', 'pipe:1',
    ])
    samples = array('f')
    samples.frombytes(raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    offset = clip[0] if clip else 0
    if clip:
        samples = samples[int(clip[0] * RATE):int(clip[1] * RATE)]
    peak = max(abs(value) for value in samples)
    threshold = peak * 0.009
    activity = [index for index, value in enumerate(samples) if abs(value) > threshold]
    start = max(0, activity[0] - int(RATE * 0.006))
    end = min(len(samples), activity[-1] + int(RATE * 0.07))
    if max_seconds is not None:
        end = min(end, start + int(RATE * max_seconds))
    samples = samples[start:end]
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    # ソースの非圧縮浮動小数点段階で調整し、PCM変換によるクリップを防ぐ。
    gain = min(0.70 / peak, 0.13 / max(rms, 0.00001))
    fade_in, fade_out = int(RATE * (0.04 if clip and path.name.startswith('hot_water') else 0.001)), int(RATE * 0.025)
    for index in range(len(samples)):
        envelope = min(1, index / fade_in, (len(samples) - index - 1) / fade_out)
        samples[index] *= gain * max(0, envelope)
    return samples, offset + start / RATE, offset + end / RATE, gain


def synthesize_tablet_touch():
    """注文タブレット向けの短い単音。録音や外部素材は使いません。"""
    samples = array('f')
    count = round(RATE * 0.076)
    attack, release = round(RATE * 0.006), round(RATE * 0.028)
    for index in range(count):
        phase = 2 * math.pi * 1220 * index / RATE
        # 基本の正弦波に、薄い三角波（第5倍音まで）を足して輪郭を付ける。
        triangle = 8 / math.pi ** 2 * (
            math.sin(phase) - math.sin(3 * phase) / 9 + math.sin(5 * phase) / 25
        )
        tone = 0.94 * math.sin(phase) + 0.06 * triangle
        edge = min(1, index / attack, (count - index - 1) / release)
        envelope = 0.5 - 0.5 * math.cos(math.pi * max(0, edge))
        samples.append(0.52 * tone * envelope)
    return samples


def synthesize_tablet_variant(frequency, duration, flavor='soft'):
    """音量をそろえて比較する、注文端末向けの短い電子音候補。"""
    samples = array('f')
    count = round(RATE * duration)
    for index in range(count):
        position = index / (count - 1)
        time = index / RATE
        if flavor == 'double':
            # 2音の間に短い無音を置く。各音の開始・終了は必ずフェードする。
            if 0.46 <= position <= 0.54:
                samples.append(0)
                continue
            second = position > 0.5
            local_position = (position - 0.54) / 0.46 if second else position / 0.46
            local_time = (position - 0.54) * duration if second else time
            phase = 2 * math.pi * frequency * (1.14 if second else 1) * local_time
            edge = min(1, local_position / 0.075, (1 - local_position) / 0.25)
            tone = math.sin(phase) - 0.018 * math.sin(3 * phase)
        else:
            phase = 2 * math.pi * frequency * time
            edge = min(1, position / 0.079, (1 - position) / 0.368)
            if flavor == 'round':
                tone = math.sin(phase)
            elif flavor == 'crisp':
                tone = math.sin(phase) - 0.06 * math.sin(3 * phase) + 0.015 * math.sin(5 * phase)
            elif flavor == 'glass':
                tone = math.sin(phase) + 0.10 * math.sin(2.51 * phase) * math.exp(-position * 4)
            else:
                tone = math.sin(phase) - 0.018 * math.sin(3 * phase)
        envelope = 0.5 - 0.5 * math.cos(math.pi * max(0, edge))
        samples.append(tone * envelope)
    # 基準音の RMS に合わせ、最大振幅を 0.54 以下にする。
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    gain = min(0.30845 / rms, 0.54 / peak)
    return array('f', (value * gain for value in samples))


def tablet_candidates():
    return [
        ('tablet-touch', '柔らかいピッ', 'ピッ', '短い「ピッ」でタッチを知らせる、柔らかな電子音。',
         synthesize_tablet_touch(), '1220Hzの正弦波と薄い三角波の倍音、6msの立ち上がりと28msの減衰'),
        ('tablet-pop', '丸いポッ', 'ポッ', '少し低めで丸い音。落ち着いたタッチ感に。',
         synthesize_tablet_variant(860, 0.088, 'round'), '860Hzの正弦波、丸い立ち上がりと減衰'),
        ('tablet-double', '注文端末のピピッ', 'ピピッ', '短い2音で反応する、注文端末らしい確認音。',
         synthesize_tablet_variant(1160, 0.148, 'double'), '1160Hzと1322.4Hzの2音、間に約12msの無音'),
        ('tablet-crisp', '歯切れのよいピッ', 'ピッ', '輪郭がはっきりした短い音。軽快なメニュー選択に。',
         synthesize_tablet_variant(1400, 0.064, 'crisp'), '1400Hzの正弦波と控えめな第3・第5倍音'),
        ('tablet-glass', '透明感のあるティッ', 'ティッ', '細い響きがすっと消える、透明感のあるタッチ音。',
         synthesize_tablet_variant(1580, 0.096, 'glass'), '1580Hzの正弦波と減衰する3965.8Hzの微小成分'),
        ('tablet-low', '低いプッ', 'プッ', '低めで控えめな電子音。繰り返し押す操作に。',
         synthesize_tablet_variant(640, 0.084), '640Hzの正弦波と控えめな第3倍音'),
    ]


def playful_impact(duration, modes, noise_level=0.08, noise_decay=0.014, seed=0, echoes=()):
    """一定音程を保持しない、柔らかい過渡音と減衰する共鳴を合成します。

    modes は (振幅, 開始周波数, 終了周波数, ピッチ減衰秒, 振幅減衰秒)。
    大きな低音や長い金属音を避け、丸い破裂音・木質の接触を誇張します。
    """
    count = round(RATE * duration)
    rng = random.Random(seed)
    samples = array('f')
    noise_low, noise_slow, output_low, output_dc = 0.0, 0.0, 0.0, 0.0
    # ノイズは約350〜1700Hz、全体は約95〜3600Hzに穏やかに制限する。
    noise_fast_alpha = 1 - math.exp(-2 * math.pi * 1700 / RATE)
    noise_slow_alpha = 1 - math.exp(-2 * math.pi * 350 / RATE)
    output_alpha = 1 - math.exp(-2 * math.pi * 3600 / RATE)
    dc_alpha = 1 - math.exp(-2 * math.pi * 95 / RATE)
    strikes = [(0.0, 1.0, 1.0), *echoes]
    for index in range(count):
        time = index / RATE
        tone = 0.0
        for delay, strike_gain, strike_pitch in strikes:
            elapsed = time - delay
            if elapsed < 0:
                continue
            attack = 1 - math.exp(-elapsed / 0.0008)
            for amplitude, start_hz, end_hz, pitch_decay, decay in modes:
                # 指数カーブで数msのうちに音程を落とす。平坦な「ピッ」にはしない。
                cycles = strike_pitch * (end_hz * elapsed + (start_hz - end_hz)
                          * pitch_decay * (1 - math.exp(-elapsed / pitch_decay)))
                tone += strike_gain * amplitude * attack * math.exp(-elapsed / decay) * math.sin(2 * math.pi * cycles)
        white_noise = rng.uniform(-1, 1)
        noise_low += noise_fast_alpha * (white_noise - noise_low)
        noise_slow += noise_slow_alpha * (white_noise - noise_slow)
        breath = (noise_low - noise_slow) * noise_level * math.exp(-time / noise_decay)
        output_low += output_alpha * (tone + breath - output_low)
        output_dc += dc_alpha * (output_low - output_dc)
        # 端点は必ずゼロ。末尾8msを滑らかに閉じてクリックを防ぐ。
        edge = min(1, index / (RATE * 0.001), (count - index - 1) / (RATE * 0.008))
        fade = 0.5 - 0.5 * math.cos(math.pi * max(0, edge))
        samples.append((output_low - output_dc) * fade)
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    gain = min(0.60 / peak, 0.135 / rms)
    return array('f', (value * gain for value in samples))


def playful_candidates():
    """25〜36: タッチと皿の動きをデフォルメしたオリジナル音。"""
    return [
        ('pop-soft', '小さなぽっ', 'ぽっ', '丸い空気の粒が、短くはじけるようなタッチ音。', 'pop',
         playful_impact(0.085, [(1, 780, 310, .008, .014), (.16, 1180, 620, .005, .008)], seed=25),
         '急なピッチ降下、14msで指数減衰する丸い共鳴、薄い帯域制限ノイズ'),
        ('pop-round', 'ふっくらぽん', 'ぽん', '少しふくらみのある、柔らかい押し心地。', 'pop',
         playful_impact(0.12, [(1, 520, 225, .013, .025), (.12, 930, 420, .009, .011)], noise_level=.13, seed=26),
         '低めの丸い共鳴と25msの減衰、短い息のような成分'),
        ('pop-dry', '軽いぷっ', 'ぷっ', '余韻が短く、連続で押しても軽いタッチ音。', 'pop',
         playful_impact(0.068, [(1, 610, 310, .005, .009), (.35, 1110, 690, .004, .005)], noise_level=.32, noise_decay=.007, seed=27),
         '9msで消える乾いた共鳴と、ごく短いノイズの破裂'),
        ('pop-bubble', '泡のぽこっ', 'ぽこっ', '泡がつぶれるような、少し弾む丸い音。', 'pop',
         playful_impact(0.135, [(1, 870, 220, .017, .021), (.10, 1430, 530, .009, .011)], noise_level=.05, seed=28),
         '大きめのピッチ降下で泡の弾みを表現、21msの指数減衰'),
        ('pop-puff', 'やわらかいぷふっ', 'ぷふっ', '息を含んだような、さらりと柔らかい反応。', 'pop',
         playful_impact(0.08, [(.70, 580, 270, .007, .013), (.13, 1070, 480, .004, .008)], noise_level=1.5, noise_decay=.018, seed=29),
         '帯域を絞った息のようなノイズと、小さく沈む共鳴'),
        ('pop-tiny', 'ひと粒のぽちっ', 'ぽちっ', '小粒で少し明るい、軽快なタッチ音。', 'pop',
         playful_impact(0.08, [(1, 1060, 450, .004, .011), (.23, 1670, 940, .003, .006)], noise_level=.20, noise_decay=.006, seed=30),
         '約4msで落ちる小さな共鳴と短い輪郭、80ms以内の小粒な過渡音'),
        ('dish-pokon', '皿のぽこん', 'ぽこん', '皿が丸く着地する、少しおもちゃっぽい音。', 'dish',
         playful_impact(0.16, [(1, 490, 215, .014, .031), (.29, 810, 480, .009, .015), (.11, 1370, 1030, .005, .010)], noise_level=.22, seed=31),
         '丸い着地音を中心に、短い非整数倍の共鳴を足したデフォルメ皿音'),
        ('dish-koton', '木のおもちゃのことん', 'ことん', '木製のおもちゃを置くような、乾いた着地。', 'dish',
         playful_impact(0.10, [(1, 480, 375, .003, .015), (.47, 880, 755, .003, .011), (.19, 1430, 1210, .003, .007)], noise_level=.55, noise_decay=.008, seed=32),
         '乾いた3つの短い共鳴と接触ノイズ、木質の着地を誇張'),
        ('dish-pon', 'まるい皿のとん', 'とん', '低めで丸い、主張を抑えた皿の着地音。', 'dish',
         playful_impact(0.14, [(1, 360, 185, .012, .027), (.20, 720, 490, .007, .013)], noise_level=.30, noise_decay=.011, seed=33),
         '控えめな低中域の着地と短い接触成分、95Hz以下は穏やかに抑制'),
        ('dish-tokon', '二段のとこん', 'とこん', '皿が小さく揺れて落ち着く、二段のリズム。', 'dish',
         playful_impact(0.155, [(1, 540, 275, .009, .018), (.25, 1040, 710, .006, .009)], noise_level=.18, seed=34, echoes=[(.043, .42, .83)]),
         '43ms遅れの小さな二打目で着地後の揺れを表現'),
        ('dish-potan', 'ふわっとぽたん', 'ぽたん', 'クッションに載せるような、ふわっとした着地。', 'dish',
         playful_impact(0.175, [(1, 660, 240, .022, .029), (.18, 1080, 550, .010, .015)], noise_level=.62, noise_decay=.021, seed=35),
         'ゆったり落ちる音程と柔らかい接触ノイズで、軽い着地を表現'),
        ('dish-comic', '弾むぽこんっ', 'ぽこんっ', '漫画の皿が弾むような、少し大きめの反応。', 'dish',
         playful_impact(0.195, [(1, 800, 250, .021, .030), (.27, 1230, 650, .012, .016)], noise_level=.20, seed=36, echoes=[(.065, .18, 1.3)]),
         '大きなピッチ降下と薄い跳ね返り、長く響かないコミカルな着地'),
    ]


def write_wav(sound_id, samples):
    pcm = array('h', (round(max(-1, min(1, value)) * 32767) for value in samples))
    if sys.byteorder != 'little':
        pcm.byteswap()
    with wave.open(str(OUTPUT / f'{sound_id}.wav'), 'wb') as output:
        output.setparams((1, 2, RATE, len(samples), 'NONE', 'not compressed'))
        output.writeframes(pcm.tobytes())


def waveform(samples):
    levels = []
    for index in range(28):
        chunk = samples[index * len(samples) // 28:(index + 1) * len(samples) // 28]
        levels.append(math.sqrt(sum(value * value for value in chunk) / max(1, len(chunk))))
    peak_level = max(levels)
    return [round((level / peak_level) ** 0.7, 3) for level in levels]


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    presets, provenance = [], []
    for sound_id, name, syllable, description, category, use_case, source, filename in SOUNDS:
        path = SOURCES[source]['folder'] / filename
        clip = {'hot-water': (3.25, 4.70), 'glass-counter': (0.185, 0.72)}.get(sound_id)
        samples, start, end, gain = prepare(path, 1.35 if sound_id == 'card-shuffle' else None, clip)
        write_wav(sound_id, samples)
        presets.append({
            'id': sound_id, 'name': name, 'syllable': syllable, 'description': description,
            'category': category, 'useCase': use_case, 'duration': len(samples) / RATE,
            'color': COLORS[category], 'file': f'audio/se-lab/{sound_id}.wav',
            'waveform': waveform(samples),
        })
        provenance.append({
            'file': f'{sound_id}.wav', 'original': filename,
            'source': SOURCES[source]['title'], 'author': SOURCES[source]['author'],
            'url': SOURCES[source]['url'], 'license': 'CC0-1.0',
            'trimStart': round(start, 5), 'trimEnd': round(end, 5), 'gain': round(gain, 5),
        })
        print(f'{sound_id}: {len(samples) / RATE:.3f}s, peak={max(abs(value) for value in samples):.3f}')
    for sound_id, name, syllable, description, samples, method in tablet_candidates():
        write_wav(sound_id, samples)
        presets.append({
            'id': sound_id, 'name': name, 'syllable': syllable, 'description': description,
            'category': 'tablet', 'useCase': 'メニューを選ぶ', 'duration': len(samples) / RATE,
            'color': COLORS['tablet'], 'file': f'audio/se-lab/{sound_id}.wav',
            'waveform': waveform(samples), 'source': 'synth',
        })
        provenance.append({
            'file': f'{sound_id}.wav', 'source': 'このプロジェクト用のオリジナル合成音',
            'generator': 'scripts/build-se-foley.py:tablet_candidates', 'method': method,
            'duration': len(samples) / RATE,
            'note': '外部の録音素材は使用していません。CC0実録素材ではありません。',
        })
        print(f'{sound_id}: {len(samples) / RATE:.3f}s, peak={max(abs(value) for value in samples):.3f}')
    for sound_id, name, syllable, description, category, samples, method in playful_candidates():
        write_wav(sound_id, samples)
        presets.append({
            'id': sound_id, 'name': name, 'syllable': syllable, 'description': description,
            'category': category, 'useCase': 'メニューを選ぶ' if category == 'pop' else '皿を取る',
            'duration': len(samples) / RATE, 'color': COLORS[category],
            'file': f'audio/se-lab/{sound_id}.wav', 'waveform': waveform(samples), 'source': 'synth',
        })
        provenance.append({
            'file': f'{sound_id}.wav', 'source': 'このプロジェクト用のオリジナル合成音',
            'generator': 'scripts/build-se-foley.py:playful_candidates', 'method': method,
            'duration': len(samples) / RATE,
            'note': '外部の録音素材は使用していません。ゲームでの採用設定は src/audio/gameSounds.ts を参照してください。',
        })
        print(f'{sound_id}: {len(samples) / RATE:.3f}s, peak={max(abs(value) for value in samples):.3f}')
    (ROOT / 'src/features/sound-lab/presets.ts').write_text(
        "import type { SoundPreset } from './audio'\n\n"
        '// scripts/build-se-foley.py が録音素材・合成音から生成するメタデータと波形。\n'
        + 'export const PRESETS: SoundPreset[] = '
        + json.dumps(presets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
    )
    (OUTPUT / 'sources.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
