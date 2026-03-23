/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cnc: {
          bg: "#06110b",
          surface: "#0b1a13",
          card: "#10241b",
          border: "#1a3d2e",
          accent: "#C6F321",
          "accent-hover": "#b2d81d",
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
          text: "#e2e8f0",
          "text-muted": "#64748b",
        },
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
      animation: {
        marquee: "marquee 20s linear infinite",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
