import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const spec = await readJson(path.join(root, 'longmemeval-s/dataset.json'));
const manifest = await readJson(path.join(root, 'longmemeval-s/manifest.json'));
const ks = [1, 3, 5, 10, 30, 50];
const fileNames = ['config.json', 'report.md', 'results.jsonl', 'summary.json'];
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const dcg = (values) =>
  values.reduce((sum, value, index) => sum + value / (index === 0 ? 1 : Math.log2(index + 1)), 0);

function close(actual, expected, label) {
  assert(Number.isFinite(actual) && Number.isFinite(expected), `${label}: non-finite metric`);
  assert(Math.abs(actual - expected) < 1e-10, `${label}: ${actual} differs from ${expected}`);
}

function metrics(ranked, goldIds) {
  const gold = new Set(goldIds);
  return Object.fromEntries(
    ks.flatMap((k) => {
      const top = ranked.slice(0, k);
      const relevance = top.map((id) => Number(gold.has(id)));
      return [
        [`hit@${k}`, Number(top.some((id) => gold.has(id)))],
        [`recall_all@${k}`, Number([...gold].every((id) => top.includes(id)))],
        [`ndcg@${k}`, dcg(relevance) / dcg(Array(Math.min(k, gold.size)).fill(1))],
      ];
    }),
  );
}

function compareMetrics(actual, expected, label) {
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    `${label}: metric names differ`,
  );
  for (const [key, value] of Object.entries(expected)) close(actual[key], value, `${label} ${key}`);
}

async function loadDataset(file) {
  assert.equal((await stat(file)).size, spec.bytes, 'Dataset byte size differs');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  assert.equal(hash.digest('hex'), spec.sha256, 'Dataset SHA-256 differs');
  const instances = await readJson(file);
  assert.equal(instances.length, spec.questions);
  const map = new Map(instances.map((instance) => [instance.question_id, instance]));
  assert.equal(map.size, spec.questions, 'Dataset has duplicate question IDs');
  assert.equal(
    instances.filter((instance) => instance.question_id.endsWith('_abs')).length,
    spec.excludedAbstentionQuestions,
  );
  console.log(`Verified upstream dataset: ${map.size} questions, exact size and SHA-256`);
  return map;
}

