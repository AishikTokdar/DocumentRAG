import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    env.VITE_DEV_PROXY_TARGET?.trim() ||
    (env.VITE_API_BASE_URL?.trim().startsWith("http") ? env.VITE_API_BASE_URL.trim() :
      `http://127.0.0.1:${env.VITE_BACKEND_PORT || "8000"}`);
  const proxy = {
    "/api/": {
      target: proxyTarget, changeOrigin: true,
      rewrite: (p: string) => p.startsWith("/api/oversight") ? p : p.replace(/^\/api\//, "/")
    },
    "^/(health|status|upload|ask|session|chat/history|models|runtime-summary|pipeline-info|docs|redoc|openapi\\.json)(/|$)":
      { target: proxyTarget, changeOrigin: true },
  };

  return {
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
        process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || "",
      ),
    },
    plugins: [react()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(configDirectory, "./src"),
        "@/components": path.resolve(configDirectory, "./src/components"),
        "@/hooks": path.resolve(configDirectory, "./src/hooks"),
        "@/lib": path.resolve(configDirectory, "./src/lib"),
        "@/types": path.resolve(configDirectory, "./src/types"),
        "@/context": path.resolve(configDirectory, "./src/context"),
        "@/pages": path.resolve(configDirectory, "./src/pages"),
      },
    },
    cacheDir: path.resolve(configDirectory, "../.cache/vite"),
    server: {
      port: 5173,
      proxy,
    },
    preview: { proxy },
    build: {
      outDir: "dist",
      sourcemap: false,
      target: "es2020",
      minify: "oxc",
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("react-router-dom") ||
              id.includes("/react/") ||
              id.includes("react-dom")
            ) {
              return "vendor";
            }
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("lucide-react")) return "icons";
            return undefined;
          },
        },
      },
    },
  };
});
