/* ============================================================================
 * test/smoke.mjs —— 不装浏览器、不连 DSH 的静态冒烟测试
 *
 *   node test/smoke.mjs
 *
 * 做法：把产出的 lib/client.js 丢进一个 vm 沙箱（只给 window.__ModuleLoader__
 * 和 document），拿到 factory 后自己调用它，再用桩 React / 桩 ctx 跑一遍 apply()。
 * 覆盖的是“移植过程中最容易出错的地方”：
 *   - 模块体能不能执行（INLINE 有没有、require 用对没有）
 *   - apply() 有没有把令牌层 / 两张样式表 / 四处 slot / 鲸鱼语挂上
 *   - 清理函数有没有把上面这些东西全部收回
 *   - 四个组件能不能构出元素树
 * 真实渲染由浏览器那一步负责（谁也不能替代真的 React）。
 * ========================================================================== */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')

const problems = []
const notes = []
function check(label, ok, detail) {
  if (ok) notes.push('  ok   ' + label + (detail ? '  → ' + detail : ''))
  else problems.push('  FAIL ' + label + (detail ? '  → ' + detail : ''))
}

/* ---------- 桩：DOM ---------- */
const liveTags = []
function makeTag(tagName) {
  const tag = {
    tagName,
    dataset: {},
    textContent: '',
    remove() {
      const index = liveTags.indexOf(tag)
      if (index >= 0) liveTags.splice(index, 1)
    },
  }
  return tag
}
const documentStub = {
  head: { append(tag) { liveTags.push(tag) } },
  createElement: makeTag,
  querySelectorAll(selector) {
    const wanted = /data-plugin="([^"]+)"/.exec(selector)
    return liveTags.filter((tag) => (wanted ? tag.dataset.plugin === wanted[1] : true))
  },
}

/* ---------- 桩：React ---------- */
const reactUsage = { useState: 0, useEffect: 0 }
const ReactStub = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children }
  },
  useState(initial) {
    reactUsage.useState += 1
    return [initial, () => {}]
  },
  useEffect(fn) {
    reactUsage.useEffect += 1
    return undefined
  },
}

/* ---------- 装 bundle ---------- */
let registration = null
const sandbox = {
  window: { __ModuleLoader__: { load(reg) { registration = reg } } },
  document: documentStub,
  console,
}
vm.createContext(sandbox)
vm.runInContext(readFileSync(BUNDLE, 'utf8'), sandbox, { filename: 'client.js' })

check('bundle 注册了 factory', registration !== null)
check('factory 的 id 就是包名', registration && registration.id === 'dsh-blue-fat-fish', registration && registration.id)
check('factory 是函数', registration && typeof registration.factory === 'function')

const plugin = registration.factory((spec) => {
  if (spec === 'react') return ReactStub
  throw new Error('未预期的 require(' + spec + ')')
})
check('module.exports 带 name', plugin && plugin.name === 'dsh-blue-fat-fish', plugin && plugin.name)
check('inject 是四个服务', Array.isArray(plugin.inject) && plugin.inject.join(',') === 'slots,theme,locale,timer', plugin && plugin.inject.join(','))
check('apply 是函数', typeof plugin.apply === 'function')

/* ---------- 桩：ctx ---------- */
const seen = {
  tokens: null, tokenDisposed: false,
  languages: [], dicts: [], locales: [],
  slotKeys: [], registrations: [],
  events: [], timers: [], disposal: [],
}
const slots = {
  inject(key, callback) {
    seen.slotKeys.push(key)
    return callback()
  },
  register(registration, component) {
    seen.registrations.push({ registration, component })
    return () => {}
  },
}
const theme = {
  overrideTokens(source, tokens) {
    seen.tokens = { source, tokens }
    return () => { seen.tokenDisposed = true }
  },
}
const locale = {
  addLanguage(input) {
    seen.languages.push(input)
    return () => { seen.disposal.push('language') }
  },
  register(ns, id, dict) {
    seen.dicts.push({ ns, id, dict })
    return () => { seen.disposal.push('dict') }
  },
  getLocale() { return { active: 'zh' } },
  setLocale(id) { seen.locales.push(id) },
}
const timer = {
  timeout(fn, ms) { seen.timers.push({ kind: 'timeout', ms }); return () => {} },
  interval(fn, ms) { seen.timers.push({ kind: 'interval', ms }); return () => {} },
}
const services = { slots, theme, locale, timer }
const ctx = {
  get(name) { return services[name] },
  on(name, fn) { seen.events.push(name); return () => {} },
  effect(fn) { const dispose = fn(); if (typeof dispose === 'function') seen.disposal.push(dispose) },
}

