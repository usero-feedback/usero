// Shared types used by both the vanilla and React entry points.
// Keep this file framework-free so the vanilla bundle never pulls react.

export type FeedbackRating = 1 | 2 | 3 | 4

export interface FeedbackMetadata {
	pageUrl: string
	pageTitle: string
	referrer?: string
	timestamp: number
}

export interface ScreenshotData {
	fileName: string
	url: string
	fileSize: number
	width?: number
	height?: number
	mimeType: string
}

export interface FeedbackSubmission {
	clientId: string
	rating?: FeedbackRating
	comment?: string
	userEmail?: string
	pageUrl: string
	pageTitle: string
	referrer?: string
	environment?: string
	screenshots?: ScreenshotData[]
	metadata?: Record<string, unknown>
	// Legacy gzipped + base64-encoded rrweb event stream. The pre-chunked
	// session-replay plugin attached this on submit. The chunked-upload
	// plugin (>= 0.4.0) does NOT set this — it ships events out-of-band
	// via the chunk endpoints and points at the resulting session replay
	// via `sessionReplayId` + `replayOffsetMs`. Kept on the wire one
	// release for backward compat with old SaaS deployments that only
	// know how to ingest the legacy field.
	replayEvents?: string
	// Pointer to a SessionReplay row created by the session-replay
	// plugin's chunked-upload pipeline, plus the offset within that
	// recording at submit time so the dashboard can deep-link.
	sessionReplayId?: string
	replayOffsetMs?: number
}

export interface FeedbackData {
	rating?: FeedbackRating
	comment?: string
	userEmail?: string
	screenshots?: ScreenshotData[]
	metadata: FeedbackMetadata
}

// Customer-supplied identity for the session-replay / identify pipeline.
// Use the declarative form: pass `user` on the React widget (the SDK
// diffs and auto-fires identify), or supply `getUser` on the vanilla
// init (the SDK polls it at session start). An imperative `identify()`
// call exists as an escape hatch only and is intentionally not
// documented as the headline API.
export type UseroUserTraitValue = string | number | boolean | null
export type UseroUserTraits = Record<string, UseroUserTraitValue>
export interface UseroUser {
	id: string
	email?: string
	displayName?: string
	traits?: UseroUserTraits
}

export type WidgetPosition = 'right' | 'left'

export interface WidgetTheme {
	primary: string
	background: string
	text: string
	border: string
	shadow: string
}

// Forward-declared to avoid a circular import. The plugin module imports
// FeedbackSubmission from this file, so we can't import UseroPlugin back
// up here without a cycle. Keeping the prop typed as an opaque object with
// the minimal shape the widget actually inspects works fine for consumers.
export interface FeedbackWidgetProps {
	clientId: string
	position?: WidgetPosition
	theme?: Partial<WidgetTheme>
	title?: string
	placeholder?: string
	showEmailOption?: boolean
	showScreenshotOption?: boolean
	environment?: string
	baseUrl?: string
	metadata?: Record<string, unknown>
	plugins?: ReadonlyArray<import('./plugin').UseroPlugin>
	// Declarative identity. React: pass the current user (or null on
	// logout) and the SDK auto-fires identify when the resolved id
	// transitions. Vanilla: pass a getter so the SDK can resolve user at
	// session start / chunk boundaries. Pass at most one. The SDK never
	// invokes both.
	user?: UseroUser | null
	getUser?: () => UseroUser | null | undefined
	onSubmit?: (feedback: FeedbackData) => void
	onError?: (error: Error) => void
	onOpen?: () => void
	onClose?: () => void
}

export interface SubmissionResponse {
	success: boolean
	error?: string
	id?: string
	message?: string
	data?: unknown
}

export const EMOJI_MAP: Record<FeedbackRating, string> = {
	1: '😞',
	2: '😐',
	3: '😊',
	4: '🤩',
}

export const RATING_LABELS: Record<FeedbackRating, string> = {
	1: 'Needs work',
	2: "It's okay",
	3: 'Pretty good',
	4: 'Amazing!',
}

export const EMOJI_BACKGROUNDS: Record<FeedbackRating, string> = {
	1: 'linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)',
	2: 'linear-gradient(135deg,#9ca3af0f,#9ca3af1a)',
	3: 'linear-gradient(135deg,#3b82f614,#3b82f61f)',
	4: 'linear-gradient(135deg,#f59e0b14,#f59e0b1f)',
}

export const DEFAULT_API_URL = 'https://usero.io'

export const DEFAULT_THEME: WidgetTheme = {
	primary: '#2563eb',
	background: '#ffffff',
	text: '#374151',
	border: '#e5e7eb',
	shadow:
		'0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
}

export const DARK_THEME: WidgetTheme = {
	primary: '#2563eb',
	background: '#1f2937',
	text: '#f9fafb',
	border: '#374151',
	shadow:
		'0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
}

export function mergeTheme(customTheme: Partial<WidgetTheme> = {}): WidgetTheme {
	return { ...DEFAULT_THEME, ...customTheme }
}
