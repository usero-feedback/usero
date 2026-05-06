import type { FeedbackSubmission } from './types'

export interface ValidationResult {
	isValid: boolean
	errors: string[]
}

export function validateFeedbackSubmission(
	data: Partial<FeedbackSubmission>,
): ValidationResult {
	const errors: string[] = []
	const hasRating = data.rating != null
	const hasComment = !!data.comment?.trim()

	if (!hasRating && !hasComment) {
		errors.push('Add rating or comment')
	}
	if (hasRating && data.rating !== undefined && ![1, 2, 3, 4].includes(data.rating)) {
		errors.push('Invalid rating')
	}
	if (hasComment && data.comment !== undefined) {
		if (data.comment.length > 1000) {
			errors.push('Comment too long')
		}
		if (/<script[^>]*>.*?<\/script>/gi.test(data.comment)) {
			errors.push('Invalid comment')
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
	}
}
