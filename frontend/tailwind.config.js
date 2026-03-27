/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        accent: {
          500: '#f59e0b',
          600: '#d97706',
        },
        teal: {
          DEFAULT: '#00BFA6',
          light: '#00d4b8',
          deep: '#0e9d8a',
        },
        dark: {
          bg: '#0a0f1e',
          card: '#141929',
          surface: '#1a2035',
          footer: '#060a14',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
