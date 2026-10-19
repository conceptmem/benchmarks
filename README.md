# ConceptMem Benchmarks

Public benchmark results and evaluation methodology for [ConceptMem](https://conceptmem.dev),
a managed ontological database for applications and AI agents.

This repository contains **LongMemEval-S session-retrieval runs**, including a clean-source
evaluation of the local **EmbeddingGemma 2 Q8_0** model and its lexical control.
It contains configurations, per-question rankings, summaries and reports.
The scripts verify those artifacts and acquire the upstream dataset independently of the
private ConceptMem engine.

## LongMemEval-S results

All runs evaluate the same **470 non-abstention questions** from the 500-question cleaned
release. Each question is evaluated against its own conversation history. The 30 abstention
questions are excluded from retrieval evaluation, following the
[upstream retrieval protocol](https://github.com/xiaowu0162/LongMemEval#memory-retrieval).

<!-- results:start -->

| Method | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 | Report |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Lexical retrieval | 470 | 89.36% | **98.09%** (461/470) | 86.81% | 0.908646 | [Report](longmemeval-s/runs/clean-20261019-lexical/report.md) |
| Lexical + EmbeddingGemma 2 Q8_0 reranking | 470 | 90.00% | **99.15%** (466/470) | 91.91% | 0.938754 | [Report](longmemeval-s/runs/clean-20261019-embeddinggemma2-q8/report.md) |

<!-- results:end -->

**hit@5 measures evidence retrieval, not answer accuracy.** It is the share of questions for
which at least one gold evidence session is in the first five retrieved sessions. A question
that needs several evidence sessions can pass hit@5 without retrieving all of them. The
reports also give `recall_all@k` and nDCG.

These are internal ConceptMem evaluations, not an official LongMemEval leaderboard entry or
a comparison against other products. No generated answers or LLM-judge scores are included.

## Methodology

- **Dataset:** `longmemeval_s_cleaned.json` from
  [xiaowu0162/longmemeval-cleaned](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned),
  pinned to revision `98d7416c24c778c2fee6e6f3006e7a073259d48f`.
- **Corpus:** one document per session, containing the nonempty user and assistant messages
  joined in conversation order. Each question uses an isolated store. Session IDs are
  provenance identifiers, not indexed text.
- **Write path:** session documents are submitted as observations through consolidation.
  These runs exercise transcript retrieval; they do not evaluate LLM extraction into a
  domain ontology or consolidation quality.
- **Query:** the question text, with its question date supplied as the search reference time.
  No answer text or evidence labels are supplied to retrieval. Gold session IDs are used
  only to score the returned rankings.
- **Configuration:** private engine storage, session granularity, both message roles, concurrency
  4, fuzzy matching disabled. See each run's `config.json` for recorded settings.
  This differs from the [upstream flat retrieval baseline](https://github.com/xiaowu0162/LongMemEval/blob/main/src/retrieval/run_retrieval.py),
  which indexes user messages only and excludes questions without user-side evidence.
  Scores require matching corpus and question-selection protocols for direct comparison.
- **Lexical run:** term-based retrieval without an embedding or generative model.
- **Clean reranking run:** lexical candidates reordered with
  [`unsloth/embeddinggemma-2-GGUF`](https://huggingface.co/unsloth/embeddinggemma-2-GGUF),
  file `embeddinggemma-2-Q8_0.gguf`, at 768 dimensions. Embeddings rerank lexical candidates;
  this is not vector retrieval. Runtime version, weights SHA-256 and device are recorded in
  the configuration. No model weights or private service implementation are distributed here.
- **Reranking parameters:** up to 100 lexical candidates, with the best 50 retained in the
  published rankings. Transcripts are split into non-overlapping chunks of at most 1,500
  characters at line or word boundaries. Each candidate uses its highest chunk cosine
  similarity, combined with its lexical score using the existing semantic weight of 0.85.
  The lexical control returns its best 50 candidates without embedding reranking.
- **Input formatting:** queries use `task: search result | query: ` and document chunks use
  `title: none | text: `. Vectors are checked for 768 finite values and L2-normalized. The
  embedding cache starts empty, is isolated from the pilot and Gemini caches, and is reused
  for repeated inputs within the full run. The Q8 run uses the engine's existing reranking
  parameters; they were not retuned for this model.
  The inference server and model are already loaded before the full run; an empty embedding
  cache does not mean a cold model process.
- **Scoring:** up to 50 distinct ranked session IDs per question. `hit@k` is 1 when any gold
  session is present; `recall_all@k` is 1 when every gold session is present. nDCG uses binary
  relevance and the upstream discount: rank 1 has weight 1, ranks 2 and onward use
  `1 / log2(rank)`. Metrics are averaged over questions, also grouped by question type.

Per-question data is in `results.jsonl`; aggregate metrics, errors and skipped writes are
reported in `summary.json`. The publication script refuses incomplete runs or failed questions.

## Verify the published results

Requires **Node.js 20 or later**. There are no npm dependencies, API credentials or database
requirements for verification.

```sh
node scripts/verify.mjs
```

This checks publication checksums, unique question IDs, matching selections across runs,
every recorded per-question retrieval metric, aggregate and per-type metrics, and timing
summaries. It recomputes scores from the published rankings and gold IDs.

To additionally check questions, gold evidence IDs and ranked-session membership against
the exact upstream release, obtain the dataset and run:

```sh
node scripts/download-data.mjs
node --max-old-space-size=4096 scripts/verify.mjs --dataset data/longmemeval/longmemeval_s_cleaned.json
```

The download is 277,383,467 bytes (about 265 MiB). The script verifies both byte size and
SHA-256 before accepting the file. The full dataset stays under the Git-ignored `data/`
directory. To reuse an existing local copy:

```sh
node scripts/download-data.mjs --from /path/to/longmemeval_s_cleaned.json
```

The expected upstream metadata and checksum are recorded in
[`longmemeval-s/dataset.json`](longmemeval-s/dataset.json).

## Provenance and reproduction limits

The two clean runs use the same full Git commit ID and an isolated source checkout with no
uncommitted changes. The harness refuses to start a clean run from a dirty checkout. The
Q8 model and runtime are pinned; cache-at-start and host details are recorded. A 12-question
integration pilot preceded the full evaluation; it used a separate cache. No retrieval
hyperparameters were selected from that pilot's scores. The artifacts do not establish a
separate held-out tuning split for the existing retrieval implementation. In particular,
the recorded engine source documents that its existing semantic weight of 0.85 was selected
in an earlier 120-question LongMemEval pilot. Treat these as development benchmark results;
the clean checkout and empty cache establish execution provenance, not a held-out evaluation.

[Validation metadata](longmemeval-s/validation.json) records the clean source tree, dependency
lockfile checksum, runtime download checksums and benchmark checks. Storage implementation
details are omitted from the public artifacts.

Two October 16 historical runs are retained separately:
[lexical](longmemeval-s/runs/final-lexical/report.md) and
[Gemini reranking](longmemeval-s/runs/final-semantic/report.md).
They record **`bccef5d+dirty`**, so their exact source state cannot be recovered from that
commit identifier alone. They are not the clean control for the Q8 run.

Search timings cover the internal search call, excluding setup, ingestion and document
indexing. The reranking harness can serve query embeddings from its cache, whose hit rates
were not recorded. These timings do not represent hosted REST, MCP or AWS Lambda latency.
The local Q8 evaluation uses a GPU; its speed does not predict a CPU-only Lambda deployment.
Context token counts are estimates based on four characters per token.

This repository supports **independent verification of the published rankings and score
aggregation**. It does not provide an exact engine rerun. The managed service's engine and
internal execution harness remain private; there is no self-hosted server distribution here.

The [publication manifest](longmemeval-s/manifest.json) records source and published file
SHA-256 hashes and the export transformations. Per-question JSONL files are copied
byte-for-byte. Machine-specific dataset paths are normalized in JSON configurations and
summaries, and public reports are regenerated from the summaries.
Storage labels are normalized to `internal`, and public run names omit storage implementation
details. These are local evaluations of the private engine; the label does not identify a
storage vendor or describe a hosted API run.

Maintainers with access to the original run outputs can refresh the selected artifacts by
staging the source outputs under the public run identifiers listed below, then running:

```sh
node scripts/prepare-longmemeval.mjs --source /path/to/longmemeval-results
node scripts/verify.mjs
```

## Layout

```text
longmemeval-s/
  dataset.json       # Pinned upstream dataset metadata
  manifest.json      # Import provenance and file checksums
  runs/
    clean-20261019-lexical/
    clean-20261019-embeddinggemma2-q8/
    final-lexical/                          # Historical, dirty source
    final-semantic/                         # Historical Gemini run
scripts/
  download-data.mjs
  prepare-longmemeval.mjs
  verify.mjs
third-party/
  longmemeval-LICENSE.txt
```

## Attribution

LongMemEval was introduced by Di Wu, Hongwei Wang, Wenhao Yu, Yuwei Zhang, Kai-Wei Chang
and Dong Yu in [LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive
Memory](https://arxiv.org/abs/2410.10813), ICLR 2025.

The [upstream project](https://github.com/xiaowu0162/LongMemEval) and cleaned dataset identify
their license as MIT. Benchmark question text appearing in the result files comes from
that dataset. The upstream copyright and license notice are preserved in
[`third-party/longmemeval-LICENSE.txt`](third-party/longmemeval-LICENSE.txt).

EmbeddingGemma 2 is a Google DeepMind model; the GGUF quantization used here is distributed
by Unsloth. See the [Google model card](https://huggingface.co/google/embeddinggemma-2) and
the [Unsloth GGUF repository](https://huggingface.co/unsloth/embeddinggemma-2-GGUF).
