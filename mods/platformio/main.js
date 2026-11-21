// PlatformIO tasks for the focused pane's project: the active environment's General, Extra Scripts,
// Platform and Advanced tasks, then PlatformIO. A click runs the task in a terminal.
// With props { button: true } it draws the tab bar button that shows this panel instead.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, Popover, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, terminals, layout, home, exec, readTextFile, writeTextFile, run, theme, settings, props, shared, setShared, nextCommand, checking } from "herdr";

// Spacing is a 4px grid: 4 between small controls, 8 inside rows and between an icon and its label,
// 16 from the panel edge to the text (8 around the tree plus 8 inside a row).
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}

// pio is on PATH, else in PlatformIO's own virtualenv (the installer's default place).
async function findPio(on) {
  const candidates = ["pio", "platformio", ...(on ? [] : [`${home()}/.platformio/penv/bin/pio`])];
  for (const command of candidates) {
    try { if ((await exec(command, ["--version"], { on })).code === 0) return command; } catch {}
  }
  return null;
}

// A pane closes when its program exits: keep the output until Enter.
const WRAP = '"$@"; c=$?; printf "\\n\\033[2m[exit %s] Press Enter to close\\033[0m " "$c"; read -r _';
// Targets that leave the serial port alone, so a running monitor survives them.
const OFFLINE = new Set(["menuconfig", "buildfs", "size", "uploadfsota", "metrics", "metrics-only", "coredump-only", "decode_crash"]);
// Tasks that keep the serial port open after they start.
const HOLDING = new Set(["pio-monitor", "pio-upload-monitor"]);

// The editor has no INI grammar (like toml in the files mod); this is the closest one.
const INI_LANGUAGE = "ini";

const load = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const hash = (text) => { let h = 5381; for (let i = 0; i < text.length; i++) h = (h * 33 ^ text.charCodeAt(i)) >>> 0; return h; };
const find = (node, id) => {
  if (!node || node.id === id) return node ?? null;
  for (const child of node.children ?? []) { const hit = find(child, id); if (hit) return hit; }
  return null;
};
const termName = (task) => `pio-${task.id}`;
// A task's terminal is known by its argv: the wrapper, then the task as the script's $0.
const taskOf = (terminal) => terminal.state === "live" && terminal.argv?.[2] === WRAP ? terminal.argv[3] : null;

