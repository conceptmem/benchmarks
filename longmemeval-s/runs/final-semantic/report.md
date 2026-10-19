# LongMemEval-S: Historical Gemini embedding reranking

This report is generated from the imported `summary.json`; per-question rankings are in `results.jsonl`.

- Dataset: `data/longmemeval/longmemeval_s_cleaned.json`
- Dataset SHA-256: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
- Started: 2026-10-16T22:14:57.518Z
- Recorded engine revision: `bccef5d+dirty` (includes uncommitted changes).
- Storage: private engine implementation; granularity: session; roles: all; concurrency: 4.
- Selection: 470 of 500 questions (30 abstention left out).
- Question date supplied as the search reference time; fuzzy matching disabled.
- Embedding reranking: gemini-embedding-001, 768 dimensions.

## Session retrieval

hit@k asks whether at least one gold evidence session appears in the first k results. These are retrieval metrics, not generated-answer accuracy.

| Metric | Value |
| --- | ---: |
| hit@1 | 92.55% |
| recall_all@1 | 32.98% |
| nDCG@1 | 0.925532 |
| hit@3 | 98.94% |
| recall_all@3 | 86.17% |
| nDCG@3 | 0.949477 |
| hit@5 | 99.57% |
| recall_all@5 | 93.62% |
| nDCG@5 | 0.957447 |
| hit@10 | 99.79% |
| recall_all@10 | 97.45% |
| nDCG@10 | 0.963689 |
| hit@30 | 100.00% |
| recall_all@30 | 98.51% |
| nDCG@30 | 0.965141 |
| hit@50 | 100.00% |
| recall_all@50 | 98.51% |
| nDCG@50 | 0.965141 |

## By question type

| Type | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| knowledge-update | 72 | 97.22% | 100.00% | 98.61% | 0.980241 |
| multi-session | 121 | 94.21% | 100.00% | 89.26% | 0.933836 |
| single-session-assistant | 56 | 100.00% | 100.00% | 100.00% | 1.000000 |
| single-session-preference | 30 | 80.00% | 96.67% | 96.67% | 0.966667 |
| single-session-user | 64 | 93.75% | 100.00% | 100.00% | 0.991104 |
| temporal-reasoning | 127 | 87.40% | 99.21% | 88.19% | 0.929118 |

## Recorded timings and context

- Search: p50 28.6 ms; p95 62.1 ms.
- Mean ingestion and indexing time per question: 1914.44 ms.
- Mean documents per question: 47.70.
- Mean top-5 context size: approximately 16359 tokens (characters / 4).
- Skipped writes: 0; failed questions: 0.

Search timings exclude setup, ingestion and document indexing. These are internal harness timings, not hosted API or AWS Lambda latency. Embedding cache hits can reduce query time; per-request hit rates were not recorded.

The private engine and execution harness are not distributed here. Published rankings and metric aggregation can be checked independently; an exact engine rerun is not provided. See the root README for methodology and provenance limits.
