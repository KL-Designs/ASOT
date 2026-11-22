# Changelog

All notable changes to the ASOT platform are recorded here.
Dates reflect when changes were merged to `main` and deployed.

---

## 2026-11-22

### Editor — Table column resize: two-column only
- Dragging an inner column border now only redistributes width between the two adjacent columns — the left column grows/shrinks and the right column takes the difference; all other columns and the outer table width stay fixed
- The rightmost column border handle is hidden (there is no right column to absorb the width)



### Editor — Table column drag no longer shrinks table
- Dragging an inner column border no longer temporarily collapses the table to a narrow width mid-drag — `prosemirror-tables` calls `updateColumnsOnResize()` directly on the DOM element (bypassing the NodeView entirely) to show live column widths; a `MutationObserver` on `table[style]` now intercepts that write and restores the declared percentage as a microtask, before the browser paints

### Editor — Table outer edge lock + corner resize (fix)
- Both remaining resize regressions share the same root fix: `PatchedTableView` (passed as `View:` to the column-resizing plugin) overrides `update()` to restore the declared `tableWidth` percentage and clear `minWidth` after `updateColumns()` overwrites them with pixel totals — fixing outer-edge drift on column drags and snap-back after a corner resize commits

### Editor — Table corner resize: horizontal + both axes simultaneously
- Dragging the corner handle horizontally now updates the table width live (previously the MutationObserver was incorrectly overriding percentage-based preview widths as if they were `displayColumnWidth` pixel writes); fixed by restricting the observer to only intercept absolute-px or empty-string widths
- Both axes now update simultaneously: drag down-right to widen and taller at the same time

### Editor — Table vertical resize
- The bottom-right corner handle now resizes both width (drag left/right) and height (drag down to set a minimum height, drag up to clear it); height is committed as `tableMinHeight` and persists across saves

### Editor — Table scrollbar removed
- The vertical scrollbar that appeared beside tables has been removed — `overflow-x: hidden` forces `overflow-y` to `auto` per CSS spec; changed to `overflow: hidden`

### Editor — Font size for pasted text (fix)
- Clicking on pasted text now shows the nearest preset size in the size selector — previously, `pt` → `px` conversions (e.g. `14pt` → `19px`) produced values not in the preset list, causing the selector to fall back to the placeholder "Size" label; the display value is now snapped to the nearest preset

### Editor — Highlight colours
- Highlight presets now match the text colour presets: white, light gray, red, orange, yellow, green, cyan, blue (plus a clear option)
- Pasting text with inline background-color styles (from Word, Google Docs, browsers) now carries the highlight mark into the editor — previously only `<mark>` elements were detected

### Editor — Font size for pasted/imported text
- Font sizes in `pt` or `em` units (pasted from Word, Google Docs, etc.) are now normalised to `px` during paste so the size selector correctly reflects the value — previously `12pt` would not match any preset option and the selector showed the editor default

### Editor — Table outer edge lock
- Dragging an inner column border no longer moves the right outer edge of the table — a per-frame enforcement loop keeps the outer boundary at the table's declared width for the duration of the drag
- The horizontal scrollbar that appeared on table wrappers has been removed

### Editor — Table corner resize
- The red resize handle now sits exactly at the bottom-right corner of the table (previously it appeared at the far right of the page because it was positioned relative to the full-width wrapper rather than the table itself)
- Drag it left/right to change the table's overall width (10 %–100 % of the content area); width is committed to the document on mouse release

---

## 2026-11-20

### Editor — Table grid picker
- Selected cells now highlight white so the selection is clearly visible
- Dimension label (e.g. "5 × 4") is now white on the dark background
- Clicking a cell in the grid now correctly inserts the table (focus was being lost on mousedown)

### Editor — Highlight colours
- Highlight button replaced with a colour picker: 8 preset colours (yellow, green, cyan, blue, pink, orange, purple, red), a clear option, and a native custom colour picker
- Default highlight is now a solid bright yellow — previously a nearly invisible 20% red
- Imported and pasted highlighted text retains its original background colour

### Editor — Font size display
- Font size selector now shows the current computed size on any line, not only empty paragraphs
- Falls back to 16 px (the editor default) when no explicit size is set

### Editor — Table column resize
- Dragging an inner column border no longer pushes the rightmost edge of the table off-page
- Outer table width is now capped at the container boundary at all times

### Editor — Text color + bold
- Bold text with a colour mark now renders in the correct colour
- Previously, the CSS rule for `strong` overrode any inherited text colour, making coloured bold text appear white

### J2 — Importer formatting fidelity
- Imported DOCX documents now preserve per-run formatting: bold, italic, underline, strikethrough, text colour, font size, and hyperlinks are carried across at the character level, not just the paragraph level
- Tables in imported documents are now inserted as proper editor tables (header row, bordered cells) rather than pipe-separated plain text
- Highlighted text (background colour) is preserved as a highlight mark

---

## 2026-11-19

### Editor — Tables
- Insert tables via a hover grid picker in the toolbar (up to 10 × 6, with a header row)
- Drag column borders to resize columns
- Table context toolbar appears automatically when the cursor is inside a table: add/delete rows and columns, merge/split cells, toggle header row, delete table
- Border Style popover: color picker (12 presets + custom), border width 0–5 px, table width 25 / 50 / 75 / 100 %
- Tables render correctly in the read view across all operation page themes

### Editor — Image Crop
- Non-destructive crop overlay with 8 drag handles and a rule-of-thirds grid
- Apply commits the crop; Cancel discards it; ✕CRP resets to uncropped
- Cropped images render correctly in both the editor and the public read view

### J2 — Operations Importer
- Import operations from DOCX or PDF files directly into the editor
- AI-assisted analysis maps document headings to operation sections
- Import history and batch management under J2 → Import

---

## 2026-11-16

### J5 — Gallery
- SOTM and Featured tiles: captions anchor correctly again after a regression fix
- Delete photos directly from the lightbox
- SOTM "Set" button no longer appears visually inert

### J5 — SOTM permissions
- `gallery.manage` role can now edit SOTM, not only J5 leads

---

## 2026-11-14

### J5 — Media uploads
- Direct uploads added to the Media tab and Screenshot of the Month tab (no longer requires a separate upload flow)

### AI — Mission Maker
- AAR board now shows an AI-generated mission summary on row 342

---

## 2026-11-10

### Help Wiki
- Living FAQ section: answers update as the platform changes
- Page-first panel layout for easier navigation
- Whole-site guides now accessible from any help page

---

## Older

For changes before 2026-11-10 see the [GitHub commit history](https://github.com/KL-Designs/ASOT/commits/main).
