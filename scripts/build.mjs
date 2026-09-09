/**
 * Build the standalone package:
 *  1. tsc emits the Node face (every `src/*.ts`) into `lib/`, then the browser
 *     half's declarations (`src/client/*.tsx` -> `lib/client/*.d.ts`);
 *  2. esbuild bundles the browser half into one closure-factory artifact at
 *     `lib/client.js`, which is the format the Web shell's module loader
 *     evaluates (`window.__ModuleLoader__.load({ id, factory })`).
 *
 * The two compiler faces stay separate because the Node face's imports pull in
 * `@deepseek-ai/dsh-session`'s Host `ctx.sessions` merge, which conflicts with
 * the Client Session object layer's merge of the same member.
 *
 * CSS Modules are compiled by esbuild's `local-css` loader and inlined as a
 * tagged <style> element inside the factory, so the bundle carries its own
 * styles without a separate asset request.
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lib = join(root, 'lib')

/** Shared module-table identities the browser bundle must not inline. */
const CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@deepseek-ai/*',
]

rmSync(lib, { recursive: true, force: true })
mkdirSync(lib, { recursive: true })

// ---- 1. Node face and browser-half declarations ---------------------------
for (const project of ['tsconfig.json', 'tsconfig.client.json']) {
  execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', project], {
    cwd: root,
    stdio: 'inherit',
  })
}

// ---- 2. Browser face ------------------------------------------------------
const bundlePath = join(lib, 'client.bundle.js')
const cssPath = join(lib, 'client.bundle.css')

await build({
  entryPoints: [join(root, 'src', 'client', 'index.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: CLIENT_EXTERNALS,
  loader: { '.css': 'local-css' },
  minify: true,
  sourcemap: false,
  logLevel: 'warning',
})

let css = ''
try {
  css = readFileSync(cssPath, 'utf8')
} catch {
  // A browser half with no stylesheet emits no CSS file; that is not an error.
}

const tagId = `${pkg.name}/client.css`
const bundle = readFileSync(bundlePath, 'utf8')
const artifact = [
  'window.__ModuleLoader__.load({',
  `\tid: ${JSON.stringify(pkg.name)},`,
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  ...(css === '' ? [] : [
    `\t\tconst css = ${JSON.stringify(css)};`,
    `\t\tconst tagId = ${JSON.stringify(tagId)};`,
    '\t\tif (typeof document !== \'undefined\'',
    "\t\t\t&& document.querySelector('style[data-plugin-css=\"' + tagId + '\"]') === null) {",
    "\t\t\tconst tag = document.createElement('style');",
    `\t\t\ttag.dataset.plugin = ${JSON.stringify(pkg.name)};`,
    '\t\t\ttag.dataset.pluginCss = tagId;',
    '\t\t\ttag.textContent = css;',
    '\t\t\tdocument.head.appendChild(tag);',
    '\t\t}',
  ]),
  bundle,
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n')

writeFileSync(join(lib, 'client.js'), artifact)
rmSync(bundlePath, { force: true })
rmSync(cssPath, { force: true })

console.log(`built ${pkg.name}: node face in lib/, browser half ${(artifact.length / 1024).toFixed(1)} kB`)
