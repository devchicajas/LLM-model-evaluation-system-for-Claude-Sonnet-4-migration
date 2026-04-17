# Human calibration template (optional)

Use this when you want to **sanity-check** the automated judge against a few hand ratings. Copy the table into a spreadsheet or duplicate rows per prompt.

## How to use

1. Run `npm start` and open `eval-output/latest-run.json` (or the dashboard drill-down).
2. For each row you care about, read the **user prompt** and **model answer** (ignore judge JSON at first).
3. Rate **your** overall quality **0–10** independently.
4. Compare your column to `scores.finalScores.overall` from the export. Large systematic gaps suggest judge prompt or model choice needs tuning.

## Template

| Eval batch id | Model | Prompt (first line or id) | Your overall (0–10) | Judge overall | Delta | Notes |
|---------------|-------|-----------------------------|----------------------|---------------|-------|-------|
| | | | | | | |
| | | | | | | |

## Suggested minimum set

Pick **one prompt per category** from the dataset (product, debugging, RAG, ambiguity, edge cases, compliance, operations) × **one model** you trust as anchor—often the incumbent or the recommended winner.

Do **not** treat this as statistical significance; it is a **smell test** for gross judge drift.
