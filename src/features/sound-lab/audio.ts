import { PRESETS } from './presets'

export type SoundCategory = 'table' | 'service' | 'cards' | 'battle' | 'tablet' | 'pop' | 'dish'

export type SoundPreset = {
  id: string
  name: string
  syllable: string
  description: string
  category: SoundCategory
  duration: number
  color: string
  waveform: number[]
  file: string
  useCase: string
  source?: 'synth'
}

export type SoundSettings = {
  volume: number
  pitch: number
  duration: number
}

export const SOUND_PRESETS: SoundPreset[] = PRESETS

type Voice = {
  sources: AudioBufferSourceNode[]
  nodes: AudioNode[]
  output: GainNode
  finished: boolean
  stopping: boolean
  onFinish?: () => void
}

let audioContext: AudioContext | undefined
let liveOutput: DynamicsCompressorNode | undefined
let playbackGeneration = 0
const activeVoices = new Set<Voice>()
const sampleCache = new Map<string, Promise<AudioBuffer>>()
const decodedDurations = new Map<string, number>()
const MAX_VOICES = 5
const SAMPLE_RATE = 48_000
const OUTPUT_PADDING = 0.04
const REFLECTIONS = [
  { delay: 0.029, gain: 0.045 },
  { delay: 0.057, gain: 0.022 },
  { delay: 0.093, gain: 0.012 },
] as const

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback
}

function normalizeSettings(settings: SoundSettings): SoundSettings {
  return {
    volume: clamp(settings.volume, 0, 1, 0.6),
    pitch: clamp(settings.pitch, 0.65, 1.5, 1),
    duration: clamp(settings.duration, 0.65, 1.5, 1),
  }
}

function getPreset(id: string): SoundPreset {
  const preset = SOUND_PRESETS.find((sound) => sound.id === id)
  if (!preset) throw new Error('指定された効果音が見つかりません。')
  return preset
}

function roomAmount(settings: SoundSettings): number {
  return Math.max(0, (settings.duration - 1) / 0.5)
}

function reflectionDelay(delay: number, amount: number): number {
  return delay * (0.65 + 0.9 * amount)
}

/** Uses decoded length when available, including pitch and the optional room tail. */
export function getPlaybackDuration(preset: SoundPreset, settings: SoundSettings): number {
  const normalized = normalizeSettings(settings)
  const amount = roomAmount(normalized)
  const tail = amount > 0 ? reflectionDelay(REFLECTIONS[REFLECTIONS.length - 1].delay, amount) : 0
  return (decodedDurations.get(preset.file) ?? preset.duration) / normalized.pitch + tail + OUTPUT_PADDING
}

function loadSample(preset: SoundPreset, context: BaseAudioContext): Promise<AudioBuffer> {
  const cached = sampleCache.get(preset.file)
  if (cached) return cached

  const request = Promise.resolve().then(async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${preset.file}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      if (buffer.length === 0) throw new Error('Empty audio sample')
      decodedDurations.set(preset.file, buffer.duration)
      return buffer
    } catch {
      // Do not keep rejected promises: the next press must retry the request.
      sampleCache.delete(preset.file)
      throw new Error(`「${preset.name}」の音声を読み込めませんでした。もう一度お試しください。`)
    }
  })
  sampleCache.set(preset.file, request)
  return request
}

function createOutput(context: BaseAudioContext): DynamicsCompressorNode {
  // The samples are already levelled. This only catches peaks from rapid repeats.
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -2
  compressor.knee.value = 2
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.08
  compressor.connect(context.destination)
  return compressor
}

function startAudio(): { context: AudioContext; resume: Promise<void> } {
  if (typeof window === 'undefined') throw new Error('効果音の再生にはブラウザーが必要です。')
  if (!audioContext || audioContext.state === 'closed') {
    const BrowserAudioContext = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!BrowserAudioContext) throw new Error('このブラウザーでは効果音を再生できません。')
    audioContext = new BrowserAudioContext()
    liveOutput = createOutput(audioContext)
  }
  // Fetch/decode やサーバー応答を待つ前に、ユーザー操作の中で resume する。
  const context = audioContext
  const resume = context.state === 'running' ? Promise.resolve() : context.resume()
  return { context, resume }
}

/** 音を鳴らさず、ユーザー操作の中でブラウザーの音声再生を有効にする。 */
export async function unlockAudio(): Promise<void> {
  const { resume } = startAudio()
  await resume
}

function finishVoice(voice: Voice): void {
  if (voice.finished) return
  voice.finished = true
  voice.sources.forEach((source) => { source.onended = null })
  voice.nodes.forEach((node) => { node.disconnect() })
  voice.onFinish?.()
}

function releaseVoice(voice: Voice, context: AudioContext): void {
  if (voice.finished || voice.stopping) return
  voice.stopping = true
  const now = context.currentTime
  voice.output.gain.cancelScheduledValues(now)
  voice.output.gain.setValueAtTime(voice.output.gain.value, now)
  voice.output.gain.linearRampToValueAtTime(0, now + 0.012)
  voice.sources.forEach((source) => { source.stop(now + 0.015) })
}

