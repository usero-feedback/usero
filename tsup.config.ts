import { defineConfig } from 'tsup'

// Four build configs:
//   1. vanilla            -> ESM + CJS + .d.ts (entry: '@usero/sdk')
//   2. react              -> ESM + CJS + .d.ts (entry: '@usero/sdk/react')
//   3. session-replay     -> ESM + CJS + .d.ts subpath chunk with rrweb
//                            bundled in (entry: '@usero/sdk/plugins/session-replay')
//   4. iife               -> single bundled file for <script> tag, exposes
//                            window.Usero
//
// React is marked external on (1), (2), (3), and (4). For the IIFE we ALSO
// mark React external because the vanilla widget never imports it. If a
// consumer drops the IIFE on a page, only the framework-free DOM widget runs.
//
// rrweb is in `dependencies`, so tsup auto-externalizes it everywhere by
// default. The base entries never import rrweb (verified via grep against
// the published dist), so they stay rrweb-free. The plugin entry uses
// `noExternal: ['rrweb']` to BUNDLE rrweb into its chunk so consumers can
// `npm install @usero/sdk` and immediately use the plugin without a second
// install step. rrweb stays lazy at runtime via dynamic `import('rrweb')`
// and esbuild code-splitting (ESM only).

export default defineConfig([
	// 1. Vanilla ESM + CJS + types
	{
		entry: { vanilla: 'src/vanilla.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		sourcemap: true,
		clean: true,
		treeshake: true,
		platform: 'browser',
		target: 'es2020',
		// Vanilla must NOT pull react in. If anything imports it the build fails.
		external: ['react', 'react-dom'],
		outExtension: ({ format }) => ({
			js: format === 'cjs' ? '.cjs' : '.js',
		}),
	},
	// 2. React ESM + CJS + types
	{
		entry: { react: 'src/react.tsx' },
		format: ['esm', 'cjs'],
		dts: true,
		sourcemap: true,
		clean: false,
		treeshake: true,
		platform: 'browser',
		target: 'es2020',
		external: ['react', 'react-dom'],
		outExtension: ({ format }) => ({
			js: format === 'cjs' ? '.cjs' : '.js',
		}),
	},
	// 3. Session replay plugin -> ESM + CJS + types. Stays a separate
	// subpath export so consumers who don't import it pay zero base-bundle
	// cost. rrweb is bundled INTO this entry (`noExternal: ['rrweb']`) so
	// `npm install @usero/sdk` is the only install step needed. rrweb is
	// still lazy at runtime: the plugin uses `await import('rrweb')` behind
	// an engagement gate, and `splitting: true` lets esbuild emit rrweb as
	// a sibling chunk that only downloads when the dynamic import fires
	// (CJS doesn't support splitting; rrweb inlines into the .cjs file).
	{
		entry: { 'plugins/session-replay': 'src/plugins/session-replay.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		sourcemap: true,
		clean: false,
		treeshake: true,
		splitting: true,
		platform: 'browser',
		target: 'es2020',
		external: ['react', 'react-dom'],
		noExternal: ['rrweb'],
		outExtension: ({ format }) => ({
			js: format === 'cjs' ? '.cjs' : '.js',
		}),
	},
	// 4. IIFE for <script> tag (vanilla only, no react)
	{
		entry: { 'usero.iife': 'src/vanilla.ts' },
		format: ['iife'],
		dts: false,
		sourcemap: true,
		clean: false,
		minify: true,
		treeshake: true,
		platform: 'browser',
		target: 'es2020',
		globalName: 'Usero',
		external: ['react', 'react-dom'],
		outExtension: () => ({ js: '.js' }),
	},
])
