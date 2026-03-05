export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md}'],
  safelist: [
    'prose', 'prose-lg', 'prose-blue', 'max-w-none',
    'prose-headings:text-gray-900',
  ],
  theme: { extend: {} },
  plugins: [require('@tailwindcss/typography')],
};
