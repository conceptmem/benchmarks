import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const spec = JSON.parse(await readFile(path.join(root, 'longmemeval-s/dataset.json'), 'utf8'));
const selected = [
  {
    id: 'final-lexical',
    label: 'Historical lexical retrieval',
    mode: 'lexical',
    status: 'historical',
  },
  {
    id: 'final-semantic',
    label: 'Historical Gemini embedding reranking',
    mode: 'reranking',
    status: 'historical',
  },
  {
    id: 'clean-20261019-lexical',
    label: 'Lexical retrieval',
    mode: 'lexical',
    status: 'clean',
  },
  {
    id: 'clean-20261019-embeddinggemma2-q8',
    label: 'Lexical + EmbeddingGemma 2 Q8_0 reranking',
    mode: 'reranking',
    status: 'clean',
  },
];
const datasetPath = `data/longmemeval/${spec.filename}`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const percent = (value) => `${(value * 100).toFixed(2)}%`;

function renderReport(run, summary) {
  const { config, session: metrics } = summary;
  const lines = [
    `# LongMemEval-S: ${run.label}`,
    '',
    'This report is generated from the imported `summary.json`; per-question rankings are in `results.jsonl`.',
    '',
    `- Dataset: \`${datasetPath}\``,
    `- Dataset SHA-256: \`${config.datasetSha256}\``,
    `- Started: ${config.startedAt}`,
    `- Recorded engine revision: \`${config.commit}\` (${config.commit.endsWith('+dirty') ? 'includes uncommitted changes' : 'clean committed source'}).`,
    `- Storage: private engine implementation; granularity: ${config.granularity}; roles: ${config.roles}; concurrency: ${config.concurrency}.`,
    `- Selection: ${config.selection}.`,
    '- Question date supplied as the search reference time; fuzzy matching disabled.',
    ...(config.search.semantic
      ? [
          `- Embedding reranking: ${config.search.semantic.model}, ${config.search.semantic.dimensions} dimensions.`,
        ]
      : ['- No embedding model or generative model used in this retrieval run.']),
    '',
    '## Session retrieval',
    '',
    'hit@k asks whether at least one gold evidence session appears in the first k results. These are retrieval metrics, not generated-answer accuracy.',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    ...[1, 3, 5, 10, 30, 50].flatMap((k) => [
      `| hit@${k} | ${percent(metrics[`hit@${k}`])} |`,
      `| recall_all@${k} | ${percent(metrics[`recall_all@${k}`])} |`,
      `| nDCG@${k} | ${metrics[`ndcg@${k}`].toFixed(6)} |`,
    ]),
    '',
    '## By question type',
    '',
    '| Type | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(summary.byType).map(
      ([type, group]) =>
        `| ${type} | ${group.questions} | ${percent(group.session['hit@1'])} | ${percent(group.session['hit@5'])} | ${percent(group.session['recall_all@5'])} | ${group.session['ndcg@5'].toFixed(6)} |`,
    ),
    '',
    '## Recorded timings and context',
    '',
    `- Search: p50 ${summary.searchMs.p50} ms; p95 ${summary.searchMs.p95} ms.`,
    `- Mean ingestion and indexing time per question: ${summary.ingestMsMean.toFixed(2)} ms.`,
    `- Mean documents per question: ${summary.docsMean.toFixed(2)}.`,
    `- Mean top-5 context size: approximately ${Math.round(summary.contextTokensAt5Mean)} tokens (characters / 4).`,
    `- Skipped writes: ${summary.skippedWrites}; failed questions: ${summary.errors.length}.`,
    '',
    'Search timings exclude setup, ingestion and document indexing. These are internal harness timings, not hosted API or AWS Lambda latency. Embedding cache hits can reduce query time; per-request hit rates were not recorded.',
    ...(config.environment
      ? [
          '',
          '## Execution environment',
          '',
          `- Node: ${config.environment.node}; platform: ${config.environment.platform}; architecture: ${config.environment.architecture}.`,
          `- CPU: ${config.environment.cpu}; RAM: ${(config.environment.memoryBytes / 1024 ** 3).toFixed(2)} GiB.`,
        ]
      : []),
    ...(config.search.semantic?.local
      ? [
          '',
          '## Local embedding model',
          '',
          `- Weights: ${config.search.semantic.local.artifact.repository} / ${config.search.semantic.local.artifact.filename}, revision \`${config.search.semantic.local.artifact.revision}\`.`,
          `- SHA-256: \`${config.search.semantic.local.artifact.sha256}\` (${config.search.semantic.local.artifact.bytes} bytes).`,
          `- Runtime: ${config.search.semantic.local.runtime.name} ${config.search.semantic.local.runtime.version}; device: ${config.search.semantic.local.runtime.device}.`,
          `- Runtime arguments: \`${config.search.semantic.local.runtime.arguments.join(' ')}\`.`,
          `- Embedding cache at start: ${config.search.semantic.cache.vectorsAtStart} vectors; populated and reused within this run.`,
          `- Client batching: ${config.search.semantic.requests.maxTexts} texts / ${config.search.semantic.requests.maxChars} characters maximum; ${config.search.semantic.requests.concurrency} request(s) per question in flight.`,
          '- Query prefix: `task: search result | query: `; document prefix: `title: none | text: `. Output: 768 finite values, L2-normalized.',
          '- Existing reranking parameters: up to 100 lexical candidates; at most 1500 characters per non-overlapping chunk; maximum chunk cosine per candidate; semantic weight 0.85. The best 50 sessions are retained.',
          '- These parameters were not retuned for Q8. The recorded engine source documents an earlier 120-question LongMemEval pilot used to select the semantic weight; no separate held-out tuning split is established.',
          '- The benchmark refuses a semantic run if a nonempty search falls back to lexical-only ranking.',
        ]
      : []),
    '',
    'The private engine and execution harness are not distributed here. Published rankings and metric aggregation can be checked independently; an exact engine rerun is not provided. See the root README for methodology and provenance limits.',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--source') {
    throw new Error(
      'Usage: node scripts/prepare-longmemeval.mjs --source <longmemeval-results-directory>',
    );
  }
  const source = path.resolve(args[1]);
  // Validate all selected inputs before creating publication files.
  const prepared = await Promise.all(
    selected.map(async (run) => {
      const originals = {};
      for (const name of ['config.json', 'summary.json', 'results.jsonl', 'report.md']) {
        originals[name] = await readFile(path.join(source, run.id, name));
      }
      const config = JSON.parse(originals['config.json']);
      const summary = JSON.parse(originals['summary.json']);
      assert.deepEqual(summary.config, config, `${run.id}: config differs from summary`);
      assert.equal(config.datasetSha256, spec.sha256, `${run.id}: unexpected dataset`);
      assert.equal(summary.questions, spec.retrievalQuestions, `${run.id}: incomplete run`);
      assert.equal(summary.scored, spec.retrievalQuestions, `${run.id}: incomplete scoring`);
      assert.equal(summary.retrievalQuestions, spec.retrievalQuestions);
      assert.deepEqual(summary.errors, []);
      assert.equal(config.granularity, 'session');
      assert.equal(config.roles, 'all');
      assert.equal(typeof config.storage, 'string', `${run.id}: missing storage provenance`);
      assert(config.storage.length > 0, `${run.id}: missing storage provenance`);
      assert.equal(config.search.referenceTime, true);
      assert.equal(config.search.fuzzy, false);
      assert.equal(Boolean(config.search.semantic), run.mode === 'reranking');
      assert.equal(config.qa, undefined);
      assert.equal(config.extraction, undefined);
      if (run.status === 'clean') {
        assert.match(
          config.commit,
          /^[a-f0-9]{40}$/,
          `${run.id}: source must be clean and committed`,
        );
        assert.equal(config.concurrency, 4);
      }
      if (config.search.semantic?.local) {
        assert.equal(config.search.semantic.local.artifact.quantization, 'Q8_0');
        assert.equal(
          config.search.semantic.cache.vectorsAtStart,
          0,
          'Clean Q8 run must start with an empty cache',
        );
        config.search.semantic.cache.file = `data/longmemeval/embeddings/${path.win32.basename(config.search.semantic.cache.file)}`;
      }
      config.dataset = datasetPath;
      config.storage = 'internal';
      if (config.environment?.cpu) config.environment.cpu = config.environment.cpu.trim();
      summary.config = config;
      const files = {
        'config.json': Buffer.from(`${JSON.stringify(config, null, 2)}\n`),
        'summary.json': Buffer.from(`${JSON.stringify(summary, null, 2)}\n`),
        'results.jsonl': originals['results.jsonl'],
        'report.md': Buffer.from(renderReport(run, summary)),
      };
      for (const [name, content] of Object.entries(files)) {
        assert(
          !/[A-Za-z]:\\|\/Users\/|\/home\//.test(content.toString()),
          `${run.id}/${name}: absolute local path`,
        );
      }
      return { run, originals, files };
    }),
  );

  const validationPath = 'longmemeval-s/validation.json';
  const validationBytes = await readFile(path.join(root, validationPath));
  const validation = JSON.parse(validationBytes);
  assert.equal(validation.source.clean, true);
  for (const { run, files } of prepared.filter(({ run }) => run.status === 'clean')) {
    assert.equal(
      JSON.parse(files['config.json']).commit,
      validation.source.commit,
      `${run.id}: validation source differs`,
    );
  }
  const manifest = {
    schemaVersion: 1,
    benchmark: 'LongMemEval-S',
    preparedAt: new Date().toISOString(),
    datasetSha256: spec.sha256,
    validationFile: {
      path: validationPath,
      bytes: validationBytes.length,
      sha256: digest(validationBytes),
    },
    sourceDirectory: 'packages/benchmark/longmemeval-results',
    transformations: [
      'config.json and summary.json: dataset path replaced with a repository-relative path; JSON formatted.',
      'Local embedding cache paths are normalized to a repository-relative path.',
      'Storage implementation details are omitted; internal denotes private engine storage, not a vendor or a hosted deployment.',
      'CPU descriptions are trimmed; public run identifiers omit implementation details.',
      'report.md: regenerated from the imported summary with methodology and timing qualifications.',
      'results.jsonl: copied byte-for-byte from the source run.',
    ],
    runs: [],
  };
  for (const { run, originals, files } of prepared) {
    const directory = `longmemeval-s/runs/${run.id}`;
    await mkdir(path.join(root, directory), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(root, directory, name), content);
    }
    manifest.runs.push({
      ...run,
      directory,
      sourceSha256: Object.fromEntries(
        Object.entries(originals).map(([name, bytes]) => [name, digest(bytes)]),
      ),
      files: Object.fromEntries(
        Object.entries(files).map(([name, bytes]) => [
          name,
          { bytes: bytes.length, sha256: digest(bytes) },
        ]),
      ),
    });
    console.log(`Prepared ${directory}`);
  }
  await writeFile(
    path.join(root, 'longmemeval-s/manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const clean = prepared.filter(({ run }) => run.status === 'clean');
  assert.equal(
    new Set(clean.map(({ files }) => JSON.parse(files['config.json']).commit)).size,
    1,
    'Clean runs must use the same source commit',
  );
  const table = [
    '| Method | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 | Report |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...clean.map(({ run, files }) => {
      const summary = JSON.parse(files['summary.json']);
      return `| ${run.label} | ${summary.questions} | ${percent(summary.session['hit@1'])} | **${percent(summary.session['hit@5'])}** (${Math.round(summary.session['hit@5'] * summary.questions)}/${summary.questions}) | ${percent(summary.session['recall_all@5'])} | ${summary.session['ndcg@5'].toFixed(6)} | [Report](longmemeval-s/runs/${run.id}/report.md) |`;
    }),
  ].join('\n');
  const readmeFile = path.join(root, 'README.md');
  const readme = await readFile(readmeFile, 'utf8');
  assert(readme.includes('<!-- results:start -->') && readme.includes('<!-- results:end -->'));
  await writeFile(
    readmeFile,
    readme.replace(
      /<!-- results:start -->[\s\S]*?<!-- results:end -->/,
      `<!-- results:start -->\n\n${table}\n\n<!-- results:end -->`,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
