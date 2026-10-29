// Local-only orchestration. Never imports content or stages challenge files.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';
import { motionOptions } from './motion-options.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const hugo = process.env.HUGO_BIN || 'hugo';
const mode = process.argv[2];
const children = new Set();
let bundler;
let stopping = false;
function launch(command, args) {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = launch(command, args);
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal || code})`)));
  });
}
async function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  await bundler?.dispose();
  process.exitCode = code;
}
process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
try {
  if (mode === 'build' || mode === 'dev') await run(process.execPath, ['scripts/vendor.mjs']);
  if (mode === 'build') {
    await run(process.execPath, ['scripts/build-motion.mjs']);
    await run(hugo, ['--environment', 'production', '--destination', 'public', '--cleanDestinationDir', '--minify']);
    await run('python3', ['scripts/check-public.py']);
  } else if (mode === 'dev') {
    bundler = await context({ ...motionOptions, logLevel: 'info' });
    await bundler.rebuild(); // Do not start Hugo with a broken or stale island.
    await bundler.watch();
    await run(hugo, ['server', '--environment', 'development', '--bind', '127.0.0.1', '--port', '1314', '--baseURL', 'http://localhost:1314/', '--destination', '.dev-public', '--disableFastRender']);
    await stop(0);
  } else throw new Error('Usage: node scripts/local.mjs dev|build');
} catch (error) {
  console.error(error.message);
  await stop(1);
}
