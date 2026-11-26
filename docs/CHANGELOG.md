# Changelog

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
