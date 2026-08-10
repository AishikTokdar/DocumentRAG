import type { Config } from "tailwindcss";

/**
 * Tailwind CSS Configuration
 * 
 * This config extends the default Tailwind setup with:
 * - Custom max-width (9xl) for wide layouts
 * - Custom animations for scroll reveals and UI effects
 * - Extended color palette — warm earth-tone editorial design
 * - Custom font family (Inter)
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Custom max-width for root layout
      maxWidth: {
        "9xl": "1600px",
      },
      // Custom font family
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      // Custom animations for scroll reveal and UI effects
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "fade-in-up": "fadeInUp 0.6s ease-out forwards",
        "fade-in-down": "fadeInDown 0.6s ease-out forwards",
        "fade-in-left": "fadeInLeft 0.6s ease-out forwards",
        "fade-in-right": "fadeInRight 0.6s ease-out forwards",
        "scale-in": "scaleIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        "bounce-in": "bounceIn 0.6s ease-out forwards",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "ripple": "ripple 0.6s linear forwards",
        "cta-shine": "ctaShine 4.5s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
        "warm-pulse": "warmPulse 3s ease-in-out infinite",
        "grain": "grain 8s steps(10) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(40px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-40px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInLeft: {
          "0%": { opacity: "0", transform: "translateX(-40px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        fadeInRight: {
          "0%": { opacity: "0", transform: "translateX(40px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        bounceIn: {
          "0%": { opacity: "0", transform: "scale(0.3)" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(217, 119, 6, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(217, 119, 6, 0.6)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.5" },
          "100%": { transform: "scale(4)", opacity: "0" },
        },
        ctaShine: {
          "0%": { left: "-100%" },
          "50%, 100%": { left: "100%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        warmPulse: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "0.8" },
        },
        grain: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "10%": { transform: "translate(-5%, -10%)" },
          "20%": { transform: "translate(-15%, 5%)" },
          "30%": { transform: "translate(7%, -25%)" },
          "40%": { transform: "translate(-5%, 25%)" },
          "50%": { transform: "translate(-15%, 10%)" },
          "60%": { transform: "translate(15%, 0%)" },
          "70%": { transform: "translate(0%, 15%)" },
          "80%": { transform: "translate(3%, 35%)" },
          "90%": { transform: "translate(-10%, 10%)" },
        },
      },
      // Extended colors — warm earth-tone palette
      colors: {
        glass: {
          light: "rgba(255, 255, 255, 0.1)",
          DEFAULT: "rgba(255, 255, 255, 0.15)",
          dark: "rgba(0, 0, 0, 0.2)",
        },
      },
      // Backdrop blur values
      backdropBlur: {
        xs: "2px",
      },
      // Box shadow — warm tones
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.15)",
        "glass-lg": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        glow: "0 0 20px rgba(217, 119, 6, 0.3)",
        "glow-lg": "0 0 40px rgba(217, 119, 6, 0.5)",
        "warm-sm": "0 1px 3px rgba(120, 113, 108, 0.08)",
        "warm-md": "0 4px 12px rgba(120, 113, 108, 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
