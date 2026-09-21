/* ============================================================================
 * 蓝色大肥鱼 · 深海皮肤 —— 浏览器半侧（源文件）
 *
 * 这个文件不是最终产物：build.mjs 会把它整段塞进 lib/client.js 的
 * lazy-CJS factory 里。在里面可以直接用：
 *   - require()      基座模块（react / react/jsx-runtime / react-dom / cordis / …）
 *   - INLINE         构建期内联进来的背景图、贴纸、skin.css、theme.json
 *   - document       浏览器全局
 *   - ctx 上的服务   slots / theme / locale / timer
 *
 * 和动态插件版本的唯一区别：
 *   1. styles.insert(css)  → 这里自带的 insertStyle（同一套 data-plugin 标签约定）
 *   2. host.call('skin-assets') → INLINE（构建期就把文件读进来了）
 * 其余（令牌层、背景两层、四处 slot、鲸鱼语、原生捕获开关）逐行照搬。
 * ========================================================================== */

const React = require('react')
const h = React.createElement

const NS_SVG = 'http://www.w3.org/2000/svg'
const SOURCE = 'blue-fat-fish'
const TAG_PLUGIN = 'dsh-blue-fat-fish'
const CHAT_NS = 'chat'
const WHALE_LANG = 'zh-whale'
const WHALE_LABEL = '鲸鱼语 · 蓝色大肥鱼'
/* 鲸鱼语：产品那一行「深度求索中...」的状态文案（chat 命名空间的 chat.deepDiving，
   一轮对话进行中显示在对话区顶部的那条 status）换成本包这套台词，每 6 秒轮播一条。
   —— 这里**只写要覆盖的那一个键**：locale 规定一个命名空间一门语言只有一个主人，
   直接改 chat 的 zh 字典会被拒（locale namespace "chat" already has locale "zh"），
   所以另开一门回退中文的语言 zh-whale，其余文案沿回退链落到中文。
   注意：思考行标题（message.think，默认「思考」）**不再覆写**，保持产品原样。 */
const DIVE_LINES = ['正在偷吃 token 白饭中……', '碗里的白饭还没扒完，等我一下', '才不是在摸鱼，是在深度思考！', '别催了别催了，已经在想了', '绝对不是偷懒，这叫战略性发呆', '蓝色大肥鱼正在运转中……', '虽然看起来在发呆，但脑子在动', '一只吃白饭的鲸鱼正在努力中', '正在把任务层层外包中，稍等', '编译跑着呢，我先眯一会儿']
const DIVE_KEY = 'chat.deepDiving'
const DIVE_INTERVAL_MS = 6000

/** 构建期内联：{ bg, full, head, css, tokens }（都是 data URL / 原文） */
const ASSETS = INLINE

/** 插入一张属于本插件的样式表；返回只移除这一张的 disposer。 */
function insertStyle(css, tagId) {
  if (typeof document === 'undefined') return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = TAG_PLUGIN
  tag.dataset.pluginCss = TAG_PLUGIN + '/' + tagId
  tag.textContent = css
  document.head.append(tag)
  return () => { tag.remove() }
}

/* HMR 换版时旧实例可能来不及收尾（进程被杀、抛异常），开跑前先把同名残留标签
   清干净 —— 它们全是我们自己留下的，不存在误删别人的风险。 */
function clearStaleStyles() {
  if (typeof document === 'undefined') return
  document.querySelectorAll('style[data-plugin="' + TAG_PLUGIN + '"]').forEach((tag) => { tag.remove() })
}

let skinState = null
const skinListeners = new Set()
const skinEffects = { sync: () => {}, reload: () => {} }

function useSkin() {
  const pair = React.useState(0)
  const bump = pair[1]
  React.useEffect(() => {
    const notify = () => bump((n) => n + 1)
    skinListeners.add(notify)
    return () => { skinListeners.delete(notify) }
  }, [])
  return skinState
}

function Sticker(props) {
  const skin = useSkin()
  const size = props.size || 40
  const src = skin.full || skin.head
  if (!src) return null
  return h('img', { className: 'bff-sticker', src: src, width: size, height: size, alt: '', 'aria-hidden': 'true', draggable: false })
}

function notifySkin() {
  skinListeners.forEach((listener) => {
    try { listener() } catch (error) { console.error('[blue-fat-fish] 渲染订阅失败', error) }
  })
}

