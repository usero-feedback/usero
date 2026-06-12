// React hook for the headless feedback controller. Lives in its own
// subpath export (`@usero/sdk/headless/react`) so the framework-free
// `@usero/sdk/headless` entry never imports React, mirroring the
// `@usero/sdk/replay` vs `@usero/sdk/replay/react` split.

import { useEffect, useRef } from 'react'
import {
	createUseroFeedback,
	type UseroFeedbackController,
	type UseroFeedbackOptions,
} from './headless'

export {
	createUseroFeedback,
	mergePluginPatches,
	validateFeedbackSubmission,
} from './headless'
export type {
	FeedbackRating,
	FeedbackSubmission,
	PluginContext,
	PluginLogger,
	ScreenshotData,
	SubmissionResponse,
	SubmitFeedbackPayload,
	UseroFeedbackController,
	UseroFeedbackOptions,
	UseroPlugin,
	UseroUser,
	UseroUserTraits,
	UseroUserTraitValue,
	ValidationResult,
} from './headless'

interface HookState {
	facade: UseroFeedbackController
	attach: (controller: UseroFeedbackController) => void
	detach: () => void
}

/**
 * Create a headless feedback controller bound to this component's
 * lifecycle.
 *
 *   function FeedbackModal() {
 *     const usero = useUseroFeedback({ clientId: 'YOUR_CLIENT_ID' })
 *     // ...your own form; call usero.submit(...) from its handler
 *   }
 *
 * Semantics:
 * - SSR-safe: the controller is created in an effect, so nothing runs on
 *   the server. The returned object is stable and never null; a submit()
 *   that somehow fires pre-mount resolves with `{ success: false }`.
 * - StrictMode-safe: the dev-mode double effect creates, destroys, and
 *   recreates the controller, exactly like the widget's React wrapper.
 * - destroy() is called automatically on unmount.
 * - Options are captured on the first render, with one exception: `user`
 *   stays reactive. Pass the current user (or null on logout) and the SDK
 *   re-identifies when it changes by value. For everything else (clientId,
 *   plugins, ...), remount the component.
 */
export function useUseroFeedback(
	options: UseroFeedbackOptions,
): UseroFeedbackController {
	const optionsRef = useRef(options)
	const stateRef = useRef<HookState | null>(null)
	if (stateRef.current === null) {
		// The facade is minted once during render (side-effect free) and
		// delegates to whichever live controller the mount effect attaches.
		// This keeps the hook's return type non-null and its identity stable
		// across renders and StrictMode remounts.
		let live: UseroFeedbackController | null = null
		let resolveReady: () => void = () => {}
		const ready = new Promise<void>(resolve => {
			resolveReady = resolve
		})
		const facade: UseroFeedbackController = {
			submit: payload =>
				live
					? live.submit(payload)
					: Promise.resolve({
							success: false,
							error: 'Usero feedback is not mounted yet',
						}),
			uploadScreenshot: file =>
				live
					? live.uploadScreenshot(file)
					: Promise.reject(new Error('Usero feedback is not mounted yet')),
			identify: user => {
				live?.identify(user)
			},
			whenReady: () => ready,
			notifyShadowMount: root => {
				live?.notifyShadowMount(root)
			},
			destroy: () => {
				live?.destroy()
			},
		}
		stateRef.current = {
			facade,
			attach: controller => {
				live = controller
				void controller.whenReady().then(resolveReady)
			},
			detach: () => {
				live = null
			},
		}
	}
	const state = stateRef.current

	useEffect(() => {
		const controller = createUseroFeedback(optionsRef.current)
		state.attach(controller)
		return () => {
			controller.destroy()
			state.detach()
		}
		// Options are captured on first render (matching useSessionReplay);
		// `user` reactivity is handled by the dedicated effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Declarative identity: diff the user by value (id, email, displayName,
	// serialised traits) so re-renders passing a fresh-but-equal object are
	// no-ops. `user: undefined` means "not supplied, do nothing"; `null`
	// means "logged out, rotate anonymousId". Mirrors the widget wrapper.
	const user = options.user
	const userId = user?.id ?? null
	const userEmail = user?.email ?? null
	const userDisplayName = user?.displayName ?? null
	const userTraitsJson = JSON.stringify(user?.traits ?? null)
	const userIsNull = user === null
	useEffect(() => {
		if (user !== undefined) state.facade.identify(user)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId, userEmail, userDisplayName, userTraitsJson, userIsNull])

	return state.facade
}
