import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('build emits only public site assets and works independently of the current directory', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'tools-build-test-'));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build.mjs', import.meta.url))], { cwd: temp });
    const dist = new URL('../dist/', import.meta.url);
    assert.deepEqual((await readdir(dist)).sort(), ['.nojekyll', 'currency-converter', 'index.html']);
    assert.deepEqual((await readdir(new URL('currency-converter/', dist))).sort(), ['app.js', 'converter.js', 'icon.svg', 'index.html', 'styles.css']);
    const home = await readFile(new URL('index.html', dist), 'utf8');
    assert.match(home, /href="\.\/currency-converter\/"/);
    const page = await readFile(new URL('currency-converter/index.html', dist), 'utf8');
    assert.match(page, /src="\.\/app.js"/);
    assert.match(page, /href="\.\/styles.css"/);
    assert.match(page, /Content-Security-Policy/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
