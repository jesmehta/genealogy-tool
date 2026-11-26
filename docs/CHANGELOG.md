# Changelog

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
