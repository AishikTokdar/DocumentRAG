import { Link } from "react-router-dom";
import { Github, Linkedin } from "lucide-react";
import {
  APP_CONFIG,
  NAV_LINKS,
  SOCIAL_LINKS,
  TECH_STACK,
} from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 transition-colors relative">
      {/* Warm accent top border */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent dark:via-amber-500/30" />
      
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-500 dark:bg-amber-500 flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-amber-500/20">
                D
              </div>
              <span className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                {APP_CONFIG.name}
              </span>
            </Link>
            <p className="max-w-sm text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              {APP_CONFIG.description}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a
                href={SOCIAL_LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href={SOCIAL_LINKS.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-4">
              Navigation
            </h3>
            <ul className="space-y-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Tech stack */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-4">
              Built With
            </h3>
            <ul className="space-y-2.5">
              {TECH_STACK.slice(0, 5).map((tech) => (
                <li key={tech.name}>
                  <span className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                    {tech.name}
                    <span className="text-xs text-stone-400 dark:text-stone-600">
                      ({tech.category})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-stone-200 dark:border-stone-800 pt-6 flex items-center justify-between text-xs text-stone-500 dark:text-stone-500">
          <span>&copy; {new Date().getFullYear()} {APP_CONFIG.name}. All rights reserved.</span>
          <span>Open Source Document Intelligence</span>
        </div>
      </div>
    </footer>
  );
}
