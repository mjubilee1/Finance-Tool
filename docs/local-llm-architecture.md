# Local LLM Platform — Architecture Design

A simple platform for studying **corporate decisions** with a **local LLM**. Data stays on the machine. Security is the default, not an add-on.

## Goals

| Goal | Meaning |
|------|---------|
| Local by default | Model and documents run on the user’s machine (or private network) |
| Secure out of the box | No cloud required; encryption and access controls on day one |
| Study decisions | Ask questions about past choices, policies, and outcomes |
| Stay simple | Few moving parts; one clear path from documents → answers |

## What the user does

1. Install the app (desktop or private server)
2. Drop in decision docs (memos, board notes, OKRs, postmortems)
3. Ask: “Why did we choose X?” / “What were the tradeoffs?” / “What did we decide last quarter?”
4. Get answers grounded in their own files — nothing leaves the box unless they choose

## High-level architecture

```
┌─────────────────────────────────────────────┐
│  UI (chat + document library)               │
├─────────────────────────────────────────────┤
│  App API (local only)                       │
│  • auth / session                           │
│  • document ingest                          │
│  • query / chat                             │
├──────────────────┬──────────────────────────┤
│  Retrieval       │  Local LLM runtime       │
│  (search index)  │  (e.g. Ollama / llama.cpp)│
├──────────────────┴──────────────────────────┤
│  Encrypted storage (docs + index + chats)   │
└─────────────────────────────────────────────┘
```

## Core pieces (keep it thin)

1. **UI** — Chat and a simple library of uploaded decisions
2. **Local API** — Talks only to localhost / private host
3. **Ingest** — Chunk documents, embed, store in a local index
4. **Retrieve** — Find relevant decision snippets for a question
5. **Generate** — Local model answers using those snippets only
6. **Storage** — Encrypted at rest; no third-party sync by default

## Security out of the box

| Control | Default |
|---------|---------|
| Network | Localhost only; no outbound LLM calls |
| Data at rest | Encrypted disk / app vault |
| Access | Device unlock + optional app PIN / passcode |
| Telemetry | Off |
| Model weights | Stored locally; user-chosen model |
| Exports | Explicit user action only |

**Rule:** If a feature needs the internet, it is opt-in and clearly labeled.

## Decision study workflow

```
Upload decision docs
        ↓
Index locally (chunks + embeddings)
        ↓
User asks a question
        ↓
Retrieve related decisions
        ↓
Local LLM answers with citations
        ↓
User can save notes / tags on that decision thread
```

Useful question types:

- What did we decide and why?
- What alternatives were rejected?
- Who owned the outcome?
- What risks did we accept?
- How does this compare to a similar past decision?

## Suggested stack (simple)

| Layer | Option |
|-------|--------|
| Runtime | Ollama or llama.cpp |
| App | Desktop shell (Tauri/Electron) or local Next.js |
| Index | Local vector store (e.g. SQLite + embeddings) |
| Auth | Device session + optional passcode |
| Crypto | OS keychain + encrypted vault for docs |

Pick one path and ship; avoid multi-cloud adapters early.

## Non-goals (for v1)

- Multi-tenant SaaS
- Cloud model fallback as the default
- Complex RBAC / org trees
- Auto-sync to external drives without consent

## v1 success criteria

- User can install, add docs, and ask a decision question offline
- Answers cite the source document
- No document content leaves the machine by default
- Setup takes minutes, not a security project

## Open choices (decide later)

- Desktop app vs private-server web UI
- Which default model size (speed vs quality)
- How “decision” records are structured (freeform PDFs vs templates)
