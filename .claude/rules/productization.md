---
paths:
  - "PRODUCTIZATION.md"
  - "**/*.test.js"
  - "scripts/golden/**"
---

## Productization Tracking (PRODUCTIZATION.md)

Progress on the multi-tenant / decoupling work is tracked in `PRODUCTIZATION.md`
(repo root). Claude Code maintains it so Filip does not tick boxes by hand.

Rules:

1. Tick a box `[ ]` -> `[x]` ONLY after Filip has confirmed the step passed its full
   gate (npm run test green with ZERO modifications to existing tests - see rule 7 for
   what "modification" means, npm run lint
   clean, golden-diff XML byte-for-byte, raw git diff reviewed) AND the step is
   committed. Never tick on "code written" or "works on my machine" - `[x]` means
   "safe in Alex's production".
   The expected test count is NOT frozen here: it moves every time a step adds a test
   file, and a stale number in this file would be read as the target. Take it from the
   baseline block at the top of `PRODUCTIZATION.md` (ETAP 0), and measure the actual
   baseline yourself before starting work. What is invariant is the SHAPE of the gate:
   the count may only ever go UP, and never because an existing test was edited.
2. Claude Code does NOT self-approve. The tick happens on Filip's explicit "gate
   passed, commit it", not when Claude Code judges the work done.
3. The checklist update is a SEPARATE commit from the code change (same discipline as
   version/changelog). ASCII-only message, e.g.
   `docs(productization): mark BUG 1 (clientId in settings:set) done`.
4. Use the right status marker, do not collapse them:
   `[ ]` todo | `[~]` in progress | `[x]` done+gated | `[!]` blocked (external dep)
   | `[=]` consciously frozen (waiting on real client #2). Frozen != todo.
5. If a step reveals new sub-tasks, add them as new `[ ]` lines under the same stage
   rather than silently expanding an existing box - the list must stay auditable.
6. Mutation proof, and what it is owed to. The principle stands unchanged: a test that
   passes whenever some other test passes is decoration. What changes is how that is
   PROVEN, because proving it per-assert costs more than it returns.
   - The proof is owed to every GATE PATH, not to every assert: gate open, gate closed,
     the flag NAME, and the interaction with any condition the gate was ANDed into.
     One mutation per path, applied ALONE and reverted before the next.
   - A mutation that kills more than one test is a signal to build a DISCRIMINATING
     mutation, never a verdict that a test is decoration. A mutation can remove a
     different defect than the one under study - `if (false && getFeature(...))`
     short-circuits the call away, so a test pinning the flag name legitimately dies
     with it. Only once no discriminating mutation can be constructed is the test
     decoration.
   - Diagnostic tests and harness guards - the ones asserting that the registration,
     import or mock worked at all - STAY deliberately and have NO corpse of their own,
     with a comment saying so and why. They earn their place when five tests fail at
     once and exactly one of them says why.
   - HOW THE RUN IS DRIVEN, not just what it proves. Mutations go onto a COPY of the
     file: `cp <file> <file>.pristine` before the round, ONE mutation, run, then
     `cp <file>.pristine <file>` and confirm with `diff -q` BEFORE the next mutation.
     Never revert with `git checkout -- <file>`. On work that is not yet committed
     that command reverts to HEAD and deletes the whole new implementation, and the
     symptom is a screen of FAILING TESTS - a false mutation signal indistinguishable
     from a real corpse, since both look like "the mutation killed something". The PRISTINE confirmation
     is what makes the next mutation's result mean anything: a round whose revert was
     never verified proves nothing about the round after it.
7. What "do not modify existing tests" protects, and where it stops. An existing test
   file has two layers and they are NOT governed by the same rule.
   - EXECUTABLE CONTENT is untouchable: assertions, mocks, fixtures, imports, test
     names, `it.each` rows, the shape of a helper. A failing test after a change is a
     STOP, never an invitation to edit it - that is the whole point of the rule.
   - COMMENTS fall under the documentation rule instead: they must be TRUE, and a false
     one is worse than none. Fixing a comment goes in its OWN commit, typed `docs`,
     never bundled with code, and the proof it carries is the test count before and
     after being identical plus a diff in which every changed line begins with `//`.
     The reason for the split, written down so the next request does not arrive as "it is
     only a mock": the rule exists to stop an unintended behaviour change from being
     masked by an edited expectation. A comment cannot mask anything, because it does not
     execute. A mock can, so a mock is executable content and stays untouchable.
8. Mutations belong in the file that WAS broken, not only in the new clean module.
   A round of 16 mutations against a freshly written pure helper, with zero against the
   producer, the handler and the UI, looks like proof and establishes nothing about the
   defect under study. The question a mutation answers is "would this test have caught
   the thing that actually went wrong", so it has to be applied where that thing lived.
9. A test, a field or a sentinel has to earn its place against a state that can really
   occur, and a state that resolves an incident is never optional.
   - A test for an IMPOSSIBLE state is not caution, it is noise: a `null` vs `[]`
     sentinel test written for a producer that always returns an array was deleted for
     this reason.
   - The mirror case is not symmetric. A field that would have ANSWERED a real incident
     is mandatory even when its absence is technically defensible: `workstation: null`
     in the read diagnostics was arguable on its own terms and wrong on the merits,
     because the whole incident was ONE station seeing different data from the others.
10. A report without the raw diff is not a report. Whoever reviews the work reads the
    diff, not a description of it - a description is exactly the layer where an
    unintended change hides. This is also why a number arrives with the command that
    produced it: both rules exist so the reader can re-derive the claim instead of
    trusting it.
