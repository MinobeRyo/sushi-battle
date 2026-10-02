import { Component, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { OrthographicCamera, PCFShadowMap } from 'three'
import { CARDS } from '../../data/cards'
import { SideMenuModel } from './models/SideMenuModel'
import { SIDE_MENU_CATALOG } from './sideMenuCatalog'
import type { SideMenuId } from './sideMenuCatalog'
import '../catalog/CardCatalogScreen.css'
import './SideMenuStudio.css'

type ViewMode = 'collection' | 'detail'

function Icon({ name }: { name: 'grid' | 'focus' | 'rotate' | 'reset' | 'arrow' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'grid' && <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
    {name === 'focus' && <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><circle cx="12" cy="12" r="4" /></>}
    {name === 'rotate' && <><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" /><path d="m11 9 4 3-4 3Z" /></>}
    {name === 'reset' && <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>}
    {name === 'arrow' && <path d="M4 12h16m-6-6 6 6-6 6" />}
  </svg>
}

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="side-studio-fallback" role="alert">3D表示を開始できませんでした。WebGLが利用できるブラウザで、このページを再読み込みしてください。</div>
    return this.props.children
  }
}

function CameraRig({ mode, reset, rotating }: { mode: ViewMode; reset: number; rotating: boolean }) {
  const { camera, size, invalidate } = useThree()
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return
    camera.position.set(...(mode === 'collection' ? [0, 10, 11] : [3.4, 4.6, 6]) as [number, number, number])
    camera.zoom = mode === 'collection'
      ? Math.min(size.width / 10.1, size.height / 7.7)
      : Math.min(size.width / 4.3, size.height / 3.8)
    camera.lookAt(0, 0.45, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, mode, reset, size.width, size.height, invalidate])
  return <OrbitControls key={`${mode}-${reset}`} makeDefault target={[0, 0.45, 0]} enablePan={false}
    minPolarAngle={0.18} maxPolarAngle={Math.PI / 2.1} minZoom={25} maxZoom={320}
    autoRotate={rotating} autoRotateSpeed={0.55} />
}

function Dish({ id, index, selected, mode, onSelect }: {
  id: SideMenuId; index: number; selected: boolean; mode: ViewMode; onSelect: (id: SideMenuId) => void
}) {
  const x = mode === 'collection' ? (index % 3 - 1) * 3.05 : 0
  const z = mode === 'collection' ? (Math.floor(index / 3) - 0.5) * 3.25 : 0
  return <group position={[x, 0, z]}>
    <mesh position={[0, -0.065, 0]} receiveShadow>
      <cylinderGeometry args={[1.33, 1.36, 0.12, 64]} />
      <meshStandardMaterial color={selected && mode === 'collection' ? '#e1cbb5' : '#e5dcce'} roughness={0.93} />
    </mesh>
    <group onClick={event => { event.stopPropagation(); onSelect(id) }}>
      <SideMenuModel id={id} />
    </group>
    {mode === 'collection' && <Html position={[0, 0.02, 1.4]} center zIndexRange={[10, 0]}>
      <button className={`side-studio-dish-label ${selected ? 'is-selected' : ''}`} onClick={() => onSelect(id)} aria-pressed={selected}>
        <span>{String(index + 1).padStart(2, '0')}</span>{SIDE_MENU_CATALOG[index].name}
      </button>
    </Html>}
  </group>
}

function StudioScene({ selected, mode, reset, rotating, onSelect }: {
  selected: SideMenuId; mode: ViewMode; reset: number; rotating: boolean; onSelect: (id: SideMenuId) => void
}) {
  return <>
    <color attach="background" args={['#ede7dc']} />
    <ambientLight intensity={0.85} color="#fff6e8" />
    <hemisphereLight args={['#fffaf0', '#b1a08a', 1.5]} />
    <directionalLight position={[-4, 9, 5]} intensity={3.1} castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8}
      shadow-normalBias={0.035} shadow-bias={-0.0001} />
    <directionalLight position={[5, 4, -5]} intensity={1.1} color="#fff1d5" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.13, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#ede7dc" roughness={1} />
    </mesh>
    {SIDE_MENU_CATALOG.map((dish, index) => (mode === 'collection' || dish.id === selected) &&
      <Dish key={dish.id} id={dish.id} index={index} selected={dish.id === selected} mode={mode} onSelect={onSelect} />)}
    <CameraRig mode={mode} reset={reset} rotating={rotating} />
  </>
}

export type SideMenuStudioProps = {
  /** 図鑑への組み込み時に指定。ページ再読み込みなしで元の図鑑へ戻る。 */
  onBack?: () => void
  /** 共通ヘッダーからタイトルへ戻る。寿司図鑑への切り替えとは分けて指定する。 */
  onTitle?: () => void
}

