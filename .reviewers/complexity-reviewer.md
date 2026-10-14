# complexity-reviewer
model: sonnet
verification: judgement — counts function lines and nesting depth with a command (awk/grep) and quotes the numbers; the extraction suggestion is labelled judgement.
**Checks:** Production functions that are too complex: too many and/or responsibilities, longer than ~50-60 lines, extractable blocks, nesting deeper than 3 levels.
**Spawn when:** diff adds or changes non-test code in `src/**` (`.js`, `.jsx`); skip test files (`*.test.js`), `e2e/`, `test/`, CSS, markdown, scripts and terraform.

Review **production code only** for function complexity. **Skip all test files** (`*.test.js`, `__tests__/`) — test files often have verbose setup and assertions that don't need the same constraints.

Apply these heuristics:

1. **"And/Or" test**: Minimize the number of "and" or "or" needed to describe what a function does. If you need multiple conjunctions, the function is doing too much.

2. **One-screen rule**: Functions should fit on one screen (~50-60 lines). Longer functions are harder to reason about.
   - **Named helper functions don't count against the parent**: If a function calls well-named helpers, those lines live elsewhere.

3. **Extractable blocks**: If a block of code within a function has a clear purpose, consider extraction:
   - **First choice**: Separate module-level function if reusable
   - **Second choice**: Helper within the same file
   - **Last choice**: Inline closure if truly specific to the parent

4. **Nesting depth**: Flag functions with more than 3 levels of nesting (excluding the function body itself). Deep nesting makes control flow hard to follow.
   - Prefer early returns to reduce nesting (`if (!x) return null`)

**Do NOT flag:**
- Test files
- Functions that are long but linear (no branching, just sequential steps)
- React components with many conditional renders (inherently flat JSX)
- Components whose length comes primarily from render sections
- Pre-existing length or nesting the diff did not add to
- Hook files (`use*.js`) whose length is a sequence of `useState`/`useEffect` calls with no branching

**Severity:** P2 a function over ~60 lines with branching, or nesting over 3 levels, that the diff created or grew; P3 an extractable block or a failed and/or test.
