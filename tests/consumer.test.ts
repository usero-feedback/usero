// This file is a consumer-perspective type smoke test. It is NOT part of
// the published package (npmignored). Running `npx tsc --noEmit` against
// it confirms that the `exports` map resolves correctly for both entries
// and that the published .d.ts files type-check from the outside.

import { initUseroFeedbackWidget } from '@usero/sdk'
import type {
	FeedbackWidgetProps,
	UseroPlugin,
	UseroWidgetHandle,
} from '@usero/sdk'
import { sessionReplay } from '@usero/sdk/plugins/session-replay'
import { UseroFeedbackWidget } from '@usero/sdk/react'
import type { FeedbackWidgetProps as ReactProps } from '@usero/sdk/react'
import { sessionReplay as sessionReplayCanonical } from '@usero/sdk/replay'
import type { SessionReplayInstance } from '@usero/sdk/replay'
import { useSessionReplay } from '@usero/sdk/replay/react'

declare const propsA: FeedbackWidgetProps
declare const propsB: ReactProps

const handle: UseroWidgetHandle = initUseroFeedbackWidget(propsA)
handle.destroy()
handle.open()
handle.close()
const ready: Promise<void> = handle.whenReady()
void ready

// Just reference the React export to ensure the module + its type re-exports resolve.
const _component: typeof UseroFeedbackWidget = UseroFeedbackWidget
void _component
void propsB

// Plugin contract resolves through the public export and the session-replay
// subpath returns a UseroPlugin instance.
const replay: UseroPlugin = sessionReplay({
	startAfterMs: 3000,
	sampleRate: 1,
	chunkSeconds: 10,
})
void replay

// The canonical `@usero/sdk/replay` subpath returns the dual-mode instance:
// usable as a widget plugin AND startable standalone.
const standalone: SessionReplayInstance = sessionReplayCanonical({
	clientId: 'client_123',
	sampleRate: 1,
	getUser: () => ({ id: 'u1', email: 'u1@example.com' }),
})
standalone.start()
standalone.stop()
const asPlugin: UseroPlugin = standalone
void asPlugin

// Both subpaths expose the same factory type.
const sameFactory: typeof sessionReplayCanonical = sessionReplay
void sameFactory

// The React hook subpath resolves and requires clientId at the type level.
const _hook: typeof useSessionReplay = useSessionReplay
void _hook
