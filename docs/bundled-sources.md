# Bundled Source Provenance

Capy Tools intentionally bundles a few small pi packages so the user only needs one core toolkit install and this repo can control registration order, UI placement, and compatibility fixes. The upstream source remains useful: future Capy Tools releases may periodically re-sync selected files from these sources, then re-apply the local integration changes documented here.

| Capability | Bundled path | Source package / repo | Captured version | License | Local integration notes |
|---|---|---|---:|---|---|
| Thinking renderer | `extensions/thinking-steps/` | `pi-thinking-steps` by fluxgear | `1.0.8` | MIT | Passive renderer only; no command/settings surface. |
| Todo tool + overlay | `extensions/todo/` | `@juicesharp/rpiv-todo` by juicesharp | not recorded at original import | MIT | Tool name and result envelope preserved for replay; UI/rendering rewritten for Capy Tools grouping. |
| Working message | `extensions/cat-whimsical/` | `https://github.com/lulucatdev/pi-cat-whimsical` | `0.1.0` | MIT | Settings migrated into `~/.pi/agent/capy-tools.json`; rendered below the todo overlay. |
| Auto-compact | `extensions/auto-compact.ts` | `https://github.com/capyup/pi-auto-compact` | `0.2.4` | MIT | Settings migrated into the unified `autoCompact` section and `/capy-tools-settings`. |
| Command history | `extensions/command-history.ts` | `npm:pi-command-history` | `0.1.2` | MIT | Behavior preserved; status text made ASCII-only. Standalone install removed after bundling. |
| Codex fast mode | `extensions/codex-fast.ts` | `@calesennett/pi-codex-fast` | `0.1.1` | package license not declared | Persistence moved from `pi-codex-fast.enabled` in pi settings into `codexFast.enabled` in `~/.pi/agent/capy-tools.json`; old global setting is migrated. |
| Custom efforts | `extensions/efforts/` | local `pi-efforts` | `0.1.0` | MIT | Runtime behavior and `~/.pi/effort_levels.json` / `~/.pi/effort_levels.state.json` compatibility preserved. |
| Codex goals | `extensions/codex-goal/` | `https://github.com/fitchmultz/pi-codex-goal` | `0.1.10` | MIT | Runtime behavior preserved; imports adjusted from `.js` to `.ts` and `typebox` to `@sinclair/typebox`. |
| RTK bash compression | `extensions/rtk/`, `skills/rtk/` | `npm:@capyup/pi-rtk` | `0.1.0` | MIT | Runtime behavior, env vars, `/rtk`, and skill preserved; imports adjusted from `.js` to `.ts`. |
| showsignature | `extensions/showsignature/`, `extensions/showsignature.ts`, `skills/showsignature/` | `npm:showsignature` / `https://github.com/FredySandoval/showsignature` by Fredy Sandoval | `0.1.6` | ISC | Ported from CLI package into a pi tool; CLI/commander/globby removed, native scanning and broad multilingual adapters added locally. Thanks to upstream for the compact-signature design and parser/extractor structure. |

## Sync Notes

When updating a bundled source, prefer this shape:

1. Copy the upstream files into the same bundled path.
2. Re-apply Capy Tools integration changes: import paths, unified settings, package wiring, rendering changes, and registration order.
3. Update the captured version in this file and the relevant README/CHANGELOG section.
4. Run `npm run check` and a live pi smoke test when the extension affects runtime hooks or UI.

The standalone packages that have now been absorbed should not remain installed in `pi list`, otherwise duplicate commands, tools, or event hooks may fire.
