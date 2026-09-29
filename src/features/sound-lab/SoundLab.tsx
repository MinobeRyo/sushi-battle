import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { SOUND_PRESETS, downloadSound, getPlaybackDuration, playSound, stopSounds } from './audio'
import type { SoundCategory, SoundPreset, SoundSettings } from './audio'
import { GAME_SOUNDS } from '../../audio/gameSounds'
import './sound-lab.css'

type IconName = 'play' | 'stop' | 'sound' | 'muted' | 'star' | 'arrow' | 'download' | 'reset' | 'wave'
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    play: <path d="m9 5 11 7-11 7Z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    sound: <><path d="m11 4-6 5H2v6h3l6 5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    muted: <><path d="m11 4-6 5H2v6h3l6 5Z" /><path d="m16 9 6 6m0-6-6 6" /></>,
    star: <path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" />,
    arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    reset: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /></>,
    wave: <path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const CATEGORY_LABELS: Record<SoundCategory, string> = { pop: 'タッチのぽっ', dish: '皿のデフォルメ', table: '食器・実録', service: '注文・厨房', cards: '引く・広げる', battle: '出す・戻す', tablet: '電子音' }
const DEFAULT_SETTINGS: SoundSettings = { volume: 0.45, pitch: 1, duration: 1 }
type SoundFilter = SoundCategory | 'all' | 'favorites'
function initialFilter(): SoundFilter {
  const hash = window.location.hash.slice(1)
  return hash === 'all' || hash === 'favorites' || Object.hasOwn(CATEGORY_LABELS, hash) ? hash as SoundFilter : 'pop'
}
const STORAGE_KEY = 'sushi-battle:se-lab:foley-v2'
const ADOPTED_SOUNDS = [
  { ...GAME_SOUNDS.expressOrder, label: '06 特急注文' },
  { ...GAME_SOUNDS.tabletTouch, label: '25 タッチ' },
  { ...GAME_SOUNDS.dishPickup, label: '31 皿を取る' },
  { ...GAME_SOUNDS.cardPlay, label: '15 カードを出す' },
]

function readFavorites(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && SOUND_PRESETS.some(preset => preset.id === id)) : []
  } catch { return [] }
}

function Waveform({ preset, active = false }: { preset: SoundPreset; active?: boolean }) {
  return <span className={`waveform ${active ? 'waveform--active' : ''}`} aria-hidden="true">
    {preset.waveform.map((height, index) => <i key={index} style={{ height: `${Math.max(8, height * 100)}%`, animationDelay: `${index * -0.037}s` }} />)}
  </span>
}

