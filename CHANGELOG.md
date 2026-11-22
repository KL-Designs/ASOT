# Changelog

All notable changes to the ASOT platform are recorded here.
Dates reflect when changes were merged to `main` and deployed.

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
