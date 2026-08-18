// ESM load hook so `node --test` can import the app's JSX components (.jsx) and
// JSX-in-.js directly — esbuild rewrites JSX (automatic runtime, same as Vite) and
// leaves import/export to Node. Only project src/ files are transformed;
// node_modules (react, react-dom, @521studios/*) pass through untouched.
import { transform } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Local imports use explicit extensions, but retry with `.js` for any that don't
// (native ESM won't guess extensions the way the bundler does).
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/.test(specifier)) {
      return nextResolve(specifier + '.js', context)
    }
    throw err
  }
}

export async function load(url, context, nextLoad) {
  // CSS imports (e.g. React Flow's dist/style.css) are bundler concerns — stub them
  // as an empty module so `node --test` doesn't choke on the unknown extension.
  if (url.endsWith('.css')) {
    return { format: 'module', source: 'export default {}', shortCircuit: true }
  }
  // Only app source — never a dep (some ship a `src/` dir, e.g. debug/src/*.js,
  // which is CommonJS and must NOT be forced to ESM).
  if (
    url.startsWith('file:') &&
    url.includes('/src/') &&
    !url.includes('/node_modules/') &&
    (url.endsWith('.js') || url.endsWith('.jsx'))
  ) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    const { code } = await transform(source, {
      loader: 'jsx',
      jsx: 'automatic',
      jsxImportSource: 'react',
      format: 'esm',
      sourcefile: fileURLToPath(url),
    })
    return { format: 'module', source: code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
