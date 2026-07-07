<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workflow

## Linear (team SOM)

- Work one issue at a time; one commit per issue (matches existing git history style).
- Only pick up issues that are already in `Todo`. Never pick up issues from `Backlog` — the user moves issues from `Backlog` to `Todo` manually when they're ready to be worked.
- Status transitions: `Todo` → `In Progress` when starting, → `In Review` when the code is implemented, type-checked, and (where testable) verified.
- Never move an issue to `Done` yourself — always stop at `In Review`. The user reviews and moves issues to `Done` manually themselves.
