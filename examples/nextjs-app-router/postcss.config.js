// Tailwind CSS v4 ships its PostCSS plugin as a separate package, and folds
// vendor prefixing in, so `tailwindcss` and `autoprefixer` are no longer plugins
// here.
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
