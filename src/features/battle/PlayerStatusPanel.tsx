import { useId } from 'react'
import { MAX_BELLY } from './battleEngine'
import { battleStatusDetails } from './battleStatusModel'
import type { FieldCard } from './types'
import type { SideMenuState } from '../../game/types'
import './PlayerStatusPanel.css'

export type PlayerStatusProps = {
  label: string
  isOpponent?: boolean
  belly: number
  gari: number
  ap: number
  maxAP: number
  fieldDamage: number
  handCount: number
  deckCount: number
  attackBuff: Record<string, number>
  drawBonus: number
  kireta: number
  kiretaSpent: boolean
  nikuMatsuri: boolean
  sacrificedThisTurn?: number
  digestStopTurns: number
  apNextBonus: number
  combosFired: string[]
  summonedIds: string[]
  field: FieldCard[]
  thisTurnArch: Record<string, number>
  sideMenu?: SideMenuState | null
}

type ActiveEffect = {
  key: string
  label: string
  value: string
  note?: string
  caution?: boolean
}

export function PlayerStatusPanel({
  label, isOpponent = false, belly, gari, ap, maxAP, fieldDamage, handCount, deckCount,
  attackBuff, drawBonus, kireta, kiretaSpent, nikuMatsuri, sacrificedThisTurn,
  digestStopTurns, apNextBonus, field, summonedIds, combosFired, thisTurnArch, sideMenu,
}: PlayerStatusProps) {
  const headingId = useId()
  const effectsHeadingId = useId()
  const bellyPercent = Math.max(0, Math.min(100, belly / MAX_BELLY * 100))
  const bellyLevel = bellyPercent >= 70 ? 'high' : bellyPercent >= 40 ? 'medium' : 'low'
  const effects: ActiveEffect[] = battleStatusDetails({
    summonedIds, combosFired, field, attackBuff, drawBonus,
    kiretaStack: kireta, kiretaSpent, nikuMatsuri, sacrificedThisTurn, digestStopTurns, apNextBonus, thisTurnArch, sideMenu,
  }).effects.map(effect => ({
    key: effect.id,
    label: effect.name,
    value: effect.id === 'kireta' ? String(kireta) : effect.value,
    caution: effect.id === 'digest-stop',
    note: effect.id === 'kireta' && kiretaSpent ? '攻撃後に0・再消費不可'
      : effect.id === 'digest-boost' && digestStopTurns > 0 ? '消化停止中は無効' : undefined,
  }))

  return (
    <section
      className={`player-status-panel${isOpponent ? ' player-status-panel--opponent' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="player-status-panel__summary">
        <div className="player-status-panel__title-row">
          <h2 id={headingId} className="player-status-panel__heading">{label}</h2>
          <span className="player-status-panel__gari" data-empty={gari === 0}
            aria-label={`${label}のガリ 残り${gari}個`}>ガリ <strong>{gari}</strong>個</span>
        </div>
        <div className="player-status-panel__belly" data-level={bellyLevel}>
          <div className="player-status-panel__belly-numbers">
            <span>お腹</span>
            <p><strong>{belly}</strong><span> / {MAX_BELLY}</span></p>
          </div>
          <div
            className="player-status-panel__gauge"
            role="meter"
            aria-label={`${label}のお腹`}
            aria-valuemin={0}
            aria-valuemax={MAX_BELLY}
            aria-valuenow={Math.max(0, Math.min(MAX_BELLY, belly))}
            aria-valuetext={`${belly} / ${MAX_BELLY}`}
          >
            <span style={{ width: `${bellyPercent}%` }} />
          </div>
        </div>

        <dl className="player-status-panel__metrics">
          <div>
            <dt>AP</dt>
            <dd><strong>{ap}</strong><span>/{maxAP}</span></dd>
          </div>
          <div>
            <dt>攻撃</dt>
            <dd className="player-status-panel__damage"><strong>{fieldDamage}</strong></dd>
          </div>
          <div className="player-status-panel__card-count">
            <dt>手札</dt>
            <dd><strong>{handCount}</strong><span>枚</span></dd>
          </div>
          <div className="player-status-panel__card-count">
            <dt>山札</dt>
            <dd><strong>{deckCount}</strong><span>枚</span></dd>
          </div>
        </dl>
      </div>

      <div
        className={`player-status-panel__details${effects.length === 0 ? ' player-status-panel__details--empty' : ''}`}
        role="region"
        aria-labelledby={effects.length > 0 ? effectsHeadingId : undefined}
        aria-label={effects.length === 0 ? `${label}の追加効果` : undefined}
        tabIndex={0}
      >
        {effects.length > 0 && <h3 id={effectsHeadingId} className="player-status-panel__effects-heading">ストックと効果</h3>}
        {effects.length === 0 ? (
          <p className="player-status-panel__empty">追加効果なし</p>
        ) : (
          <ul className="player-status-panel__effects">
            {effects.map(effect => (
              <li key={effect.key} className={effect.caution ? 'is-caution' : undefined}>
                <span>{effect.label}</span>
                <strong>{effect.value}</strong>
                {effect.note && <small>{effect.note}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
