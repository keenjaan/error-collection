import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';

export default {
  input: './src/index.js',
  external: ['pako'],
  output: {
    name: 'Bundle',
    format: 'umd',
    globals: {pako: 'pako'},
    file: './dist/error-collection-umd.js'
  },
  plugins: [
    resolve(),
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**' // 只编译我们的源代码
    })
  ],
  watch: {
    include: ['./src/**']
  }
}