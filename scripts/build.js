// Bundle the server into dist/cli.js: one file, no node_modules needed at run time, so the
// Claude Code plugin starts from a plain clone. CI rebuilds it and fails if it differs.
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {build} from 'esbuild';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const result = await build({
  entryPoints: [join(root, 'src/cli.js')],
  outfile: join(root, 'dist/cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning'
});

// MIT and similar licences ask that the notice travels with the code: collect one per package.
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /.*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) packages.add(m[1]);
}
const notices = [...packages].sort().map(name => {
  const dir = join(root, 'node_modules', name);
  const {version, license} = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find(f => /^licen[cs]e/i.test(f));
  const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `License: ${license}`;
  return `${name}@${version} (${license})\n\n${text}\n`;
});
writeFileSync(
  join(root, 'dist/THIRD_PARTY_LICENSES.txt'),
  `dist/cli.js bundles these packages. Their licences follow.\n\n${notices.join('\n---\n\n')}`
);
process.stdout.write(`dist/cli.js built with ${packages.size} bundled packages: ${[...packages].sort().join(', ')}\n`);
