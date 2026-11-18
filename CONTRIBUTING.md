# Contributing

## Branch Naming

Create feature branches with the format: `feat/EXP-<n>-short-name`

Example: `feat/EXP-3-add-curve-adjustment`

## Commits

Use Conventional Commits: `type(scope): description`

Examples:
- `feat(recipe): add HSL adjustment layer type`
- `fix(engine): correct gamma calculation`
- `docs(readme): update installation steps`

## Pull Requests

1. All pull requests must link the corresponding Multica issue
2. All PRs are reviewed before merge
3. Merge conflicts must be resolved before review
4. All tests and linting must pass CI

## Code Quality

Before pushing, run locally:

```bash
pnpm lint    # Check for linting errors
pnpm format  # Format code
pnpm typecheck  # Type check
pnpm test    # Run unit tests
```

## Merge

Do not merge your own PRs. Wait for review approval and let a reviewer merge.
