# LongMemEval-S: Lexical + EmbeddingGemma 2 Q8_0 reranking (2026-10-19 engine)

This report is generated from the imported `summary.json`; per-question rankings are in `results.jsonl`.

- Dataset: `data/longmemeval/longmemeval_s_cleaned.json`
- Dataset SHA-256: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
- Started: 2026-10-19T18:50:15.130Z
- Recorded engine revision: `d7cd3e3e5dca0456a67f427d1c6654ec34ea8a8c` (clean committed source).
- Storage: private engine implementation; granularity: session; roles: all; concurrency: 4.
- Selection: 470 of 500 questions (30 abstention left out).
- Question date supplied as the search reference time; fuzzy matching disabled.
- Embedding reranking: embeddinggemma2-q8-a8304450a4843c984798075612dbc80b6654de4912fe142d597b9ff55ce6bbaa, 768 dimensions.

## Session retrieval

hit@k asks whether at least one gold evidence session appears in the first k results. These are retrieval metrics, not generated-answer accuracy.

| Metric | Value |
| --- | ---: |
| hit@1 | 90.00% |
| recall_all@1 | 31.70% |
| nDCG@1 | 0.900000 |
| hit@3 | 97.66% |
| recall_all@3 | 82.77% |
| nDCG@3 | 0.923733 |
| hit@5 | 99.15% |
| recall_all@5 | 91.91% |
| nDCG@5 | 0.938754 |
| hit@10 | 99.57% |
| recall_all@10 | 95.96% |
| nDCG@10 | 0.945456 |
| hit@30 | 100.00% |
| recall_all@30 | 98.30% |
| nDCG@30 | 0.948700 |
| hit@50 | 100.00% |
| recall_all@50 | 98.51% |
| nDCG@50 | 0.948862 |

## By question type

| Type | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| knowledge-update | 72 | 98.61% | 100.00% | 98.61% | 0.980241 |
| multi-session | 121 | 89.26% | 100.00% | 87.60% | 0.919569 |
| single-session-assistant | 56 | 100.00% | 100.00% | 100.00% | 1.000000 |
| single-session-preference | 30 | 76.67% | 96.67% | 96.67% | 0.914356 |
| single-session-user | 64 | 87.50% | 100.00% | 100.00% | 0.985338 |
| temporal-reasoning | 127 | 85.83% | 97.64% | 83.46% | 0.888795 |

## Recorded timings and context

- Search: p50 71.6 ms; p95 106.9 ms.
- Mean ingestion and indexing time per question: 7092.83 ms.
- Mean documents per question: 47.70.
- Mean top-5 context size: approximately 15968 tokens (characters / 4).
- Skipped writes: 0; failed questions: 0.

Search timings exclude setup, ingestion and document indexing. These are internal harness timings, not hosted API or AWS Lambda latency. Embedding cache hits can reduce query time; per-request hit rates were not recorded.

## Execution environment

- Node: v24.21.0; platform: win32; architecture: x64.
- CPU: AMD Ryzen 9 7900X 12-Core Processor; RAM: 31.16 GiB.

## Local embedding model

- Weights: unsloth/embeddinggemma-2-GGUF / embeddinggemma-2-Q8_0.gguf, revision `031f0d4b35536f69ab3509d4893c923264fcf253`.
- SHA-256: `6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc` (309855520 bytes).
- Runtime: llama.cpp 0.7.0-dev b11739 0ce8cd114 CUDA 12.4; device: NVIDIA GeForce RTX 4080, 16376 MiB VRAM, driver 610.88.
- Runtime arguments: `--embeddings --pooling mean --ctx-size 8192 --batch-size 8192 --ubatch-size 8192 --parallel 4 --n-gpu-layers 99 --cache-type-k bf16 --cache-type-v bf16`.
- Embedding cache at start: 0 vectors; populated and reused within this run.
- Client batching: 4 texts / 6000 characters maximum; 1 request(s) per question in flight.
- Query prefix: `task: search result | query: `; document prefix: `title: none | text: `. Output: 768 finite values, L2-normalized.
- Existing reranking parameters: up to 100 lexical candidates; at most 1500 characters per non-overlapping chunk; maximum chunk cosine per candidate; semantic weight 0.85. The best 50 sessions are retained.
- These parameters were not retuned for Q8. The recorded engine source documents an earlier 120-question LongMemEval pilot used to select the semantic weight; no separate held-out tuning split is established.
- The benchmark refuses a semantic run if a nonempty search falls back to lexical-only ranking.

The private engine and execution harness are not distributed here. Published rankings and metric aggregation can be checked independently; an exact engine rerun is not provided. See the root README for methodology and provenance limits.
