import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import App from './App'
import { AuthSessionProvider } from './context/AuthSessionProvider'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider>
        <BrowserRouter>
          <App />
          <Toaster position="top-center" toastOptions={{ duration: 3500 }} />
        </BrowserRouter>
      </AuthSessionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
