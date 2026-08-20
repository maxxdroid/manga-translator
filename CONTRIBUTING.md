# Contributing

## Getting Started

1. Read [README.md](README.md) for project overview
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
3. Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for dev setup
4. Check [PROGRESS.md](PROGRESS.md) for current status
5. Pick a task from [TODO.md](TODO.md)

## Branch Strategy

- `main` — Production-ready code
- `dev` — Active development
- `feature/*` — Feature branches
- `fix/*` — Bug fix branches

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `style:` — Code style (formatting, no logic change)
- `refactor:` — Code restructuring
- `test:` — Adding tests
- `chore:` — Build/config changes

Examples:
```
feat: add Japanese OCR support
fix: overlay positioning on wide images
docs: update ARCHITECTURE.md with caching strategy
```

## Code Review Checklist

- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] Linter passes (`npm run lint`)
- [ ] Tested on at least one manga site
- [ ] No console errors
- [ ] Memory cleanup on overlay destroy
- [ ] Works with both JP and KR text

## Handoff Notes for New Developers

1. Read all docs in `docs/` directory
2. Check `PROGRESS.md` for what's done
3. Check `TODO.md` for what needs doing
4. Start with the setup instructions in `docs/DEVELOPMENT.md`
5. Look for `// TODO:` comments in code
6. Run `npm run dev` and load `dist/` in Chrome to test
