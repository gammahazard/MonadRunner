/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./utils/**/*.{js,ts,jsx,tsx}"],
  plugins: [require("daisyui")],
  darkTheme: "dark",
  darkMode: ["selector", "[data-theme='dark']"],
  daisyui: {
    themes: [
      {
        light: {
          primary: "#5D7AFF",        // Brighter blue
          "primary-content": "#0F1022",
          secondary: "#6AFFBD",      // Neon green-cyan
          "secondary-content": "#0F1022",
          accent: "#B06AFF",         // Neon purple
          "accent-content": "#0F1022",
          neutral: "#0F1022",
          "neutral-content": "#ffffff",
          "base-100": "#ffffff",
          "base-200": "#F0F4FF",
          "base-300": "#D8E2FF",
          "base-content": "#0F1022",
          info: "#5D7AFF",
          success: "#21DFAB",        // Bright teal
          warning: "#FFB13D",
          error: "#FF4D6A",         // Vibrant pink-red
          "--rounded-btn": "8px",
          ".tooltip": { "--tooltip-tail": "6px" },
          ".link": { textUnderlineOffset: "2px" },
          ".link:hover": { opacity: "80%" },
        },
      },
      {
        dark: {
          primary: "#3A56D4",        // Deep blue
          "primary-content": "#EFF2FF",
          secondary: "#00FFB2",      // Bright neon green
          "secondary-content": "#0F1022",
          accent: "#9437FF",         // Vibrant purple
          "accent-content": "#EFF2FF",
          neutral: "#EFF2FF",
          "neutral-content": "#1A1D3B",
          "base-100": "#1A1D3B",     // Dark blue-purple
          "base-200": "#141836",     // Deeper blue-purple
          "base-300": "#0F1022",     // Darkest blue
          "base-content": "#EFF2FF", // Very light blue-white
          info: "#3A56D4",
          success: "#00FFB2",
          warning: "#FFB13D",
          error: "#FF4D6A",
          "--rounded-btn": "8px",
          ".tooltip": { "--tooltip-tail": "6px", "--tooltip-color": "oklch(var(--p))" },
          ".link": { textUnderlineOffset: "2px" },
          ".link:hover": { opacity: "80%" },
          
          // Adding some additional monadic-inspired styles
          ".card": { "backdrop-filter": "blur(4px)", "background-color": "rgba(26, 29, 59, 0.8)" },
          ".glass": { "background": "rgba(15, 16, 34, 0.7)", "backdrop-filter": "blur(8px)" },
          ".btn-primary": { "box-shadow": "0 0 15px -2px rgba(58, 86, 212, 0.6)" },
          ".btn-secondary": { "box-shadow": "0 0 15px -2px rgba(0, 255, 178, 0.6)" },
          ".btn-accent": { "box-shadow": "0 0 15px -2px rgba(148, 55, 255, 0.6)" },
        },
      },
    ],
  },
  theme: {
    extend: {
      boxShadow: { 
        center: "0 0 12px -2px rgb(0 0 0 / 0.05)",
        neon: "0 0 20px rgba(0, 255, 178, 0.6)",
        'neon-blue': "0 0 20px rgba(58, 86, 212, 0.6)",
        'neon-purple': "0 0 20px rgba(148, 55, 255, 0.6)"
      },
      animation: { 
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate"
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 178, 0.6)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 178, 0.8), 0 0 30px rgba(0, 255, 178, 0.6)' }
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'monad-grid': 'linear-gradient(rgba(26, 29, 59, 0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(26, 29, 59, 0.8) 1px, transparent 1px)'
      },
      backgroundSize: {
        'grid-lg': '60px 60px',
      }
    },
  },
};