/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      minHeight: {
        dvh: ['100vh', '100dvh']
      },
      keyframes: {
        fadeOut: {
          '0%': { opacity: 1 },
          '100%': { opacity: 0 }
        }
      },
      animation: {
        fadeOut: 'fadeOut 1s ease-in-out forwards' // You can adjust the duration and timing function
      }
    }
  },
  plugins: []
}
