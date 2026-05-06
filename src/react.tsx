// Thin React wrapper around the framework-free vanilla widget. Renders
// nothing into the React tree; the widget mounts a host <div> on
// document.body and renders into a shadow root. This keeps the React
// bundle tiny (just the wrapper) and means there is one source of truth
// for widget UX, the vanilla implementation.

import { useEffect, useRef } from 'react'
import {
	DARK_THEME,
	DEFAULT_THEME,
	initUseroFeedbackWidget,
	mergeTheme,
	type UseroWidgetHandle,
} from './vanilla'
import type { FeedbackData, FeedbackWidgetProps } from './types'

export {
	DARK_THEME,
	DEFAULT_THEME,
	mergeTheme,
}
export type {
	FeedbackData,
	FeedbackRating,
	FeedbackSubmission,
	FeedbackWidgetProps,
	ScreenshotData,
	WidgetPosition,
	WidgetTheme,
} from './types'
export type { UseroWidgetHandle } from './vanilla'

export function UseroFeedbackWidget(props: FeedbackWidgetProps): null {
	const handleRef = useRef<UseroWidgetHandle | null>(null)

	// Latest callbacks live in a ref so identity changes (a new arrow each
	// render) never re-init the widget.
	const callbacksRef = useRef({
		onSubmit: props.onSubmit,
		onError: props.onError,
		onOpen: props.onOpen,
		onClose: props.onClose,
	})
	callbacksRef.current = {
		onSubmit: props.onSubmit,
		onError: props.onError,
		onOpen: props.onOpen,
		onClose: props.onClose,
	}

	const { clientId, baseUrl } = props

	// Init / tear-down. We only re-init when clientId or baseUrl change,
	// because the API client + widget identity are bound to those.
	useEffect(() => {
		const handle = initUseroFeedbackWidget({
			...props,
			onSubmit: (data: FeedbackData) => callbacksRef.current.onSubmit?.(data),
			onError: (err: Error) => callbacksRef.current.onError?.(err),
			onOpen: () => callbacksRef.current.onOpen?.(),
			onClose: () => callbacksRef.current.onClose?.(),
		})
		handleRef.current = handle
		return () => {
			handle.destroy()
			handleRef.current = null
		}
		// Intentionally narrow deps. All other prop changes flow through the
		// update() effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [clientId, baseUrl])

	// Hot-swap render-affecting props without re-init.
	const themeJson = JSON.stringify(props.theme ?? null)
	const metadataJson = JSON.stringify(props.metadata ?? null)
	useEffect(() => {
		const handle = handleRef.current
		if (!handle) return
		const updates: Partial<Omit<FeedbackWidgetProps, 'clientId' | 'baseUrl'>> = {}
		if (props.position !== undefined) updates.position = props.position
		if (props.theme !== undefined) updates.theme = props.theme
		if (props.title !== undefined) updates.title = props.title
		if (props.placeholder !== undefined) updates.placeholder = props.placeholder
		if (props.showEmailOption !== undefined) {
			updates.showEmailOption = props.showEmailOption
		}
		if (props.showScreenshotOption !== undefined) {
			updates.showScreenshotOption = props.showScreenshotOption
		}
		if (props.environment !== undefined) updates.environment = props.environment
		if (props.metadata !== undefined) updates.metadata = props.metadata
		handle.update(updates)
		// theme/metadata compared by serialized identity since they're
		// objects; primitives use direct dep tracking.
	}, [
		props.position,
		themeJson,
		props.title,
		props.placeholder,
		props.showEmailOption,
		props.showScreenshotOption,
		props.environment,
		metadataJson,
	])

	return null
}
