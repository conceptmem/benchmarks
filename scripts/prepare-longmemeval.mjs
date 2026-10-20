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
    label: 'Lexical retrieval (2026-10-19 engine)',
    mode: 'lexical',
    status: 'historical',
  },
  {
    id: 'clean-20261019-embeddinggemma2-q8',
    label: 'Lexical + EmbeddingGemma 2 Q8_0 reranking (2026-10-19 engine)',
    mode: 'reranking',
    status: 'historical',
  },
  {
    id: 'clean-20261020-lexical',
    label: 'Lexical retrieval',
    mode: 'lexical',
    status: 'clean',
  },
  {
    id: 'clean-20261020-embeddinggemma2-q8',
    label: 'Lexical + EmbeddingGemma 2 Q8_0 reranking',
    mode: 'reranking',
    status: 'clean',
  },
  {
    id: 'clean-20261020-lexical-qa',
    label: 'Answers from lexical retrieval',
    mode: 'qa',
    retrieval: 'lexical',
    status: 'clean',
  },
  {
    id: 'clean-20261020-embeddinggemma2-q8-qa',
    label: 'Answers from lexical + EmbeddingGemma 2 Q8_0 reranking',
    mode: 'qa',
    retrieval: 'reranking',
    status: 'clean',
  },
];
/** The answer model, reader and judge alike, of every published QA run. */
const QA_MODEL = 'gemini-3.5-flash-lite';
const filesOf = (run) =>
  run.mode === 'qa'
    ? ['config.json', 'summary.json', 'results.jsonl', 'report.md', 'hypotheses.jsonl']
    : ['config.json', 'summary.json', 'results.jsonl', 'report.md'];
const datasetPath = `data/longmemeval/${spec.filename}`;

/** A local path as it reads in text: a Windows drive, or a macOS or Linux home directory. */
const LOCAL_PATH = /(?<![A-Za-z])[A-Za-z]:\\(?=[^\\\s])|\/Users\/|\/home\//;

/** Every string a JSON value holds, keys included. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) out.push(key), strings(item, out);
  return out;
}

/**
 * Whether a published file names a local path. JSON is read decoded: its raw text writes a line
 * break as backslash-n, so an answer saying "Answer:" before a new line looked like a drive.
 */
