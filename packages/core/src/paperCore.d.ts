// paper-core is the build without a canvas or DOM; it ships no types of its own, but exposes the same API as `paper`.
declare module 'paper/dist/paper-core.js' {
  import paper from 'paper'
  export default paper
}
