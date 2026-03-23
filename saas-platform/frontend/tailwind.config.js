/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cnc: {
          bg: "#0a0e14",
          surface: "#111827",
          card: "#1a2234",
          border: "#263044",
          accent: "#38bdf8",
          "accent-hover": "#0ea5e9",
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
          text: "#e2e8f0",
          "text-muted": "#64748b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