function hasLocalPath(name, content) {
  const text = content.toString();
  if (!/\.jsonl?$/.test(name)) return LOCAL_PATH.test(text);
  const values = name.endsWith('.jsonl')
    ? text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line))
    : [JSON.parse(text)];
  return values.some((value) => strings(value).some((s) => LOCAL_PATH.test(s)));
}
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
      : ['- No embedding model or generative model used in retrieval.']),
    ...(config.qa
      ? [
          `- Answers: reader and judge ${config.qa.provider} ${config.qa.model}, thinking ${config.qa.thinking}; prompts ${config.qa.readerVersion} and ${config.qa.judgeVersion}; context: the first ${config.qa.k} retrieved sessions.`,
        ]
      : []),
    ...(summary.qa
      ? [
          '',
          '## Answer accuracy',
          '',
          `The reader answers each question from the first ${config.qa.k} sessions retrieval ranked, and the judge grades the answer against the reference. Both are ${config.qa.model} under this harness's own prompts, not LongMemEval's GPT-4o judge: compare these figures between ConceptMem runs, not with accuracies published elsewhere. Abstention questions are graded on whether the answer declines.`,
          '',
          `- Overall: ${percent(summary.qa.accuracy)} (${summary.qa.correct}/${summary.qa.questions}); a failed or unanswered question counts as incorrect.`,
          `- Task-averaged: ${percent(summary.qa.taskAveraged)}.`,
          `- Abstention: ${percent(summary.qa.abstention.accuracy)} (${summary.qa.abstention.correct}/${summary.qa.abstention.questions}).`,
          `- Reader context: approximately ${Math.round(summary.qa.contextTokensMean)} tokens per question (characters / 4).`,
          `- Tokens: ${summary.qa.usage.inputTokens} input, ${summary.qa.usage.outputTokens} output, ${summary.qa.usage.thinkingTokens} thinking${summary.qa.costUsd !== undefined ? `; about US$${summary.qa.costUsd.toFixed(2)} at list price` : ''}.`,
          '',
          '| Type | Questions | Correct | Accuracy |',
          '| --- | ---: | ---: | ---: |',
          ...Object.entries(summary.qa.byType).map(
            ([type, group]) =>
              `| ${type} | ${group.questions} | ${group.correct} | ${percent(group.accuracy)} |`,
          ),
          '',
          'Each answer is in `hypotheses.jsonl`, and each grade, with the judge\'s reason, in `results.jsonl` (`qa_correct`, `qa_reason`).',
        ]
      : []),
    '',
    `## Session retrieval${summary.qa ? ` (${summary.retrievalQuestions} questions, abstention excluded)` : ''}`,
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
      for (const name of filesOf(run)) {
        originals[name] = await readFile(path.join(source, run.id, name));
      }
      const config = JSON.parse(originals['config.json']);
      const summary = JSON.parse(originals['summary.json']);
      const qa = run.mode === 'qa';
      // A QA run answers the abstention questions too; retrieval is scored without them.
      const questions = qa ? spec.questions : spec.retrievalQuestions;
      assert.deepEqual(summary.config, config, `${run.id}: config differs from summary`);
      assert.equal(config.datasetSha256, spec.sha256, `${run.id}: unexpected dataset`);
      assert.equal(summary.questions, questions, `${run.id}: incomplete run`);
      assert.equal(summary.scored, questions, `${run.id}: incomplete scoring`);
      assert.equal(summary.retrievalQuestions, spec.retrievalQuestions);
      assert.deepEqual(summary.errors, []);
      assert.equal(config.granularity, 'session');
      assert.equal(config.roles, 'all');
      assert.equal(typeof config.storage, 'string', `${run.id}: missing storage provenance`);
      assert(config.storage.length > 0, `${run.id}: missing storage provenance`);
      assert.equal(config.search.referenceTime, true);
      assert.equal(config.search.fuzzy, false);
      assert.equal(
        Boolean(config.search.semantic),
        (qa ? run.retrieval : run.mode) === 'reranking',
      );
      assert.equal(config.extraction, undefined);
      if (qa) {
        assert.equal(config.qa?.provider, 'gemini', `${run.id}: QA provider`);
        assert.equal(config.qa.model, QA_MODEL, `${run.id}: QA model`);
        assert.equal(config.qa.context, 'retrieved');
        assert.equal(config.qa.k, 5);
        assert.equal(summary.qa?.questions, spec.questions, `${run.id}: incomplete answers`);
        config.qa.cache = `data/longmemeval/qa/${path.win32.basename(config.qa.cache)}`;
      } else {
        assert.equal(config.qa, undefined);
      }
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
        // The retrieval run measures the model from an empty cache; its QA run reuses the
        // vectors it left, which changes no ranking and is recorded.
        if (!qa)
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
        ...(qa ? { 'hypotheses.jsonl': originals['hypotheses.jsonl'] } : {}),
      };
      for (const [name, content] of Object.entries(files)) {
        assert(!hasLocalPath(name, content), `${run.id}/${name}: absolute local path`);
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
    schemaVersion: 2,
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
      'hypotheses.jsonl (QA runs): copied byte-for-byte from the source run.',
      'QA answer cache paths are normalized to a repository-relative path.',
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
    ...clean
      .filter(({ run }) => run.mode !== 'qa')
      .map(({ run, files }) => {
        const summary = JSON.parse(files['summary.json']);
        return `| ${run.label} | ${summary.questions} | ${percent(summary.session['hit@1'])} | **${percent(summary.session['hit@5'])}** (${Math.round(summary.session['hit@5'] * summary.questions)}/${summary.questions}) | ${percent(summary.session['recall_all@5'])} | ${summary.session['ndcg@5'].toFixed(6)} | [Report](longmemeval-s/runs/${run.id}/report.md) |`;
      }),
  ].join('\n');
  const qaTable = [
    '| Retrieval | Questions | Accuracy | Task-averaged | Abstention | Reader context | Report |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...clean
      .filter(({ run }) => run.mode === 'qa')
      .map(({ run, files }) => {
        const { qa } = JSON.parse(files['summary.json']);
        return `| ${run.label.replace(/^Answers from (.)/, (_, first) => first.toUpperCase())} | ${qa.questions} | **${percent(qa.accuracy)}** (${qa.correct}/${qa.questions}) | ${percent(qa.taskAveraged)} | ${percent(qa.abstention.accuracy)} (${qa.abstention.correct}/${qa.abstention.questions}) | ~${Math.round(qa.contextTokensMean).toLocaleString('en-US')} tokens | [Report](longmemeval-s/runs/${run.id}/report.md) |`;
      }),
  ].join('\n');
  const readmeFile = path.join(root, 'README.md');
  const readme = await readFile(readmeFile, 'utf8');
  assert(readme.includes('<!-- results:start -->') && readme.includes('<!-- results:end -->'));
  assert(readme.includes('<!-- qa:start -->') && readme.includes('<!-- qa:end -->'));
  await writeFile(
    readmeFile,
    readme
      .replace(
        /<!-- results:start -->[\s\S]*?<!-- results:end -->/,
        `<!-- results:start -->\n\n${table}\n\n<!-- results:end -->`,
      )
      .replace(
        /<!-- qa:start -->[\s\S]*?<!-- qa:end -->/,
        `<!-- qa:start -->\n\n${qaTable}\n\n<!-- qa:end -->`,
      ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
