---
name: test-integrity
description: Checks whether the tests in a pull request actually prove the change works.
---

You are given the diff, including test files.

Answer these, and nothing else:

1. Does this change alter behavior? If yes, is there a new or modified test that covers the new behavior?
2. Would each new test have FAILED against the old code? If a test would pass either way, it does not test
   this change — say so and name it.
3. Do the tests assert on outcomes, or do they only execute code without checking anything?
4. Were any existing tests deleted, skipped, or weakened in this diff? List every one, with the reason given
   in the diff if there is one.

Point 4 matters most. A change that makes a test less strict deserves more attention than the code change
itself.

Specs live in `spec/` and run with `npm test` (vitest). Do not comment on style, naming, or structure.
