import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(new URL('currency-converter/', output), { recursive: true });
for (const file of ['index.html', '.nojekyll', ...['index.html', 'styles.css', 'app.js', 'converter.js', 'icon.svg'].map((name) => `currency-converter/${name}`)]) {
  await cp(new URL(file, root), new URL(file, output));
}
console.log(`Static site built: ${fileURLToPath(output)}`);