async function verifyRun(run, dataset) {
  assert.match(run.id, /^[a-z0-9-]+$/);
  assert.equal(run.directory, `longmemeval-s/runs/${run.id}`);
  assert.deepEqual(Object.keys(run.files).sort(), fileNames);
  for (const [name, expected] of Object.entries(run.files)) {
    const content = await readFile(path.join(root, run.directory, name));
    assert.equal(content.length, expected.bytes, `${run.id}/${name}: byte size differs`);
    assert.equal(
      createHash('sha256').update(content).digest('hex'),
      expected.sha256,
      `${run.id}/${name}: checksum differs`,
    );
  }
  assert.equal(
    run.files['results.jsonl'].sha256,
    run.sourceSha256['results.jsonl'],
    'Published rankings differ from source bytes',
  );
  const summary = await readJson(path.join(root, run.directory, 'summary.json'));
  const config = await readJson(path.join(root, run.directory, 'config.json'));
  assert.deepEqual(summary.config, config, `${run.id}: config differs from summary`);
  assert.equal(
    config.storage,
    'internal',
    'Public configuration must omit storage implementation details',
  );
  if (run.status === 'clean') {
    assert.match(
      config.commit,
      /^[a-f0-9]{40}$/,
      'Clean run has a dirty or missing source revision',
    );
    assert.equal(config.concurrency, 4);
    assert(config.environment, 'Clean run must record its environment');
    if (config.search.semantic?.local) {
      assert.equal(config.search.semantic.local.artifact.quantization, 'Q8_0');
      assert.equal(
        config.search.semantic.local.artifact.sha256,
        '6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc',
      );
      assert.equal(config.search.semantic.local.dimensions, 768);
      assert.equal(config.search.semantic.cache.vectorsAtStart, 0);
      assert.equal(config.search.semantic.local.inputFormat, 'embeddinggemma-2-search-v1');
    }
  }
  assert.equal(config.datasetSha256, spec.sha256);
  assert.equal(config.dataset, `data/longmemeval/${spec.filename}`);
  assert.deepEqual(summary.errors, []);
  const rows = (await readFile(path.join(root, run.directory, 'results.jsonl'), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  assert.equal(rows.length, spec.retrievalQuestions);
  assert.equal(
    new Set(rows.map((row) => row.question_id)).size,
    rows.length,
    'Duplicate question IDs',
  );
  for (const key of ['questions', 'scored', 'retrievalQuestions'])
    assert.equal(summary[key], rows.length);
  const groups = new Map();
  for (const row of rows) {
    assert.equal(row.error, undefined);
    assert(
      !row.abstention && !row.question_id.endsWith('_abs'),
      'Abstention question in retrieval run',
    );
    assert(row.gold_sessions.length > 0 && row.gold_sessions.every((id) => typeof id === 'string'));
    assert(row.ranked_sessions.every((id) => typeof id === 'string'));
    assert(row.ranked_sessions.length <= 50);
    assert.equal(
      new Set(row.ranked_sessions).size,
      row.ranked_sessions.length,
      'Duplicate ranked session',
    );
    if (dataset) {
      const instance = dataset.get(row.question_id);
      assert(instance, `Question ${row.question_id} is absent from upstream dataset`);
      assert.equal(row.question, instance.question);
      assert.equal(row.question_type, instance.question_type);
      assert.deepEqual(row.gold_sessions, instance.answer_session_ids);
      assert(
        row.ranked_sessions.every((id) => instance.haystack_session_ids.includes(id)),
        `${row.question_id}: ranked session absent from haystack`,
      );
    }
    compareMetrics(row.session, metrics(row.ranked_sessions, row.gold_sessions), row.question_id);
    if (!groups.has(row.question_type)) groups.set(row.question_type, []);
    groups.get(row.question_type).push(row);
  }
  const aggregate = (items) =>
    Object.fromEntries(
      Object.keys(items[0].session).map((key) => [key, mean(items.map((row) => row.session[key]))]),
    );
  compareMetrics(summary.session, aggregate(rows), `${run.id} aggregate`);
  assert.deepEqual(Object.keys(summary.byType).sort(), [...groups.keys()].sort());
  for (const [type, items] of groups) {
    assert.equal(summary.byType[type].questions, items.length);
    compareMetrics(summary.byType[type].session, aggregate(items), `${run.id} ${type}`);
  }
  const times = rows.map((row) => row.search_ms).sort((a, b) => a - b);
  for (const p of [50, 95])
    close(summary.searchMs[`p${p}`], times[Math.ceil((p / 100) * times.length) - 1], `p${p}`);
  close(summary.searchMs.mean, mean(times), 'Mean search time');
  close(summary.ingestMsMean, mean(rows.map((row) => row.ingest_ms)), 'Mean ingestion time');
  close(
    summary.contextTokensAt5Mean,
    mean(rows.map((row) => row.context_chars_at_5)) / 4,
    'Mean context estimate',
  );
  close(summary.matchedMean, mean(rows.map((row) => row.matched)), 'Mean matches');
  close(summary.docsMean, mean(rows.map((row) => row.docs)), 'Mean documents');
  assert.equal(
    summary.skippedWrites,
    rows.reduce((sum, row) => sum + row.skipped_writes, 0),
  );
  const violations = {};
  for (const row of rows)
    for (const [kind, count] of Object.entries(row.violations))
      violations[kind] = (violations[kind] ?? 0) + count;
  assert.deepEqual(summary.violations, violations);
  console.log(
    `${run.id}: ${rows.length} rankings, per-question metrics, aggregates and checksums verified; hit@5 ${(summary.session['hit@5'] * 100).toFixed(2)}%`,
  );
  return rows.map((row) => row.question_id).sort();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--dataset')) {
    throw new Error('Usage: node scripts/verify.mjs [--dataset <longmemeval_s_cleaned.json>]');
  }
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.datasetSha256, spec.sha256);
  assert.equal(manifest.validationFile.path, 'longmemeval-s/validation.json');
  const validationBytes = await readFile(path.join(root, manifest.validationFile.path));
  assert.equal(validationBytes.length, manifest.validationFile.bytes);
  assert.equal(
    createHash('sha256').update(validationBytes).digest('hex'),
    manifest.validationFile.sha256,
  );
  const validation = JSON.parse(validationBytes);
  assert.equal(validation.source.clean, true);
  assert.deepEqual(validation.storage, { implementation: 'private', execution: 'local' });
  assert.equal(
    validation.database,
    undefined,
    'Public metadata must omit storage implementation details',
  );
  assert.equal(manifest.runs.length, 4);
  assert.equal(new Set(manifest.runs.map((run) => run.id)).size, manifest.runs.length);
  const dataset = args.length ? await loadDataset(path.resolve(args[1])) : undefined;
  let selection;
  for (const run of manifest.runs) {
    const ids = await verifyRun(run, dataset);
    if (selection) assert.deepEqual(ids, selection, 'Runs evaluated different question sets');
    selection = ids;
  }
  if (dataset) {
    const expectedIds = [...dataset.keys()].filter((id) => !id.endsWith('_abs')).sort();
    assert.deepEqual(
      selection,
      expectedIds,
      'Run selection differs from the full non-abstention dataset',
    );
  }
  const cleanConfigs = await Promise.all(
    manifest.runs
      .filter((run) => run.status === 'clean')
      .map((run) => readJson(path.join(root, run.directory, 'config.json'))),
  );
  assert.equal(cleanConfigs.length, 2);
  assert.equal(cleanConfigs[0].commit, validation.source.commit);
  assert.equal(
    cleanConfigs[0].commit,
    cleanConfigs[1].commit,
    'Clean runs use different source commits',
  );
  console.log(
    dataset
      ? 'All checks passed, including upstream question and gold-label checks.'
      : 'All artifact checks passed. Use --dataset to also check upstream questions and gold labels.',
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