export default function SoundLab() {
  const [selectedId, setSelectedId] = useState(() => (SOUND_PRESETS.find(preset => preset.category === initialFilter()) ?? SOUND_PRESETS[0]).id)
  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SETTINGS)
  const [favorites, setFavorites] = useState(readFavorites)
  const [filter, setFilter] = useState<SoundFilter>(initialFilter)
  const [muted, setMuted] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [sequencing, setSequencing] = useState(false)
  const [status, setStatus] = useState('ボタンを押すと音が鳴ります。')
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const playback = useRef({
    sequenceToken: 0,
    playToken: 0,
    sequenceTimer: undefined as number | undefined,
    highlightTimer: undefined as number | undefined,
  }).current
  const selected = SOUND_PRESETS.find(preset => preset.id === selectedId) ?? SOUND_PRESETS[0]
  const isCardSound = selected.category === 'cards' || selected.category === 'battle'
  const isTabletSound = selected.category === 'tablet' || selected.category === 'pop'
  const visible = SOUND_PRESETS.filter(preset => filter === 'all' || (filter === 'favorites' ? favorites.includes(preset.id) : preset.category === filter))

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)) } catch { /* 保存不可でも試聴は利用できます。 */ }
  }, [favorites])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.target instanceof Element && event.target.closest('button,input,select,textarea,a,[contenteditable="true"]')) return
      event.preventDefault()
      document.getElementById('preview-button')?.click()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      playback.sequenceToken++
      playback.playToken++
      window.clearTimeout(playback.sequenceTimer)
      window.clearTimeout(playback.highlightTimer)
      stopSounds()
    }
  }, [playback])

  function stop() {
    playback.sequenceToken++
    playback.playToken++
    window.clearTimeout(playback.sequenceTimer)
    window.clearTimeout(playback.highlightTimer)
    stopSounds()
    setSequencing(false)
    setPlayingId(null)
  }

  function chooseCategory(value: SoundFilter) {
    stop()
    setFilter(value)
    const first = SOUND_PRESETS.find(preset => preset.category === value)
    if (first) setSelectedId(first.id)
    window.history.replaceState(null, '', `#${value}`)
    setStatus('ボタンを押すと音が鳴ります。')
    setError(false)
  }

  async function audition(preset: SoundPreset, interrupt = true, soundSettings = settings) {
    if (interrupt) stop()
    const token = ++playback.playToken
    setSelectedId(preset.id)
    setError(false)
    if (muted || soundSettings.volume === 0) {
      setStatus('消音中です。音量を上げるか、消音を解除してください。')
      return false
    }
    try {
      await playSound(preset.id, soundSettings)
      if (token !== playback.playToken) return false
      setPlayingId(preset.id)
      setStatus(`「${preset.name}」を試聴しました。`)
      window.clearTimeout(playback.highlightTimer)
      playback.highlightTimer = window.setTimeout(() => setPlayingId(null), Math.max(220, getPlaybackDuration(preset, soundSettings) * 1000))
      return true
    } catch {
      if (token === playback.playToken) {
        setError(true)
        setStatus('音を再生できませんでした。ブラウザの音声設定を確認して、もう一度お試しください。')
      }
      return false
    }
  }

  function playInOrder() {
    if (sequencing) {
      stop()
      setStatus('順番再生を停止しました。')
      return
    }
    stop()
    const token = playback.sequenceToken
    setSequencing(true)
    async function next(index: number) {
      if (playback.sequenceToken !== token) return
      if (index >= visible.length) {
        setSequencing(false)
        setStatus('聴き比べが終わりました。気になる音をもう一度どうぞ。')
        return
      }
      const preset = visible[index]
      const played = await audition(preset, false)
      if (playback.sequenceToken !== token) return
      if (!played) { setSequencing(false); return }
      playback.sequenceTimer = window.setTimeout(() => { void next(index + 1) }, Math.max(750, getPlaybackDuration(preset, settings) * 1000 + 350))
    }
    void next(0)
  }

  function updateSetting(key: keyof SoundSettings, value: number) {
    stop()
    setSettings(previous => ({ ...previous, [key]: value }))
    if (key === 'volume' && value > 0) setMuted(false)
  }

  function toggleFavorite(id: string) {
    if (filter === 'favorites') stop()
    setFavorites(previous => previous.includes(id) ? previous.filter(saved => saved !== id) : [...previous, id])
  }

  async function saveWav() {
    setExporting(true)
    setError(false)
    try {
      await downloadSound(selected.id, settings)
      setStatus(`「${selected.name}」を現在の設定でWAVに書き出しました。`)
    } catch {
      setError(true)
      setStatus('WAVを書き出せませんでした。もう一度お試しください。')
    } finally { setExporting(false) }
  }

  return <div className="sound-lab">
    <header className="site-header">
      <a className="brand" href="./se-lab.html" aria-label="SE LAB トップ"><span className="brand-mark"><Icon name="wave" size={24} /></span><strong>SE LAB<span>SUSHI BATTLE</span></strong></a>
      <span className="header-note">寿司バトルの、音の試聴室。</span>
      <a className="back-link" href="./"><Icon name="arrow" size={16} /><span>ゲームに戻る</span></a>
    </header>

    <main>
      <section className="intro">
        <div><p className="eyebrow"><span /> PLAYFUL SUSHI SOUNDS / VOL. 03</p><h1>ぽっ、と触れる。<br className="mobile-break" /><em>ぽこん、と取る。</em></h1><p className="intro-copy">短いタッチ音と、ちょっと漫画のような皿の音。<br />新しい12候補を、押して聴き比べ。</p></div>
        <div className="intro-stamp" aria-hidden="true"><Icon name="wave" size={38} /><span>12 NEW SOUNDS<br />POP & POKON.</span></div>
      </section>

      <div className="audition-modes" role="group" aria-label="新しい音のプレビュー">
        <button aria-pressed={filter === 'pop'} onClick={() => chooseCategory('pop')}><span>25–30 / TOUCH</span><strong>タッチの「ぽっ」</strong><small>小さく、丸く、すぐ消える。</small></button>
        <button aria-pressed={filter === 'dish'} onClick={() => chooseCategory('dish')}><span>31–36 / PLATE</span><strong>皿の「ぽこん」</strong><small>ひと皿取るのを、ゲームらしく。</small></button>
      </div>

      <section className="adopted-sounds" aria-label="ゲームの採用設定で試聴">
        <span>採用設定で試す</span>
        {ADOPTED_SOUNDS.map(sound => <button key={sound.id} onClick={() => {
          const preset = SOUND_PRESETS.find(item => item.id === sound.id)
          if (!preset) return
          const nextSettings = { ...DEFAULT_SETTINGS, volume: sound.volume }
          setSettings(nextSettings)
          void audition(preset, true, nextSettings)
        }}><Icon name="play" size={14} />{sound.label}<b>{Math.round(sound.volume * 100)}%</b></button>)}
        <span className="selection-pending">ゲームに反映済み</span>
      </section>

      <section className="workbench" aria-label="選んだ効果音を調整して試す">
        <div className={`preview ${isTabletSound ? 'preview--tablet' : isCardSound ? 'preview--cards' : 'preview--table'} ${playingId ? 'preview--playing' : ''}`}>
          <div className="preview-heading"><span><span className="live-dot" /> {isTabletSound ? 'ORDER TABLET' : isCardSound ? 'CARD TABLE' : 'SUSHI COUNTER'}</span><span>{isTabletSound ? 'タッチ音を聴き比べ' : '実際の操作をイメージして'}</span></div>
          <div className="pad-area">
            <div className="pad-rings" aria-hidden="true" />
            <button id="preview-button" className={`preview-button preview-button--${isTabletSound ? 'tablet' : isCardSound ? 'card' : 'dish'} ${playingId ? 'preview-button--playing' : ''}`} onClick={() => { void audition(selected) }} aria-label={`仮ボタンで「${selected.name}」を試聴`}>
              {isTabletSound ? <span className="tablet-prop" aria-hidden="true"><span>すしバトル ご注文</span><span className="tablet-prop-menu"><span>おすすめ</span><span>にぎり</span><span>軍艦</span></span><strong>{selected.syllable}</strong></span> : isCardSound ? <span className="card-prop" aria-hidden="true"><span>SUSHI BATTLE</span><svg width="60" height="48" viewBox="0 0 60 48"><path d="M8 27Q30 12 52 27L49 38Q30 47 11 38Z" fill="#eee2c7" /><path d="M7 21Q31 8 53 21L51 29Q30 20 9 30Z" fill="#c76b53" /><path d="m20 18 6 8m7-10 6 9" fill="none" stroke="#f8c5a0" strokeWidth="3" /></svg><span>手札</span></span> : <span className="dish-prop" aria-hidden="true"><span className="dish-prop-rim" /><span className="nigiri"><i /><i /></span></span>}
              <span className="preview-action">{selected.useCase}</span>
              <small>押して試す</small>
            </button>
          </div>
          <div className="preview-footer"><span>{selected.syllable} <span className="preview-syllable-divider">／</span> {selected.name}</span><span className="keyboard-hint"><kbd>Space</kbd> でも再生</span></div>
        </div>

        <div className="tuner">
          <div className="selection-heading"><div><p className="eyebrow">SELECTED SOUND</p><h2>{selected.name}<span>{CATEGORY_LABELS[selected.category]}</span></h2></div><button className={`icon-button favorite-button ${favorites.includes(selected.id) ? 'is-favorite' : ''}`} aria-label={`${selected.name}をお気に入り${favorites.includes(selected.id) ? 'から削除' : 'に追加'}`} aria-pressed={favorites.includes(selected.id)} onClick={() => toggleFavorite(selected.id)}><Icon name="star" size={21} /></button></div>
          <p className="selection-description">{selected.description}</p>
          <p className="source-note"><span>{selected.source === 'synth' ? 'ORIGINAL' : 'FOLEY'}</span>{selected.source === 'synth' ? (selected.category === 'tablet' ? 'オリジナルの電子音' : 'オリジナルのデフォルメ音') : '実物素材を使用'}<span className="sample-duration">{selected.duration.toFixed(2)} 秒</span></p>
          <div className="sliders">
            <label className="slider-row" htmlFor="volume"><span>音量<output>{muted ? '消音中' : `${Math.round(settings.volume * 100)}%`}</output></span><div className="volume-control"><button className={`icon-button mute-button ${muted ? 'is-muted' : ''}`} aria-label={muted ? '消音を解除' : '消音にする'} aria-pressed={muted} onClick={() => { stop(); setMuted(!muted); setStatus(muted ? '消音を解除しました。' : '消音にしました。') }}><Icon name={muted ? 'muted' : 'sound'} /></button><input id="volume" type="range" min="0" max="1" step="0.01" value={settings.volume} onChange={event => updateSetting('volume', Number(event.target.value))} style={{ '--range': `${settings.volume * 100}%` } as CSSProperties} /></div></label>
            <div className="tuning-pair">{([{ key: 'pitch', label: '音の高さ', low: '低め', high: '高め' }, { key: 'duration', label: '余韻の長さ', low: '短め', high: '長め' }] as const).map(control => <label className="slider-row" key={control.key} htmlFor={control.key}><span>{control.label}<output>{settings[control.key].toFixed(2)}×</output></span><input id={control.key} type="range" min="0.65" max="1.5" step="0.05" value={settings[control.key]} onChange={event => updateSetting(control.key, Number(event.target.value))} style={{ '--range': `${(settings[control.key] - 0.65) / 0.85 * 100}%` } as CSSProperties} /><span className="range-labels"><small>{control.low}</small><small>{control.high}</small></span></label>)}</div>
          </div>
          <div className="tuner-actions"><button className="text-button" onClick={() => { stop(); setSettings(DEFAULT_SETTINGS); setMuted(false); setStatus('音の設定を初期値に戻しました。') }}><Icon name="reset" size={15} />設定をリセット</button><button className="download-button" disabled={exporting} onClick={() => { void saveWav() }}><Icon name="download" size={16} />{exporting ? '書き出し中…' : 'WAVを保存'}</button></div>
        </div>
      </section>
      <p className={`playback-status ${error ? 'playback-status--error' : ''}`} role="status" aria-live="polite"><span />{status}</p>

      <section className="library" aria-labelledby="library-title">
        <div className="library-heading"><div><p className="eyebrow">THE SOUND COLLECTION</p><h2 id="library-title">音を選ぶ<span>{String(visible.length).padStart(2, '0')}</span></h2></div><button className={`sequence-button ${sequencing ? 'sequence-button--active' : ''}`} onClick={playInOrder} disabled={visible.length === 0 || muted || settings.volume === 0}><Icon name={sequencing ? 'stop' : 'play'} size={16} />{sequencing ? '再生を止める' : '順番に聴く'}</button></div>
        <div className="filters" role="group" aria-label="音の種類で絞り込む">{(['pop', 'dish', 'all', 'table', 'service', 'cards', 'battle', 'tablet', 'favorites'] as const).map(value => <button key={value} className={filter === value ? 'filter--active' : ''} aria-pressed={filter === value} onClick={() => chooseCategory(value)}>{value === 'favorites' && <Icon name="star" size={14} />}{value === 'all' ? 'すべて' : value === 'favorites' ? `お気に入り ${favorites.length}` : CATEGORY_LABELS[value]}</button>)}</div>
        {filter === 'pop' && <p className="category-guide">25–30：タッチ用の「ぽっ」を6種類。丸さ・軽さ・弾み方を、同じ音量で比べられます。</p>}
        {filter === 'dish' && <p className="category-guide">31–36：皿を取る操作に合わせたい、デフォルメした「ぽこん」「ことん」。上の皿を押して、操作に合う音を探せます。</p>}
        {filter === 'tablet' && <p className="category-guide">19–24：前の電子音の候補です。「ぽっ」系は「タッチのぽっ」から聴けます。</p>}
        <div className="sound-grid">{visible.map(preset => <article className={`sound-card ${selectedId === preset.id ? 'sound-card--selected' : ''} ${playingId === preset.id ? 'sound-card--playing' : ''}`} key={preset.id} style={{ '--sound-color': preset.color } as CSSProperties}>
          <button className="sound-card-main" onClick={() => { void audition(preset) }} aria-label={`${preset.name}を選んで試聴`} aria-pressed={selectedId === preset.id}>
            <span className="card-meta"><span>{String(SOUND_PRESETS.indexOf(preset) + 1).padStart(2, '0')}</span><span>{CATEGORY_LABELS[preset.category]}</span></span>
            <strong className="card-name">{preset.name}</strong><span className="card-description">{preset.description}</span>
            <span className="card-wave"><Waveform preset={preset} active={playingId === preset.id} /><span className="card-play"><Icon name="play" size={16} /></span></span>
            <span className="card-bottom"><span>{preset.useCase}</span><span>{playingId === preset.id ? '再生中' : selectedId === preset.id ? '選択中' : `${preset.duration.toFixed(2)} 秒`}<span className="selection-dot" /></span></span>
          </button>
          <button className={`card-favorite icon-button ${favorites.includes(preset.id) ? 'is-favorite' : ''}`} aria-label={`${preset.name}をお気に入り${favorites.includes(preset.id) ? 'から削除' : 'に追加'}`} aria-pressed={favorites.includes(preset.id)} onClick={() => toggleFavorite(preset.id)}><Icon name="star" size={17} /></button>
        </article>)}</div>
        {visible.length === 0 && <div className="empty-state"><Icon name="star" size={30} /><h3>気になる音を、お気に入りに。</h3><p>各カードの星を押すと、ここに集めて聴き比べられます。</p><button className="text-button" onClick={() => setFilter('all')}>すべての音を見る</button></div>}
      </section>
      <aside className="listening-note"><span className="note-label">LISTENING TIP</span><p>同じ音を何回か押して、繰り返し操作したときの心地よさも確認できます。気になる音は星で保存して聴き比べ。</p></aside>
      <p className="sound-credits">実録素材：<a href="https://kenney.nl/assets/casino-audio" target="_blank" rel="noreferrer">Kenney</a> ・ <a href="https://opengameart.org/node/85570" target="_blank" rel="noreferrer">rubberduck</a> ・ <a href="https://bigsoundbank.com/eau-chaude-dans-mug-2-s3312.html" target="_blank" rel="noreferrer">Joseph SARDIN</a><span>CC0・整音済み ／ タッチ音・デフォルメ音はオリジナル合成</span><a href={`${import.meta.env.BASE_URL}audio/se-lab/SOURCES.md`} target="_blank" rel="noreferrer">使用素材の詳細</a></p>
    </main>
    <footer className="site-footer"><span>SE LAB <span>／</span> SUSHI BATTLE</span><span>いい音は、いい手ざわり。</span></footer>
  </div>
}
