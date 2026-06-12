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

## Session replay

Record what your users actually did, with or without the feedback widget. Recording streams rrweb events to Usero in gzipped chunks while the user is on the page, so you capture whole sessions rather than only the moments around a feedback submission.

`rrweb` ships inside the replay chunk, so `npm install @usero/sdk` is the only install step. Replay lives in its own subpath export (`@usero/sdk/replay`), so consumers who never import it pay zero rrweb bytes on the base bundle. Even consumers who DO import it don't pay rrweb's bytes upfront: rrweb lazy-loads at runtime via dynamic import only once a recording actually starts.

### Standalone (no widget)

```ts
import { sessionReplay } from '@usero/sdk/replay'

sessionReplay({ clientId: 'YOUR_CLIENT_ID' }).start()
```

That is the whole integration. No widget mounts, no UI renders, nothing is added to the DOM. If you know who the user is, pass `getUser` so replays show up under the right person:

```ts
const replay = sessionReplay({
  clientId: 'YOUR_CLIENT_ID',
  getUser: () => (auth.user ? { id: auth.user.id, email: auth.user.email } : null),
})
replay.start()

// Optional: end the recording early. Flushes buffered events and
// finalises the session server-side.
replay.stop()
```

`getUser` is re-invoked at session start and at every chunk boundary, so a login that happens mid-session is picked up without any extra wiring. Returning `null` after a user was identified is treated as a logout.

### React

```tsx
import { useSessionReplay } from '@usero/sdk/replay/react'

function App() {
  useSessionReplay({ clientId: 'YOUR_CLIENT_ID' })
  return <Routes />
}
```

The hook is SSR-safe (a no-op on the server), StrictMode-safe (the dev-mode double effect starts exactly one recording), and page-scoped: recording survives the component unmounting on client-side route changes, and ends when the page is hidden or closed. The hook returns the replay instance, so you can call `.stop()` to end a recording early. Options are captured on first render; to track a user who logs in mid-session, pass a `getUser` callback rather than changing options.

### With the feedback widget

Pass the same factory to the widget's `plugins` array. Feedback submissions then deep-link to the exact moment in the recording where the user hit submit.

```ts
import { initUseroFeedbackWidget } from '@usero/sdk'
import { sessionReplay } from '@usero/sdk/replay'

initUseroFeedbackWidget({
  clientId: 'YOUR_CLIENT_ID',
  plugins: [
    sessionReplay({
      // Wait 3s after load before starting. If the user navigates away
      // first, rrweb is never fetched and no session is created.
      startAfterMs: 3000,
      // Sample 50% of sessions. Decided once at init via Math.random().
      sampleRate: 0.5,
    }),
  ],
})
```

In plugin mode you don't pass `clientId`, `user`, or `getUser`: the widget's own configuration is authoritative.

The legacy import path `@usero/sdk/plugins/session-replay` still works and resolves to the same module. New code should import from `@usero/sdk/replay`.

### One recording per page

At most one replay recording runs per page, whichever way it was started. The rules:

- `.start()` is idempotent. Calling it while a recording is live (from this instance or any other on the page) is a no-op, which is also what makes the React hook StrictMode-safe.
- If a recording was started standalone and the feedback widget mounts later with a `sessionReplay()` plugin, the widget does NOT start a second recorder. It links to the running recording: feedback submissions deep-link into it, and the widget takes over user resolution while mounted.
- A widget unmount never kills a recording it merely adopted; recordings are page-scoped.
- `.stop()` flushes buffered events, finalises the session server-side, and tears down listeners. Calling `.start()` afterwards begins a new replay session.
- `.start()` is a no-op without a `window` (SSR) and logs an error if no `clientId` was provided.

### Privacy defaults

| Option              | Default                | What it does                                                  |
| ------------------- | ---------------------- | ------------------------------------------------------------- |
| `maskAllInputs`     | `true`                 | Mask `<input>` and `<textarea>` values in the recording       |
| `maskTextSelector`  | `'[data-usero-mask]'`  | Mask text content of any node matching this selector          |
| `blockSelector`     | `'[data-usero-block]'` | Skip recording subtrees entirely                              |
| `inlineStylesheet`  | `true`                 | Inline external stylesheets so replays render offline         |
| `sampling`          | `{ mousemove: 50, scroll: 100 }` | Throttle high-frequency events                  |
| `startAfterMs`      | `0`                    | Delay before loading rrweb and starting the session           |
| `sampleRate`        | `1`                    | Probability (0..1) that a given session records at all        |

Tag any DOM node you want masked at the source: `<div data-usero-mask>...</div>`. Tag entire subtrees you want skipped with `data-usero-block`.

Standalone-only options: `clientId` (required for `.start()`), `user` / `getUser` (identify the current user), and `apiUrl` (override the API host, defaults to `https://usero.io`). Advanced chunking knobs (`chunkSeconds`, `chunkMaxEvents`, `chunkMaxBytes`, `chunkMaxAttempts`, `checkoutEveryMs`) are documented in the `SessionReplayOptions` type.

## Headless (bring your own UI)

The widget's look is configurable but its structure is fixed: a launcher button, a panel, our copy. If you want full control, a modal that matches your design system, a form embedded in your settings page, your own copy, import the headless core instead. You get the same submission pipeline, identity handling, and plugin support as the widget, with zero UI and zero opinion about how feedback gets collected.

```ts
import { createUseroFeedback } from '@usero/sdk/headless'

const usero = createUseroFeedback({ clientId: 'YOUR_CLIENT_ID' })

// Wire this to your own form's submit handler.
const result = await usero.submit({ rating: 4, comment: 'Love the new dashboard' })
if (!result.success) showError(result.error)
```

