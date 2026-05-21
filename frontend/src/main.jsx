import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Log application version and build info
console.log(
  `%c APEX Client %c v${__APP_VERSION__} (${__BRANCH_NAME__} @ ${__COMMIT_HASH__}) Built: ${__BUILD_TIME__} `,
  'background: #24A1DD; color: #fff; padding: 2px 4px; border-radius: 3px 0 0 3px; font-weight: bold;',
  'background: #35495E; color: #fff; padding: 2px 4px; border-radius: 0 3px 3px 0; font-weight: normal;'
)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)