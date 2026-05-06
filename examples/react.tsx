// Minimal example. Not run as part of the build; it exists so a reader can
// see exactly what consuming the React entry point looks like.

import { createRoot } from 'react-dom/client'
import { UseroFeedbackWidget } from 'usero/react'

function App() {
	return (
		<div>
			<h1>Usero React demo</h1>
			<UseroFeedbackWidget clientId='demo-client-id' position='right' />
		</div>
	)
}

const container = document.getElementById('root')
if (container) {
	createRoot(container).render(<App />)
}
