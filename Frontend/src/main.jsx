import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { AppProvider } from './contexts/AppContext.jsx'

// ── TanStack Query Client ──────────────────────────────────────────────────
// Cung cấp caching, retry, background refetch cho tất cả API calls.
//   staleTime: 5 phút — tasks & analytics data không cần fetch lại liên tục
//   retry: 1 — retry 1 lần nếu request thất bại (network glitch)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// AppProvider wraps everything — bao gồm cả BrowserRouter bên trong App.
// Lý do đặt ở đây (main.jsx) thay vì App.jsx:
//   → Global state không nên phụ thuộc vào routing context
//   → Mọi component trong toàn cây đều có thể useAppContext() ngay lập tức
//
// QueryClientProvider phải nằm ngoài cùng để mọi hook useQuery/useMutation
// đều có access đến shared cache.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <App />
      </AppProvider>
    </QueryClientProvider>
  </StrictMode>,
)

