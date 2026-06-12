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
	// 3. Session replay -> ESM + CJS + types. Three entries share one config
	// so esbuild code-splitting can hoist the shared implementation (and the
	// rrweb runtime) into common chunks instead of duplicating them:
	//   - replay                  -> '@usero/sdk/replay' (canonical)
	//   - plugins/session-replay  -> back-compat alias, re-exports replay
	//   - replay/react            -> useSessionReplay hook (react external)
	// All stay separate subpath exports so consumers who don't import them
	// pay zero base-bundle cost. rrweb is bundled INTO this config
	// (`noExternal: ['rrweb']`) so `npm install @usero/sdk` is the only
	// install step needed. rrweb is still lazy at runtime: the plugin uses
	// `await import('rrweb')` behind an engagement gate, and
	// `splitting: true` lets esbuild emit rrweb as a sibling chunk that only
	// downloads when the dynamic import fires (CJS doesn't support
	// splitting; shared code inlines into each .cjs file).
	{
		entry: {
			replay: 'src/replay.ts',
			'plugins/session-replay': 'src/plugins/session-replay.ts',
			'replay/react': 'src/replay-react.tsx',
		},
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
	// 4. User-test audio capture plugin -> ESM + CJS + types. Native
	// MediaRecorder + small shadow-DOM UI; no heavy deps. Activates only
	// when the host URL has `?usero_test=<slug>`. Subpath export keeps the
	// base bundle untouched for consumers who don't use it.
	{
		entry: { 'plugins/user-test': 'src/plugins/user-test.ts' },
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
	// 5. Headless core -> ESM + CJS + types. The widget's submission,
	// identity, and plugin pipeline with no UI, for consumers building
	// their own feedback interface:
	//   - headless        -> '@usero/sdk/headless' (framework-free)
	//   - headless/react  -> useUseroFeedback hook (react external)
	// No rrweb here: replay stays opt-in via the consumer passing
	// sessionReplay() from '@usero/sdk/replay' into `plugins`. Splitting
	// lets the two ESM entries share the core chunk (CJS inlines).
	{
		entry: {
			headless: 'src/headless.ts',
			'headless/react': 'src/headless-react.tsx',
		},
		format: ['esm', 'cjs'],
		dts: true,
		sourcemap: true,
		clean: false,
		treeshake: true,
		splitting: true,
		platform: 'browser',
		target: 'es2020',
		external: ['react', 'react-dom'],
		outExtension: ({ format }) => ({
			js: format === 'cjs' ? '.cjs' : '.js',
		}),
	},
	// 6. IIFE for <script> tag (vanilla only, no react)
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