export default class PlatformIO extends View {
  init(_props, cx) {
    this.open = { general: true, scripts: true, platform: true, advanced: true, pio: true };
    this.envs = []; this.targets = null; this.scripts = {}; this.ports = null;
    if (checking()) return;
    if (props()?.button) {
      // The tab bar restores each space's side panel only from this list.
      const enabled = shared("workspace.panels") ?? ["files", "changes"];
      if (Array.isArray(enabled) && !enabled.includes("platformio")) setShared("workspace.panels", [...enabled, "platformio"]);
      return;
    }
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
    // The commands "platformio.ini" (open or close the editor) and "platformio.save" can be bound in keys.json.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "save") this.save(cx);
        else if (command !== "ini") continue;
        else if (this.code) this.leave(cx);
        else { this.view(this.ini ?? null); cx.notify(); }
      }
    });
  }

  refresh(cx, force = false) {
    const { cwd, on } = location();
    if (!cwd || this.busy) return;
    this.busy = true; this.cwd = cwd;
    cx.spawn(async (cx) => {
      try {
        this.pio ??= await findPio(on);
        if (!this.pio) { this.error = "PlatformIO (pio) was not found on PATH"; return; }
        const ini = await readTextFile(`${cwd}/platformio.ini`, { on }).catch(() => null);
        const dir = ini === null ? null : cwd;
        if (dir !== this.dir) {
          const saved = load(`prefs:${dir}`) ?? {};
          this.view(null);
          this.dir = dir; this.on = on; this.ini = null; this.envs = []; this.targets = null; this.error = null;
          this.env = saved.env ?? null; this.port = saved.port ?? null; this.verbose = Boolean(saved.verbose);
        }
        if (!dir) return;
        if (this.code && ini !== this.shown) { if (this.dirty) this.stale = true; else this.view(ini); }
        if (ini === this.ini && !force) return;
        const config = await exec(this.pio, ["project", "config", "--json-output"], { cwd: dir, on });
        if (config.code !== 0) throw new Error(config.stderr.trim() || "pio project config failed");
        const sections = Object.fromEntries(JSON.parse(config.stdout).map(([name, options]) => [name, Object.fromEntries(options)]));
        this.envs = Object.keys(sections).filter((s) => s.startsWith("env:")).map((s) => s.slice(4));
        // Config merges [env] into each environment, so this is the env's own list ("pre:"/"post:" stripped).
        this.scripts = Object.fromEntries(this.envs.map((e) => [e, [].concat(sections[`env:${e}`]?.extra_scripts ?? []).map((p) => p.replace(/^(pre|post):/, ""))]));
        const preferred = [].concat(sections.platformio?.default_envs ?? [])[0];
        if (!this.envs.includes(this.env)) this.env = this.envs.includes(preferred) ? preferred : this.envs[0] ?? null;
        this.ini = ini; this.error = null;
        await this.loadTargets(force, cx);
      } catch (e) { this.error = String(e?.message ?? e); }
      finally { this.busy = false; cx.notify(); }
    });
  }

  // `pio project metadata` loads the whole build environment (~15 s here), so its targets are
  // kept per environment until platformio.ini changes or the person reloads.
  async loadTargets(force, cx) {
    const dir = this.dir, env = this.env, stamp = hash(this.ini ?? ""), cacheKey = `targets-v3:${dir}:${env}`;
    this.targets = null;
    if (!env) return;
    const cached = load(cacheKey);
    if (!force && cached?.stamp === stamp) { this.targets = cached.targets; return; }
    this.loading = true; cx.notify();
    try {
      const r = await exec(this.pio, ["project", "metadata", "-e", env, "--json-output"], { cwd: dir, on: this.on, timeout: 300000 });
      if (dir !== this.dir || env !== this.env) return;
      if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || "pio project metadata failed");
      const targets = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")))[env]?.targets ?? [];
      // The targets this environment's own extra_scripts add: the names in their AddCustomTarget calls.
      const own = new Set();
      for (const path of this.scripts[env] ?? []) {
        const text = await readTextFile(`${dir}/${path}`, { on: this.on }).catch(() => null);
        for (const m of (text ?? "").matchAll(/AddCustomTarget\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/g)) own.add(m[1]);
      }
      this.targets = targets.map(({ name, title, group }) => ({ name, title: title || name, group, own: group === "Custom" && own.has(name) }));
      localStorage.setItem(cacheKey, JSON.stringify({ stamp, targets: this.targets }));
    } finally { this.loading = false; }
  }

  // Shows platformio.ini in place of the tree, editable; null goes back. `shown` is the text on
  // disk as last read or written: it is what writeTextFile checks a save against.
  view(text) {
    this.code?.release(); this.code = null;
    this.shown = text; this.dirty = false; this.stale = false; this.leaving = false; this.saveError = null;
    if (text == null) return;
    const t = theme(), code = EditorState.new({ language: INI_LANGUAGE, value: text,
      font_family: settings().font_family, font_size: 12, folding: false,
      syntax: { keyword: t.ansi4, string: t.ansi2, comment: t.dim, function: t.ansi3, type: t.ansi3, number: t.ansi6, constant: t.ansi5, variable: t.ansi4, operator: t.muted, punctuation: t.muted } });
    code.on("change", (_e, cx) => { this.dirty = code.value() !== this.shown; this.leaving = false; cx.notify(); });
    this.code = code;
  }

  // Back out of the viewer; with unsaved changes the first call only asks.
  leave(cx) {
    if (this.dirty && !this.leaving) this.leaving = true; else this.view(null);
    cx.notify();
  }

  save(cx) {
    if (!this.code || !this.dirty || this.saving) return;
    if (this.on) { this.saveError = "Saving works on this computer only"; return cx.notify(); }
    const text = this.code.value(), expected = this.shown;
    this.saving = true; this.saveError = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        await writeTextFile(`${this.dir}/platformio.ini`, text, expected);
        this.shown = text; this.dirty = this.code?.value() !== text; this.stale = false;
        this.refresh(cx, true);
      } catch (e) { this.saveError = String(e?.message ?? e); }
      finally { this.saving = false; cx.notify(); }
    });
  }

  // Drops the edits for what is on disk now.
  reload(cx) {
    const dir = this.dir, on = this.on;
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${dir}/platformio.ini`, { on });
      if (dir === this.dir && text != null) this.view(text);
      cx.notify();
    });
  }

  savePrefs() {
    localStorage.setItem(`prefs:${this.dir}`, JSON.stringify({ env: this.env, port: this.port, verbose: this.verbose }));
  }

  selectEnv(env, cx) {
    this.picking = false;
    if (this.busy || env === this.env) return cx.notify();
    this.env = env;
    this.savePrefs(); this.error = null; this.busy = true;
    cx.spawn(async (cx) => {
      try { await this.loadTargets(false, cx); }
      catch (e) { this.error = String(e?.message ?? e); }
      finally { this.busy = false; cx.notify(); }
    });
    cx.notify();
  }

  // Lists the connected serial devices each time the port menu opens.
  listPorts(cx) {
    this.ports = null; this.portError = null;
    if (!this.pio || !this.dir) { this.ports = []; return; }
    cx.spawn(async (cx) => {
      try {
        const r = await exec(this.pio, ["device", "list", "--json-output"], { on: this.on });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || "pio device list failed");
        this.ports = JSON.parse(r.stdout).filter((d) => d.hwid && d.hwid !== "n/a").map((d) => d.port);
      } catch (e) { this.ports = []; this.portError = String(e?.message ?? e); }
      finally { cx.notify(); }
    });
  }

  selectPort(port, cx) {
    this.pickingPort = false;
    this.port = port;
    this.savePrefs();
    cx.notify();
  }

  groups() {
    const env = this.env, v = this.verbose ? ["-v"] : [], port = this.port ? ["--upload-port", this.port] : [];
    const target = (...names) => ["run", "-e", env, ...names.flatMap((n) => ["-t", n]), ...v];
    const task = (t) => ({ id: t.name, title: t.title, args: [...target(t.name), ...port], serial: !OFFLINE.has(t.name) });
    const upload = (this.targets ?? []).find((t) => t.name === "upload");
    // PlatformIO files every AddCustomTarget under "Custom": the environment's own extra_scripts add some, the platform's builder the rest.
    const scriptTasks = (this.targets ?? []).filter((t) => t.own).map(task);
    const platformTasks = (this.targets ?? []).filter((t) => !t.own && t.name !== "upload").map(task);
    return [
      { id: "general", title: env ? "General" : "No environment", tasks: !env ? [] : [
        { id: "build", title: "Build", icon: "hammer", color: "ansi3", args: target() },
        ...(upload ? [{ ...task(upload), title: "Build & Upload", icon: "upload", color: "ansi2" },
          { id: "upload-monitor", title: "Build & Upload & Monitor", icon: "upload", color: "ansi2", args: [...target("upload", "monitor"), ...port, ...(this.port ? ["--monitor-port", this.port] : [])], serial: true }] : []),
        { id: "monitor", title: "Serial Monitor", icon: "terminal", color: "ansi4", args: ["device", "monitor", "-e", env, ...(this.port ? ["--port", this.port] : [])], serial: true },
        { id: "clean", title: "Clean", icon: "trash", args: target("clean") }] },
      ...(scriptTasks.length ? [{ id: "scripts", title: "Extra Scripts", tasks: scriptTasks }] : []),
      ...(platformTasks.length ? [{ id: "platform", title: "Platform", tasks: platformTasks }] : []),
      ...(!env ? [] : [{ id: "advanced", title: "Advanced", tasks: [
        { id: "check", title: "Analyze Code", args: ["check", "-e", env, ...v] },
        { id: "update", title: "Update Packages", args: ["pkg", "update", "-e", env] }] }]),
      { id: "pio", title: "PlatformIO", tasks: [
        { id: "home", title: "PlatformIO Home", args: ["home"] },
        { id: "upgrade", title: "Upgrade PlatformIO", args: ["upgrade"] }] }];
  }

  // One output terminal at a time, a task rerun replaces it; a monitor stays until a task needs its port.
  start(task) {
    const name = termName(task), holds = HOLDING.has(name);
    for (const terminal of terminals()) {
      const other = taskOf(terminal);
      if (other && (other === name || (HOLDING.has(other) ? task.serial : !holds))) run("terminal.kill", { terminal: terminal.address });
    }
    run("terminal.open", { argv: ["/bin/sh", "-c", WRAP, name, this.pio, ...task.args], folder: this.dir,
      place: focused()?.pane ? "down" : "tab" });
  }

  renderButton(t) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    const on = panel && !panel.hidden && body?.active === "platformio";
    return h_flex().size_full().pr(8).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("panel-platformio").h(26).px(8).gap(4).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: "platformio" }); run("layout.show", { id: "panel" }); }
        }).child(image("mods/platformio/logo.svg").size(15).flex_none()).child("PlatformIO"));
  }

  render(cx) {
    const t = theme();
    if (props()?.button) return this.renderButton(t);
    if (!checking() && location().cwd !== this.cwd) this.refresh(cx);
    const live = new Set(terminals().map(taskOf).filter(Boolean));
    const tool = (id, label, on, action, tip) => div().id(id).h(24).px(8).flex().items_center().rounded(6).text_size(12).cursor_pointer()
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover)).when(Boolean(tip), (el) => el.tooltip(tip)).on_click(action).child(label);
    const rows = [];
    // A small button reading "<prefix><label>"; only the label shrinks, and a row clips its start.
    const pill = (prefix, label, picking, chevron) => h_flex().h(24).px(8).gap(4).items_center().rounded(6).text_size(12).min_w(0)
      .text_color(picking ? t.foreground : t.muted)
      .when(chevron, (el) => el.bg(picking ? t.selected : t.background).cursor_pointer().hover((s) => s.bg(t.hover)))
      .child(div().flex_none().child(prefix)).child(div().min_w(0).truncate().child(label))
      .when(chevron, (el) => el.child(svg("mods/platformio/chevron-down.svg").size(11).flex_none()));
    const menu = (id, prefix, label, picking, onOpen, items, empty) => Popover.new(id).open(Boolean(picking))
      .on_open_change(onOpen)
      .trigger(h_flex().id(`${id}-trigger`).tooltip(`${prefix}${label}`).child(pill(prefix, label, picking, true)))
      .content(v_flex().id(`${id}-list`).min_w(200).max_h(320).overflow_y_scrollbar().p(4).rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(13)
        .children(items.map((it) => h_flex().id(`${id}-${it.value ?? "auto"}`).h(28).flex_none().px(8).gap(8).items_center().rounded(6).cursor_pointer()
          .when(it.on, (row) => row.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => it.pick(cx))
          .child(div().flex_1().min_w(0).truncate().child(it.label))))
        .when(Boolean(empty), (el) => el.child(div().h(28).px(8).flex().items_center().text_size(12).text_color(t.dim).child(empty))));
    const envMenu = () => menu("pio-env-menu", "Environment: ", this.env, this.picking, (open, cx) => { this.picking = open; cx.notify(); },
      this.envs.map((env) => ({ value: env, label: env, on: env === this.env, pick: (cx) => this.selectEnv(env, cx) })));
    const portMenu = () => menu("pio-port-menu", "", this.port ?? "Auto", this.pickingPort,
      (open, cx) => { this.pickingPort = open; if (open) this.listPorts(cx); cx.notify(); },
      [{ value: null, label: "Auto", on: !this.port, pick: (cx) => this.selectPort(null, cx) },
        ...(this.ports ?? []).map((p) => ({ value: p, label: p, on: p === this.port, pick: (cx) => this.selectPort(p, cx) }))],
      this.ports == null ? "Searching…" : this.ports.length ? null : this.portError ?? "No devices found");
    if (this.dir && this.ini != null) rows.push(h_flex().h(28).flex_none().items_center()
      .child(h_flex().id("pio-ini").flex_none().h_full().pl(8).pr(4).gap(8).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.view(this.ini); cx.notify(); })
        .child(image("mods/platformio/logo.svg").size(14).flex_none())
        .child(div().child("platformio.ini")))
      .child(div().id("pio-reload").size(24).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
        .tooltip("Reload targets from platformio.ini").on_click((_e, cx) => { this.refresh(cx, true); cx.notify(); })
        .child(svg("mods/platformio/refresh.svg").size(14).text_color(this.loading || this.busy ? t.working : t.muted)))
      .child(h_flex().flex_1().min_w(0).overflow_hidden().justify_end()
        .when(Boolean(this.env) && this.envs.length > 1, (el) => el.child(envMenu()))
        .when(Boolean(this.env) && this.envs.length === 1, (el) => el.child(h_flex().id("pio-env-label").tooltip(`Environment: ${this.env}`).child(pill("Environment: ", this.env, false, false))))));
    for (const g of this.dir ? this.groups() : []) {
      const open = this.open[g.id];
      rows.push(h_flex().h(28).flex_none().items_center()
        .child(h_flex().id(`pio-group-${g.id}`).flex_1().min_w(0).h_full().px(8).gap(8).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.open[g.id] = !open; cx.notify(); })
          .child(svg(`mods/platformio/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))
          .child(div().flex_1().min_w(0).truncate().child(`[${g.title}]`))));
      if (!open) continue;
      const taskRow = (task, pl) => h_flex().id(`pio-task-${task.id}`).h(26).flex_none().pl(pl).pr(8).gap(8).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
        .tooltip(["pio", ...task.args].join(" ")).on_click(() => this.start(task))
        .child(svg(`mods/platformio/${task.icon ?? "task"}.svg`).size(12).flex_none().text_color(!task.icon && live.has(termName(task)) ? t.working : t[task.color] ?? t.muted))
        .child(div().flex_1().min_w(0).truncate().child(task.title));
      for (const task of g.tasks) rows.push(taskRow(task, 28));
      if (g.id === "general" && this.loading) rows.push(div().h(26).flex_none().pl(28).flex().items_center().text_size(12).text_color(t.dim).child("Loading targets…"));
    }
    const viewing = Boolean(this.code);
    const note = this.saveError ?? (this.leaving ? "Unsaved changes: click ← again to discard" : this.stale ? "platformio.ini changed on disk" : null);
    const empty = this.error || (this.dir ? null : this.busy ? "Looking for a PlatformIO project…" : "No platformio.ini in this folder");
    return v_flex().id("platformio").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(16).gap(8).items_center().border_b(1).border_color(t.border)
        .when(viewing, (el) => el.child(div().id("pio-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => this.leave(cx)).child("←")))
        .child(div().font_semibold().child(viewing ? "platformio.ini" : "PlatformIO"))
        .when(this.dirty, (el) => el.child(div().text_color(t.blocked).child("●")))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(note ? t.blocked : t.dim).child(note ?? this.dir?.split("/").pop() ?? ""))
        .when(viewing && this.stale, (el) => el.child(tool("pio-ini-reload", "Reload", false, (_e, cx) => this.reload(cx))))
        .when(viewing && this.dirty, (el) => el.child(tool("pio-ini-save", this.saving ? "Saving…" : "Save", true, (_e, cx) => this.save(cx))))
        .when(!viewing, (el) => el
          .child(tool("pio-verbose", "Verbose", this.verbose, (_e, cx) => { this.verbose = !this.verbose; if (this.dir) this.savePrefs(); cx.notify(); }, "Add -v to the pio commands for more detailed output"))))
      .when(viewing, (el) => el.child(div().id("pio-ini-editor").flex_1().min_h(0).child(Editor.new(this.code))))
      .when(!viewing, (el) => el.child(v_flex().id("pio-tree").flex_1().min_h(0).overflow_y_scrollbar().p(8).children(rows)
        .when(Boolean(empty), (el) => el.child(div().p(8).text_size(12).text_color(this.error ? t.ansi1 : t.dim).child(empty)))))
      .when(Boolean(this.dir) && !viewing, (el) => el.child(h_flex().h(36).flex_none().px(16).gap(8).items_center().border_t(1).border_color(t.border).text_size(12)
        .child(div().text_color(t.muted).child("Upload port:"))
        .child(portMenu())));
  }
}
