/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['IBM Plex Mono', 'Courier New', 'monospace'],
        display: ['Bebas Neue', 'sans-serif'],
      },
      colors: {
        bg:     '#080c11',
        bg2:    '#0a0e14',
        bg3:    '#0d1420',
        border: '#1a2a40',
        muted:  '#5a7a90',
        dim:    '#3a6a90',
        green:  '#00ff88',
        amber:  '#ffaa00',
        danger: '#ff4444',
        blue:   '#7aa3d4',
      },
    },
  },
  plugins: [],
}
