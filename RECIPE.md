# PlatformIO

Build, upload and monitor your PlatformIO project without leaving herdr. A view lists every task of the active environment and runs it in a herdr terminal with one click; `platformio.ini` opens in an editor right there.

![PlatformIO](preview.png)

## What you see

A side panel on the right, shown and hidden by a "PlatformIO" button (logo and label) in the tab bar, next to herdr's Files and Changes buttons. It shares the right-hand panel with Files and Changes (see "Recommended install"). Without that layout change it can be opened as a tab instead (`tab.new {mod: "platformio"}`). Top to bottom:

- **Header, 42px:** the title "PlatformIO" and the project folder's name (dimmed, truncated), then the "Verbose" toggle. While `platformio.ini` is open the header shows a back arrow, "platformio.ini", a "●" and a "Save" button when there are unsaved changes. Notes (a save error, "changed on disk", "click ← again to discard") replace the folder name.
- **Tree, scrolling:** first the `platformio.ini` row (a click opens the editor), a reload icon right next to it (`working` color while targets load), and on the right "Environment: <env>", a dropdown to switch environments (a plain label when there is only one; when the row is too narrow its start is clipped, so the end of the name and the arrow stay visible). Then groups with their titles in square brackets, each folded and unfolded by a click on its title (open by default, with chevrons, not remembered):
  - `[General]`: Build, Build & Upload, Build & Upload & Monitor, Serial Monitor, Clean. The two upload tasks show only when the environment has an `upload` target. While targets load, a dimmed "Loading targets…" row follows.
  - `[Extra Scripts]`: the targets the active environment's own `extra_scripts` add.
  - `[Platform]`: every other target of the environment except `upload`, in the order `pio` reports them (platform targets, then the platform package's `Custom` targets).
  - `[Advanced]`: Analyze Code, Update Packages.
  - `[PlatformIO]`: PlatformIO Home, Upgrade PlatformIO.
  - `[Extra Scripts]` and `[Platform]` show only when they have entries.
- **Footer, 36px, only with a project:** "Upload port:" and a dropdown of the connected serial ports (`Auto` by default), read with `pio device list` each time it opens.
- Each task has a 12px icon in the theme's `muted` color: a triangle by default, a hammer (`ansi3`) for Build, an upload arrow (`ansi2`) for Build & Upload and Build & Upload & Monitor, a terminal (`ansi4`) for Serial Monitor, a trash can (`muted`, like the default) for Clean. The PlatformIO logo sits in the `platformio.ini` row.

## How it behaves

- **Project:** the focused terminal pane's folder (else the space's folder; in its own tab the mod has the focus, so it uses the space's folder), and only that folder: it counts as a project when it holds a `platformio.ini` itself. There is no search up or down. Without one the view says "No platformio.ini in this folder" ("Looking for a PlatformIO project…" while it checks); without `pio` it says "PlatformIO (pio) was not found on PATH".
- **Environment:** the saved one, else `default_envs`, else the first. The choice, the port and "Verbose" are remembered per project.
- **Targets:** from `pio project metadata -e <env> --json-output`, often 15 to 45 seconds, longer when it first downloads a platform; it gives up after 5 minutes. The environments come from `pio project config --json-output`. Both are fetched again only when `platformio.ini` changes or the reload icon is clicked; the targets are kept per project and environment (in `localStorage`). The folder and file are checked every 10 seconds, and right away when the focused folder changes.
- **Run a task:** a click opens a terminal under the focused pane (a new tab when no pane has focus) and runs the command; its pane header shows the task's title in square brackets ("[Build]", "[Serial Monitor]"). A terminal that the task replaces in the focused tab gives the new one its pane, at the same place and size; the task's icon turns the `working` color while its terminal is open (only tasks with the default triangle; tasks with their own icon keep their color). One task terminal at a time, a monitor included: a new task closes the previous one. The terminal stays after the program ends until Enter is pressed.
- **Commands:** targets run `pio run -e <env> -t <target>`; Build `pio run -e <env>`; Build & Upload `-t upload`; Build & Upload & Monitor `-t upload -t monitor`; Clean `-t clean`; Serial Monitor `pio device monitor -e <env>`; Analyze Code `pio check -e <env>`; Update Packages `pio pkg update -e <env>`; Home `pio home`; Upgrade PlatformIO `pio upgrade`. A tooltip on each task shows its full command (`pio …` with the current flags). "Verbose" adds `-v` to the `pio run` tasks and Analyze Code. A chosen port adds `--upload-port <port>` to Build & Upload and every Extra Scripts and Platform target, `--upload-port` and `--monitor-port <port>` to Build & Upload & Monitor, and `--port <port>` to Serial Monitor.
- **Editor:** a click on the `platformio.ini` row opens the file in herdr's `Editor` (editable, line numbers, no syntax colours). "Save" writes the file with `writeTextFile(path, text, expected)`, which fails when the file changed on disk meanwhile, then reloads the targets. "Save" shows only with unsaved changes. If the file changes on disk while there are unsaved edits, nothing is overwritten: the header says "platformio.ini changed on disk" and shows "Reload" (discards the edits). The back arrow asks once ("click ← again to discard") when there are unsaved changes. Saving works on this computer only.
- **Port list:** "Searching…" while `pio device list` runs, then the devices with a hardware id; if it fails, its error shows instead of "No devices found".
- **Keys:** the panel reads `nextCommand()`: `platformio.ini` opens or closes the editor, `platformio.save` saves. Both can be bound in `keys.json`.

## Built from

- One file, `mods/platformio/main.js`, a `View` class with two `props` roles: none is the panel itself, `{ "button": true }` is the tab bar button (it toggles `panel` and selects the `platformio` child of `panel-body`, and adds `"platformio"` to shared `"workspace.panels"` so the tabs mod restores it per space). `mod.json` is `{ "place": "none", "title": "PlatformIO" }`.
- `gpui-kit`: `View`, `div`, `image`, `svg`; `herdr`: `spaces`, `panes`, `focused`, `terminals`, `exec`, `readTextFile`, `writeTextFile`, `run` (`terminal.open`, `terminal.kill`, `pane.split`, `pane.swap`, `layout.select`, `layout.show`, `layout.hide`), `layout`, `home`, `props`, `shared`, `setShared`, `theme`, `settings`, `nextCommand`, `checking`; `gpui-base`: `v_flex`, `h_flex`, `Editor`, `EditorState`, `Popover`. Caches and preferences live in `localStorage`.
- Icons in the folder: `logo.svg` (the PlatformIO logo), `task.svg`, `hammer.svg`, `upload.svg`, `terminal.svg`, `trash.svg`, `refresh.svg`, `chevron-down.svg`, `chevron-right.svg`. `svg()` tints the whole icon in one color. Task icons use 2px strokes with round caps and joins, rounded corners a 2.5 radius; only the upload icon has a filled arrow and a 3px bar.
- Programs it runs: `pio`, and `/bin/sh` with `head` (the terminal wrapper only; see README).

## Recommended install

1. Copy `mods/platformio/` to `~/.config/herdr-app/mods/platformio/` and run `herdr-app check` on it. This alone changes nothing on screen: `"place": "none"` docks nothing.
2. **Ask the person first:** "Add a PlatformIO button next to Files and Changes? This changes your layout." Without a yes, stop here and point to the tab route (`herdr-app do tab.new --mod platformio --name PlatformIO`).
3. Find the shown layout: `herdr-app status` prints it as `"layout"`; the file is `layouts/<name>.json`. herdr's own layouts (`main`, `terminals`, `win98`) are read-only and restored on every start, so never edit them. If the person uses `main`, run `herdr-app do layout.clone '{"name":"main"}'` (herdr names it `main-copy`; if that name is taken, add `"as"` with a free name; it switches to the clone) and tell them the clone no longer receives herdr's updates to `main`. A layout that is already the person's own (a clone) is edited in place; no new layout is made. If the layout has no block with `"content": { "mod": "tabs" }` or no stack `panel-body`, it is not built like `main`: do not guess, stop and use the tab route.
4. If the layout already has a block with `"mod": "platformio"` (an earlier install), leave it as it is and skip to step 5. Otherwise change two nodes and nothing else:
   - **Tab bar:** replace the block whose `content` is `{ "mod": "tabs" }` (in `main` it carries `"size": { "px": 42 }` and `"window_drag": true`) with a row that holds it and the button; the row takes over the block's size:
     ```json
     { "id": "tabs-row", "type": "row", "size": { "px": 42 }, "resizable": false, "children": [
       { "id": "tabs", "type": "block", "window_drag": true, "content": { "mod": "tabs" } },
       { "id": "platformio-button", "type": "block", "size": { "px": 112 }, "content": { "mod": "platformio", "props": { "button": true } } }
     ] }
     ```
   - **Panel:** append `{ "id": "platformio", "type": "block", "content": { "mod": "platformio" } }` to the children of the stack `panel-body` (after `files` and `changes`).
5. Keep the file's other keys and order, and run `herdr-app status` to check for errors.

## Watch out

- `pio project metadata` is slow: it loads the environment's whole build configuration (no compiling). Bumping the cache key (`targets-v3`) makes every project fetch its targets again, and any edit to `platformio.ini` does so for that project, so do either only on purpose.
- herdr has no INI grammar: `ini` and `toml` are unknown languages (no colours), `yaml` colours the whole file green and `properties` colours it wrongly. Leave the editor without colours.
- Terminals are recognised by their `argv`; the `sh -c` wrapper is `argv[2]`, the task name `argv[3]` and its title `argv[4]` (`[<title>]`). The wrapper sets the terminal title to it (`OSC 2`), which the pane header shows. It waits for Enter with `exec head -n 1`, not the shell's `read`: herdr's header names a waiting shell "sh" instead of the title.
- A replaced task terminal hands its pane to the new one: herdr gives a closed pane's space to the pane above it, so the mod splits the old pane down, swaps the new pane above it (`pane.swap` with `target`; a swap by `direction` does not keep the size) and then kills the old terminal.
- macOS and Linux only (the wrapper is `/bin/sh`).

## Done when

- `herdr-app check ~/.config/herdr-app/mods/platformio` passes and `herdr-app status` shows no errors.
- With the recommended install, the tab bar shows a "PlatformIO" button right of Changes; clicking it opens the panel on the right, clicking again hides it.
- In a space whose folder holds a `platformio.ini`, the panel shows the tree with `[General]` and `[PlatformIO]`.
- Clicking Build runs `pio run -e <env>` in a terminal under the pane and the terminal stays until Enter.
- Opening `platformio.ini`, changing a line and pressing Save writes the file, and the "●" disappears.
- Changing the file on disk while there are unsaved edits shows "platformio.ini changed on disk" and does not overwrite the edits.
