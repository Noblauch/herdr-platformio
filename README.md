# herdr-platformio

PlatformIO panel for [herdr](https://herdr.dev): the targets of the active environment, the groups
*Project* and *PlatformIO*, and an editable `platformio.ini`. Clicking a task runs `pio` in a herdr terminal.

Requires `pio` on the machine, macOS/Linux and `/bin/sh`.

## Install

Ask your herdr agent to add the mod from this repo's `mods/platformio` folder, or copy it yourself:

```sh
cp -r mods/platformio ~/.config/herdr-app/mods/platformio
herdr-app check ~/.config/herdr-app/mods/platformio
```

herdr reloads mods on its own; no restart and no `keys.json` or layout change is needed.

## Open it as a tab

The mod is a normal herdr mod pane. To open it in a tab of the current space, run the command
`tab.new` with the mod `platformio`: from the command palette (Cmd+Shift+P), or from a shell:

```sh
herdr-app do tab.new --mod platformio --name PlatformIO
```

The panel shows the project whose `platformio.ini` lies directly in the folder of the focused pane
(else the current space's folder); it does not search parent or sub folders. Close the tab like any other.

## What it runs and touches

- Programs: `pio` (or `platformio`, also found in `~/.platformio/penv/bin`) for everything PlatformIO does, and
  `/bin/sh` only as a wrapper that keeps a task's terminal open until Enter.
- Files: it reads `platformio.ini` and the `extra_scripts` files named in it, and writes `platformio.ini` only when you press Save.
- No network access of its own; it keeps small caches (targets, chosen environment and port) in the mod's `localStorage`.

## Notes

- `mods/platformio/logo.svg` is the PlatformIO logo by PlatformIO, licensed under the Apache License 2.0
  (<https://www.apache.org/licenses/LICENSE-2.0>), taken from
  <https://de.wikipedia.org/wiki/Datei:PlatformIO_logo.svg>. The logo is a trademark of PlatformIO.
- The `platformio.ini` editor has no syntax colours: herdr has no INI grammar.
