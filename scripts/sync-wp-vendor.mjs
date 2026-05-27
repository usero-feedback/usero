#!/usr/bin/env node
// Sync the built SDK IIFE bundle into the WordPress plugin's vendor dir
// and stamp USERO_SDK_VERSION in usero.php to match package.json.
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
const phpRegex = /^define\(\s*'USERO_SDK_VERSION'\s*,\s*'[^']+'\s*\)\s*;/m
if (!phpRegex.test(phpRaw)) {
	console.error(`sync-wp-vendor: could not find USERO_SDK_VERSION define in ${phpPath}`)
	process.exit(1)
}
const phpOut = phpRaw.replace(phpRegex, `define( 'USERO_SDK_VERSION', '${version}' );`)
if (phpOut !== phpRaw) {
	await writeFile(phpPath, phpOut, 'utf8')
}

const bytes = Buffer.byteLength(out, 'utf8')
console.log(`synced @usero/sdk v${version} -> wordpress/assets/js/vendor/usero-sdk.iife.js (${bytes} bytes)`)
