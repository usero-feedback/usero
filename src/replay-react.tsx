// React hook for standalone session replay. Lives in its own subpath
// export (`@usero/sdk/replay/react`) so the framework-free
// `@usero/sdk/replay` entry never imports React, mirroring the
// `@usero/sdk` vs `@usero/sdk/react` split.

import { useEffect, useRef } from 'react'
import {
	sessionReplay,
	type SessionReplayInstance,
	type SessionReplayOptions,
} from './replay'

export { sessionReplay }
export type { SessionReplayInstance, SessionReplayOptions }

// Standalone recording needs a clientId; the hook makes it required at the
// type level so the "forgot clientId, silent no-op" failure mode can't
// compile.
export interface UseSessionReplayOptions extends SessionReplayOptions {
	clientId: string
}

/**
 * Start session replay for the current page, no widget required.
 *
 *   function App() {
 *     useSessionReplay({ clientId: 'YOUR_CLIENT_ID' })
 *     return <Routes />
 *   }
 *
 * Semantics:
 * - SSR-safe: nothing runs on the server (effects don't fire there, and
 *   `start()` itself no-ops without a `window`).
 * - StrictMode-safe: the dev-mode double effect calls `start()` twice; the
 *   second call is a no-op, so exactly one recording starts.
 * - Page-scoped: there is intentionally NO effect cleanup. Recording
 *   survives this component unmounting (client-side route changes), ends on
 *   page hide, and can be ended early via `stop()` on the returned
 *   instance.
 * - Options are captured on the first render; later changes are ignored
 *   (re-configuring a live recording isn't meaningful). To identify a user
 *   who logs in mid-session, pass a `getUser` callback rather than swapping
 *   options.
 */
export function useSessionReplay(options: UseSessionReplayOptions): SessionReplayInstance {
	const instanceRef = useRef<SessionReplayInstance | null>(null)
	if (instanceRef.current === null) {
		// Minting the instance during render is side-effect free: the factory
		// only merges options. Recording starts in the effect below.
		instanceRef.current = sessionReplay(options)
	}
	const instance = instanceRef.current
	useEffect(() => {
		instance.start()
	}, [instance])
	return instance
}
