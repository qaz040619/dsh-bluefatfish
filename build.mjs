/* ============================================================================
 * build.mjs —— 把皮肤打包成常驻插件要的浏览器 bundle
 *
 *   node build.mjs           读 ../src 与 ../assets，产出 lib/client.js
 *   node build.mjs --check   只比对哈希，不写文件（看产物是不是旧的）
 *
 * 产物格式是 DSH 客户端模块系统的 lazy-CJS factory：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... module.exports } })
 * 执行 bundle 只是注册 factory，模块体在浏览器首次需要时才跑。
 *
 * 素材是「内联」方案：图片转 base64 data URL，skin.css 与 theme.json 直接
 * 塞成字面量 —— 所以这个包自带全部家当，删掉 D:\DSH\主题 也不会坏。
 * 代价是改完样式要重新跑一次本脚本（DSH 的 HMR 会在 ~500ms 内把新版换进浏览器，
 * 不用重启也不用刷新页面）。
 * ========================================================================== */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_NAME = 'dsh-blue-fat-fish'

/* 同一份脚本要伺候两种目录布局，自动探测：
 *   开发布局（本机工作区）  plugin/ 与 ../src、../assets 平级，主题文件在 ../src
 *   分发布局（git 仓库根 = 包根）  theme/ 与 assets/ 就在包内
 * 两种布局构建出的 lib/client.js **逐字节相同** —— 指纹只取文件内容，不取路径。 */
function pickLayout() {
  const repoTheme = join(HERE, 'theme')
  if (existsSync(join(repoTheme, 'skin.css'))) {
    return { name: '分发布局（仓库根 = 包根）', theme: repoTheme, assets: join(HERE, 'assets') }
  }
  const devTheme = join(HERE, '..', 'src')
  if (existsSync(join(devTheme, 'skin.css'))) {
    return { name: '开发布局（工作区）', theme: devTheme, assets: join(HERE, '..', 'assets') }
  }
  throw new Error('找不到主题源文件：既没有包内 theme/skin.css，也没有上级 ../src/skin.css')
}
const LAYOUT = pickLayout()

const INPUTS = {
  body: join(HERE, 'src', 'client-body.js'),
  css: join(LAYOUT.theme, 'skin.css'),
  tokens: join(LAYOUT.theme, 'theme.json'),
  bg: join(LAYOUT.assets, 'blue-fat-fish.jpg'),
  full: join(LAYOUT.assets, 'whale-girl.png'),
  head: join(LAYOUT.assets, 'whale-girl-head.png'),
}

const OUT = join(HERE, 'lib', 'client.js')

function readBytes(path) {
  if (!existsSync(path)) throw new Error('缺少输入文件：' + path)
  return readFileSync(path)
}

function dataUrl(path, mime) {
  return 'data:' + mime + ';base64,' + readBytes(path).toString('base64')
}

/** 逐行缩进，空行保持空行。 */
function indent(text, prefix) {
  return text
    .split(/\r?\n/)
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n')
}

export function build() {
  const body = readBytes(INPUTS.body).toString('utf8')
  const css = readBytes(INPUTS.css).toString('utf8')
  const tokens = JSON.parse(readBytes(INPUTS.tokens).toString('utf8'))

  const inline = {
    bg: dataUrl(INPUTS.bg, 'image/jpeg'),
    full: dataUrl(INPUTS.full, 'image/png'),
    head: dataUrl(INPUTS.head, 'image/png'),
    css: css,
    tokens: tokens,
  }

  const fingerprint = createHash('sha256')
  for (const key of ['body', 'css', 'tokens', 'bg', 'full', 'head']) {
    fingerprint.update(key).update('\0').update(readBytes(INPUTS[key]))
  }
  const hash = fingerprint.digest('hex').slice(0, 16)

  const out = [
    '/* 由 plugin/build.mjs 生成，不要手改 —— 改 src/client-body.js 或 ../src/* 后重新构建。',
    ' * 源指纹 sha256:' + hash,
    ' * 素材：' + Object.keys(inline).join(' / ') + '（图片已内联为 data URL）',
    ' */',
    'window.__ModuleLoader__.load({',
    '\tid: ' + JSON.stringify(PKG_NAME) + ',',
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tconst INLINE = ' + JSON.stringify(inline) + ';',
    indent(body, '\t\t'),
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
  ].join('\n')

  return { out, hash, css, tokens, body }
}

function main() {
  const check = process.argv.includes('--check')
  const { out, hash, css, tokens } = build()
  const bytes = Buffer.byteLength(out, 'utf8')
  const tokenCount = Object.keys(tokens).length

  if (check) {
    if (!existsSync(OUT)) {
      console.log('lib/client.js 不存在 —— 需要构建')
      process.exitCode = 1
      return
    }
    const current = readFileSync(OUT, 'utf8')
    const currentHash = (/源指纹 sha256:([0-9a-f]+)/.exec(current) || [])[1]
    const same = currentHash === hash
    console.log(same ? '产物是最新的（sha256:' + hash + '）' : '产物已过期：当前 ' + currentHash + ' → 应为 ' + hash)
    process.exitCode = same ? 0 : 1
    return
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, out, 'utf8')

  const kb = (n) => (n / 1024).toFixed(0) + ' KB'
  console.log('已写出 ' + relative(HERE, OUT).replace(/\\/g, '/') + '（' + kb(bytes) + '）')
  console.log('  令牌 ' + tokenCount + ' 条 · skin.css ' + kb(Buffer.byteLength(css, 'utf8')) + ' · 源指纹 sha256:' + hash)
  for (const key of ['bg', 'full', 'head']) {
    const bytesIn = statSync(INPUTS[key]).size
    console.log('  ' + key.padEnd(5) + ' ' + kb(bytesIn) + ' 原图 → ' + kb(Math.ceil(bytesIn / 3) * 4) + ' base64')
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main()
