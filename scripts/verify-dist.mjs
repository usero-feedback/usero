#!/usr/bin/env node
// Postbuild guard: assert every file the package.json `exports` map points at
// actually exists and is non-empty in `dist` after a build.
//
// Why this exists: tsup's DTS step runs every entry through a single shared
// declaration-emit pass. Under CI it can silently skip emitting one entry's
// `.d.ts` while still printing "DTS Build success", producing a tarball whose
// exports map references a declaration file that does not exist. That is
// exactly what shipped in 1.1.8 (dist/plugins/user-test.d.ts was missing), and
// it broke every consumer that imports `@usero/sdk/plugins/user-test` with
// TS7016 "Could not find a declaration file". The build "succeeding" while the
// published exports map points at a non-existent file is the real bug. This
// script fails the build loudly the moment any declared target is missing, so
// a broken artifact can never reach npm.
//
// Dependency-free. Runs as the last step of `npm run build`.

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const pkgPath = resolve(repoRoot, 'package.json')

// Gzipped byte budgets, ~5% over the 1.5.1 build (replay entries: 1.6.0, which
// adds the upload lane, after the test seams left the published bundle). An entry's size is the entry file plus every chunk it
// imports statically, i.e. what a consumer downloads up front. `lazy rrweb` is
// the chunk loaded on demand. Raising a budget needs Will's OK (docs/PERFORMANCE.md).
const GZIP_BUDGETS = {
	'./dist/headless.cjs': 5600,
	'./dist/headless.js': 5500,
	'./dist/headless/react.cjs': 6200,
	'./dist/headless/react.js': 6100,
	'./dist/plugins/session-replay.cjs': 13100,
	'./dist/plugins/session-replay.js': 12900,
	'./dist/plugins/user-test.cjs': 22700,
	'./dist/plugins/user-test.js': 22600,
	'./dist/react.cjs': 13900,
	'./dist/react.js': 13900,
	'./dist/replay.cjs': 13100,
	'./dist/replay.js': 12900,
	'./dist/replay/react.cjs': 13000,
	'./dist/replay/react.js': 12900,
	'./dist/usero.iife.js': 10500,
	'./dist/vanilla.cjs': 13300,
	'./dist/vanilla.js': 13300,
	'lazy rrweb (.js)': 121800,
	'lazy rrweb (.cjs)': 121800,
}

// Static local imports only: `from './x.js'` and `require('./x.cjs')`. The
// lazy rrweb chunk is a multi-line `import(` and is deliberately not followed.
const STATIC_IMPORT_RE = /(?:\bfrom\s*|\brequire\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g

async function staticClosure(absPath, seen = new Set()) {
	if (seen.has(absPath)) return seen
	seen.add(absPath)
	const source = await readFile(absPath, 'utf8')
	for (const match of source.matchAll(STATIC_IMPORT_RE)) {
		await staticClosure(resolve(dirname(absPath), match[1]), seen)
	}
	return seen
}

async function gzippedSize(paths) {
	let total = 0
	for (const p of paths) total += gzipSync(await readFile(p), { level: 9 }).byteLength
	return total
}

// Returns { label: gzippedBytes } for every JS entry in the exports map plus the lazy rrweb chunks.
async function measureBundles(jsTargets) {
	const sizes = {}
	for (const rel of [...jsTargets].sort()) {
		sizes[rel] = await gzippedSize(await staticClosure(resolve(repoRoot, rel)))
	}
	for (const file of await readdir(resolve(repoRoot, 'dist'))) {
		const lazy = /^rrweb-[\w-]+\.(js|cjs)$/.exec(file)
		if (lazy) sizes[`lazy rrweb (.${lazy[1]})`] = await gzippedSize([resolve(repoRoot, 'dist', file)])
	}
	return sizes
}

/**
 * Recursively collect every string leaf inside the `exports` map. Subpaths map
 * to condition objects ({ types, import, require }) whose leaves are relative
 * file paths; some entries (e.g. "./package.json") are a bare string.
 * @param {unknown} node
 * @param {string[]} out
 */
function collectTargets(node, out) {
	if (typeof node === 'string') {
		out.push(node)
		return
	}
	if (node && typeof node === 'object') {
		for (const value of Object.values(node)) collectTargets(value, out)
	}
}

async function main() {
	const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))

	const targets = new Set()

	// Every leaf path referenced by the exports map.
	const exportLeaves = []
	collectTargets(pkg.exports ?? {}, exportLeaves)
	for (const leaf of exportLeaves) targets.add(leaf)

	// Top-level entry points too (main/module/types/unpkg/jsdelivr).
	for (const key of ['main', 'module', 'types', 'unpkg', 'jsdelivr']) {
		if (typeof pkg[key] === 'string') targets.add(pkg[key])
	}

	const missing = []
	const empty = []

	for (const rel of targets) {
		// package.json itself is always present and is not a build artifact.
		if (rel === './package.json') continue
		const abs = resolve(repoRoot, rel)
		try {
			const info = await stat(abs)
			if (!info.isFile() || info.size === 0) empty.push(rel)
		} catch {
			missing.push(rel)
		}
	}

	if (missing.length === 0 && empty.length === 0) {
		console.log(
			`verify-dist: OK, all ${targets.size} declared package entry points exist and are non-empty.`,
		)
		checkBudgets(await measureBundles([...targets].filter(t => /\.(c?js)$/.test(t))))
		return
	}

	console.error('verify-dist: FAILED. The build produced an incomplete dist.')
	if (missing.length > 0) {
		console.error('\nMissing files (declared in package.json but absent from dist):')
		for (const f of missing) console.error(`  - ${f}`)
	}
	if (empty.length > 0) {
		console.error('\nEmpty files (declared in package.json but zero bytes in dist):')
		for (const f of empty) console.error(`  - ${f}`)
	}
	console.error(
		'\nThis usually means a tsup DTS-emit step silently dropped a declaration.',
	)
	console.error('Re-run `npm run build`. Do NOT publish until this passes.')
	process.exit(1)
}

function checkBudgets(sizes) {
	const over = []
	const unbudgeted = []
	for (const [label, bytes] of Object.entries(sizes)) {
		const budget = GZIP_BUDGETS[label]
		if (budget === undefined) unbudgeted.push(label)
		else if (bytes > budget) over.push(label)
		const status = budget === undefined ? 'NO BUDGET' : bytes > budget ? 'OVER' : 'ok'
		console.log(`  ${label.padEnd(38)} ${String(bytes).padStart(7)} B gz  budget ${budget ?? '-'}  ${status}`)
	}
	if (over.length === 0 && unbudgeted.length === 0) {
		console.log('verify-dist: OK, every entry is within its gzipped size budget.')
		return
	}
	if (over.length > 0) console.error(`verify-dist: FAILED. Over the gzipped size budget: ${over.join(', ')}`)
	if (unbudgeted.length > 0) console.error(`verify-dist: FAILED. No size budget for: ${unbudgeted.join(', ')}`)
	console.error('Shrink the bundle, or get Will to OK a higher budget in GZIP_BUDGETS (docs/PERFORMANCE.md).')
	process.exit(1)
}

main().catch(err => {
	console.error('verify-dist: crashed:', err)
	process.exit(1)
})