function setSkin(patch) {
  Object.keys(patch).forEach((key) => { skinState[key] = patch[key] })
  skinEffects.sync()
  notifySkin()
}

function backgroundVars(state) {
  const on = state.on ? 1 : 0
  const v = Math.max(0, Math.min(1, state.intensity))
  const bg = state.on && state.bg ? 'url("' + state.bg + '")' : 'none'
  const mark = state.on && state.full ? 'url("' + state.full + '")' : 'none'
  return ':root{--bff-img:' + bg + ';--bff-mark:' + mark + '}\nbody{--bff-on:' + on + ';--bff-vis:' + v.toFixed(3) + '}'
}

const BUBBLES = [[5, 0, 15, 15], [11, 4.2, 9, 18], [17, 8.5, 20, 22], [23, 1.6, 11, 16], [29, 11, 7, 20], [35, 6.4, 16, 24], [42, 13.5, 10, 17], [48, 3.1, 13, 21], [55, 9.8, 8, 19], [61, 15.2, 18, 25], [68, 5.6, 11, 16], [74, 12.1, 9, 20], [81, 2.4, 14, 23], [88, 10.4, 12, 18], [94, 7.2, 16, 21]]

function bubbleNode(item, index) {
  return h('span', { key: 'b' + index, className: 'bff-bubble', style: { left: item[0] + '%', width: item[2] + 'px', height: item[2] + 'px', animationDelay: '-' + item[1] + 's', animationDuration: item[3] + 's' } },
    h('svg', { viewBox: '0 0 24 24', fill: 'none', xmlns: NS_SVG, 'aria-hidden': 'true', focusable: 'false' },
      h('circle', { cx: '12', cy: '12', r: '10.4', stroke: 'currentColor', strokeWidth: '1.1', opacity: '0.85' }),
      h('path', { d: 'M7.4 8.2c.9-1.6 2.4-2.7 4.2-3', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round' })))
}

function Ambience() {
  const skin = useSkin()
  if (!skin.on) return null
  return h('div', { className: 'bff-ambience', 'aria-hidden': 'true' },
    h('svg', { className: 'bff-silhouette', viewBox: '0 0 220 120', fill: 'none', xmlns: NS_SVG, 'aria-hidden': 'true', focusable: 'false' },
      h('path', { d: 'M172 62c17-19 27-40 27-40 5 19 2 39-7 55 11 16 15 36 11 54 0 0-13-22-31-33z', fill: 'currentColor' }),
      h('path', { d: 'M14 60c0-34 28-58 68-58s68 24 68 58c0 33-30 54-68 54S14 93 14 60z', fill: 'currentColor' }),
      h('path', { d: 'M43 82c13 17 35 27 62 24 23-2 42-13 51-29-11-10-30-17-52-17-25 0-46 8-61 22z', fill: '#FFFFFF', opacity: '0.22' })),
    skin.bubbles ? h('div', { className: 'bff-bubbles' }, BUBBLES.map(bubbleNode)) : null)
}

function BrandWhale(props) {
  const size = (props && props.size) || 24
  return h('span', { className: 'bff-brand-mark' }, h(Sticker, { size: size }))
}

/* 关键修正：React 17+ 把监听挂在根容器上，而左上角整行是一个产品的 <button>
   （无障碍名就叫「新建会话」）。在 span 上写 React onClick + stopPropagation 拦不住
   产品那个处理函数 —— 现象是皮肤切了、会话也被切走。
   改成直接挂在元素上的原生“捕获阶段”监听：捕获在冒泡之前，stopPropagation 让事件
   根本到不了根容器，产品那个 onClick 自然不会派发。
   【实测记录】在常驻版上复验过：事件目标是 .bff-wordmark、cancelBubble 变 true、
   挂在 document 上的冒泡监听一次都没被触发 —— 即产品处理函数确实没跑。
   注意别把「点一下之后会话切换了」当成这个 bug：DSH 自己在页面加载后几秒会恢复
   上一个会话（实测空等 22 秒、零交互也会打开），跟点击无关。 */
let brandCleanup = null
function brandRef(node) {
  if (brandCleanup) { brandCleanup(); brandCleanup = null }
  if (!node) return
  const toggle = (event) => {
    event.stopPropagation()
    event.preventDefault()
    setSkin({ on: !skinState.on })
  }
  const onClick = (event) => { toggle(event) }
  const onKey = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    toggle(event)
  }
  node.addEventListener('click', onClick, true)
  node.addEventListener('keydown', onKey, true)
  brandCleanup = () => {
    node.removeEventListener('click', onClick, true)
    node.removeEventListener('keydown', onKey, true)
  }
}

function BrandToggle() {
  const skin = useSkin()
  return h('span', {
    ref: brandRef,
    className: 'bff-wordmark' + (skin.on ? ' is-on' : ' is-off'),
    role: 'button',
    tabIndex: 0,
    'aria-pressed': skin.on ? 'true' : 'false',
    title: skin.on ? '蓝色大肥鱼 · 已启用（点一下关掉）' : '蓝色大肥鱼 · 已关闭（点一下开启）',
  }, '蓝色大肥鱼')
}

function HeroWhale() {
  return h('span', { className: 'bff-hero-mark' }, h(Sticker, { size: 44 }))
}

function installWhaleLocale(ctx) {
  const locale = ctx.get('locale')
  if (locale === undefined) { console.error('[blue-fat-fish] locale 服务不可用'); return null }
  const timer = ctx.get('timer')
  const pending = []
  let langDisposer = null
  let dictDisposer = null
  let tick = null
  let line = 0
  let original = null
  let wantOn = true
  let setting = false
  let disposed = false
  const later = (fn, ms) => {
    if (timer === undefined || disposed) return
    pending.push(timer.timeout(fn, ms))
  }
  function writeLine() {
    if (dictDisposer) { try { dictDisposer() } catch (error) { void error } dictDisposer = null }
    const text = DIVE_LINES[line % DIVE_LINES.length]
    line += 1
    try { dictDisposer = locale.register(CHAT_NS, WHALE_LANG, { [DIVE_KEY]: text }) }
    catch (error) { dictDisposer = null; console.error('[blue-fat-fish] 写入鲸鱼语字典失败', error) }
  }
  function ensure(attempt) {
    if (disposed) return
    if (langDisposer === null) {
      try { langDisposer = locale.addLanguage({ id: WHALE_LANG, label: WHALE_LABEL, fallback: 'zh' }) }
      catch (error) {
        console.error('[blue-fat-fish] 注册鲸鱼语失败，' + (attempt > 1 ? '稍后重试' : '已放弃'), error)
        if (attempt > 1) later(() => ensure(attempt - 1), 700)
        return
      }
    }
    if (dictDisposer === null) writeLine()
    if (tick === null && timer !== undefined) tick = timer.interval(writeLine, DIVE_INTERVAL_MS)
    if (!wantOn) return
    if (locale.getLocale().active === WHALE_LANG) return
    try {
      if (original === null) original = locale.getLocale().active
      setting = true
      locale.setLocale(WHALE_LANG)
      setting = false
    } catch (error) {
      setting = false
      console.error('[blue-fat-fish] 切换到鲸鱼语失败', error)
      if (attempt > 1) later(() => ensure(attempt - 1), 700)
    }
  }
  ensure(5)
  later(() => ensure(3), 350)
  later(() => ensure(3), 1400)
  ctx.on('locale/change', () => {
    if (setting || disposed) return
    if (wantOn && locale.getLocale().active !== WHALE_LANG) {
      wantOn = false
      console.log('[blue-fat-fish] 你自己换了语言，不再抢回来')
    }
  })
  return {
    enable() { wantOn = true; ensure(5); later(() => ensure(3), 350) },
    disable() {
      wantOn = false
      if (tick) { tick(); tick = null }
      if (original !== null && locale.getLocale().active === WHALE_LANG) {
        try { setting = true; locale.setLocale(original); setting = false }
        catch (error) { setting = false; void error }
      }
    },
    dispose() {
      disposed = true
      wantOn = false
      pending.forEach((fn) => { try { fn() } catch (error) { void error } })
      if (tick) { tick(); tick = null }
      if (dictDisposer) { try { dictDisposer() } catch (error) { void error } dictDisposer = null }
      if (langDisposer) { try { langDisposer() } catch (error) { void error } langDisposer = null }
      if (original !== null && locale.getLocale().active === WHALE_LANG) {
        try { locale.setLocale(original) } catch (error) { void error }
      }
    },
  }
}

function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) { console.error('[blue-fat-fish] slots 服务不可用'); return }
  const theme = ctx.get('theme')
  clearStaleStyles()
  skinState = { on: true, bg: ASSETS.bg, full: ASSETS.full, head: ASSETS.head, css: ASSETS.css, tokens: ASSETS.tokens, intensity: 0.50, rays: false, bubbles: true }
  let bgDisposer = null
  let tokenDisposer = null
  let fallbackDisposer = null
  let cssDisposer = null
  function tokenFallbackCss(tokens) {
    const light = []
    const dark = []
    Object.keys(tokens).forEach((name) => {
      light.push(name + ':' + tokens[name].light + ';')
      dark.push(name + ':' + tokens[name].dark + ';')
    })
    return 'body{' + light.join('') + '}\nbody[data-ds-dark-theme]{' + dark.join('') + '}'
  }
  function applyTokens() {
    if (tokenDisposer) { tokenDisposer(); tokenDisposer = null }
    if (fallbackDisposer) { fallbackDisposer(); fallbackDisposer = null }
    if (!skinState.on || !skinState.tokens) return
    if (theme !== undefined) tokenDisposer = theme.overrideTokens(SOURCE, skinState.tokens)
    else fallbackDisposer = insertStyle(tokenFallbackCss(skinState.tokens), 'tokens')
  }
  function applyBackground() {
    if (bgDisposer) { bgDisposer(); bgDisposer = null }
    if (!skinState.bg) return
    bgDisposer = insertStyle(backgroundVars(skinState), 'background')
  }
  function applyCss() {
    if (cssDisposer) { cssDisposer(); cssDisposer = null }
    if (!skinState.css) return
    cssDisposer = insertStyle(skinState.css, 'skin.css')
  }
  const whaleLocale = installWhaleLocale(ctx)
  skinEffects.sync = () => {
    applyTokens()
    applyBackground()
    applyCss()
    if (whaleLocale !== null) {
      if (skinState.on) whaleLocale.enable()
      else whaleLocale.disable()
    }
  }
  /* 素材已经在构建期内联，这里只剩“把样式摆上去”这一步；保留 load 这个名字，
     是为了 HMR 换版 / 手动重放时有一致的入口。 */
  function load() {
    if (!skinState.tokens || !skinState.css) {
      try {
        skinState.tokens = INLINE.tokens
        skinState.css = INLINE.css
      } catch (error) { console.error('[blue-fat-fish] 内联素材读取失败', error) }
    }
    skinEffects.sync()
    notifySkin()
  }
  skinEffects.reload = load
  load()
  ctx.effect(() => () => {
    if (bgDisposer) bgDisposer()
    if (tokenDisposer) tokenDisposer()
    if (fallbackDisposer) fallbackDisposer()
    if (cssDisposer) cssDisposer()
    bgDisposer = null
    tokenDisposer = null
    fallbackDisposer = null
    cssDisposer = null
    skinEffects.sync = () => {}
    skinEffects.reload = () => {}
    skinListeners.clear()
    if (brandCleanup) { brandCleanup(); brandCleanup = null }
    if (whaleLocale !== null) whaleLocale.dispose()
  })
  /* 侧栏那两处是 single 槽：同一个优先级只允许一个登记，撞了就抛
     `single slot "…" already has a registration at priority 0`，而且渲染的是
     **优先级最低**的那个。产品自带的 brand-official 就登记在 0，所以想盖住它
     必须显式写 priority: -1（动态插件版之所以不用管，是因为动态运行时会给每个
     动态登记自动分配一个更低的优先级 —— 常驻包没有这层代劳）。
     shell.overlay 是 list 槽，优先级另有含义，继续用 id + order 排队。 */
  slots.inject('sidebar.brand.mark', () => slots.register({ name: 'sidebar.brand.mark', priority: -1 }, BrandWhale))
  slots.inject('sidebar.brand.name', () => slots.register({ name: 'sidebar.brand.name', priority: -1 }, BrandToggle))
  slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'blue-fat-fish-ambience', order: 4 }, Ambience))
  slots.inject('conversation.hero.brand.mark', () => slots.register({ name: 'conversation.hero.brand.mark' }, HeroWhale))
}

module.exports = { name: TAG_PLUGIN, inject: ['slots', 'theme', 'locale', 'timer'], apply }
