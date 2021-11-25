import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from "rollup-plugin-terser";
import os, { type } from 'os';
import pkg from './package.json'
  
const cpuNums = os.cpus().length;

const out = [
  {
    file: pkg.main,
    format: 'cjs'
  },
  {
    file: pkg.module,
    format: 'esm'
  },
  {
    file: pkg.browser,
    format: 'umd',
    name: 'Sentry'
  }
]

const banner = 
`/*!
* ${pkg.name} v${pkg.version}
* (c) 2020-2021 ${pkg.author}
* Released under the ${pkg.license} License.
*/
`;

const minimize = (obj) => {
  const ob = {
    banner,
    file: obj.file.slice(0, -2) + 'min.js',
    plugins: [terser({
      output: {
        comments: RegExp(`${pkg.name}`),
      },
      compress: {
        drop_console: true,
        drop_debugger: true
      },
      numWorkers: cpuNums, //多线程压缩
    })]
  }
  return ob
}

// console.log(process.env.NODE_ENV === 'production', '======')
let output = out.map(type => ({...type, banner}))
if (process.env.NODE_ENV === 'production') {
  output = output.concat(out.map(type => minimize(type)))
}

export default {
  input: './src/index.js',
  // external: ['pako'],
  output,
  // output: [
  //   ...out.map(type => ({...type, banner})),
  //   ...out.map(type => minimize(type))
  // ],
  plugins: [
    resolve(),
    commonjs(),
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**' // 只编译我们的源代码
    }),
    // terser({
    //   output: {
    //     comments: false,
    //   },
    //   compress: {
    //     drop_console: true,
    //     drop_debugger: true
    //   },
    //   numWorkers: cpuNums, //多线程压缩
    //   // sourcemap: false,
    //   // include: [/^.+\.js$/],
    //   // exclude: [ 'node_modules/**' ]
    // })
  ],
  watch: {
    include: ['./src/**']
  }
}