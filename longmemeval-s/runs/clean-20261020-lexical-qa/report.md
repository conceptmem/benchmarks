# LongMemEval-S: Answers from lexical retrieval

This report is generated from the imported `summary.json`; per-question rankings are in `results.jsonl`.

- Dataset: `data/longmemeval/longmemeval_s_cleaned.json`
- Dataset SHA-256: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
- Started: 2026-10-20T15:54:38.726Z
- Recorded engine revision: `a8e7e7cfebb242b68f0a2baa83754aa2453e7a1d` (clean committed source).
- Storage: private engine implementation; granularity: session; roles: all; concurrency: 4.
- Selection: 500 of 500 questions (30 abstention, QA only).
- Question date supplied as the search reference time; fuzzy matching disabled.
- No embedding model or generative model used in retrieval.
- Answers: reader and judge gemini gemini-3.5-flash-lite, thinking low; prompts reader-3-attributed and judge-1; context: the first 5 retrieved sessions.

## Answer accuracy

The reader answers each question from the first 5 sessions retrieval ranked, and the judge grades the answer against the reference. Both are gemini-3.5-flash-lite under this harness's own prompts, not LongMemEval's GPT-4o judge: compare these figures between ConceptMem runs, not with accuracies published elsewhere. Abstention questions are graded on whether the answer declines.

- Overall: 83.00% (415/500); a failed or unanswered question counts as incorrect.
- Task-averaged: 85.89%.
- Abstention: 90.00% (27/30).
- Reader context: approximately 16483 tokens per question (characters / 4).
- Tokens: 7491131 input, 34099 output, 167319 thinking; about US$2.75 at list price.

| Type | Questions | Correct | Accuracy |
| --- | ---: | ---: | ---: |
| knowledge-update | 78 | 69 | 88.46% |
| multi-session | 133 | 95 | 71.43% |
| single-session-assistant | 56 | 55 | 98.21% |
| single-session-preference | 30 | 25 | 83.33% |
| single-session-user | 70 | 67 | 95.71% |
| temporal-reasoning | 133 | 104 | 78.20% |

Each answer is in `hypotheses.jsonl`, and each grade, with the judge's reason, in `results.jsonl` (`qa_correct`, `qa_reason`).

## Session retrieval (470 questions, abstention excluded)

hit@k asks whether at least one gold evidence session appears in the first k results. These are retrieval metrics, not generated-answer accuracy.

| Metric | Value |
| --- | ---: |
| hit@1 | 91.06% |
| recall_all@1 | 32.55% |
| nDCG@1 | 0.910638 |
| hit@3 | 97.23% |
| recall_all@3 | 81.28% |
| nDCG@3 | 0.905090 |
| hit@5 | 98.51% |
| recall_all@5 | 87.66% |
| nDCG@5 | 0.918554 |
| hit@10 | 98.51% |
| recall_all@10 | 92.55% |
| nDCG@10 | 0.926467 |
| hit@30 | 100.00% |
| recall_all@30 | 98.30% |
| nDCG@30 | 0.934265 |
| hit@50 | 100.00% |
| recall_all@50 | 98.30% |
| nDCG@50 | 0.934265 |

## By question type

| Type | Questions | hit@1 | hit@5 | recall_all@5 | nDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| knowledge-update | 72 | 97.22% | 100.00% | 98.61% | 0.981894 |
| multi-session | 121 | 90.91% | 99.17% | 75.21% | 0.877704 |
| single-session-assistant | 56 | 100.00% | 100.00% | 100.00% | 1.000000 |
| single-session-preference | 30 | 70.00% | 90.00% | 90.00% | 0.858729 |
| single-session-user | 64 | 93.75% | 100.00% | 100.00% | 0.977525 |
| temporal-reasoning | 127 | 87.40% | 97.64% | 81.10% | 0.870067 |

## Recorded timings and context

- Search: p50 12.2 ms; p95 16.8 ms.
- Mean ingestion and indexing time per question: 1464.70 ms.
- Mean documents per question: 47.73.
- Mean top-5 context size: approximately 16342 tokens (characters / 4).
- Skipped writes: 0; failed questions: 0.

Search timings exclude setup, ingestion and document indexing. These are internal harness timings, not hosted API or AWS Lambda latency. Embedding cache hits can reduce query time; per-request hit rates were not recorded.

## Execution environment

- Node: v24.21.0; platform: win32; architecture: x64.
- CPU: AMD Ryzen 9 7900X 12-Core Processor; RAM: 31.16 GiB.

The private engine and execution harness are not distributed here. Published rankings and metric aggregation can be checked independently; an exact engine rerun is not provided. See the root README for methodology and provenance limits.
