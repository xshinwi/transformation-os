/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Alexandria', 'sans-serif'],
        mono: ['Outfit', 'monospace'],
        arabic: ['Alexandria', 'sans-serif'],
      }
    },
  },
  plugins: [],
}