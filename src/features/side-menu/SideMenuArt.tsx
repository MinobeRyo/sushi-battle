import { useId } from 'react'
import { SIDE_MENU_CATALOG } from './sideMenuCatalog'
import type { SideMenuId } from './sideMenuCatalog'

export type SideMenuArtProps = {
  id: SideMenuId
  className?: string
  size?: number
  decorative?: boolean
}

type Paint = Record<'plate' | 'crust' | 'fries' | 'broth' | 'ceramic' | 'lacquer' | 'custard', string>

function Plate({ paint, dark = false }: { paint: Paint; dark?: boolean }) {
  return <>
    <ellipse cx="120" cy="139" rx="91" ry="17" fill="#593c24" opacity=".11" />
    <path d="M22 113Q25 150 120 153Q215 150 218 113Z" fill={dark ? '#334644' : '#d9c7a8'} />
    <ellipse cx="120" cy="113" rx="98" ry="34" fill={dark ? '#415650' : paint.plate} stroke={dark ? '#29423c' : '#c8b68d'} strokeWidth="1.4" />
    <ellipse cx="120" cy="113" rx="85" ry="26" fill={dark ? '#2d433c' : '#f4ebd8'} stroke={dark ? '#778578' : '#d9c8a5'} strokeWidth="1" />
    <path d="M35 123Q66 149 133 143" fill="none" stroke={dark ? '#73847b' : '#fffdf2'} strokeWidth="2" opacity=".65" />
  </>
}

