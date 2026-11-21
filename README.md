# herdr-platformio

PlatformIO for [herdr](https://herdr.dev): run build, upload and monitor tasks, and edit your `platformio.ini`,
all from one view. It lists the tasks of the active environment (General, Extra Scripts, Platform, Advanced)
and PlatformIO's own; clicking a task runs `pio` in a herdr terminal.

Requires `pio` on the machine, macOS/Linux and `/bin/sh`.

## Install

Ask your herdr agent to add the mod from this repo's `mods/platformio` folder, or copy it yourself:

```sh
cp -r mods/platformio ~/.config/herdr-app/mods/platformio
herdr-app check ~/.config/herdr-app/mods/platformio
```

herdr reloads mods on its own; no restart and no `keys.json` change is needed.

**Recommended:** a "PlatformIO" button next to Files and Changes that opens the mod as a side panel.
herdr has no way for a mod to add that button by itself, so it takes a small change to your layout;
your agent does it when you agree (steps in [`RECIPE.md`](RECIPE.md#recommended-install)). herdr's own
`main` layout is read-only, so the agent first clones it; a clone no longer receives herdr's updates to `main`.

## Or open it as a tab

Without the layout change, open the mod in a tab of the current space: run the command
`tab.new` with the mod `platformio`, from the command palette (Cmd+Shift+P), or from a shell:

```sh
herdr-app do tab.new --mod platformio --name PlatformIO
```

The mod shows the project whose `platformio.ini` lies directly in the folder of the focused terminal pane,
else in the current space's folder. Opened as a tab, the mod itself has the focus, so the space's folder
must hold the `platformio.ini`. It does not search parent or sub folders. Close the tab like any other.

## What it runs and touches

- Programs: `pio` (or `platformio`, also found in `~/.platformio/penv/bin`) for everything PlatformIO does, and
  `/bin/sh` only as a wrapper that keeps a task's terminal open until Enter.
- Without a click: whenever the focused folder holds a `platformio.ini`, the mod runs `pio --version`,
  `pio project config` and `pio project metadata -e <env>` (slow, up to a few minutes; cached per environment until
  `platformio.ini` changes). A timer checks every 10 seconds whether the folder or file changed.
  `pio device list` runs each time the port dropdown opens. Everything else runs only when you click a task.
- Files: it reads `platformio.ini` and the `extra_scripts` files named in it, and writes `platformio.ini` only when you press Save.
- Network: the mod makes no requests of its own, but `pio` does: Update Packages, Upgrade PlatformIO and
  PlatformIO Home go online, and `pio project metadata` may download a missing platform or toolchain the first time.
- State: small caches (targets, chosen environment, port, Verbose) in the mod's `localStorage`. The tab bar button
  adds `platformio` to herdr's shared `workspace.panels` list, so the tab bar remembers the panel per space.
- Remote spaces: in a space on another machine, `pio` runs and `platformio.ini` is read on that machine;
  saving the file works on this computer only.

## Notes

- `mods/platformio/logo.svg` is the PlatformIO logo by PlatformIO, licensed under the Apache License 2.0
  (<https://www.apache.org/licenses/LICENSE-2.0>), taken from
  <https://de.wikipedia.org/wiki/Datei:PlatformIO_logo.svg>. The logo is a trademark of PlatformIO. The MIT license of this repository does not cover the logo.
- The `platformio.ini` editor has no syntax colours: herdr has no INI grammar.
