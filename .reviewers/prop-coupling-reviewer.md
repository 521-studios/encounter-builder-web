# prop-coupling-reviewer
model: sonnet
verification: evidence-query — greps `src` for the prop at each JSX call site and in the intermediate components' signatures, and quotes the chain; "should be context" suggestions are labelled judgement.
**Checks:** React components threading cross-cutting data (auth token/session, API client, selected campaign/encounter) as props through layers that do not use it, or passing a shared bag via spread.
**Spawn when:** diff adds or changes a React component or its JSX call sites in `src/components/**` or `src/App.jsx`; skip tests, `e2e/`, CSS, markdown and terraform.
**Contents:** Patterns to FLAG · Do NOT flag · Severity

Review React components for **unnecessary prop threading** (prop drilling).

**Core principle:** This app has no React Context. Auth and API access are module singletons: the bearer comes from `src/api/token.js` (`setTokenProvider`/`getToken`, wired once in `src/App.jsx`) and components call `src/api/*.js` directly. Components must not receive the token, a user/session object or an API client as a prop; import the module.

**Patterns to FLAG:**

1. **Auth or API access passed as props:** `token`, `user`/session, `tokenProvider`, `fetchImpl`, an API client object or a `fetch` wrapper passed to or destructured in a component under `src/components/`.
2. **Cross-cutting UI state threaded through 2+ intermediate components that don't use it:** e.g. `released`, `siblings`, `entryOf`, `onOpenEncounter` passed EncounterEditor → EncounterContent → ContentEditors → `*Line`. Quote the chain from the call sites. Suggesting a new context is judgement, and only when three or more components read the value.
3. **A "shared" prop bag passed via spread:**
   ```jsx
   // BAD
   const shared = { token, campaign, entryOf }
   <ChildComponent {...shared} />
   ```

**Do NOT flag:**
- Data props specific to each component (the entity it renders, e.g. a monster/treasure line), `children`, and props that genuinely vary per instance
- `disabled`/`released` passed one level to a control, and `campaign`/`campaignId` passed one or two levels from `App.jsx`
- Pre-existing threading the diff did not add a hop to
- `tokenProvider`/`fetchImpl` options in `src/api/*.js` and tests (test injection)

**Severity:** P2 auth/API access passed as a prop; P3 multi-hop threading and spread bags.
