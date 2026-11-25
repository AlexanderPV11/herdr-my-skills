// Skills: a dialog listing the Claude Code skills on this computer, grouped by where they live,
// with each one's folder, description and SKILL.md. The search is done by scan.py.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState, ScrollHandle } from "gpui-base";
import { spaces, panes, focused, exec, run, shared, setShared, props, closeOverlay, theme, settings, readTextFile, appHome } from "herdr";

const VIEWER = "file-viewer", OPEN = "file-viewer:open";
const GROUPS = [["project", "Proyecto"], ["personal", "Personales"], ["plugins", "Plugins instalados"], ["catalog", "Catálogo (no instaladas)"]];
const PREVIEW_LINES = 300;

// The focused pane's folder, where the project skills are looked for first.
function currentFolder() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  return pane?.cwd || f?.cwd || space?.folder || "";
}

export default class Skills extends View {
  init(_props, cx) {
    this.root = currentFolder();
    this.skills = []; this.home = ""; this.items = []; this.rows = []; this.sel = 0;
    this.folded = new Set(["catalog"]);
    this.status = "Buscando skills…"; this.preview = null; this.pseq = 0; this.busy = false;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Buscar por nombre, descripción o directorio…" });
    this.input.on("change", (_e, cx) => { this.sel = 0; this.arrange(); this.loadPreview(cx); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.open(cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.load(cx);
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python", ["-X", "utf8", `${appHome()}/mods/skills/scan.py`, this.root], { timeout: 60000 });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || "scan.py falló");
        const data = JSON.parse(r.stdout);
        this.skills = data.skills; this.home = data.home;
        this.arrange();
        this.loadPreview(cx);
      } catch (e) { this.status = `No se pudieron leer las skills: ${String(e?.message ?? e)}`; }
      cx.notify();
    });
  }

  // The list as drawn: group headers and rows. A search looks in every group, folded or not.
  arrange() {
    const words = this.input.value().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (s) => {
      const text = `${s.name} ${s.description} ${s.dir}`.toLowerCase();
      return words.every(w => text.includes(w));
    };
    this.items = []; this.rows = [];
    let total = 0;
    for (const [id, title] of GROUPS) {
      const mine = this.skills.filter(s => s.group === id && match(s));
      if (!mine.length) continue;
      total += mine.length;
      const open = words.length > 0 || !this.folded.has(id);
      this.items.push({ header: id, title, count: mine.length, open });
      if (!open) continue;
      for (const skill of mine) {
        this.items.push({ skill, row: this.rows.length });
        this.rows.push(skill);
      }
    }
    this.sel = Math.min(this.sel, Math.max(0, this.rows.length - 1));
    this.status = total ? `${total} skill${total === 1 ? "" : "s"}` : "Sin resultados";
  }

  short(path) {
    return this.home && path.toLowerCase().startsWith(this.home.toLowerCase()) ? "~" + path.slice(this.home.length) : path;
  }

  loadPreview(cx) {
    const skill = this.rows[this.sel];
    const seq = ++this.pseq;
    if (!skill) { this.preview = null; return; }
    if (this.preview?.file === skill.file) return;
    this.preview = { file: skill.file, lines: ["Cargando…"] };
    cx.spawn(async (cx) => {
      let lines;
      try {
        const text = await readTextFile(skill.file);
        lines = text === null ? ["El archivo ya no existe."] : text.split(/\r?\n/);
        if (lines.length > PREVIEW_LINES) lines = [...lines.slice(0, PREVIEW_LINES), "… (Enter abre el archivo completo)"];
      } catch (e) { lines = [`No se pudo leer: ${String(e?.message ?? e)}`]; }
      if (seq !== this.pseq) return;
      this.preview = { file: skill.file, lines };
      cx.notify();
    });
  }

  select(i, cx) {
    this.sel = i;
    this.loadPreview(cx);
    cx.notify();
  }

  move(by, cx) {
    if (!this.rows.length) return;
    const next = (this.sel + by + this.rows.length) % this.rows.length;
    this.scroll.scroll_to_item(this.items.findIndex(it => it.row === next));
    this.select(next, cx);
  }

  // SKILL.md in a file-viewer tab, the same bookkeeping as my-files: an open tab is reused.
  open(cx) {
    const skill = this.rows[this.sel];
    if (!skill || this.busy) return;
    this.busy = true;
    const file = skill.file, key = `|${file}`, overlay = props()?.overlay;
    const open = { ...(shared(OPEN) ?? {}) }, entry = open[key], tab = typeof entry === "string" ? entry : entry?.tab;
    const hasViewer = panes().some(p => p.tab === tab && p.mod === VIEWER);
    if (tab && hasViewer) { closeOverlay(overlay); run("tab.select", { id: tab }); return; }
    if (entry) { delete open[key]; setShared(OPEN, open); }
    const before = new Set(panes().filter(p => p.mod === VIEWER).map(p => p.pane));
    run("tab.new", { name: `${skill.name} · SKILL.md`, mod: VIEWER, props: { file, on: null } });
    const claim = (n) => (cx) => {
      const fresh = panes().find(p => p.mod === VIEWER && !before.has(p.pane));
      if (fresh) { setShared(OPEN, { ...(shared(OPEN) ?? {}), [key]: { tab: fresh.tab, root: skill.dir } }); closeOverlay(overlay); }
      else if (n < 20) cx.timer.after(100, claim(n + 1));
      else closeOverlay(overlay);
    };
    cx.timer.after(50, claim(0));
  }

