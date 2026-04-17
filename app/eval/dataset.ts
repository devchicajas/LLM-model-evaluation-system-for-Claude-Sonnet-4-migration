import type { DatasetPrompt } from './types.js'

/** Bump when prompt text or count changes (for exports and reproducibility). */
export const EVAL_DATASET_VERSION = '2.0.0' as const

/**
 * Fixed benchmark prompts representing realistic product traffic (5–10 prompts per assignment spec).
 * Categories map to how we expect production prompts to behave.
 */
export const EVAL_DATASET: readonly DatasetPrompt[] = [
  {
    id: 'product-roadmap-prioritization',
    category: 'product',
    prompt:
      'We are a B2B SaaS for finance teams. Leadership wants a quarterly roadmap theme: either "workflow automation" or "deeper ERP integrations". What criteria should we use to decide, and what decision process would you recommend for a 10-person product org?',
  },
  {
    id: 'product-feature-request-triage',
    category: 'product',
    prompt:
      'Customers keep asking for a "dark mode" and for CSV exports larger than 500k rows. Our eng capacity is tight. How should we triage these requests and what should we communicate back to customers?',
  },
  {
    id: 'debugging-python-traceback',
    category: 'debugging',
    prompt:
      'I am getting this error in Python 3.11:\n\nTraceback (most recent call last):\n  File "app.py", line 42, in <module>\n    user = load_user(payload["user_id"])\nKeyError: \'user_id\'\n\nThe payload is built from a JWT. What are the most likely causes and how should I debug step by step?',
  },
  {
    id: 'debugging-node-async-hang',
    category: 'debugging',
    prompt:
      'Our Node.js API sometimes hangs under load: requests never return, no obvious exception. We use Postgres + Prisma. Outline a practical debugging checklist and what signals to look for in logs/metrics.',
  },
  {
    id: 'rag-policy-handbook',
    category: 'RAG',
    prompt:
      'Using ONLY the following retrieved snippets from our employee handbook, answer the question. If the snippets are insufficient, say what is missing.\n\n[Snippet A] Remote employees must follow the security checklist in Appendix C before accessing customer data.\n[Snippet B] Appendix C requires full-disk encryption, screen lock <= 5 minutes, and MDM enrollment on laptops.\n[Snippet C] Customer data access requires manager approval recorded in the access ticket system.\n\nQuestion: As a remote employee, what must I complete before accessing customer data, and where is approval recorded?',
  },
  {
    id: 'ambiguity-vague-bug-report',
    category: 'ambiguity',
    prompt: 'The checkout is broken. Fix it.',
  },
  {
    id: 'edge-cases-empty-input',
    category: 'edge cases',
    prompt: '',
  },
  {
    id: 'edge-cases-extreme-constraints',
    category: 'edge cases',
    prompt:
      'Design a URL shortener API with these constraints: max 6-character codes, case-insensitive, must support 10M active links, and collisions must be astronomically unlikely. Summarize the encoding approach and the collision handling strategy in under 200 words.',
  },
  {
    id: 'security-gdpr-dsr-workflow',
    category: 'compliance',
    prompt:
      'A customer in the EU emailed support asking to exercise their GDPR data subject rights: access, rectification, and erasure for their account. Our app stores profile data in Postgres, files in S3, and audit logs in a separate retention bucket (7-year legal hold for finance events). Outline a practical internal workflow: who approves what, in what order, what we must not delete, and what to communicate back to the customer with realistic timelines.',
  },
  {
    id: 'operations-incident-summary',
    category: 'operations',
    prompt:
      'Summarize the following incident notes for leadership (max 5 bullet points, each one line): At 09:12 UTC API error rate spiked to 12%. On-call paged. Found DB connection pool exhausted after a deploy that doubled default pool size in one region only. Rolled back deploy at 09:45. Error rate normalized by 09:52. Customer impact: ~400 failed checkouts, no data loss. Follow-up: add pool metrics dashboard and regional deploy checklist.',
  },
] as const
