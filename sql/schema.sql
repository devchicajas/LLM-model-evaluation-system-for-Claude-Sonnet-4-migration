-- Core tables match the product spec. eval_batch_id groups one full eval transaction
-- so reports can filter a single run without guessing by timestamps.
CREATE TABLE IF NOT EXISTS prompts (
  id             SERIAL PRIMARY KEY,
  category       TEXT NOT NULL,
  prompt         TEXT NOT NULL,
  eval_batch_id  UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  id          SERIAL PRIMARY KEY,
  model       TEXT NOT NULL,
  prompt_id   INT REFERENCES prompts(id),
  answer      TEXT,
  scores      JSONB,
  latency_ms  INT,
  cost_usd    NUMERIC(10, 6),
  created_at  TIMESTAMPTZ DEFAULT now(),
  eval_batch_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_model_prompt ON results(model, prompt_id);
CREATE INDEX IF NOT EXISTS idx_results_eval_batch ON results(eval_batch_id);
CREATE INDEX IF NOT EXISTS idx_prompts_eval_batch ON prompts(eval_batch_id);
