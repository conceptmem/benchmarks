# LongMemEval-S: Historical lexical retrieval

This report is generated from the imported `summary.json`; per-question rankings are in `results.jsonl`.

- Dataset: `data/longmemeval/longmemeval_s_cleaned.json`
- Dataset SHA-256: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
- Started: 2026-10-16T22:11:13.477Z
- Recorded engine revision: `bccef5d+dirty` (includes uncommitted changes).
- Storage: private engine implementation; granularity: session; roles: all; concurrency: 4.
- Selection: 470 of 500 questions (30 abstention left out).
- Question date supplied as the search reference time; fuzzy matching disabled.
- No embedding model or generative model used in this retrieval run.

## Session retrieval

hit@k asks whether at least one gold evidence session appears in the first k results. These are retrieval metrics, not generated-answer accuracy.

| Metric | Value |
| --- | ---: |
| hit@1 | 89.36% |
| recall_all@1 | 31.49% |
| nDCG@1 | 0.893617 |
| hit@3 | 96.38% |
| recall_all@3 | 80.43% |
| nDCG@3 | 0.896002 |
| hit@5 | 98.09% |
| recall_all@5 | 86.81% |
| nDCG@5 | 0.908646 |
| hit@10 | 98.51% |
| recall_all@10 | 91.70% |
| nDCG@10 | 0.918162 |
| hit@30 | 100.00% |
| recall_all@30 | 97.87% |
| nDCG@30 | 0.926883 |
| hit@50 | 100.00% |
| recall_all@50 | 98.51% |
| nDCG@50 | 0.927511 |

## By question type

| Type | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| knowledge-update | 72 | 97.22% | 100.00% | 98.61% | 0.979331 |
| multi-session | 121 | 90.91% | 98.35% | 74.38% | 0.862605 |
| single-session-assistant | 56 | 98.21% | 100.00% | 100.00% | 1.000000 |
| single-session-preference | 30 | 60.00% | 86.67% | 86.67% | 0.823085 |
| single-session-user | 64 | 95.31% | 100.00% | 100.00% | 0.979571 |
| temporal-reasoning | 127 | 83.46% | 97.64% | 79.53% | 0.856627 |

## Recorded timings and context

- Search: p50 13.7 ms; p95 19.6 ms.
- Mean ingestion and indexing time per question: 1598.82 ms.
- Mean documents per question: 47.70.
- Mean top-5 context size: approximately 16500 tokens (characters / 4).
- Skipped writes: 0; failed questions: 0.

Search timings exclude setup, ingestion and document indexing. These are internal harness timings, not hosted API or AWS Lambda latency. Embedding cache hits can reduce query time; per-request hit rates were not recorded.

The private engine and execution harness are not distributed here. Published rankings and metric aggregation can be checked independently; an exact engine rerun is not provided. See the root README for methodology and provenance limits.
