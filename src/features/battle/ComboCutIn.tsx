import { motion, useReducedMotion } from 'framer-motion'
import type { ComboAnim } from './types'
import './ComboCutIn.css'

export function ComboCutIn({ combo }: { combo: ComboAnim }) {
  const reducedMotion = useReducedMotion()
  const title = combo.name.replace(/[!！]+$/, '')

  return (
    <motion.div className="combo-cutin" role="status" aria-atomic="true"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.16 }}>
      <div className="combo-cutin-shade" />
      <motion.div className="combo-cutin-band"
        initial={reducedMotion ? false : { x: '-110%', skewY: -6 }}
        animate={{ x: 0, skewY: -6 }}
        exit={reducedMotion ? { opacity: 0 } : { x: '110%', skewY: -6 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
        <div className="combo-cutin-grain" aria-hidden="true" />
        <div className="combo-cutin-pegs" aria-hidden="true"><i /><i /><i /><i /></div>
      </motion.div>
      <motion.div className="combo-cutin-content"
        initial={reducedMotion ? false : { x: 100, opacity: 0, scale: 1.06 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, delay: reducedMotion ? 0 : 0.1, ease: [0.16, 1, 0.3, 1] }}>
        <div className="combo-cutin-kicker">
          <span className="combo-cutin-player">{combo.playerLabel}</span>
          <span className="combo-cutin-trigger">合わせ技 <small>COMBO</small></span>
          <span className="combo-cutin-rule" aria-hidden="true" />
        </div>
        <div className="combo-cutin-title-row">
          <span className="combo-cutin-seal" aria-hidden="true">連<br />携</span>
          <h2 className={title.length > 7 ? 'combo-cutin-title is-long' : 'combo-cutin-title'}>{title}<span className="combo-cutin-bang" aria-hidden="true">!</span></h2>
        </div>
        <div className="combo-cutin-effect"><span aria-hidden="true">効</span><p>{combo.desc}</p></div>
        <div className="combo-cutin-caption" aria-hidden="true"><span>連携成立</span><span>寿司バトル · SUSHI BATTLE</span></div>
      </motion.div>
    </motion.div>
  )
}
