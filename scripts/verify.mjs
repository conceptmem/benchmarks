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
const fileNamesOf = (run) =>
  run.mode === 'qa'
    ? ['config.json', 'hypotheses.jsonl', 'report.md', 'results.jsonl', 'summary.json']
    : ['config.json', 'report.md', 'results.jsonl', 'summary.json'];
const QA_MODEL = 'gemini-3.5-flash-lite';
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
  assert.deepEqual(Object.keys(run.files).sort(), fileNamesOf(run));
  const qa = run.mode === 'qa';
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
      // Only the retrieval run measures the model from an empty cache; its QA run reuses it.
      if (!qa) assert.equal(config.search.semantic.cache.vectorsAtStart, 0);
      assert.equal(config.search.semantic.local.inputFormat, 'embeddinggemma-2-search-v1');
    }
  }
  if (qa) {
    assert.equal(config.qa?.model, QA_MODEL, `${run.id}: QA model`);
    assert.equal(config.qa.context, 'retrieved');
    assert.equal(config.qa.cache, `data/longmemeval/qa/${path.basename(config.qa.cache)}`);
  } else {
    assert.equal(config.qa, undefined, `${run.id}: retrieval run carries QA`);
  }
  assert.equal(config.datasetSha256, spec.sha256);
  assert.equal(config.dataset, `data/longmemeval/${spec.filename}`);
  assert.deepEqual(summary.errors, []);
  const all = (await readFile(path.join(root, run.directory, 'results.jsonl'), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const isAbstention = (row) => Boolean(row.abstention) || row.question_id.endsWith('_abs');
  // A QA run answers every question; retrieval is scored over the non-abstention ones.
  const rows = all.filter((row) => !isAbstention(row));
  assert.equal(all.length, qa ? spec.questions : spec.retrievalQuestions);
  assert.equal(rows.length, spec.retrievalQuestions);
  assert.equal(
    new Set(all.map((row) => row.question_id)).size,
    all.length,
    'Duplicate question IDs',
  );
  for (const key of ['questions', 'scored']) assert.equal(summary[key], all.length);
  assert.equal(summary.retrievalQuestions, rows.length);
  if (qa) verifyAnswers(run, summary, all, isAbstention);
  for (const row of all.filter(isAbstention)) {
    assert.equal(row.error, undefined);
    if (dataset) assert(dataset.get(row.question_id), `${row.question_id}: not upstream`);
  }
  const groups = new Map();
  for (const row of rows) {
    assert.equal(row.error, undefined);
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
  // Timings, matches and writes are over every scored question; context over retrieval ones.
  const times = all.map((row) => row.search_ms).sort((a, b) => a - b);
  for (const p of [50, 95])
    close(summary.searchMs[`p${p}`], times[Math.ceil((p / 100) * times.length) - 1], `p${p}`);
  close(summary.searchMs.mean, mean(times), 'Mean search time');
  close(summary.ingestMsMean, mean(all.map((row) => row.ingest_ms)), 'Mean ingestion time');
  close(
    summary.contextTokensAt5Mean,
    mean(rows.map((row) => row.context_chars_at_5)) / 4,
    'Mean context estimate',
  );
  close(summary.matchedMean, mean(all.map((row) => row.matched)), 'Mean matches');
  close(summary.docsMean, mean(all.map((row) => row.docs)), 'Mean documents');
  assert.equal(
    summary.skippedWrites,
    all.reduce((sum, row) => sum + row.skipped_writes, 0),
  );
  const violations = {};
  for (const row of all)
    for (const [kind, count] of Object.entries(row.violations))
      violations[kind] = (violations[kind] ?? 0) + count;
  assert.deepEqual(summary.violations, violations);
  console.log(
    `${run.id}: ${rows.length} rankings, per-question metrics, aggregates and checksums verified; hit@5 ${(summary.session['hit@5'] * 100).toFixed(2)}%${qa ? `; ${all.length} answers, accuracy ${(summary.qa.accuracy * 100).toFixed(2)}%` : ''}`,
  );
  return {
    retrieval: rows.map((row) => row.question_id).sort(),
    all: all.map((row) => row.question_id).sort(),
  };
}

/** A QA run's grades and answers: every recorded figure recomputed from the per-question rows. */
function verifyAnswers(run, summary, rows, isAbstention) {
  for (const row of rows) {
    assert.equal(typeof row.qa_correct, 'boolean', `${row.question_id}: missing grade`);
    assert.equal(typeof row.hypothesis, 'string', `${row.question_id}: missing answer`);
  }
  const accuracy = (items) => {
    const correct = items.filter((row) => row.qa_correct).length;
    return { questions: items.length, correct, accuracy: items.length ? correct / items.length : 0 };
  };
  const check = (actual, expected, label) => {
    assert.equal(actual.questions, expected.questions, `${label}: questions`);
    assert.equal(actual.correct, expected.correct, `${label}: correct`);
    close(actual.accuracy, expected.accuracy, `${label}: accuracy`);
  };
  check(summary.qa, accuracy(rows), `${run.id} QA`);
  check(summary.qa.abstention, accuracy(rows.filter(isAbstention)), `${run.id} QA abstention`);
  const types = [...new Set(rows.map((row) => row.question_type))].sort();
  assert.deepEqual(Object.keys(summary.qa.byType).sort(), types);
  for (const type of types)
    check(
      summary.qa.byType[type],
      accuracy(rows.filter((row) => row.question_type === type)),
      `${run.id} QA ${type}`,
    );
  close(
    summary.qa.taskAveraged,
    mean(types.map((type) => accuracy(rows.filter((row) => row.question_type === type)).accuracy)),
    `${run.id} QA task-averaged`,
  );
  close(
    summary.qa.contextTokensMean,
    mean(rows.map((row) => row.qa_context_chars ?? 0)) / 4,
    `${run.id} QA context`,
  );
  return rows;
}

/** The answers file of a QA run: one line per question, the answer its results row recorded. */
async function verifyHypotheses(run) {
  const results = (await readFile(path.join(root, run.directory, 'results.jsonl'), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const answers = (await readFile(path.join(root, run.directory, 'hypotheses.jsonl'), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const byId = new Map(answers.map((row) => [row.question_id, row.hypothesis]));
  assert.equal(byId.size, answers.length, `${run.id}: duplicate answers`);
  assert.equal(answers.length, results.length, `${run.id}: answers and results differ in number`);
  for (const row of results)
    assert.equal(byId.get(row.question_id), row.hypothesis, `${row.question_id}: answer differs`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--dataset')) {
    throw new Error('Usage: node scripts/verify.mjs [--dataset <longmemeval_s_cleaned.json>]');
  }
  assert.equal(manifest.schemaVersion, 2);
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
  assert.equal(manifest.runs.length, 8);
  assert.equal(new Set(manifest.runs.map((run) => run.id)).size, manifest.runs.length);
  const dataset = args.length ? await loadDataset(path.resolve(args[1])) : undefined;
  let selection;
  let answered;
  for (const run of manifest.runs) {
    const ids = await verifyRun(run, dataset);
    if (run.mode === 'qa') {
      await verifyHypotheses(run);
      if (answered) assert.deepEqual(ids.all, answered, 'QA runs answered different questions');
      answered = ids.all;
    }
    if (selection)
      assert.deepEqual(ids.retrieval, selection, 'Runs evaluated different question sets');
    selection = ids.retrieval;
  }
  if (dataset) {
    const expectedIds = [...dataset.keys()].filter((id) => !id.endsWith('_abs')).sort();
    assert.deepEqual(
      selection,
      expectedIds,
      'Run selection differs from the full non-abstention dataset',
    );
    assert.deepEqual(answered, [...dataset.keys()].sort(), 'QA runs skip upstream questions');
  }
  const clean = manifest.runs.filter((run) => run.status === 'clean');
  const cleanConfigs = await Promise.all(
    clean.map((run) => readJson(path.join(root, run.directory, 'config.json'))),
  );
  assert.deepEqual(
    clean.map((run) => run.mode).sort(),
    ['lexical', 'qa', 'qa', 'reranking'],
    'Clean runs: one lexical, one reranking and their two QA runs',
  );
  for (const config of cleanConfigs)
    assert.equal(config.commit, validation.source.commit, 'Clean runs use different source commits');
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