function KaraageArt({ paint }: { paint: Paint }) {
  const nuggets = [[77, 87, .97, -11], [132, 79, .95, 8], [158, 111, .84, 15], [62, 115, .84, 9], [109, 111, 1.07, -7]]
  return <>
    <Plate paint={paint} />
    <g fill="#557137" stroke="#40572a" strokeWidth=".7">
      <path d="M160 96Q142 81 154 76Q162 65 166 80Q179 67 180 80Q194 87 176 95Z" />
      <path d="M168 95L166 80M167 89L180 81" fill="none" stroke="#93a45a" strokeWidth="1.5" />
    </g>
    {nuggets.map(([x, y, scale, rotation], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
      <ellipse cx="1" cy="19" rx="25" ry="9" fill="#6d421e" opacity=".15" />
      <path d="M-24-4Q-30-13-19-19Q-15-29-5-23Q6-29 14-19Q27-19 25-8Q33 1 24 10Q24 23 10 23Q2 31-10 23Q-26 24-26 12Q-34 4-24-4Z" fill={paint.crust} stroke="#a36325" strokeWidth="1.2" />
      <path d="M-24 7Q-22 18-12 16Q-8 24 1 18Q10 24 20 13L23 18Q13 30 3 25Q-9 29-16 22Q-27 23-26 11Z" fill="#a9692b" opacity=".55" />
      <path d="M-18-10L-12-16L-6-12M2-19L9-15L7-11M15-7L22-2M-19 3L-14 0M-4 6L2 2L7 7M13 14L18 10" fill="none" stroke="#efba63" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      {[[-16, -8, 2.5], [-4, -17, 2.1], [13, -10, 3], [-11, 10, 2.5], [3, 14, 1.8], [18, 4, 2.6], [-3, -3, 2.2], [7, -5, 1.8]].map(([cx, cy, r], j) => <path key={j} d={`M${cx-r} ${cy}l${r} ${-r}l${r*1.1} ${r*.7}l${-r*.4} ${r*1.3}Z`} fill={j % 3 === 0 ? '#93521f' : '#e4aa51'} opacity=".85" />)}
    </g>)}
    <g transform="translate(176 128) rotate(-19)">
      <path d="M-23 0Q0-30 23 0L1 19Z" fill="#dec238" stroke="#c8a72b" strokeWidth="1" />
      <path d="M-21-1Q0-25 21-1L1 15Z" fill="#fff2af" />
      <path d="M-17-2Q-10-10-4-12L-1 10ZM0-13Q8-12 14-6L2 11ZM17-4L19-1L5 10Z" fill="#f4cf42" />
      <path d="M-22 2L1 19L23 2" fill="none" stroke="#f6df62" strokeWidth="3" />
    </g>
  </>
}

function FriesArt({ paint }: { paint: Paint }) {
  const fries = [
    [60, 115, 60, -19], [76, 111, 66, 12], [88, 106, 63, -12], [103, 107, 65, 12], [117, 106, 70, 27], [130, 110, 62, 30], [147, 114, 62, 29],
    [65, 125, 63, -43], [89, 126, 68, -25], [105, 126, 71, 19], [124, 124, 66, 42], [140, 129, 59, 27], [160, 125, 54, 37],
    [83, 135, 55, -56], [111, 135, 63, -67], [112, 123, 55, 68], [144, 136, 65, 63], [72, 128, 49, 41],
  ]
  return <>
    <Plate paint={paint} />
    <path d="M40 104L52 64L173 72L195 126L146 143L57 133Z" fill="#fff7df" stroke="#e1cfaa" />
    <path d="M52 64L68 84L40 104M173 72L159 92L195 126" fill="none" stroke="#eadbbd" strokeWidth="2" />
    {fries.map(([x, y, length, rotate], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x="-4" y={-length} width="10" height={length} rx="2" fill="#b7802c" />
      <rect x="-4" y={-length} width="7.5" height={length-1.5} rx="1.8" fill={paint.fries} />
      <path d={`M-2 ${-length+6}V-9`} stroke="#ffe6a0" strokeWidth="1.2" opacity=".75" />
      <path d={`M-3 ${-length+2}L2 ${-length+1}M-3-4L2-3`} stroke={i % 4 === 0 ? '#a86627' : '#d2a042'} strokeWidth="2.5" opacity=".75" />
      {i > 6 && <><path d={`M-1 ${-length*.6}l2-1M0 ${-length*.4}l1 1`} stroke="#fff6d8" strokeWidth="1.5" /></>}
    </g>)}
    <g transform="translate(187 129)">
      <path d="M-22-5L-18 12Q0 25 18 12L22-5Z" fill="#e1ceb0" stroke="#cbb48f" />
      <ellipse cy="-5" rx="22" ry="10" fill="#fff7e6" />
      <ellipse cy="-5" rx="17.5" ry="7" fill="#a43224" />
      <path d="M-12-5Q-7-11 4-8Q15-4 4-2Q-9 1-5-5Q-1-8 6-5" fill="none" stroke="#d75331" strokeWidth="3" strokeLinecap="round" />
      <path d="M-17 1L-14 12" stroke="#f9eedc" strokeWidth="2" />
    </g>
  </>
}

function TempuraArt({ paint }: { paint: Paint }) {
  return <>
    <Plate paint={paint} dark />
    <path d="M44 100L132 78L197 119L105 139Z" fill="#f5efdc" stroke="#c5bea9" />
    <g transform="translate(69 101) rotate(-20)">
      <path d="M-29 5A29 30 0 0 1 29 5L17 4A17 18 0 0 0-17 4Z" fill="#526444" stroke="#314931" strokeWidth="2" />
      <path d="M-25 4A25 25 0 0 1 25 4L16 3A16 16 0 0 0-16 3Z" fill="#e8ae44" stroke="#efcf80" strokeWidth="3" />
      <path d="M-20-5L-18-9M-11-17L-7-19M5-19L10-17M18-10L21-5" stroke="#ffe0a0" strokeWidth="3" strokeLinecap="round" />
    </g>
    {[[105, 119, 26], [141, 122, 43]].map(([x, y, rotate], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <g transform="translate(0 -68)">
        <path d="M0 7Q-25-7-19-23Q-7-24 1-1Q4-26 16-26Q23-8 3 7Z" fill="#da5c35" stroke="#b74728" strokeWidth="1.2" />
        <path d="M-2-1L-15-18M5-4L14-20" stroke="#f69b61" strokeWidth="2" strokeLinecap="round" />
        <path d="M-5 4L6 4L5 14L-5 13Z" fill="#ed9860" />
      </g>
      <path d="M-11 2Q-15-15-13-35Q-15-50-7-59Q0-65 9-57Q12-40 13-26Q18-9 11 4Q0 14-11 2Z" fill="#b8873a" opacity=".3" transform="translate(2 3)" />
      <path d="M-11 2Q-15-15-13-35Q-15-50-7-59Q0-65 9-57Q12-40 13-26Q18-9 11 4Q0 14-11 2Z" fill="#e6bb65" stroke="#c99b48" strokeWidth="1" />
      <path d="M-5-53Q5-55 5-48M-9-41L-3-45L4-40M-7-31L0-35L8-29M-9-19L-1-23L7-18M-6-7L1-12L9-7M-5 3L2 0" fill="none" stroke="#f8d996" strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round" />
      {Array.from({ length: 12 }, (_, j) => <path key={j} d={`M${j % 2 ? 8 : -11} ${-49+j*4}l3-2l3 3l-3 3Z`} fill={j % 3 ? '#f1d083' : '#d1a154'} />)}
    </g>)}
    <g transform="translate(63 125) rotate(-20)">
      <path d="M-22 1Q-16-12-4-7Q8-4 22-6Q21 2 8 7Q-10 14-22 1Z" fill="#6b8241" stroke="#4b6232" strokeWidth="1.5" />
      <path d="M-14-2Q0 6 17-3" fill="none" stroke="#adc06d" strokeWidth="2" />
      <path d="M21-5L31-11" stroke="#526939" strokeWidth="3" strokeLinecap="round" />
      <path d="M-15 4L-9 8M0-4L7-1M9 5L15 2" stroke="#e9cd88" strokeWidth="4" strokeLinecap="round" />
    </g>
  </>
}

function RamenArt({ paint }: { paint: Paint }) {
  return <>
    <ellipse cx="120" cy="154" rx="77" ry="14" fill="#593c24" opacity=".11" />
    <ellipse cx="120" cy="152" rx="38" ry="9" fill="#c9b99e" />
    <path d="M33 88Q39 145 97 153Q122 159 148 151Q204 138 207 88Z" fill={paint.ceramic} stroke="#c5b08e" strokeWidth="1.3" />
    <path d="M42 106Q119 143 197 106M48 117Q122 152 190 117" fill="none" stroke="#b7583d" strokeWidth="3" />
    <path d="M63 126L68 136M87 135L89 144M152 135L150 145M177 126L172 136" stroke="#b7583d" strokeWidth="3" />
    <ellipse cx="120" cy="88" rx="87" ry="33" fill="#fff7df" stroke="#d0ba96" strokeWidth="2" />
    <ellipse cx="120" cy="89" rx="77" ry="26" fill={paint.broth} />
    <path d="M59 85Q70 77 84 82T111 80T143 85M54 92Q72 85 87 92T118 89T151 94M62 100Q77 91 93 100T124 98T153 99M81 105Q93 97 108 105T141 104" fill="none" stroke="#ebc971" strokeWidth="3.3" strokeLinecap="round" />
    <path d="M161 78L154 44L184 50L188 86Z" fill="#304b34" stroke="#1e3b2a" strokeWidth="1.3" />
    <path d="M160 51L180 55M163 57L181 62M165 65L183 71" stroke="#66744d" strokeWidth="1.5" opacity=".8" />
    <g transform="translate(87 84) rotate(-14)">
      <ellipse rx="27" ry="15" fill="#a56643" />
      <ellipse cy="-2" rx="25" ry="14" fill="#d99a71" stroke="#bd7a53" strokeWidth="1" />
      <path d="M-18-2Q-10-13 6-9Q24-4 12 5Q0 13-12 4Q-17-3-4-5Q9-7 10 0Q7 6-3 3" fill="none" stroke="#f2c6a0" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g transform="translate(150 95) rotate(-29)">
      <ellipse rx="22" ry="15" fill="#d3b88c" />
      <ellipse cy="-3" rx="22" ry="15" fill="#fff0ce" stroke="#decda7" strokeWidth="1.2" />
      <ellipse cx="1" cy="-3" rx="11" ry="9" fill="#e3a134" />
      <ellipse cx="-2" cy="-6" rx="5" ry="3" fill="#f6c44f" opacity=".85" />
    </g>
    {[[112, 70, -25], [123, 72, 10], [115, 79, 30], [129, 81, -14], [134, 72, -30], [106, 76, 12]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="5" ry="2.6" transform={`rotate(${r} ${x} ${y})`} fill="#d1d695" stroke="#6d914c" strokeWidth="2.2" />)}
    <path d="M53 90Q52 100 67 106" fill="none" stroke="#ffdfa2" strokeWidth="1.5" opacity=".8" />
  </>
}

function MisoArt({ paint }: { paint: Paint }) {
  return <>
    <ellipse cx="120" cy="151" rx="68" ry="13" fill="#593c24" opacity=".11" />
    <path d="M87 140L87 149Q119 161 153 149L153 140Z" fill="#49332c" />
    <path d="M43 84Q43 140 103 149Q124 153 146 146Q196 132 197 84Z" fill={paint.lacquer} stroke="#49332c" strokeWidth="1.5" />
    <path d="M53 101Q63 130 94 139" fill="none" stroke="#b06949" strokeWidth="3" opacity=".55" strokeLinecap="round" />
    <ellipse cx="120" cy="84" rx="77" ry="31" fill="#ad6144" stroke="#543b2e" strokeWidth="2" />
    <ellipse cx="120" cy="84" rx="69" ry="25" fill="#b39461" />
    <ellipse cx="120" cy="83" rx="64" ry="22" fill="#c3a26b" />
    {[[79, 78, 1], [106, 72, .8], [139, 77, 1.1], [163, 84, .7], [144, 93, .9], [103, 94, 1], [70, 89, .65], [120, 84, .65]].map(([x, y, scale], i) => <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-13 0L-8-5L-2-3L4-6L10-2L13 3L7 5L1 3L-5 6L-11 4Z" fill={i % 2 ? '#526448' : '#3d5b3e'} />
      <path d="M-8 1L-2-1L3 2L8 0M0-3L-2 4" fill="none" stroke="#839163" strokeWidth="1.3" />
    </g>)}
    <g stroke="#dbc79e" strokeWidth=".8">
      <path d="M87 79L99 75L107 80L96 85Z" fill="#f3e4be" /><path d="M87 79V84L96 89L107 84V80L96 85Z" fill="#ddd0a7" />
      <path d="M142 85L155 81L165 87L152 92Z" fill="#f3e4be" /><path d="M142 85V90L152 96L165 91V87L152 92Z" fill="#ddd0a7" />
    </g>
    <path d="M90 48Q81 38 91 28M116 44Q129 32 118 18M147 48Q157 38 148 28" fill="none" stroke="#a99476" strokeWidth="2.3" opacity=".4" strokeLinecap="round" />
  </>
}

function ChawanmushiArt({ paint }: { paint: Paint }) {
  return <>
    <ellipse cx="116" cy="151" rx="73" ry="14" fill="#593c24" opacity=".11" />
    <ellipse cx="115" cy="147" rx="67" ry="17" fill="#e0d8c1" stroke="#c6baa0" />
    <ellipse cx="115" cy="143" rx="67" ry="17" fill={paint.plate} stroke="#e0d4b8" />
    <g transform="translate(179 119) rotate(-37)">
      <ellipse cy="5" rx="30" ry="13" fill="#849f98" />
      <ellipse rx="30" ry="13" fill="#d9e5d6" stroke="#8fa89b" strokeWidth="1.2" />
      <ellipse rx="23" ry="9" fill="none" stroke="#75978a" strokeWidth="1.5" />
      <path d="M-7-2L-6-9Q0-14 6-9L7-2Q0 3-7-2" fill="#aec5b7" stroke="#78988a" />
      <ellipse cy="-9" rx="6" ry="3" fill="#e6ead8" />
    </g>
    <path d="M65 71L73 130Q77 148 112 149Q150 149 155 130L163 71Z" fill={paint.ceramic} stroke="#d3c2a2" strokeWidth="1.3" />
    <path d="M76 92L81 133M88 96L91 139M139 97L135 139M151 90L146 133" fill="none" stroke="#819e90" strokeWidth="3" opacity=".78" />
    <path d="M98 105Q105 99 111 105Q117 112 124 105Q131 99 136 105M99 113Q106 107 112 113Q119 120 126 113Q132 108 135 112" fill="none" stroke="#819e90" strokeWidth="1.8" />
    <ellipse cx="114" cy="71" rx="49" ry="20" fill="#fffae6" stroke="#c8b796" strokeWidth="1.5" />
    <ellipse cx="114" cy="72" rx="43" ry="15.5" fill={paint.custard} />
    <path d="M78 72Q86 82 103 83" fill="none" stroke="#fff4bf" strokeWidth="1.6" />
    <g transform="translate(97 72) rotate(-13)">
      <path d="M-10 3Q-15-7-4-12Q10-14 14-3L7 6Z" fill="#92704a" />
      <path d="M-10 1Q0-5 12-1" fill="none" stroke="#d1b58a" strokeWidth="2.3" />
      <path d="M2-9L1-3M-2-7L5-5" stroke="#e0c7a1" strokeWidth="1.5" />
    </g>
    <g transform="translate(134 73) rotate(20)">
      <path d="M-11 1Q-13-10-3-11Q9-12 12-3Q13 3 7 7L1 3Q8-2 3-5Q-4-7-4 0Z" fill="#e89869" stroke="#bf7854" strokeWidth=".8" />
      <path d="M-10-3L-5-2M-6-9L-3-5M1-10L1-6M7-7L5-4" stroke="#ffdab2" strokeWidth="2.3" />
    </g>
    <g transform="translate(117 66) rotate(8)">
      <path d="M-1 12Q2 0 0-10" fill="none" stroke="#5e773f" strokeWidth="2" />
      <path d="M0 0Q-20-1-15-11Q-2-15 0 0M0-1Q-10-17 0-19Q12-14 0-1M1 1Q5-16 15-9Q18 2 1 1" fill="#6a8a4e" stroke="#476a39" strokeWidth=".8" />
      <path d="M-11-8L-1 0M0-14V-3M11-7L2 0" stroke="#aec082" strokeWidth="1" />
    </g>
  </>
}

function InboundDonArt({ paint }: { paint: Paint }) {
  const beef = [[108, 69, 48], [125, 66, 51], [141, 70, 48], [155, 75, 43], [169, 83, 38], [180, 93, 31], [178, 103, 20]]
  const uni = [[59, 83, 32, .78], [76, 76, 43, .83], [89, 82, 35, .92], [51, 95, 35, .78], [65, 99, 54, .9], [82, 99, 27, .89], [100, 101, 38, .94], [68, 113, 66, .78], [85, 116, 78, .92], [107, 116, 61, .89], [125, 113, 52, .9], [144, 114, 45, .82], [161, 112, 67, .78], [78, 92, 49, .88], [96, 109, 61, .89], [120, 106, 40, .84]]
  return <>
    <ellipse cx="120" cy="153" rx="85" ry="13" fill="#593c24" opacity=".13" />
    <path d="M87 139V149Q120 160 153 149V139Z" fill="#20221f" />
    <path d="M24 88Q31 136 91 149Q119 159 153 149Q209 134 216 88Z" fill="#222522" stroke="#121a16" strokeWidth="1.3" />
    <path d="M38 110Q60 139 96 145" fill="none" stroke="#667061" strokeWidth="2" opacity=".4" strokeLinecap="round" />
    <ellipse cx="120" cy="88" rx="96" ry="38" fill="#dbb968" stroke="#c9a655" strokeWidth="2" />
    <ellipse cx="120" cy="88" rx="85" ry="30" fill="#e9ca80" />
    <ellipse cx="120" cy="89" rx="74" ry="25" fill={paint.plate} />
    {Array.from({ length: 220 }, (_, i) => {
      const angle = i * 2.39996, radius = Math.sqrt((i + .5) / 220)
      const x = 120 + Math.cos(angle) * radius * 72, y = 89 + Math.sin(angle) * radius * 23
      return <g key={i} transform={`translate(${x} ${y}) rotate(${i * 137.5 % 180})`}>
        <ellipse cy=".55" rx={1.8 + (i % 3) * .2} ry=".86" fill="#d7cebb" opacity=".8" />
        <ellipse rx={1.8 + (i % 3) * .2} ry=".78" fill={i % 4 ? '#fff9ed' : '#eee7d8'} />
        {i % 3 === 0 && <path d="M-1-.2L.8-.2" stroke="#fffdf5" strokeWidth=".35" strokeLinecap="round" />}
      </g>
    })}
    {beef.map(([x, y, rotation], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <path d="M-13-25Q-21-16-19 1Q-20 22-10 28Q1 33 12 24Q22 10 18-7Q16-29 3-30Q-5-30-13-25Z" fill="#785344" />
      <path d="M-12-23Q-19-15-17 1Q-18 21-9 26Q1 30 11 22Q20 10 16-7Q14-27 3-28Q-5-28-12-23Z" fill={i % 2 ? '#bf4e58' : '#d7646b'} />
      <path d="M-14-13Q-4-9 13-15M-16-3Q-3 2 16-4M-15 8Q-5 13 14 6M-11 18Q-2 23 9 17" fill="none" stroke="#ec9a9d" strokeWidth=".8" strokeLinecap="round" opacity=".8" />
      <path d="M-10-22Q-6-17-8-11M3 5Q1 9 5 14" fill="none" stroke="#f0b7b4" strokeWidth=".7" opacity=".75" />
    </g>)}
    {uni.map(([x, y, rotation, scale], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
      <path d="M-1-27Q-7-24-7-19L-9-14L-8-8Q-11-2-8 4L-9 9L-6 16Q-5 23 0 28Q5 21 6 15L8 11L7 5Q11-1 8-6L9-12L6-17Q6-23 2-27Q0-29-1-27Z" fill={i % 3 === 0 ? '#ef850e' : i % 3 === 1 ? '#e77505' : '#ed921c'} stroke="#df740b" strokeWidth=".55" />
      <path d="M0-24Q-3-17-1-10Q2-3-1 4Q-3 13 0 23" fill="none" stroke="#cc6208" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M-3-21Q-6-15-4-8M-5-5Q-7 1-4 7M-4 11L-2 19M3-21Q6-16 4-10M5-6Q7 1 4 7M4 11L2 20" fill="none" stroke="#ffaf43" strokeWidth="1.05" strokeLinecap="round" />
      {Array.from({ length: 15 }, (_, j) => <path key={j} d={`M${(j % 2 ? 3 : -5) + Math.sin(j * 2 + i)} ${-19 + j * 2.7}l1.8 .65`} stroke={j % 3 ? '#ffaf43' : '#db6d0a'} strokeWidth=".6" strokeLinecap="round" opacity=".85" />)}
    </g>)}
    {Array.from({ length: 31 }, (_, i) => {
      const a = i * 2.39996, r = 18 * Math.sqrt((i + .5) / 31)
      const x = 121 + Math.cos(a) * r, y = 88 + Math.sin(a) * r * .55
      return <g key={i}>
        <circle cx={x} cy={y} r={3.7 + (i % 3) * .3} fill={i % 3 ? '#ee721e' : '#f58927'} stroke="#e26714" strokeWidth=".5" />
        <circle cx={x + .6} cy={y + .5} r="1.65" fill="#d94410" opacity=".65" />
        <ellipse cx={x - 1.1} cy={y - 1.2} rx="1.05" ry=".65" fill="#ffe2a5" opacity=".9" />
      </g>
    })}
    <g fill="#4d8537" stroke="#3c6b31" strokeWidth=".5">
      <path d="M119 81Q104 80 108 72Q117 69 119 81Z" />
      <path d="M120 80Q112 68 120 66Q129 68 120 80Z" />
      <path d="M121 82Q123 70 132 74Q138 82 121 82Z" />
      <path d="M111 75L120 82L128 77M120 70V80" fill="none" stroke="#a3b86e" strokeWidth=".6" />
    </g>
  </>
}

/** 多数のカードにも軽量に表示できる、外部画像・WebGL 不要の料理イラストです。 */
export function SideMenuArt({ id, className, size, decorative = true }: SideMenuArtProps) {
  const instanceId = `side-art-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const paint: Paint = {
    plate: `url(#${instanceId}-plate)`, crust: `url(#${instanceId}-crust)`, fries: `url(#${instanceId}-fries)`,
    broth: `url(#${instanceId}-broth)`, ceramic: `url(#${instanceId}-ceramic)`, lacquer: `url(#${instanceId}-lacquer)`, custard: `url(#${instanceId}-custard)`,
  }
  const name = SIDE_MENU_CATALOG.find(menu => menu.id === id)?.name ?? 'サイドメニュー'
  return (
    <svg className={className} width={size ?? '100%'} height={size ? size * .75 : undefined} viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg" role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${name}のイラスト`} focusable="false">
      <defs>
        <linearGradient id={`${instanceId}-plate`} x1="120" y1="70" x2="120" y2="150" gradientUnits="userSpaceOnUse"><stop stopColor="#fffaf0" /><stop offset="1" stopColor="#e9ddc3" /></linearGradient>
        <linearGradient id={`${instanceId}-crust`} x1="-12" y1="-24" x2="13" y2="25" gradientUnits="userSpaceOnUse"><stop stopColor="#e4a44e" /><stop offset=".5" stopColor="#cb8835" /><stop offset="1" stopColor="#ad682a" /></linearGradient>
        <linearGradient id={`${instanceId}-fries`} x1="-4" y1="0" x2="5" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#e4b44a" /><stop offset=".4" stopColor="#f5d171" /><stop offset="1" stopColor="#e6b64c" /></linearGradient>
        <radialGradient id={`${instanceId}-broth`} cx=".45" cy=".38" r=".8"><stop stopColor="#bd934d" /><stop offset="1" stopColor="#8d6435" /></radialGradient>
        <linearGradient id={`${instanceId}-ceramic`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#ded0b4" /><stop offset=".3" stopColor="#fcf3de" /><stop offset=".7" stopColor="#f5ead2" /><stop offset="1" stopColor="#d6c5a5" /></linearGradient>
        <linearGradient id={`${instanceId}-lacquer`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#45342d" /><stop offset=".35" stopColor="#754636" /><stop offset=".8" stopColor="#603c31" /><stop offset="1" stopColor="#3f3029" /></linearGradient>
        <radialGradient id={`${instanceId}-custard`} cx=".4" cy=".35" r=".9"><stop stopColor="#f6e5a5" /><stop offset="1" stopColor="#debd71" /></radialGradient>
      </defs>
      {id === 'karaage' && <KaraageArt paint={paint} />}
      {id === 'fries' && <FriesArt paint={paint} />}
      {id === 'tempura' && <TempuraArt paint={paint} />}
      {id === 'ramen' && <RamenArt paint={paint} />}
      {id === 'miso' && <MisoArt paint={paint} />}
      {id === 'chawanmushi' && <ChawanmushiArt paint={paint} />}
      {id === 'inbound_don' && <InboundDonArt paint={paint} />}
    </svg>
  )
}
