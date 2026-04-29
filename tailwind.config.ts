import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        panel: {
          dark: '#10141f',
          darker: '#0b0f18',
          light: '#f8fafc'
        }
      }
    }
  },
  plugins: []
};

export default config;