plugin.apply(ctx)

check('四处 slot 全部注册', seen.slotKeys.join(',') === 'sidebar.brand.mark,sidebar.brand.name,shell.overlay,conversation.hero.brand.mark', seen.slotKeys.join(','))
check('slot 渲染组件都拿到了', seen.registrations.length === 4, seen.registrations.length + ' 个')
check('shell.overlay 带 id/order', seen.registrations.some((r) => r.registration.id === 'blue-fat-fish-ambience' && r.registration.order === 4))
check('令牌层用主题服务挂载', seen.tokens !== null && seen.tokens.source === 'blue-fat-fish', seen.tokens && Object.keys(seen.tokens.tokens).length + ' 条令牌')
check('令牌是明暗双值', seen.tokens && Object.values(seen.tokens.tokens).every((v) => typeof v.light === 'string' && typeof v.dark === 'string'))
check('鲸鱼语语言包已注册', seen.languages.length === 1 && seen.languages[0].id === 'zh-whale' && seen.languages[0].fallback === 'zh', JSON.stringify(seen.languages[0]))
check('状态文案写进 chat 命名空间的 chat.deepDiving', seen.dicts.length >= 1 && seen.dicts[0].ns === 'chat' && typeof seen.dicts[0].dict['chat.deepDiving'] === 'string', seen.dicts[0] && JSON.stringify(seen.dicts[0].dict))
check('不再覆写思考行标题 message.think', seen.dicts.every((d) => !('message.think' in d.dict)))
check('切到了鲸鱼语', seen.locales.includes('zh-whale'), seen.locales.join(','))
check('监听了语言变化', seen.events.includes('locale/change'))
check('轮播间隔 6 秒', seen.timers.some((t) => t.kind === 'interval' && t.ms === 6000), seen.timers.map((t) => t.kind + '@' + t.ms).join(' '))

const cssTags = liveTags.filter((tag) => /skin\.css$/.test(String(tag.dataset.pluginCss)))
const bgTags = liveTags.filter((tag) => /background$/.test(String(tag.dataset.pluginCss)))
check('skin.css 样式表已插入', cssTags.length === 1 && cssTags[0].textContent.length > 1000, cssTags.length + ' 张')
check('背景变量样式表已插入', bgTags.length === 1 && /--bff-img:url\("data:image\/jpeg;base64,/.test(bgTags[0].textContent))
check('样式标签带归属标记', liveTags.every((tag) => tag.dataset.plugin === 'dsh-blue-fat-fish'))
check('主题服务可用时不插兜底令牌表', liveTags.every((tag) => !/tokens$/.test(String(tag.dataset.pluginCss))))

/* ---------- 组件能不能构出元素树 ---------- */
for (const { registration: reg, component } of seen.registrations) {
  try {
    const tree = component({})
    check('组件 ' + reg.name + ' 渲染出元素', tree !== null && tree !== undefined && typeof tree.type !== 'undefined', tree && String(tree.type))
  } catch (error) {
    check('组件 ' + reg.name + ' 渲染出元素', false, error.message)
  }
}

/* ---------- 清理 ---------- */
for (const item of seen.disposal) if (typeof item === 'function') item()
check('清理后样式表全部收回', liveTags.length === 0, liveTags.length + ' 张残留')
check('清理时释放了令牌层', seen.tokenDisposed)
check('清理时释放了语言与字典', seen.disposal.filter((d) => d === 'language').length >= 1 && seen.disposal.filter((d) => d === 'dict').length >= 1)

console.log('蓝色大肥鱼 · 常驻包冒烟测试')
console.log(notes.join('\n'))
if (problems.length > 0) {
  console.log('\n失败项：')
  console.log(problems.join('\n'))
  process.exitCode = 1
} else {
  console.log('\n全部通过（' + notes.length + ' 项）。真实渲染仍以浏览器为准。')
}