/** Both live playback and WAV export use this sample-only rendering path. */
function renderSound(
  buffer: AudioBuffer,
  context: BaseAudioContext,
  destination: AudioNode,
  start: number,
  settings: SoundSettings,
): Voice {
  const output = context.createGain()
  output.gain.value = settings.volume
  output.connect(destination)
  const voice: Voice = { sources: [], nodes: [output], output, finished: false, stopping: false }
  const seconds = buffer.duration / settings.pitch

  const sample = (delay: number, level: number, reflected: boolean) => {
    const at = start + delay
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = settings.pitch
    const envelope = context.createGain()
    const edgeFade = Math.min(0.003, seconds * 0.02)
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(level, at + Math.min(0.001, edgeFade))

    if (settings.duration < 1) {
      // Preserve the complete gesture; only soften the last quarter of the sample.
      const damping = (1 - settings.duration) / 0.35
      envelope.gain.setValueAtTime(level, at + seconds * 0.75)
      envelope.gain.linearRampToValueAtTime(level * (1 - damping), at + seconds - edgeFade)
    } else {
      envelope.gain.setValueAtTime(level, at + seconds - edgeFade)
    }
    envelope.gain.linearRampToValueAtTime(0, at + seconds)
    source.connect(envelope)
    if (reflected) {
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 3_800
      filter.Q.value = 0.5
      envelope.connect(filter)
      filter.connect(output)
      voice.nodes.push(filter)
    } else {
      envelope.connect(output)
    }
    voice.sources.push(source)
    voice.nodes.push(source, envelope)
    source.start(at)
  }

  sample(0, 1, false)
  const amount = roomAmount(settings)
  if (amount > 0) {
    // Quiet early reflections from the original recording, with no generated tones.
    REFLECTIONS.forEach((reflection) => {
      sample(reflectionDelay(reflection.delay, amount), reflection.gain * amount, true)
    })
  }

  let remainingSources = voice.sources.length
  voice.sources.forEach((source) => {
    source.onended = () => {
      remainingSources -= 1
      if (remainingSources === 0) finishVoice(voice)
    }
  })
  return voice
}

/** Resolves once playback starts. Call directly from a user gesture. */
export async function playSound(id: string, settings: SoundSettings): Promise<void> {
  const preset = getPreset(id)
  const normalized = normalizeSettings(settings)
  const generation = playbackGeneration

  const { context, resume } = startAudio()
  let buffer: AudioBuffer
  try {
    if (normalized.volume === 0) {
      await resume
      return
    }
    const loaded = await Promise.all([resume, loadSample(preset, context)])
    buffer = loaded[1]
  } catch (error) {
    if (generation !== playbackGeneration) return
    throw error
  }
  if (generation !== playbackGeneration) return
  if (context.state !== 'running') throw new Error('音声を開始できませんでした。もう一度ボタンを押してください。')
  if (!liveOutput) return

  while (activeVoices.size >= MAX_VOICES) {
    const oldest = activeVoices.values().next().value as Voice | undefined
    if (!oldest) break
    activeVoices.delete(oldest)
    releaseVoice(oldest, context)
  }
  const voice = renderSound(buffer, context, liveOutput, context.currentTime + 0.006, normalized)
  voice.onFinish = () => { activeVoices.delete(voice) }
  activeVoices.add(voice)
}

/** Also cancels play requests still waiting for fetch, decoding, or audio resume. */
export function stopSounds(): void {
  playbackGeneration += 1
  const context = audioContext
  if (context && context.state !== 'closed') {
    activeVoices.forEach((voice) => { releaseVoice(voice, context) })
  }
  activeVoices.clear()
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const samples = buffer.getChannelData(0)
  const wav = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(wav)
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true)
  }
  return wav
}

export async function downloadSound(id: string, settings: SoundSettings): Promise<void> {
  const preset = getPreset(id)
  const normalized = normalizeSettings(settings)
  if (typeof window === 'undefined' || typeof OfflineAudioContext === 'undefined') {
    throw new Error('このブラウザーでは WAV の書き出しを利用できません。')
  }
  // Decode before sizing the render so the actual sample length is authoritative.
  const decodeContext = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const sample = await loadSample(preset, decodeContext)
  const length = Math.ceil(getPlaybackDuration(preset, normalized) * SAMPLE_RATE)
  const context = new OfflineAudioContext(1, length, SAMPLE_RATE)
  const output = createOutput(context)
  const voice = renderSound(sample, context, output, 0, normalized)
  let buffer: AudioBuffer
  try {
    buffer = await context.startRendering()
  } finally {
    finishVoice(voice)
    output.disconnect()
  }

  const url = URL.createObjectURL(new Blob([encodeWav(buffer)], { type: 'audio/wav' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `sushi-se-${id}.wav`
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => { URL.revokeObjectURL(url) }, 1_000)
  }
}