  copy(text, what, cx) {
    cx.write_to_clipboard(text);
    this.status = `Copiado: ${what}`;
    cx.notify();
  }

  folder(skill, cx) {
    // explorer.exe wants backslashes, and exits with 1 even when it worked.
    const path = skill.dir.split("/").join(String.fromCharCode(92));
    cx.spawn(async (cx) => {
      try { await exec("explorer", [path]); }
      catch (e) { this.status = `No se pudo abrir la carpeta: ${String(e?.message ?? e)}`; cx.notify(); }
    });
  }

  button(t, id, label, action) {
    return h_flex().id(id).h(24).px(9).flex_none().items_center().rounded(6).border_1().border_color(t.border)
      .text_size(11.5).cursor_pointer().hover(s => s.bg(t.hover))
      .on_click((_e, cx) => action(cx)).child(label);
  }

  listItem(t, item) {
    if (item.header) {
      return h_flex().id(`sk-group-${item.header}`).w_full().h(28).flex_none().px(8).gap(6).items_center().rounded(6).cursor_pointer()
        .text_size(11).text_color(t.dim).hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          this.folded.has(item.header) ? this.folded.delete(item.header) : this.folded.add(item.header);
          this.sel = 0; this.arrange(); this.loadPreview(cx); cx.notify();
        })
        .child(div().w(12).flex_none().child(item.open ? "▾" : "▸"))
        .child(div().flex_1().child(item.title))
        .child(div().flex_none().child(String(item.count)));
    }
    const s = item.skill;
    return v_flex().id(`sk-row-${item.row}`).w_full().h(42).flex_none().pl(26).pr(8).justify_center().rounded(6).cursor_pointer()
      .when(item.row === this.sel, el => el.bg(t.selected)).hover(el => el.bg(t.hover))
      .on_click((_e, cx) => this.select(item.row, cx))
      .child(div().truncate().text_size(12.5).child(s.name))
      .child(div().truncate().text_size(10.5).text_color(t.dim).child(this.short(s.dir)));
  }

  detail(t) {
    const box = v_flex().flex_1().min_w(0).min_h(0).overflow_hidden().rounded(8).border_1().border_color(t.border).bg(t.background);
    const s = this.rows[this.sel];
    if (!s) return box.child(div().p(12).text_size(12).text_color(t.dim).child("Selecciona una skill"));
    return box
      .child(v_flex().flex_none().p(12).gap(7).border_b(1).border_color(t.border)
        .child(div().text_size(15).font_bold().child(s.name))
        .when(Boolean(s.description), el => el.child(div().text_size(12).text_color(t.muted).child(s.description)))
        .child(div().text_size(11).text_color(t.dim).child("Directorio"))
        .child(div().text_size(11.5).child(s.dir))
        .child(h_flex().gap(6)
          .child(this.button(t, "sk-open", "Abrir SKILL.md", cx => this.open(cx)))
          .child(this.button(t, "sk-folder", "Abrir carpeta", cx => this.folder(s, cx)))
          .child(this.button(t, "sk-copy-dir", "Copiar ruta", cx => this.copy(s.dir, "ruta", cx)))
          .child(this.button(t, "sk-copy-name", `Copiar /${s.name}`, cx => this.copy(`/${s.name}`, `/${s.name}`, cx)))))
      .child(v_flex().id("sk-preview").flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().p(12).flex_none().text_size(11.5).font_family(settings().font_family)
          .children((this.preview?.lines ?? []).map(line => div().flex_none().min_h(16).child(line || " ")))));
  }

  render(cx) {
    const t = theme();
    return v_flex().id("skills").track_focus(this.handle).size_full().min_h(0).p(14).gap(10).bg(t.popover).text_color(t.foreground).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); }
        else if (e.key === "down") { this.move(1, cx); cx.stop_propagation(); }
        else if (e.key === "up") { this.move(-1, cx); cx.stop_propagation(); }
        else if (e.key === "enter") { this.open(cx); cx.stop_propagation(); }
      })
      .child(h_flex().gap(8).items_center()
        .child(div().flex_none().text_size(13).font_bold().child("Skills"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(t.dim).child(this.root)))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.accent).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().flex_1().min_h(0).gap(10)
        .child(v_flex().id("sk-list").w(390).flex_none().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).gap(1)
          .children(this.items.map(item => this.listItem(t, item))))
        .child(this.detail(t)))
      .child(h_flex().gap(10).items_center().text_size(11).text_color(t.dim)
        .child(div().flex_1().child(this.status))
        .child(div().child("↑↓ mover · Enter abrir · Esc cerrar")));
  }
}
