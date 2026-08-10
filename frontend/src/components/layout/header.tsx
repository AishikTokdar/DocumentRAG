import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  FileText,
  MessageSquare,
  Github,
  Sun,
  Moon,
  BookOpen,
  LineChart,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { APP_CONFIG, NAV_LINKS, SOCIAL_LINKS } from "@/lib/constants";
import { useHealth } from "@/hooks/use-health";
import { useTheme } from "@/context/theme-context";
import { ApiNavDropdown } from "@/components/layout/api-nav-dropdown";
import { joinApiUrl } from "@/lib/constants";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const location = useLocation();
  const { status } = useHealth();
  const { isDark, toggleTheme } = useTheme();

  React.useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const healthColor =
    status === "connected"
      ? "bg-lime-500"
      : status === "disconnected"
        ? "bg-red-500"
        : "bg-amber-500 animate-pulse";

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-950/80 backdrop-blur-md transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-lg bg-amber-500 dark:bg-amber-500 flex items-center justify-center text-white font-bold text-sm transition-transform group-hover:scale-105 shadow-sm shadow-amber-500/20">
              D
            </div>
            <span className="text-base font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
              {APP_CONFIG.name}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.href;
              const iconMap: Record<string, typeof FileText> = {
                "/": FileText,
                "/chat": MessageSquare,
              };
              const Icon = iconMap[link.href] ?? FileText;

              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-medium transition-colors px-2.5 py-1.5 rounded-lg",
                    isActive
                      ? "text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800/60"
                      : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-900",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}

            <ApiNavDropdown />

            {/* Health Indicator */}
            <div
              className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-600 dark:text-stone-400"
              title={`Backend Status: ${status}`}
            >
              <span className={cn("w-2 h-2 rounded-full", healthColor)} />
              <span>{status === "connected" ? "Online" : status === "disconnected" ? "Offline" : "Checking..."}</span>
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              aria-label="Toggle dark/light theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-stone-700" />}
            </button>

            {/* GitHub */}
            <a
              href={SOCIAL_LINKS.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>

            <Button variant="default" size="sm" asChild className="bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">
              <Link to="/chat">Launch App</Link>
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-stone-700" />}
            </button>
            <button
              className="p-2 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle Menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-4 py-4 space-y-2"
          >
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.href;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                      : "text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <a
              href={joinApiUrl("/redoc")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <BookOpen className="w-4 h-4" />
              API Documentation
              <ExternalLink className="w-3.5 h-3.5 ml-auto opacity-50" />
            </a>
            <Link
              to="/api-status"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <LineChart className="w-4 h-4" />
              API Status
            </Link>
            <div className="pt-2">
              <Button variant="default" className="w-full" asChild>
                <Link to="/chat">Launch App</Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
