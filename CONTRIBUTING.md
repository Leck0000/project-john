# Contributing to Project:John

Thank you for considering contributing to Project:John! This is an open-source browser-based IT help desk simulator for technician training.

## Development Setup

1. **Fork the repository** and clone your fork locally
2. **Install dependencies**: `pnpm install`
3. **Run the development server**: `pnpm dev`
4. **Run tests**: `pnpm test` (unit tests) and `pnpm test:e2e` (end-to-end tests)
5. **Lint**: `pnpm lint`
6. **Typecheck**: `pnpm typecheck`
7. **Build**: `pnpm build`

## Project Conventions

- **No `any` types** in source code (only `as any` in test utilities is acceptable)
- **Strict TypeScript**: `strict: true`, `noUncheckedIndexedAccess: true` in tsconfig.json
- **CSS variable theming**: `--fg, --bg, --accent, --border, --card` — no hardcoded colors
- **Responsive layout**: desktop >=1280px, drawer collapses <1024px
- **Zod boundary validation** at all API boundaries
- All code should pass `pnpm lint`, `pnpm typecheck`, and `pnpm test` before submission

## Pull Request Process

1. Create a new branch from `main` for your feature/fix
2. Make your changes following the project conventions
3. Ensure all tests pass and linting is clean
4. Submit a pull request with a clear description of what you changed and why
5. Address any review feedback

## Project Structure

- `src/` — Source code organized by feature
- `tests/` — Unit and E2E tests
- `.github/workflows/ci.yml` — CI pipeline
- `README.md` — Project overview and documentation
- `LICENSE` — Software license

## Questions or Feedback?

Open an issue or discussion on the GitHub repository for any questions, feature requests, or feedback.
