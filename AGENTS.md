# Root AGENTS.md

## External packages

Before using an outside package or dependency, fetch its current API, version, configuration, setup, CLI, or migration docs with Context7. Resolve the library ID with `npx ctx7@latest library`, then fetch the relevant docs with `npx ctx7@latest docs`. Prefer those docs over memory or web search for package facts.

## Agent skills

### Issue tracker

Track issues and specs as local Markdown under `.scratch/<feature>/`. Before creating, fetching, or updating them, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles. Before triaging an issue, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`. Before exploring the codebase, read `docs/agents/domain.md`.
