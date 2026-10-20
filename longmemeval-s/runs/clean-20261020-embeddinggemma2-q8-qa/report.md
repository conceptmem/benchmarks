# LongMemEval-S: Answers from lexical + EmbeddingGemma 2 Q8_0 reranking

This report is generated from the imported `summary.json`; per-question rankings are in `results.jsonl`.

- Dataset: `data/longmemeval/longmemeval_s_cleaned.json`
- Dataset SHA-256: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
- Started: 2026-10-20T16:06:50.914Z
- Recorded engine revision: `a8e7e7cfebb242b68f0a2baa83754aa2453e7a1d` (clean committed source).
- Storage: private engine implementation; granularity: session; roles: all; concurrency: 4.
- Selection: 500 of 500 questions (30 abstention, QA only).
- Question date supplied as the search reference time; fuzzy matching disabled.
- Embedding reranking: embeddinggemma2-q8-a8304450a4843c984798075612dbc80b6654de4912fe142d597b9ff55ce6bbaa, 768 dimensions.
- Answers: reader and judge gemini gemini-3.5-flash-lite, thinking low; prompts reader-3-attributed and judge-1; context: the first 5 retrieved sessions.

## Answer accuracy

The reader answers each question from the first 5 sessions retrieval ranked, and the judge grades the answer against the reference. Both are gemini-3.5-flash-lite under this harness's own prompts, not LongMemEval's GPT-4o judge: compare these figures between ConceptMem runs, not with accuracies published elsewhere. Abstention questions are graded on whether the answer declines.

- Overall: 85.40% (427/500); a failed or unanswered question counts as incorrect.
- Task-averaged: 86.54%.
- Abstention: 93.33% (28/30).
- Reader context: approximately 16105 tokens per question (characters / 4).
- Tokens: 6722251 input, 30044 output, 157511 thinking; about US$2.49 at list price.

| Type | Questions | Correct | Accuracy |
| --- | ---: | ---: | ---: |
| knowledge-update | 78 | 68 | 87.18% |
| multi-session | 133 | 109 | 81.95% |
| single-session-assistant | 56 | 55 | 98.21% |
| single-session-preference | 30 | 24 | 80.00% |
| single-session-user | 70 | 64 | 91.43% |
| temporal-reasoning | 133 | 107 | 80.45% |

Each answer is in `hypotheses.jsonl`, and each grade, with the judge's reason, in `results.jsonl` (`qa_correct`, `qa_reason`).

## Session retrieval (470 questions, abstention excluded)

hit@k asks whether at least one gold evidence session appears in the first k results. These are retrieval metrics, not generated-answer accuracy.

| Metric | Value |
| --- | ---: |
| hit@1 | 91.06% |
| recall_all@1 | 32.13% |
| nDCG@1 | 0.910638 |
| hit@3 | 98.09% |
| recall_all@3 | 84.04% |
| nDCG@3 | 0.929495 |
| hit@5 | 98.94% |
| recall_all@5 | 91.91% |
| nDCG@5 | 0.940396 |
| hit@10 | 99.79% |
| recall_all@10 | 95.53% |
| nDCG@10 | 0.946911 |
| hit@30 | 100.00% |
| recall_all@30 | 98.30% |
| nDCG@30 | 0.950261 |
| hit@50 | 100.00% |
| recall_all@50 | 98.30% |
| nDCG@50 | 0.950261 |

## By question type

| Type | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| knowledge-update | 72 | 98.61% | 100.00% | 98.61% | 0.982804 |
| multi-session | 121 | 90.08% | 99.17% | 88.43% | 0.919517 |
| single-session-assistant | 56 | 100.00% | 100.00% | 100.00% | 1.000000 |
| single-session-preference | 30 | 80.00% | 96.67% | 96.67% | 0.916667 |
| single-session-user | 64 | 87.50% | 98.44% | 98.44% | 0.972842 |
| temporal-reasoning | 127 | 88.19% | 98.43% | 83.46% | 0.899219 |

## Recorded timings and context

- Search: p50 26.3 ms; p95 38.6 ms.
- Mean ingestion and indexing time per question: 1888.12 ms.
- Mean documents per question: 47.73.
- Mean top-5 context size: approximately 15938 tokens (characters / 4).
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
- Embedding cache at start: 136930 vectors; populated and reused within this run.
- Client batching: 4 texts / 6000 characters maximum; 4 request(s) per question in flight.
- Query prefix: `task: search result | query: `; document prefix: `title: none | text: `. Output: 768 finite values, L2-normalized.
- Existing reranking parameters: up to 100 lexical candidates; at most 1500 characters per non-overlapping chunk; maximum chunk cosine per candidate; semantic weight 0.85. The best 50 sessions are retained.
- These parameters were not retuned for Q8. The recorded engine source documents an earlier 120-question LongMemEval pilot used to select the semantic weight; no separate held-out tuning split is established.
- The benchmark refuses a semantic run if a nonempty search falls back to lexical-only ranking.

The private engine and execution harness are not distributed here. Published rankings and metric aggregation can be checked independently; an exact engine rerun is not provided. See the root README for methodology and provenance limits.
