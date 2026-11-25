# herdr-my-skills

Mod para [Herdr](https://herdr.dev) que lista las **skills de Claude Code** que hay en tu equipo, en qué **directorio** está cada una y qué contiene su `SKILL.md`. Se abre como un diálogo con una tecla.

## Qué hace

- Agrupa las skills por origen:

  | Grupo | Dónde busca |
  |---|---|
  | **Proyecto** | `.claude/skills` en la carpeta del pane enfocado y sus carpetas superiores, y hasta 4 niveles por debajo de esa carpeta y de `~/Documents` |
  | **Personales** | `~/.claude/skills` (incluye las sincronizadas de tu cuenta) |
  | **Plugins instalados** | `~/.claude/plugins/synced` y `~/.claude/plugins/cache` |
  | **Catálogo (no instaladas)** | `~/.claude/plugins/marketplaces` (plegado al abrir) |

- Cada fila muestra el nombre y el directorio (`~` es la carpeta de usuario).
- Buscador por nombre, descripción o directorio; mira también los grupos plegados.
- Panel de detalle: descripción, ruta completa y vista previa del `SKILL.md` (primeras 300 líneas).
- Botones: **Abrir SKILL.md** (en una pestaña del visor `file-viewer`), **Abrir carpeta** (Explorador de Windows), **Copiar ruta** y **Copiar /nombre** (para pegarlo en Claude Code).
- Teclas: `↑↓` mover, `Enter` abrir, `Esc` cerrar.

## Requisitos

- Herdr app (se hizo con `herdr-app 0.1.17`).
- Python 3 en el PATH (`python`): `scan.py` hace la búsqueda y solo usa la librería estándar.
- El mod `file-viewer`, que viene con Herdr, para abrir los archivos.
- Windows. "Abrir carpeta" usa `explorer`; en otros sistemas habría que cambiarlo.

## Instalación

1. Copia el mod:

   ```sh
   cp -R mods/skills ~/.config/herdr-app/mods/
   ```

   En Windows: `%USERPROFILE%\.config\herdr-app\mods\skills`.

2. Valida:

   ```sh
   herdr-app check ~/.config/herdr-app/mods/skills
   ```

3. Agrega la tecla en `~/.config/herdr-app/keys.json`, dentro de `"global"`:

   ```json
   "alt-s": "mod.open:skills"
   ```

## Archivos

| Archivo | Qué es |
|---|---|
| `mods/skills/main.js` | El diálogo: lista, buscador, detalle y botones. |
| `mods/skills/scan.py` | Busca los `SKILL.md`, lee `name` y `description` del encabezado y devuelve JSON. Se puede probar solo: `python scan.py <carpeta>`. |
| `mods/skills/mod.json` | Tamaño del diálogo (1040 × 600). |

Para cambiar dónde se busca, edita `scan.py`: `DOWN` es la profundidad y `SKIP` las carpetas que se ignoran.

## Agregar más skills

- **Plugins:** `/plugin` dentro de Claude Code.
- **A mano:** copia la carpeta con su `SKILL.md` en `~/.claude/skills/<nombre>/` (todos los proyectos) o en `<proyecto>/.claude/skills/<nombre>/`.

Una skill son instrucciones que Claude sigue y puede traer scripts: instala solo las de autores en los que confíes y léelas antes.

## Límites

- No lista las skills integradas en Claude Code, porque no son archivos en esas carpetas.
- Solo lee las de este equipo, no las de máquinas remotas.
- No sabe qué skills tiene activas una sesión concreta.
- Una skill de proyecto más profunda que 4 niveles, o fuera de las carpetas indicadas, no aparece.
- Se verificó con `herdr-app check` y probando `scan.py`; la interfaz no está cubierta por pruebas.
