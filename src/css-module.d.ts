/** `scripts/css-text.js`: a CSS import gives the minified CSS as a string. */
declare module '*.css' {
  const css: string;
  export default css;
}
