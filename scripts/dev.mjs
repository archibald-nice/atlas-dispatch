import { context } from 'esbuild';
import { fileURLToPath } from 'node:url';

const pageDirectory = 'scripts/dev-page';

export const devBuildOptions = {
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  entryPoints: { atlas: 'src/dev.tsx' },
  outdir: pageDirectory,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  jsxDev: true,
  sourcemap: true,
  write: false,
  define: { 'process.env.NODE_ENV': '"development"' },
};

if (import.meta.main) {
  const host = '127.0.0.1';
  const ctx = await context(devBuildOptions);
  try {
    const { port } = await ctx.serve({ host, port: 5173, servedir: pageDirectory });
    await ctx.watch();
    console.log(`Atlas + Agentation: http://${host}:${port}/ (Ctrl+C to stop)`);
  } catch (error) {
    await ctx.dispose();
    throw error;
  }
}
