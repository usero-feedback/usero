import { defineConfig } from 'tsup'

// Three build configs:
//   1. vanilla -> ESM + CJS + .d.ts (entry: 'usero')
//   2. react   -> ESM + CJS + .d.ts (entry: 'usero/react')
//   3. iife    -> single bundled file for <script> tag, exposes window.Usero
//
// React is marked external on (1) and (2). For the IIFE we ALSO mark React
// external because the vanilla widget never imports it. If a consumer drops
// the IIFE on a page, only the framework-free DOM widget runs.

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
	// 3. IIFE for <script> tag (vanilla only, no react)
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
