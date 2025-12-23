import { useState, useEffect } from 'react'

const DEFAULT_DELAY_MS = 300

/**
 * Returns a debounced version of the input value.
 * The returned value only updates after the specified delay has passed
 * without the input value changing.
 */
export function useDebouncedValue<T>(value: T, delayMs = DEFAULT_DELAY_MS): T {
	const [debouncedValue, setDebouncedValue] = useState(value)

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedValue(value)
		}, delayMs)

		return () => {
			clearTimeout(timer)
		}
	}, [value, delayMs])

	return debouncedValue
}

