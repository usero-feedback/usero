import {
	DEFAULT_API_URL,
	type FeedbackSubmission,
	type ScreenshotData,
	type SubmissionResponse,
} from './types'

interface JsonErrorBody {
	error?: string
}

function isJsonErrorBody(value: unknown): value is JsonErrorBody {
	return typeof value === 'object' && value !== null && 'error' in value
}

interface ScreenshotUploadResponseBody {
	success: boolean
	error?: string
	screenshot?: ScreenshotData
}

function parseScreenshotUploadBody(
	value: unknown,
): ScreenshotUploadResponseBody {
	if (typeof value !== 'object' || value === null) {
		return { success: false, error: 'Invalid response' }
	}
	const obj = value as Record<string, unknown>
	const success = obj.success === true
	const error = typeof obj.error === 'string' ? obj.error : undefined
	const rawShot = obj.screenshot
	let screenshot: ScreenshotData | undefined
	if (typeof rawShot === 'object' && rawShot !== null) {
		const s = rawShot as Record<string, unknown>
		if (
			typeof s.fileName === 'string' &&
			typeof s.url === 'string' &&
			typeof s.fileSize === 'number' &&
			typeof s.mimeType === 'string'
		) {
			screenshot = {
				fileName: s.fileName,
				url: s.url,
				fileSize: s.fileSize,
				mimeType: s.mimeType,
				width: typeof s.width === 'number' ? s.width : undefined,
				height: typeof s.height === 'number' ? s.height : undefined,
			}
		}
	}
	return { success, error, screenshot }
}

export class FeedbackApiClient {
	private baseUrl: string

	constructor(baseUrl: string = DEFAULT_API_URL) {
		this.baseUrl = baseUrl.replace(/\/$/, '')
	}

	async submitFeedback(data: FeedbackSubmission): Promise<SubmissionResponse> {
		try {
			const response = await fetch(`${this.baseUrl}/api/feedback`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(data),
				signal: AbortSignal.timeout(10000),
			})

			if (!response.ok) {
				let errorMessage = `HTTP ${response.status}: ${response.statusText}`
				try {
					const errorData: unknown = await response.json()
					if (isJsonErrorBody(errorData) && typeof errorData.error === 'string') {
						errorMessage = errorData.error
					}
				} catch {
					// Ignore JSON parse errors
				}
				throw new Error(errorMessage)
			}

			const result: unknown = await response.json()
			const message =
				typeof result === 'object' &&
				result !== null &&
				'message' in result &&
				typeof (result as { message: unknown }).message === 'string'
					? (result as { message: string }).message
					: 'Feedback submitted successfully'

			return {
				success: true,
				data: result,
				message,
			}
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'An unexpected error occurred',
			}
		}
	}

	async uploadScreenshot(
		file: File,
		clientId: string,
	): Promise<ScreenshotData> {
		const formData = new FormData()
		formData.append('screenshot', file)
		formData.append('clientId', clientId)

		const response = await fetch(`${this.baseUrl}/api/screenshots`, {
			method: 'POST',
			body: formData,
			signal: AbortSignal.timeout(30000),
		})

		let body: ScreenshotUploadResponseBody = { success: false }
		try {
			const raw: unknown = await response.json()
			body = parseScreenshotUploadBody(raw)
		} catch {
			// fall through to error handling below
		}

		if (!response.ok || !body.success || !body.screenshot) {
			const message =
				body.error ?? `HTTP ${response.status}: ${response.statusText}`
			throw new Error(message)
		}

		return body.screenshot
	}

	ping(): void {
		fetch(`${this.baseUrl}/api/ping`, {
			signal: AbortSignal.timeout(5000),
		}).catch(() => {})
	}
}
