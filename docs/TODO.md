# To-do and watch-outs

## Open items

- [ ] **GEDCOM 5.5.1 export, then import** (deferred from v1). Map unions → FAM, parent types →
      `PEDI` (birth/adopted/foster), parallel unions → extra FAM records with a NOTE. List what is lost.
- [ ] Undo / redo (every change autosaves immediately; for now, export before big edits).
- [ ] Multiple relationship paths: pedigree collapse / cousin marriages currently report only the
      closest kinship. Show "also related as …" for every distinct common-ancestor line.
- [ ] Whole-family graph on large trees (hundreds of people): the layout is O(sweeps × families);
      check speed and consider collapsing branches.
- [ ] Print / export the current tree view as SVG or PNG.
- [ ] Data-health checks: child born before a parent, union before the partners' births, death before birth.
- [ ] Per-person sources/citations (currently: notes + custom fields).
- [ ] Choose which union an untagged child belongs to directly in the person panel (the model supports
      `unionId`; the UI sets it only when a child is added through "+ Child" on a union).
- [ ] If this gets mounted on Cabinet: back-link + OG tags/preview image (Cabinet independent-page checklist).

## Watch-outs

- **Storage is per browser *and* per origin.** The same `index.html` opened from `file://` and from a
  hosted URL sees two separate sets of projects. Clearing site data deletes them. ZIP export is the
  real backup.
- **JSON exports carry no photos.** Importing a JSON with "Replace" keeps photos already in that
  browser if the data still references them. On another machine, those people show "photo file missing".
- **Project id decides replace vs copy.** Two exports of the same family share an id, which is why
  import asks. "Import as copy" gives a new id and appends "(imported …)" to the name.
- **Numeric dates are day-first** (`05/04/1920` = 5 April). ISO `1920-04-05` is unambiguous.
- **Half- in cousin/niece names** relies on a recorded partner or a child with another parent. An
  ancestor recorded alone gives a plain "first cousin", even if the true answer is half.
- **Step/foster/raised links don't propagate kinship.** Someone raised by a neighbour doesn't make
  the neighbour's children their cousins. "Raised together" siblings are listed separately.
- **Partner rows:** a person with 3+ partners gets an arc for partners who can't sit next to them,
  with a bracket under both for their children. Very dense intermarriage can still cross lines.
- **Branch colours can shift.** Hues are assigned by founding order. Adding an earlier founding
  family, or crossing the 75% "split into children's lines" threshold, re-colours existing branches.
  More than 8 branches reuse hues. (Possible to-do: let the user pin a colour per branch.)
- **Theme colours live only in the `:root` blocks** at the top of `css/app.css`, in three copies:
  light, dark under `prefers-color-scheme`, and the forced `[data-theme="dark"]`. Change all three
  together. The texture strength is the last two numbers of the `feColorMatrix` alpha row inside
  each `--texture` data URI (gain, bias).
- **`color-mix()`** drives the card tints, so very old browsers (pre-2023) show untinted cards.
- **No ES modules on purpose.** Converting to `type="module"` breaks opening the page from disk.
- Scripts must load in the order given in `index.html` (each extends `window.GT`).
- `review/` holds local test screenshots and is git-ignored.
