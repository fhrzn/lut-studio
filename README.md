# LUT Studio

Color grading and 3D LUT baking tool for professional image editing workflows.

## Getting Started

### Prerequisites

- Node 22 or later
- pnpm 12.21.0 or later

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

The app will be available at `http://localhost:5173/lut-studio/`.

### Build

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Scripts

- `pnpm dev` — Start the development server
- `pnpm build` — Build for production
- `pnpm preview` — Preview the production build
- `pnpm lint` — Run ESLint
- `pnpm typecheck` — Check TypeScript types
- `pnpm test` — Run unit tests with Vitest
- `pnpm test:e2e` — Run end-to-end tests with Playwright
- `pnpm format` — Format code with Prettier

## Project Structure

- `src/app/` — Application entry point and shell
- `src/engine/` — Rendering engine types and interface
- `src/lut/` — LUT (Look-Up Table) types and utilities
- `src/recipe/` — Recipe types for color grading adjustments
- `src/grading/` — Baking engine for recipes into LUTs
- `src/ui/` — UI components
- `src/library/` — Library management
- `src/presets/` — Preset management
- `tests/unit/` — Unit tests
- `tests/e2e/` — End-to-end tests

## License

MIT
