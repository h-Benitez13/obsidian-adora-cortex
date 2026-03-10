# Ticket Refinement Layer

This layer sits **after** heuristic scoring.

## Gate

Only tickets with `easy = true` from the heuristic scorer are allowed into the
LLM refinement step.

That preserves the fail-closed rule.

## Expected model output

```json
{
  "summary": "...",
  "confidenceScore": 0.0,
  "missingContext": ["..."],
  "nextAction": "promote|review|reject",
  "rationale": "..."
}
```

## Fallback behavior

If the model returns malformed JSON or an invalid structure:

- the system returns a parse-safe fallback
- the ticket is marked `reviewRequired = true`
- the next action becomes `review`

This prevents malformed model output from silently promoting work.
