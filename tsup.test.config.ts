import { defineConfig } from 'tsup'

// Test-only build of src/replay.ts with its `__test__` seams, into dist-test/ (never published, see `files`).
// The published replay entries go through src/replay-entry.ts, which leaves the seams out.
export default defineConfig({
	entry: { replay: 'src/replay.ts' },
	outDir: 'dist-test',
	format: ['esm'],
	dts: false,
	sourcemap: false,
	clean: true,
	treeshake: true,
	platform: 'browser',
	target: 'es2020',
	external: ['react', 'react-dom', 'rrweb'],
})
