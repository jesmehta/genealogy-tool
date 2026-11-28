# Changelog

## 0.5.0 — 2026-11-28 — quick editing on the tree

- **+** on every card (hover / selected): Parent · Child · Partner · Sibling · Cousin · Other bond ·
  Open details.
- **Sibling** reuses the person's parents (full or half). With no parents recorded, two
  placeholder parents and a marriage are created.
- **Cousin**: a dotted "cousin" bond (`others[].kind = 'cousin'`) with the common ancestor noted, not
  drawn. Always visible.
- **Drag to connect**: drag from a card's ⇢ corner onto another card and choose how they're related.
- **Not connected** tray in the tree views lists people and groups not linked to the main family.
  Drag them onto a card to connect.
- Requirement and design: DESIGN.md, "Quick editing on the tree". Screenshots (local, git-ignored):
  `review/after-connect/`.

## 0.4.0 — 2026-11-28 — missing data, siblings by age, expanded timeline

- **Missing data** tab: every person in a table, empty fields highlighted and counted per column,
  filters (missing field, family branch, name), inline editing, bulk "Set field to value" on ticked
  rows (only where empty by default) with undo, and a partnerships table for start dates.
- Siblings are ordered left to right by birth date at every level. Undated siblings keep their
  entry order.
- Generation bands show the birth-year range of the people in them.
- **Timeline** toggle in the focus and whole-family views: cards placed by birth year on a decade
  grid, partnership start shown as a diamond on a stem, undated people estimated from relatives
  (faded, ≈), and colliding cards pushed down with a tick at their true year.
- Requirement and design: DESIGN.md, "Missing data tab", "Siblings ordered by age", "Timeline".
  Screenshots (local, git-ignored): `review/after-missing/`, `review/after-timeline/`.

## 0.3.0 — 2026-11-28 — scoped views for large families

- **Descendants of**: a second tree mode beside *Centred on*. It shows one ancestor's whole line
  (descendants, their partners, co-parents) and nobody else. Open it from the toolbar select, the
  person panel ("Descendants of …"), or by clicking a family in the legend.
- **Folding**: ▾ on a card (on hover/selection) or "Fold branch" in the panel hides that person's
  descendants behind a "▸ +N" pill; click the pill to unfold. "Unfold all (n)" is in the toolbar.
  Folds are saved with the project (`project.collapsed`) and work in the whole-family view too.
- **▲ N badges** on people whose own family is outside the view. Clicking adds that family to the
  view as a removable chip. On the root of a *Descendants of* view the badge reads "▲ up" and
  re-roots on the parent.
- Generation bands in *Descendants of* read "Generation n from *ancestor*".
- Requirement and design: DESIGN.md, "Scoped views for large families". Screenshots (local, git-ignored):
  `review/before-scope/`, `review/after-scope/`.

## 0.2.2 — 2026-11-27 — greener bar, paper texture

- Top bar is now a forest-to-teal-green gradient (`--bar-grad`); the flat blue read as corporate.
  The accent (selected tab, selection, links, buttons) moved from blue to teal-green. Blue stays as
  the first branch hue on the cards, and yellow (`--sun`) stays for the primary button and highlights.
- Faint paper-grain texture (`--texture`) on the page background and top bar: inline SVG fractal
  noise in a data URI, so no image files and still offline. Separate light/dark variants. The tree
  canvas is now transparent, so the grain sits still behind the tree while panning.
- Screenshots: `review/after-green-texture/` (local, git-ignored).

## 0.2.1 — 2026-11-27 — blue / yellow palette

- Replaced the all-green palette: deep blue top bar, warm yellow (`--sun`) primary button, leaf
  bullets and focus-card glow, blue accent for selection/links, cream background with faint yellow
  generation bands, slate-grey connector lines. Branch hue `--br0` (the most common) is now blue
  and green moved to `--br5`. Leaf brand mark recoloured yellow and blue. Dark mode is navy-based.
- Screenshots: `review/after-blue-yellow/` (local, git-ignored).

## 0.2.0 — 2026-11-27 — "botanical" look + family-branch colour

- New theme: forest-green top bar with pill tabs, sage background, serif headings (system fonts
  only, so it still works offline), rounded cards and pill buttons, tinted dialogs, leaf brand mark,
  and an illustrated empty state. Light and dark variants.
- Card colour now means **family branch** (`I.branches` in infer.js; rule in DESIGN.md) instead of
  sex. Eight branch hues `--br0…7`, neutral `--bn` for people with no branch. Card tint, avatar ring
  and initials follow the first branch. The stripe is split when someone descends from several branches.
- Sex is shown as a ♀ / ♂ / ⚧ glyph on the card and in the people list.
- Generation bands behind the tree. The focus view labels them relative to the focus person
  (Parents, Grandparents, Children…); the whole-family view numbers them.
- Legend lists the branches with founders and member counts. Panel header is tinted by branch
  with branch chips. Sibling and union tags are colour-coded by kind, and union cards have a
  coloured edge by relationship type.
- Before/after screenshots: `review/before-botanical/` and `review/after-botanical/` (local, git-ignored).

## 0.1.0 — 2026-11-27 — first version

- Data model: people, typed parent links, typed unions (dates, end reason, offspring flag), "other"
  relations, photos; `M.normalize` validates and cleans imported data (drops dangling references).
- Inference: full/half/adoptive/step siblings and "raised together"; kinship naming (nth cousin m×
  removed, great-/grand- forms, half-); in-law, step-parent/child and "by marriage" terms; shortest
  connection path over every edge type.
- Views: focus (hourglass) tree with adjustable generations, whole-family graph, sortable/searchable
  people table, relationship finder. Pan / zoom / pinch, click to edit, double-click to re-centre,
  click a partner line to edit the union.
- Person panel: details + custom fields + photo; two parent slots always visible; partners with
  numbered unions and their children; "+ Child" seeds offspring into a union; children outside
  any union; inferred siblings and relatives; other relationships.
- Projects in IndexedDB with autosave; JSON and ZIP export (`<family>_<YYYY-MM-DD_HHMM>`); import
  with replace / copy choice; sample family.
- Fixes made while testing: drawn trunks for non-adjacent partners now use a bracket under both
  parents (the trunk had appeared to come from the person sitting between them); a trunk whose
  children all share a non-biological link type takes that type's dash style; union numbering is
  done per class (marriages vs others) so a parallel relationship doesn't shift marriage numbers;
  double-click detection moved into the pointer handler (pointer capture retargets `dblclick`).
