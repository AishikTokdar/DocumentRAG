import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Sentry } from "@/lib/sentry";
import { ThemeProvider } from "@/context/theme-context";
import { HealthProvider } from "@/context/health-context";
import { BackendNotice } from "@/components/layout/backend-notice";
import { ChatProvider } from "@/context/chat-context";
import { ScrollToTop } from "@/components/layout/scroll-to-top";
import { HomePage } from "@/pages/home";
import { ChatPage } from "@/pages/chat";
import { ApiStatusPage } from "@/pages/api-status";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

function AppFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="text-center max-w-md px-6">
        <h1 className="text-2xl font-bold mb-3">Something went wrong</h1>
        <p className="text-zinc-400 mb-6">
          An unexpected error occurred.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl bg-zinc-100 text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <Sentry.ErrorBoundary fallback={<AppFallback />} showDialog>
      <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <HealthProvider>
        <BrowserRouter>
          <TooltipProvider delayDuration={350}>
            <Toaster />
            <ScrollToTop />
            <BackendNotice />
            <ChatProvider>
              <AnimatePresence mode="wait">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/api-status" element={<ApiStatusPage />} />
                  <Route path="*" element={<HomePage />} />
                </Routes>
              </AnimatePresence>
            </ChatProvider>
          </TooltipProvider>
        </BrowserRouter>
        </HealthProvider>
      </ThemeProvider>
      </MotionConfig>
    </Sentry.ErrorBoundary>
  );
}

export default App;
