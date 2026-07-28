# Caveman mode (repo-level, Claude Code web + CLI)

Makes Claude respond in terse "caveman" style automatically in every Claude Code
session opened on this repo — no plugin install, works offline, zero per-session
delay.

## How it works
- `.claude/hooks/caveman-activate.sh` — a `SessionStart` hook that injects the
  caveman activation rules as context at the start of every session.
- `.claude/settings.json` — wires that hook.
- `.claude/commands/caveman.md` — the `/caveman` command (on / level switch).
- `.claude/commands/caveman-off.md` — the `/caveman-off` command.

## Usage in a Claude Code web conversation
- Starts in caveman mode automatically.
- `/caveman` — turn it on / reaffirm. Optional level: `/caveman lite`,
  `/caveman full`, `/caveman ultra`.
- `/caveman-off` — normal full-prose responses for this conversation.
- Plain language also works: "stop caveman" / "modo normal".

## Scope
This only applies to sessions that check out the branch containing these files.
Merge them into the branch your sessions use (e.g. `main`) to have caveman on
across the whole repo.

## Note vs the real plugin
This is the repo-vendored, offline version. The full plugin
(github.com/JuliusBrussee/caveman) adds `/caveman-stats`, token tracking, and a
statusline badge — those need the plugin installed in the running environment,
which ephemeral web containers don't persist. For local Claude Code CLI, install
the full plugin instead:
`npx -y github:JuliusBrussee/caveman -- --only claude`
