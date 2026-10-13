# Agent Guide — Data Structure Review & Race-Condition Advisory

## What this is
A copy-paste **agent prompt** that reproduces the "review the whole data structure
and advise on race conditions for two people editing at the same time" study.

## How to use it
1. Open a coding agent with this repository as the workspace.
2. Paste the whole prompt below (the part between the `---START PROMPT---` markers).
3. The agent explores, reviews, and returns the deliverable described in the prompt.
4. Optionally, follow up with: "Now implement recommendations 1 and 2" to turn the analysis into code.

---

--- START PROMPT ---

You are a senior backend reviewer for a codebase that stores its data in CSV/XLSX
files (no database). The user asked: "review the whole data structure of the
project and tell me how I should handle race conditions when 2 people log in and
edit at the same time."

Your job is to produce a concrete, code-grounded review. Do the following in order:

1. Map the data structure and architecture.
   - Read the repo README and any AGENTS.md files (root and subdirectories).
   - Identify how data is persisted (files, directories, formats) and how the
     frontend reaches the backend (proxy, ports, env vars).
   - List the main feature areas and the endpoints that write data.

2. Trace every read/write code path.
   - Find the low-level I/O helpers (read all rows, mutate in memory, rewrite the
     whole file). Quote the function names and file paths.
   - Identify row identity / keys for each table (e.g. prodgroup3, id, nbr,
     composite keys).
   - Note any in-memory caching, locks, or rebuild/recompute logic that reads
     multiple files and writes one file back.

3. Analyze race conditions for concurrent edits.
   - Identify the classic read-modify-write (RMW) lost-update race: two concurrent
     writes both read the old snapshot and the last writer wins silently.
   - Call out cross-row races (whole-file rewrites still clobber different-row edits).
   - Call out id/duplicate races (auto-increment on a stale read, duplicate-check
     then append without atomicity).
   - Call out the worst hotspot: any service that regenerates a derived file from
     multiple input files while merging back previous decisions.
   - Check whether any existing lock only guards an in-memory cache rather than
     the file writes, and note when the app runs single-process vs multi-worker.

4. Deliver a written review.
   - Data structure overview (brief, with file paths).
   - Where the races are (specific router/service/io functions and files).
   - Recommendations, ordered by effort/impact, in three layers:
       1. Serialize + atomicize file writes (per-file process lock around the RMW,
          write temp file then atomic replace).
       2. Optimistic concurrency for same-record edits (version / updated_at
          round-trip; return 409 Conflict on mismatch so the second user is told
          to refresh instead of being silently overwritten).
       3. Cross-process story (what to do if the app later runs multi-worker or in
          Docker: real file lock or move to SQLite).
   - For each recommendation, say exactly which files/functions to change.
   - Follow the repo's final-answer formatting style: section headers, concise
     bullets, file references as clickable paths.

Do not modify files. Only read and analyze, then return the review.

--- END PROMPT ---

---

## What a good deliverable looks like
- Backs every claim with a file reference (clickable path), not generic advice.
- Distinguishes the three failure modes: lost update on same row, lost update on
  different rows, and id/duplicate races.
- Gives a layering strategy (serialize → atomic → pessimistic/optimistic) that a
  follow-up prompt can turn into code.

## Follow-up prompts
- "Now implement layer 1 (lock + atomic replace) in `app/io/csv_excel.py` and
  `app/io/generic_csv.py`."
- "Now implement layer 2: add/check `updated_at` (or a `version`) and return 409
  Conflict on stale writes in the editable endpoints."
