#!/usr/bin/env node
// Sync the built SDK IIFE bundle into the WordPress plugin's vendor dir
// and stamp every version string in the plugin to match package.json:
//   - usero.php  USERO_SDK_VERSION constant (vendored widget runtime version)
//   - usero.php  plugin "Version:" header
//   - usero.php  USERO_VERSION constant
//   - readme.txt "Stable tag:"
// The plugin is versioned in lockstep with the SDK (every SDK build re-vendors
// the widget, so it is a new plugin build). Keeping all four in sync here means
// a `package.json` bump can never leave the WordPress files behind and trip the
// release-wordpress.yml "Verify version consistency" gate.
//
// Run automatically as part of `npm run build`.

import { readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

const pkgPath = resolve(repoRoot, 'package.json')
const srcPath = resolve(repoRoot, 'dist/usero.iife.js')
const destPath = resolve(repoRoot, 'wordpress/assets/js/vendor/usero-sdk.iife.js')
const phpPath = resolve(repoRoot, 'wordpress/usero.php')
const readmePath = resolve(repoRoot, 'wordpress/readme.txt')

/** @returns {Promise<boolean>} */
async function exists(p) {
	try {
		await stat(p)
		return true
	} catch {
		return false
	}
}

const pkgRaw = await readFile(pkgPath, 'utf8')
/** @type {{ version?: unknown }} */
const pkg = JSON.parse(pkgRaw)
if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
	console.error('sync-wp-vendor: package.json is missing a string "version" field')
	process.exit(1)
}
const version = pkg.version

if (!(await exists(srcPath))) {
	console.error(`sync-wp-vendor: source bundle not found at ${srcPath}. Run tsup first.`)
	process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const header = `// @usero/sdk v${version} (vendored ${today} from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)`

const srcRaw = await readFile(srcPath, 'utf8')
let body = srcRaw
if (body.startsWith('// @usero/sdk')) {
	const nl = body.indexOf('\n')
	body = nl === -1 ? '' : body.slice(nl + 1)
}
const out = `${header}\n${body}`
await writeFile(destPath, out, 'utf8')

if (!(await exists(phpPath))) {
	console.error(`sync-wp-vendor: ${phpPath} not found, cannot stamp USERO_SDK_VERSION`)
	process.exit(1)
}
const phpRaw = await readFile(phpPath, 'utf8')

// Each entry: a label for error reporting, a regex matching the existing line,
// and the replacement line stamped with the current version. Every regex must
// match exactly once or the build fails loudly rather than silently drifting.
/** @type {Array<{ label: string, regex: RegExp, replacement: string }>} */
const phpStamps = [
	{
		label: "USERO_SDK_VERSION define",
		regex: /^define\(\s*'USERO_SDK_VERSION'\s*,\s*'[^']+'\s*\)\s*;/m,
		replacement: `define( 'USERO_SDK_VERSION', '${version}' );`,
	},
	{
		label: "USERO_VERSION define",
		regex: /^define\(\s*'USERO_VERSION'\s*,\s*'[^']+'\s*\)\s*;/m,
		replacement: `define( 'USERO_VERSION', '${version}' );`,
	},
	{
		label: 'plugin "Version:" header',
		regex: /^(\s*\*\s*Version:\s*)[^\r\n]*$/m,
		replacement: `$1${version}`,
	},
]

let phpOut = phpRaw
for (const { label, regex, replacement } of phpStamps) {
	if (!regex.test(phpOut)) {
		console.error(`sync-wp-vendor: could not find ${label} in ${phpPath}`)
		process.exit(1)
	}
	phpOut = phpOut.replace(regex, replacement)
}
if (phpOut !== phpRaw) {
	await writeFile(phpPath, phpOut, 'utf8')
}

if (!(await exists(readmePath))) {
	console.error(`sync-wp-vendor: ${readmePath} not found, cannot stamp Stable tag`)
	process.exit(1)
}
const readmeRaw = await readFile(readmePath, 'utf8')
const stableTagRegex = /^(Stable tag:\s*)[^\r\n]*$/m
if (!stableTagRegex.test(readmeRaw)) {
	console.error(`sync-wp-vendor: could not find "Stable tag:" line in ${readmePath}`)
	process.exit(1)
}
const readmeOut = readmeRaw.replace(stableTagRegex, `$1${version}`)
if (readmeOut !== readmeRaw) {
	await writeFile(readmePath, readmeOut, 'utf8')
}

const bytes = Buffer.byteLength(out, 'utf8')
console.log(`synced @usero/sdk v${version} -> wordpress/assets/js/vendor/usero-sdk.iife.js (${bytes} bytes)`)
console.log(`stamped v${version} -> wordpress/usero.php (Version header + USERO_VERSION), wordpress/readme.txt (Stable tag)`)
