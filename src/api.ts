import {
	DEFAULT_API_URL,
	type FeedbackSubmission,
	type SubmissionResponse,
} from './types'

interface JsonErrorBody {
	error?: string
}

function isJsonErrorBody(value: unknown): value is JsonErrorBody {
	return typeof value === 'object' && value !== null && 'error' in value
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

	ping(): void {
		fetch(`${this.baseUrl}/api/ping`, {
			signal: AbortSignal.timeout(5000),
		}).catch(() => {})
	}
}
