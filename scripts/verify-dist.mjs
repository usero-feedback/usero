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

import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const pkgPath = resolve(repoRoot, 'package.json')

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

main().catch(err => {
	console.error('verify-dist: crashed:', err)
	process.exit(1)
})
