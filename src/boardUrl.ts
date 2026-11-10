// Link to a Usero public board with custom field answers and the email already filled in.

export type BoardUrlFieldValue = string | number | boolean | null | undefined

export interface BoardUrlOptions {
	/** The board slug, the `<slug>` in `/b/<slug>`. */
	board: string
	/** Answers keyed by field id (`cf_...`) or field label. Null, undefined and empty values are skipped. */
	fields?: Record<string, BoardUrlFieldValue>
	/** Pre-fills the optional author email. */
	email?: string
	/** `submit` (default) opens the new idea form, `home` the board; answers carry over to the form either way. */
	path?: 'home' | 'submit'
	/** Where the board is served, default `https://usero.io`. A custom domain keeps the `/b/<slug>` path. */
	baseUrl?: string
}

export const DEFAULT_BOARD_BASE_URL = 'https://usero.io'

export function boardUrl(options: BoardUrlOptions): string {
	const base = (options.baseUrl ?? DEFAULT_BOARD_BASE_URL).trim().replace(/\/+$/, '')
	const slugPath = `/b/${encodeURIComponent(options.board.trim())}`
	const path = options.path === 'home' ? slugPath : `${slugPath}/submit`
	const params = new URLSearchParams()
	for (const [key, value] of Object.entries(options.fields ?? {})) {
		if (value === null || value === undefined) continue
		const name = key.trim()
		const text = String(value).trim()
		if (name !== '' && text !== '') params.append(`field.${name}`, text)
	}
	const email = options.email?.trim() ?? ''
	if (email !== '') params.set('email', email)
	const query = params.toString()
	return query === '' ? `${base}${path}` : `${base}${path}?${query}`
}
