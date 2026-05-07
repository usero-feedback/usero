# usero

Lightweight feedback widget for the web. Drop-in vanilla JS, React component, or `<script>` tag. Zero config, framework-free, tiny.

Backed by [Usero](https://usero.io). Sign up to get a `clientId`.

## Install

```bash
npm install @usero/sdk
```

## Usage

### Vanilla JS (any framework, or none)

```ts
import { initUseroFeedbackWidget } from '@usero/sdk'

const widget = initUseroFeedbackWidget({
  clientId: 'YOUR_CLIENT_ID',
  position: 'right',
})

// later, if you need to remove it:
widget.destroy()
```

The vanilla build never imports React. Vue, Svelte, Angular, plain HTML, and Electron apps pay zero React tax.

### React

```tsx
import { UseroFeedbackWidget } from '@usero/sdk/react'

export function App() {
  return (
    <>
      {/* your app */}
      <UseroFeedbackWidget clientId='YOUR_CLIENT_ID' />
    </>
  )
}
```

### Screenshot upload

The widget includes a screenshot upload button by default. Users can attach up to 3 images (max 10MB each, any `image/*` MIME type) to their feedback. Uploads go to `${baseUrl}/api/screenshots` and the resulting URLs are attached to the feedback submission. Disable with `showScreenshotOption: false`.

### Script tag (CDN)

```html
<script src="https://unpkg.com/@usero/sdk"></script>
<script>
  Usero.initUseroFeedbackWidget({ clientId: 'YOUR_CLIENT_ID' })
</script>
```

`unpkg` and `jsDelivr` both serve the IIFE bundle automatically. No separate hosting needed.

## Theme

The widget auto-detects the OS color scheme via `prefers-color-scheme`. It picks the built-in dark theme on dark systems and the light theme on light systems, and swaps live if the user toggles modes while the widget is open. When no preference is reported (older browsers, SSR), it defaults to dark. Pass an explicit `theme` to override; explicit values always win, and partial overrides merge on top of the OS-resolved base.

## Options

| Option                 | Type                          | Default                                       | Description                                |
| ---------------------- | ----------------------------- | --------------------------------------------- | ------------------------------------------ |
| `clientId`             | `string`                      | required                                      | Your Usero client ID                       |
| `position`             | `'left' \| 'right'`           | `'right'`                                     | Which side of the viewport the tab sits on |
| `theme`                | `Partial<WidgetTheme>`        | auto (OS color scheme, dark fallback)         | Override colors. Wins over auto-detection  |
| `title`                | `string`                      | `'Share Feedback'`                            | Panel header                               |
| `placeholder`          | `string`                      | `'Tell us what you think... (optional)'`      | Comment placeholder                        |
| `showEmailOption`      | `boolean`                     | `true`                                        | Show the "share my email" checkbox         |
| `showScreenshotOption` | `boolean`                     | `true`                                        | Show the screenshot upload button (up to 3 images, 10MB each) |
| `environment`          | `string`                      | undefined                                     | Tag feedback with an environment           |
| `baseUrl`              | `string`                      | `'https://usero.io'`                          | Override API host (self-hosted Usero)      |
| `metadata`             | `Record<string, unknown>`     | undefined                                     | Arbitrary metadata attached to feedback    |
| `onSubmit`             | `(data) => void`              | undefined                                     | Fires after a successful submission        |
| `onError`              | `(err: Error) => void`        | undefined                                     | Fires on init or submission error          |
| `onOpen` / `onClose`   | `() => void`                  | undefined                                     | Fire when the panel opens/closes           |

## Plugins

The widget has a tiny plugin API for opt-in features that would otherwise bloat the base bundle. Plugins live in subpath exports so the base widget stays small for everyone who doesn't use them.

### Session replay

Attaches a rolling rrweb buffer (last 30 seconds by default) to each feedback submission, gzipped via the native CompressionStream API.

```bash
npm install rrweb
```

```ts
import { initUseroFeedbackWidget } from '@usero/sdk'
import { sessionReplay } from '@usero/sdk/plugins/session-replay'

initUseroFeedbackWidget({
  clientId: 'YOUR_CLIENT_ID',
  plugins: [
    sessionReplay({
      bufferSeconds: 30,
      // Wait 3s of engagement before loading rrweb. If the user navigates
      // away first, rrweb is never fetched.
      startAfterMs: 3000,
      // Sample 50% of sessions. Decided once at init via Math.random().
      sampleRate: 0.5,
    }),
  ],
})
```

`rrweb` is an optional peer dependency — install it only if you use this plugin. Consumers who don't import the plugin pay zero rrweb bytes (verified: the base bundle has zero rrweb references). The plugin entry itself is ~1.8KB gzipped, and `rrweb` lazy-loads at runtime via dynamic import the first time the engagement gate elapses.

#### Privacy defaults

| Option              | Default                | What it does                                                  |
| ------------------- | ---------------------- | ------------------------------------------------------------- |
| `maskAllInputs`     | `true`                 | Mask `<input>` and `<textarea>` values in the recording       |
| `maskTextSelector`  | `'[data-usero-mask]'`  | Mask text content of any node matching this selector          |
| `blockSelector`     | `'[data-usero-block]'` | Skip recording subtrees entirely                              |
| `inlineStylesheet`  | `true`                 | Inline external stylesheets so replays render offline         |
| `sampling`          | `{ mousemove: 50, scroll: 100 }` | Throttle high-frequency events                  |
| `bufferSeconds`     | `30`                   | Length of the rolling in-memory buffer in seconds             |
| `startAfterMs`      | `0`                    | Engagement gate before loading rrweb                          |
| `sampleRate`        | `1`                    | Probability (0..1) that a given session records at all        |

Tag any DOM node you want masked at the source: `<div data-usero-mask>...</div>`. Tag entire subtrees you want skipped with `data-usero-block`.

### Writing your own plugin

```ts
import type { UseroPlugin } from '@usero/sdk'

export function consoleCapture(): UseroPlugin {
  return {
    name: 'console-capture',
    onInit(ctx) {
      const logs: string[] = []
      ctx.setStore(logs)
      const original = console.log
      console.log = (...args) => {
        logs.push(args.map(String).join(' '))
        original(...args)
      }
    },
    onFeedbackSubmit(ctx) {
      const logs = ctx.getStore<string[]>() ?? []
      return { metadata: { recentLogs: logs.slice(-50) } }
    },
  }
}
```

Plugins return a `Partial<FeedbackSubmission>` from `onFeedbackSubmit`. The patch is shallow-merged into the outgoing payload.

## Why named exports only

Default exports break tree-shaking and rename inconsistently across consumer codebases. The package exports nothing as a default, anywhere, on purpose.

## Why subpath exports

Bundlers can tree-shake well, but `@usero/sdk/react` vs `@usero/sdk` is a guarantee, not a hope. Vanilla users never pull React into their bundle.

## Building from source

```bash
npm install
npm run build
```

Outputs:

- `dist/vanilla.js` (ESM) + `dist/vanilla.cjs` + `dist/vanilla.d.ts`
- `dist/react.js` (ESM) + `dist/react.cjs` + `dist/react.d.ts`
- `dist/plugins/session-replay.js` (ESM) + `.cjs` + `.d.ts`
- `dist/usero.iife.js` (minified, exposes `window.Usero`)

## License

MIT