export default function SideMenuStudio({ onBack, onTitle }: SideMenuStudioProps = {}) {
  const [selected, setSelected] = useState<SideMenuId>('ramen')
  const [mode, setMode] = useState<ViewMode>('collection')
  const [rotating, setRotating] = useState(false)
  const [reset, setReset] = useState(0)
  const [ready, setReady] = useState(false)
  const dish = SIDE_MENU_CATALOG.find(item => item.id === selected)!
  const index = SIDE_MENU_CATALOG.indexOf(dish)
  const returnUrl = window.location.pathname + window.location.search

  return <main className="card-catalog side-studio" aria-labelledby="side-catalog-title">
    <header className="catalog-header">
      <div className="catalog-header-inner">
        {onTitle
          ? <button type="button" className="catalog-back" onClick={onTitle}>← タイトルへ</button>
          : onBack
            ? <button type="button" className="catalog-back" onClick={onBack}>← 寿司の図鑑へ</button>
            : <a className="catalog-back" href={returnUrl}>← タイトルへ</a>}
        <h1 id="side-catalog-title">サイドメニュー図鑑</h1>
        <span className="catalog-total">全{SIDE_MENU_CATALOG.length}種</span>
      </div>
    </header>

    <div className="catalog-content">
      <nav className="catalog-sections" aria-label="図鑑の種類">
        {onBack
          ? <button type="button" onClick={onBack}>寿司カード <small>{CARDS.length}種</small><span aria-hidden="true">↗</span></button>
          : <button type="button" onClick={() => window.location.assign(returnUrl)}>ゲームへ戻る <span aria-hidden="true">↗</span></button>}
        <span aria-current="page">サイドメニュー <small>{SIDE_MENU_CATALOG.length}種</small></span>
      </nav>
      <p className="catalog-intro">六つのサイドメニューを、立体でじっくり。<br />一覧から気になる一皿を選び、料理や効果の説明をご覧ください。</p>
      <div className="catalog-results-bar">
        <p role="status">{mode === 'collection' ? SIDE_MENU_CATALOG.length : 1} / {SIDE_MENU_CATALOG.length}種を表示</p>
      </div>
      <p className="catalog-guide">料理を選ぶと詳細を表示します。「一皿ずつ」で拡大し、ドラッグで回転・スクロールでズームできます。</p>

    <div className="side-studio-layout">
      <section className="side-studio-viewer" aria-label="サイドメニューの3Dプレビュー">
        <div className="side-studio-viewer-bar">
          <div className="side-studio-view-switch" role="group" aria-label="表示方法">
            <button className={mode === 'collection' ? 'active' : ''} aria-pressed={mode === 'collection'} onClick={() => { setMode('collection'); setRotating(false) }}><Icon name="grid" />一覧</button>
            <button className={mode === 'detail' ? 'active' : ''} aria-pressed={mode === 'detail'} onClick={() => setMode('detail')}><Icon name="focus" />一皿ずつ</button>
          </div>
          {mode === 'detail' ? <select className="side-studio-dish-select" aria-label="拡大する料理" value={selected} onChange={event => setSelected(event.target.value as SideMenuId)}>
            {SIDE_MENU_CATALOG.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select> : <span className="side-studio-live"><i />3D VIEW</span>}
        </div>
        <div className="side-studio-canvas" data-testid="side-menu-viewer">
          <ViewerBoundary>
            <Suspense fallback={<div className="side-studio-fallback" role="status">お料理を準備しています…</div>}>
              <Canvas orthographic shadows frameloop="demand" dpr={[1, 1.8]} camera={{ position: [0, 10, 11], zoom: 70, near: 0.1, far: 250 }}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                onCreated={({ gl }) => { gl.shadowMap.type = PCFShadowMap; setReady(true) }}
                fallback={<div className="side-studio-fallback" role="alert">WebGL対応ブラウザでご覧ください。</div>}>
                <StudioScene selected={selected} mode={mode} reset={reset} rotating={rotating} onSelect={setSelected} />
              </Canvas>
            </Suspense>
          </ViewerBoundary>
          <span className="side-studio-render-state" role="status">{ready ? '3Dモデルを表示中' : '3Dモデルを読み込み中'}</span>
        </div>
        <div className="side-studio-viewer-footer">
          <span>ドラッグで回転 <b>·</b> スクロールで拡大</span>
          <div><button onClick={() => setRotating(value => !value)} aria-pressed={rotating} className={rotating ? 'active' : ''}><Icon name="rotate" /><span>{rotating ? '回転を止める' : '自動回転'}</span></button><button onClick={() => { setReset(value => value + 1); setRotating(false) }} aria-label="視点をリセット"><Icon name="reset" /></button></div>
        </div>
      </section>

      <aside className="side-studio-detail" aria-label="選んだメニューの詳細">
        <div className="side-studio-detail-top"><span>本日のお品書き</span><span>0{index + 1} <i>/ 06</i></span></div>
        <div className="side-studio-dish-info" key={dish.id}>
          <p className="side-studio-category" style={{ color: dish.accent }}>{dish.category}</p>
          <h2>{dish.name}</h2><p className="side-studio-english">{dish.english}</p>
          <p className="side-studio-description">{dish.description}</p>
          <div className="side-studio-effect"><span>バトルでの効果案</span><p>{dish.effect}</p><small>{dish.timing}</small></div>
        </div>
        <button className="side-studio-inspect" onClick={() => setMode(mode === 'detail' ? 'collection' : 'detail')}>
          {mode === 'detail' ? '六つのお品書きに戻る' : 'この一皿を拡大'}<Icon name={mode === 'detail' ? 'grid' : 'arrow'} />
        </button>
        <p className="side-studio-slot-note">サイドメニュースロットは1枠。<br />購入できるのは、1試合に一品だけ。</p>
      </aside>
    </div>

    <nav className="side-studio-menu" aria-label="料理を選ぶ">
      {SIDE_MENU_CATALOG.map((item, itemIndex) => <button key={item.id} className={selected === item.id ? 'selected' : ''} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
        <span className="side-studio-menu-number">0{itemIndex + 1}</span><span><strong>{item.name}</strong><small>{item.english}</small></span><span className="side-studio-menu-dot" style={{ background: item.accent }} />
      </button>)}
    </nav>
    <p className="side-studio-footer">サイドメニューの効果は設計案です。</p>
    </div>
  </main>
}
