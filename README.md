# Genealogy Tool

A local-first family tree builder that runs in the browser. You record people and two kinds of
structural relationship (parent → child and partner ↔ partner, each typed), plus free-form "other"
bonds. The tool works out everything else (siblings, half/step-siblings, cousins, in-laws) itself.
Each family is a separate project, saved automatically in the browser, and can be exported as
JSON (data only) or ZIP (data + photos) to back up, move or share.

**Open `index.html`.** There's no build step, no server and no network access. It works from
`file://` or from any static host.

## Why it exists (the original need)

> create a genealogy/family tree tool that allows someone to add people (name, birthdate, death
> date, photo, other fields) and relationships (person1, person2, nature of relationship). 2 major
> relationships exist — parent-child and marriage — both with multiple types (biological, adoptive,
> step…; marriage, relationship-not-married, 2nd/3rd marriages, parallel relationships…), offspring
> or no offspring, and seed that. All people nodes have parent relationships to 2 people ready to
> add, + add relationship option. Children should be linkable without a marriage of the parents /
> non-biological, non-officially-adopted. People can also have "other" relationships (distant
> cousin but close to family…). Sibling, half-sibling, step-sibling, cousin etc. are inferred.
> Everything exportable/importable so the tool is usable for multiple families, resumable and
> reusable — JSON for data, ZIP of data + images named project + timestamp.

## What it does

| Area | Details |
|---|---|
| People | Given name(s), surname, other names, sex, birth/death date + place, deceased flag, photo, notes, unlimited custom fields |
| Dates | Kept as typed. Fuzzy forms (`c. 1920`, `1920s`, `bef. 1931`, `14/05/1920`, `14 May 1920`) are understood for sorting and display |
| Parent links | One record per parent: biological, adoptive, step, foster, guardian, raised-by (informal), unknown. A child can have any number of parents, with or without a union |
| Unions | Marriage, civil union, partners (unmarried), engagement, parallel/extramarital, other. Start and end dates, end reason, an offspring flag (yes/no/unknown), and **+ Child** to seed offspring. Marriages are numbered (1st, 2nd…) by date |
| Other relations | Free-text label + notes (godparent, family friend, "like an aunt"…) |
| Inferred | Full, half, adoptive and step siblings; grandparents and grand-children; step-parents/children; aunts and uncles (incl. by marriage); first cousins; nieces and nephews; in-laws |
| Relationship finder | Any two people → "nth cousin m× removed", half-relations, in-law and step terms, closest common ancestor, and the shortest connection path. Optional "biological only" |
| Views | **Focus tree**, either *Centred on* one person (hourglass, generations adjustable) or *Descendants of* an ancestor (their whole line, nothing else) · **Whole family** graph · **People** table · **Relationship finder** |
| Quick editing | On any card: **+** opens Parent · Child · Partner · Sibling · Cousin · Other. Drag from a card's ⇢ corner onto another card to connect two existing people. A **Not connected** tray lists people and groups not yet linked to the family; drag them onto a card. Adding a sibling to someone without parents creates two placeholder parents and a marriage. A cousin is a dotted link with no invented grandparents |
| Missing data | A spreadsheet of every person with empty fields highlighted and counted per column. Filter by missing field, family branch or name, type straight into cells, or tick rows and **Set *field* to *value*** in bulk (only where empty, by default), with undo. A second table lists partnerships missing a start date |
| Timeline | **Collapsed** (default): compact generation rows, siblings left to right by age, birth-year range on each band. **Expanded**: cards placed by birth year on a decade grid, partnership start marked on a stem, undated people estimated from relatives (faded, ≈) |
| Large families | Fold any branch into a "▸ +N" pill (saved with the project). A "▲ N" badge marks people whose own family is outside the view; click it to add that family. Click a family in the legend to open its descendants |
| Projects | Several families side by side; switch, rename, notes, delete; a sample family to explore |
| Export / import | `Export JSON` → `<family>_<YYYY-MM-DD_HHMM>.json`; `Export ZIP` → same name `.zip` with `data.json` + `photos/`. Importing either one asks whether to replace or copy if the family already exists |

## Files

```
index.html          page shell
css/app.css         styles (light + dark)
js/util.js          ids, fuzzy dates, download helpers, thumbnails
js/store.js         IndexedDB persistence (projects + photo blobs)
js/model.js         data model, validation, mutations, sample family
js/infer.js         inferred relationships + relationship naming
js/layout.js        layered family-graph layout (hand-written)
js/render.js        SVG drawing, pan / zoom / pinch
js/zip.js           dependency-free ZIP writer / reader
js/io.js            JSON / ZIP export and import
js/ui.js            dialogs, person picker, person panel
js/missing.js       Missing data tab: gap table, inline + bulk edits
js/connect.js       quick editing: + menu, drag-to-connect, tray, siblings, cousins
js/app.js           controller: projects, views, wiring
docs/               DESIGN (decisions) · CHANGELOG · TODO (watch-outs)
```

Detail lives in [docs/DESIGN.md](docs/DESIGN.md) (data model, why it's built this way, what was
rejected), [docs/CHANGELOG.md](docs/CHANGELOG.md) and [docs/TODO.md](docs/TODO.md) (open items and gotchas).
