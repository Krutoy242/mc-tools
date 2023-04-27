export default {
  entries: [
    { builder: 'mkdist', format: 'cjs', input: './src' },
    { builder: 'mkdist', input: './src' }],
  declaration: true,
}
