# Architecture

**Status: undecided.** No architecture has been locked in — this
describes the constraints the eventual design must satisfy, not a
decision. See the private docs repo's `architecture/README.md` and
`tech-stack/README.md` for the full reasoning once those choices
are made.

## Constraints from the client brief

- Installable PWA — Web App Manifest + Service Worker
- Must fully function offline (no network dependency for core
  gameplay)
- Local data layer via IndexedDB (Dexie.js or similar)
- Opportunistic sync to a backend on reconnect
- Backend performs AI-driven analysis of synced performance data
- Local push notifications via Service Worker Push API
- Optional webhook to Systeme.io/Zapier on the backend

## Candidate stacks (not yet chosen)

- Frontend: .NET Blazor WebAssembly, or React / Next.js / Vue
- Styling: Tailwind CSS or similar
- Backend/AI: open

This file will be rewritten with the actual chosen architecture once
decided.