`submit()` validates the payload (a submission needs a rating or a non-empty comment), captures page context (URL, title, referrer) automatically, runs the plugin pipeline, and POSTs to Usero. It resolves with `{ success: false, error }` instead of throwing, for validation and network failures alike, so your form can render the message directly.

There is deliberately no `open()`, `close()`, or `isOpen`. When you own the UI, you own its state.

### React

```tsx
import { useUseroFeedback } from '@usero/sdk/headless/react'

function FeedbackModal({ onDone }: { onDone: () => void }) {
  const usero = useUseroFeedback({ clientId: 'YOUR_CLIENT_ID' })
  const [comment, setComment] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = await usero.submit({ comment })
    if (result.success) onDone()
  }

  return <form onSubmit={handleSubmit}>{/* your design system here */}</form>
}
```

The hook is SSR-safe (the controller is created in an effect, never on the server), StrictMode-safe, and destroys the controller on unmount. Options are captured on first render, except `user`, which stays reactive: pass the current user object (or `null` on logout) and the SDK re-identifies when it changes by value.

### Session replay with your custom UI

Pass `sessionReplay()` into `plugins` and every submission from your custom UI deep-links to the exact moment in the recording, the same as it does with our widget. The plugin pipeline runs on every `submit()`, so the replay plugin attaches `sessionReplayId` and `replayOffsetMs` for you.

```ts
import { createUseroFeedback } from '@usero/sdk/headless'
import { sessionReplay } from '@usero/sdk/replay'

const usero = createUseroFeedback({
  clientId: 'YOUR_CLIENT_ID',
  plugins: [sessionReplay()],
})
```

One caveat: if you render your feedback UI inside a ShadowRoot, call `usero.notifyShadowMount(root)` after attaching it so the recorder re-snapshots and captures your UI. Light-DOM UIs are recorded without any extra call.

### Screenshots

Collect a `File` however you like (a file input, a paste handler, your own capture flow), upload it, and include the result in a later submit:

```ts
const screenshot = await usero.uploadScreenshot(file) // throws on failure
await usero.submit({ comment: 'Broken layout', screenshots: [screenshot] })
```

### Identity

```ts
usero.identify({ id: user.id, email: user.email, traits: { plan: 'pro' } })
usero.identify(null) // logout: rotates the anonymousId
```

Identify calls are deduped, so calling on every render or route change is free when nothing changed. You can also pass `user` or `getUser` in the options instead; `getUser` is re-resolved at submit time, so a login that happens after creation is picked up without extra wiring.

### Full surface

`createUseroFeedback(options)` takes `clientId` (required), `apiUrl`, `environment`, `metadata` (attached to every submission, deep-merged one level with per-submission metadata), `plugins`, and `user` / `getUser`. The returned controller has `submit`, `uploadScreenshot`, `identify`, `whenReady` (resolves when every plugin's `onInit` has settled), `notifyShadowMount`, and `destroy`. Everything is typed: `SubmitFeedbackPayload`, `SubmissionResponse`, `ScreenshotData`, `UseroUser`, `UseroPlugin`, and friends are all exported from `@usero/sdk/headless`.

The headless entry is its own subpath export with no widget CSS, no React, and no rrweb: 3.2KB gzipped minified.

## Plugins

The widget has a tiny plugin API for opt-in features that would otherwise bloat the base bundle. Plugins live in subpath exports so the base widget stays small for everyone who doesn't use them. Session replay (above) is the flagship plugin; it doubles as a standalone recorder.

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

Plugins return a `Partial<FeedbackSubmission>` from `onFeedbackSubmit`. Top-level keys are shallow-merged into the outgoing payload (later plugins win wholesale). `metadata` is deep-merged one level so multiple plugins can each contribute their own metadata keys without clobbering each other.

### `widget.whenReady()`

`initUseroFeedbackWidget` returns a handle with a `whenReady(): Promise<void>` method that resolves once every plugin's `onInit` has settled (fulfilled or rejected — a misbehaving plugin never blocks readiness). It's intended for end-to-end tests and dogfooding scripts that want to trigger a synthetic submit only after all plugins are live:

```ts
const widget = initUseroFeedbackWidget({ clientId, plugins: [sessionReplay()] })
await widget.whenReady()
widget.open()
```

If no plugins are registered, `whenReady()` resolves immediately.

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
- `dist/replay.js` (ESM) + `.cjs` + `.d.ts` for `@usero/sdk/replay`, with `dist/plugins/session-replay.js` as a thin back-compat re-export and `dist/replay/react.js` for the `useSessionReplay` hook. The replay implementation lives in a shared `dist/chunk-*.js`, and the bundled rrweb runtime sits in a sibling `dist/rrweb-*.js` chunk loaded via dynamic `import()` only when a recording actually starts.
- `dist/usero.iife.js` (minified, exposes `window.Usero`)

## WordPress plugin

This repo is a monorepo. The `@usero/sdk` npm package lives at the root; the WordPress plugin lives in [`wordpress/`](./wordpress/) and ships to the wordpress.org plugin directory as `usero`.

The plugin vendors the SDK's IIFE build at `wordpress/assets/js/vendor/usero-sdk.iife.js`. It is regenerated automatically on `npm run build` via `scripts/sync-wp-vendor.mjs`. Do not edit it by hand.

To cut a plugin release see [`wordpress/RELEASE.md`](./wordpress/RELEASE.md). Tagging `v<version>` on GitHub triggers `.github/workflows/release-wordpress.yml`, which builds the SDK, verifies that `package.json`, `wordpress/usero.php`, and `wordpress/readme.txt` all agree on the version, then pushes to wordpress.org SVN via `10up/action-wordpress-plugin-deploy`.

## License

MIT
