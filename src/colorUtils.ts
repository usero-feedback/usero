export function colorNameToHex(color: string): string {
	if (color.startsWith('#')) return color
	if (typeof document === 'undefined') return color

	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')
	if (!ctx) return color

	ctx.fillStyle = color
	return ctx.fillStyle
}

export function getGradientEnd(color: string): string {
	const hex = colorNameToHex(color)
	if (!hex.startsWith('#') || hex.length < 7) return hex
	const r = parseInt(hex.slice(1, 3), 16)
	const g = parseInt(hex.slice(3, 5), 16)
	const b = parseInt(hex.slice(5, 7), 16)
	const shiftedR = Math.max(0, r - 60)
	const shiftedG = Math.min(255, g + 40)
	const shiftedB = Math.min(255, b + 20)
	return `#${[shiftedR, shiftedG, shiftedB]
		.map(x => x.toString(16).padStart(2, '0'))
		.join('')}`
}

// Launcher and submit fill as CSS values. The gradient's second stop is
// --usero-primary-end, so a --usero-primary override moves both stops.
export function getButtonColors(
	primary: string,
	buttonStyle: 'gradient' | 'flat' | undefined,
): { background: string; color: string } {
	if (buttonStyle !== 'flat') {
		return { background: 'linear-gradient(135deg, var(--usero-primary), var(--usero-primary-end))', color: '#fff' }
	}
	// YIQ brightness: near-black text on light fills, white on dark ones.
	const n = parseInt(colorNameToHex(primary).slice(1, 7), 16)
	const yiq = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000
	return { background: 'var(--usero-primary)', color: Number.isNaN(n) || yiq < 128 ? '#fff' : '#111827' }
}
