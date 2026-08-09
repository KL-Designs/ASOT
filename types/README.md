# Shared types

Ambient global type declarations used by **both** `apps/web` and `apps/bot`. Each app's
`tsconfig.json` includes this directory (`"../../types/**/*.ts"`) alongside its own local
`types/`, and both Dockerfiles `COPY types/ ./types/` into the image — don't forget that
step if you add a new shared file and the Docker build starts failing to resolve it.

**`web` takes priority.** These files originated from `apps/web/types/` and web's schema is
the more complete, more current one (it's the primary app). When the two apps' concepts
diverge, prefer web's shape; only add bot-specific fields here if the bot genuinely needs
them and web wouldn't reasonably want them too — otherwise keep bot-only concerns in
`apps/bot/types/`.

Only types that are genuinely shared MongoDB document shapes belong here — `User` (the
`users` collection, referenced by both apps under that exact name — the bot used to have
its own narrower duplicate called `GuildMember`, since merged into this `User`) and
`Role`/`Optional` (also shared collections). Everything else stays app-local:
`apps/web/types/` for the ~35 web-only concepts (operations, attendance, training, etc.),
`apps/bot/types/` for bot-only ones (`Reminder`, `StatusData`/`SyncStateData`, the bot's
runtime `Config`/`Modlist`).
