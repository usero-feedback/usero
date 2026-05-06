// This file is a consumer-perspective type smoke test. It is NOT part of
// the published package (npmignored). Running `npx tsc --noEmit` against
// it confirms that the `exports` map resolves correctly for both entries
// and that the published .d.ts files type-check from the outside.

import { initUseroFeedbackWidget } from 'usero'
import type {
	FeedbackWidgetProps,
	UseroWidgetHandle,
} from 'usero'
import { UseroFeedbackWidget } from 'usero/react'
import type { FeedbackWidgetProps as ReactProps } from 'usero/react'

declare const propsA: FeedbackWidgetProps
declare const propsB: ReactProps

const handle: UseroWidgetHandle = initUseroFeedbackWidget(propsA)
handle.destroy()
handle.open()
handle.close()

// Just reference the React export to ensure the module + its type re-exports resolve.
const _component: typeof UseroFeedbackWidget = UseroFeedbackWidget
void _component
void propsB
