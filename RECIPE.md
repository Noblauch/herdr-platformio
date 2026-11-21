# PlatformIO

A side panel for PlatformIO in herdr: the targets of the active environment, the groups Project and PlatformIO, and an editor for `platformio.ini`. A click on a task runs `pio` in a herdr terminal.

![PlatformIO](preview.png)

## What you see

A mod pane, opened as a tab (`tab.new {mod: "platformio"}`). Top to bottom:

- **Header, 42px:** the title "PlatformIO" and the project folder's name (dimmed, truncated), then the "Verbose" toggle. While `platformio.ini` is open the header shows a back arrow, "platformio.ini", a "●" when there are unsaved changes, and a "Save" button.
- **Tree, scrolling:** first the `platformio.ini` row (a click opens the editor), a reload icon right next to it, and on the right "Environment: <env>", a dropdown to switch environments (a plain label when there is only one; when the row is too narrow its start is clipped, so the end of the name and the arrow stay visible). Then groups with their titles in square brackets, each foldable (open by default, with chevrons):
  - `[General]`: Build, Build & Upload, Build & Upload & Monitor, Serial Monitor, Clean.
  - `[Extra Scripts]`: the targets the active environment's own `extra_scripts` add.
  - `[Platform]`: every other target of the environment, in the order `pio` reports them (platform targets, then the platform package's `Custom` targets).
  - `[Advanced]`: Analyze Code, Update Packages.
  - `[PlatformIO]`: PlatformIO Home, Upgrade PlatformIO.
  - `[Extra Scripts]` and `[Platform]` show only when they have entries.
  - A `platformio.ini` row opens the file in the editor.
- **Footer, 36px:** "Upload port:" and a dropdown of the connected serial ports (`Auto` by default), read with `pio device list` each time it opens.
- Each task has a 12px icon in the theme's `muted` color: a triangle by default, a hammer (`ansi3`) for Build, a broom (`ansi6`) for Clean. The PlatformIO logo sits in the header.

## How it behaves

- **Project:** the focused pane's folder (else the space's folder), and only that folder: it counts as a project when it holds a `platformio.ini` itself. There is no search up or down. Without one the panel says "No platformio.ini in this folder".
- **Environment:** the saved one, else `default_envs`, else the first. The choice, the port and "Verbose" are remembered per project.
- **Targets:** from `pio project metadata -e <env> --json-output`, which can take 15 to 45 seconds. The result is kept per project and environment (in `localStorage`) and fetched again only when `platformio.ini` changes or "Reload" is pressed. A timer checks every 10 seconds whether the folder or file changed.
- **Run a task:** a click opens a terminal under the focused pane (a new tab when no pane has focus) and runs the command; the task's icon turns the `working` color while it runs. A new task closes the previous output terminal; a monitor stays open until a task needs the serial port. The terminal stays after the program ends until Enter is pressed.
- **Commands:** targets run `pio run -e <env> -t <target>`; Build `pio run -e <env>`; Build & Upload `-t upload`; Build & Upload & Monitor `-t upload -t monitor`; Clean `-t clean`; Serial Monitor `pio device monitor -e <env>`; Analyze Code `pio check -e <env>`; Update Packages `pio pkg update -e <env>`; Home `pio home`; Upgrade PlatformIO `pio upgrade`. "Verbose" adds `-v`, a chosen port adds `--upload-port <port>` (Build & Upload & Monitor also `--monitor-port <port>`, Serial Monitor `--port <port>`).
- **Editor:** a click on the `platformio.ini` row opens the file in herdr's `Editor` (editable, line numbers, no syntax colours). "Save" writes the file with `writeTextFile(path, text, expected)`, which fails when the file changed on disk meanwhile, then reloads the targets. If the file changes on disk while there are unsaved edits, nothing is overwritten: the header says "platformio.ini changed on disk" and shows "Reload" (discards the edits). The back arrow asks once ("click ← again to discard") when there are unsaved changes. Saving works on this computer only.
- Groups and sub-folders fold and unfold by click.

## Built from

- One file, `mods/platformio/main.js`, a `View` class; `mod.json` is `{ "place": "none", "title": "PlatformIO" }`.
- `herdr`: `spaces`, `panes`, `focused`, `terminals`, `exec`, `readTextFile`, `writeTextFile`, `run` (`terminal.open`), `theme`, `checking`; `gpui-base`: `Editor`, `EditorState`, `Popover`.
- Icons in the folder: `logo.svg` (the PlatformIO logo), `task.svg`, `hammer.svg`, `bug.svg`, `broom.svg`, `chevron-down.svg`, `chevron-right.svg`. `svg()` tints the whole icon in one color.
- Programs it runs: `pio` and `/bin/sh` (the terminal wrapper only; see README).

## Watch out

- `pio project metadata` is slow and builds the environment's configuration. Do not start it for an environment you do not want to touch; changing the cache key or `platformio.ini` starts it again for the saved environment.
- herdr has no INI grammar: `ini` and `toml` are unknown languages (no colours), `yaml` colours the whole file green and `properties` colours it wrongly. Leave the editor without colours.
- Terminals are recognised by their `argv`; the `sh -c` wrapper is `argv[2]` and the task name `argv[3]`.
- An icon cached by herdr keeps its first image per path: restart herdr after replacing one.
- The panel reads the project from the focused terminal's folder, falling back to the space's folder, so that folder must itself hold the `platformio.ini` (no search in parent or sub folders).
- macOS and Linux only; `/bin/sh` is required.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/platformio` passes and `herdr-app status` shows no errors.
- In a space whose folder holds a `platformio.ini`, the tab shows the tree with Project and PlatformIO.
- Clicking Build runs `pio run -e <env>` in a terminal under the pane and the terminal stays until Enter.
- Opening `platformio.ini`, changing a line and pressing Save writes the file, and the "●" disappears.
- Changing the file on disk while there are unsaved edits shows "platformio.ini changed on disk" and does not overwrite the edits.
