import { readdir, rm } from 'node:fs/promises';
// One asset contract for local watching and production builds. CSS remains Hugo-served.
export const motionOptions = {
  entryPoints: { 'motion-system': 'ui/main.jsx' }, outdir: 'static/js',
  splitting: true, chunkNames: 'chunks/[name]-[hash]',
  bundle: true, minify: true, format: 'esm', target: ['es2020'], jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'eof', sourcemap: false, metafile: true,
  plugins: [{ name: 'prune-stale-chunks', setup(builder) {
    builder.onEnd(async result => {
      if (result.errors.length || !result.metafile) return;
      const outputs = new Set(Object.keys(result.metafile.outputs));
      for (const name of await readdir('static/js/chunks').catch(() => [])) {
        const file = `static/js/chunks/${name}`;
        if (name.endsWith('.js') && !outputs.has(file)) await rm(file, { force: true });
      }
    });
  }}],
};
