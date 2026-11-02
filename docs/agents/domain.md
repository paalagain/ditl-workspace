# Domain Docs

How engineering skills consume this repo's domain documentation.

## Before exploring, read these

- `GLOSSARY.md` at the repo root.
- ADRs in `docs/adr/` that touch the area you're about to work in.

If these files don't exist, proceed silently. The `domain-modeling` skill (reached via `grill-with-docs` and `improve-codebase-architecture`) creates them lazily when terms or decisions get resolved.

## File structure

This repo uses a single-context layout:

```text
/
├── GLOSSARY.md
└── docs/
    └── adr/
        └── 0001-<decision-slug>.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, or a test name), use the term defined in `GLOSSARY.md`.

If a concept isn't in the glossary, check whether the project uses another term. Note real gaps for `domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, name the ADR and explain why the decision should be reopened.
