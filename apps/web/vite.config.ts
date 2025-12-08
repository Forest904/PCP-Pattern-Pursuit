import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use a subpath on GitHub Pages; default to root for local/dev.
  base: process.env.GITHUB_PAGES ? "/PCP-Pattern-Pursuit/" : "/",
})
