# Project Folder Structure & Organization

## Directory Mapping

- `app/`: Next.js App Router (pages and layouts).
- `components/`: Pure UI components (UI Primitives).
- `fragments/`: Feature-specific component compositions.
- `hooks/`: Reusable custom React hooks.
- `lib/`: Core logic, API clients, and **Server Actions** (`lib/actions`).
- `constants/`: Non-changeable configuration and text.
- `types/`: Global TypeScript definitions.
- `utils/`: Small, pure helper functions.

## Rule of Locality

- Keep feature-specific components close to their route (e.g., `app/(dashboard)/components`).
- Shared/Global components go into the root `components/` directory.
- Never nest more than 4-5 levels deep.
