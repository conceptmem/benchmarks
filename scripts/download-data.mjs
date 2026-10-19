import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const spec = JSON.parse(await readFile(path.join(root, 'longmemeval-s/dataset.json'), 'utf8'));

async function matches(file) {
  if ((await stat(file)).size !== spec.bytes) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex') === spec.sha256;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--from')) {
    throw new Error('Usage: node scripts/download-data.mjs [--from <existing-dataset-file>]');
  }
  const target = path.join(root, 'data/longmemeval', spec.filename);
  await mkdir(path.dirname(target), { recursive: true });
  if (existsSync(target)) {
    if (!(await matches(target)))
      throw new Error(`Existing dataset failed verification: ${target}`);
    console.log(`Dataset already present; size and SHA-256 verified: ${target}`);
    return;
  }

  let source;
  if (args.length) {
    const input = path.resolve(args[1]);
    console.log(`Importing local dataset: ${input}`);
    source = createReadStream(input);
  } else {
    console.log(`Downloading ${spec.bytes} bytes from pinned upstream revision ${spec.revision}`);
    const response = await fetch(spec.url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
    source = Readable.fromWeb(response.body);
  }

  const partial = `${target}.${randomUUID()}.part`;
  const hash = createHash('sha256');
  let bytes = 0;
  const check = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > spec.bytes) return callback(new Error('Dataset exceeds its expected size'));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(source, check, createWriteStream(partial, { flags: 'wx' }));
    const digest = hash.digest('hex');
    if (bytes !== spec.bytes || digest !== spec.sha256) {
      throw new Error(`Dataset verification failed: ${bytes} bytes, SHA-256 ${digest}`);
    }
    // Another process may have completed the same download while this one was running.
    if (existsSync(target)) {
      if (!(await matches(target))) throw new Error('Another process created an invalid dataset');
    } else {
      await rename(partial, target);
    }
    console.log(`Dataset ready; size and SHA-256 verified: ${target}`);
  } finally {
    await rm(partial, { force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
