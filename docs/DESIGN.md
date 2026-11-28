# Design and decisions

## Data model (format `genealogy-tool`, version 1)

```jsonc
{
  "format": "genealogy-tool", "version": 1, "exported": "ISO time (exports only)",
  "project": { "id": "fam_…", "name": "…", "created": "…", "updated": "…", "notes": "…" },
  "people": [{
    "id": "p_…", "given": "", "surname": "", "otherNames": "", "sex": "F|M|X|U",
    "birth": { "date": "c. 1920", "place": "" }, "death": { "date": "", "place": "" },
    "deceased": false, "photo": "ph_…|null", "notes": "", "fields": [{ "k": "Occupation", "v": "…" }]
  }],
  "parentLinks": [{ "id": "pl_…", "parent": "p_…", "child": "p_…",
    "type": "biological|adoptive|step|foster|guardian|raised|unknown", "unionId": "u_…|null", "notes": "" }],
  "unions": [{ "id": "u_…", "a": "p_…", "b": "p_…",
    "type": "marriage|civil|partnership|engagement|parallel|other",
    "start": { "date": "", "place": "" }, "end": { "date": "", "reason": "|divorce|separation|annulment|death|other" },
    "offspring": "unknown|yes|no", "notes": "" }],
  "others": [{ "id": "o_…", "a": "p_…", "b": "p_…", "label": "godparent", "notes": "" }],
  "photos": { "ph_…": { "name": "original filename.jpg", "type": "image/jpeg" } }
}
```

In the ZIP, `photos/<photoId>.<ext>` holds the original image. In the browser, IndexedDB stores the
original and a 160 px square JPEG thumbnail. The thumbnail is never exported; it is regenerated on import.

## Key decisions

**Only two structural relationships are stored; everything else is derived.**
Siblings, cousins, in-laws and step-relations are computed from `parentLinks` + `unions` every
time. Stored siblings would go stale the moment a parent link changes, and "half vs full" depends on
which parents are recorded, which changes as research progresses.

**Parent links are per parent, not per couple.**
A child can have one recorded parent, two, or four (birth parents + adoptive parents), with or
without any union between them. This is what makes "child of an unmarried couple", "raised by a
neighbour, never formally adopted" and "single parent" work without special cases. `unionId` on a
link is optional. It only says which partnership a child came from when the same two people have
several unions. Untagged children of both partners are attributed to their first union.

**"2nd / 3rd marriage" is computed, not stored.**
Unions are sorted by start date. Numbering happens within a class: marriage-like (marriage, civil
union) vs. everything else. A parallel relationship therefore doesn't make the next marriage the
"3rd". Overlapping dates are allowed, which is how parallel relationships are represented.

**Kinship vs. direct relationships.**
Biological, adoptive and unknown links propagate kinship (cousins, aunts, nieces). Step, foster,
guardian and raised-by links are shown as direct relationships ("foster mother") but don't create
cousins etc. A **biological only** toggle in the finder drops adoption too.
"Half-" in cousin and niece names is used when the closest common ancestor is a single person who
has a recorded partner or children with someone else. If only one grandparent is recorded at all,
the result is a plain cousin rather than a guessed half-cousin.

**Fuzzy dates are free text with a parsed sort key.**
Exact dates are rare in genealogy, so a date picker would force false precision. Day-first
numeric dates (`14/05/1920`) are assumed. Unparseable text is kept and flagged in the form, but it
is not sortable.

**Storage: IndexedDB, autosave, no server.**
Projects and photos live in this browser profile. Export is the only way data leaves. Each import
asks before replacing a project with the same id. "Import as copy" gets a new id, so two machines
can both keep their version.

**ZIP: hand-written, no dependency.** (Chosen over JSZip from a CDN or a vendored copy.)
The writer uses "store" (no compression), because photos are already compressed. The reader handles
store + deflate through the browser's `DecompressionStream('deflate-raw')`, so ZIPs re-packed by
Windows/macOS also import. A `data.json` inside a sub-folder is found too. ZIP64 (> 4 GB) isn't supported.

**Layout: hand-written layered layout, no dagre/ELK.**
The user chose to include a whole-family view in v1. A graph library was the first idea. It was
dropped to keep the tool offline and dependency-free like the ZIP, and because a generic DAG
layout doesn't know about couples. The engine (`layout.js`):
1. Groups each child into a *family*: a union (tagged, or the parents' shared union) or a bare
   parent pair / single parent. Links are grouped by type first, so a child with birth parents
   and adoptive parents sits under two families.
2. Assigns generations: children below parents, partners on the same row. Parent-less people
   (married-in spouses' families, etc.) are pulled down next to their children.
3. Treats each connected set of same-row partners as a rigid *block*. A person with three
   partners becomes `[P2, Hub, P1, P3]`. Partners who can't sit side by side are joined by an arc,
   and their children hang from a bracket under both boxes.
4. Orders blocks with barycentre sweeps (down from parents, up from children) and positions them
   with weighted isotonic regression (pool-adjacent-violators). That gives the closest positions to
   the targets with no overlaps.
5. *Added in 0.5.1, after a real family showed one brother's children placed among another
   brother's children:* generations keep **siblings on one row** and pull **every** parent down to
   sit just above their children (not only people without recorded parents). When a marriage joins
   a deeper family, the joining family moves down a row in step instead of stretching across rows.
   After the sweeps, a final **top-down pass orders each row by its parents' family position**,
   with siblings by age, so descendant groups never interleave. Three more rules apply:
   - unconnected groups stay side by side, largest first;
   - a "raised by" or step link doesn't pull someone away from their birth family;
   - a couple whose partners come from two families joins the family it is nearer to, at the end
     facing the other one.
   Measured on the 154-person test family, children placed inside another family's group dropped
   from 24 to 6 in the whole-family view, and to 0 in every "Descendants of" view.
The focus tree uses the same engine on a subset: ancestors up to N, descendants down to M, the
focus person's siblings, descendants' partners, and optionally ancestors' other partners.

**Scoped views for large families (0.3.0).**
*The need.* The first real family entered (about 55 people transcribed from a whiteboard, with more
disconnected groups still to come) made two limits obvious. The plan is to work backwards through the
mothers and grandmothers and add *their* families. The focus view then needs ever more filters to
stay readable, and the whole-family view becomes very wide. The request: "on selecting an ancestor,
their whole tree is displayed, while the rest are not displayed / collapsed and minimised."

*What was built.* There are three parts, and all of them only decide **which people go into the
layout**. The layout engine is unchanged (`L.compute(prj, include)` already accepted a subset).
`L.scope()` in `layout.js` produces that subset plus what to draw for the hidden parts:

1. **Descendants of** (tree-tab mode next to *Centred on*). The set is the ancestor, every descendant
   through any parent-link type, every partner of those people, and every other parent of their
   children. The last group covers co-parents without a recorded union and adoptive/step parents.
   Nothing above the ancestor and no in-law families are included. Double-click still re-roots, and
   the panel and legend can open it too.
2. **Folding.** Any card with children in view gets a ▾ toggle, visible on hover or selection
   (always visible on touch screens). It hides that person's descendants and any partner left with
   no connection, and leaves a "▸ +N" pill. Folded ids are stored in `project.collapsed`, so they
   survive reloads and travel with exports. The data format stays at v1, because older files simply
   lack the field. The focus person and their ancestor line can't be folded away. Folding applies
   in every tree mode, including the whole-family view.
3. **▲ badges for hidden families.** A person in view whose parents are outside the view, typically
   someone married in, shows "▲ N". N counts their recorded ancestors and those ancestors'
   descendants that aren't shown. Clicking adds that family (descendants of their topmost
   ancestors) to the current view as a removable chip in the toolbar. The root of a *Descendants of*
   view gets "▲ up" instead, which re-roots on their parent. In *Centred on* mode, the focus
   person's own ancestor line gets no badge, because "generations up" already controls it.

The legend's family branches are buttons that open *Descendants of* the branch's first founder, a
one-click way to see "this family". Mode and generations are per browser (`localStorage`). Folds
are per project. Added families reset when the root changes.

*Rejected:* a separate "collapse" data structure per view (more state for little gain), and
collapsing a whole branch into a single summary card (it would break the partner/child lines the
layout draws).

**Quick editing on the tree (0.5.0).**
*The need:* transcribing a whiteboard means adding many people and wiring them up fast, often
with groups that aren't connected yet ("otherwise they float"). The request: controls on each
card to add a parent, child, partner, sibling or cousin; drag-and-connect between people; a sibling
should create two parents and a marriage if none exist; a cousin should be a dotted link whose
common ancestor is noted but not drawn, like the "other relationships" indicator.
*What was built* (`js/connect.js`):
- **+ on a card** (shown on hover or selection; on touch, on the selected card) opens a menu. Parent,
  child, partner and other reuse the panel dialogs (pick an existing person or create one). Child
  goes into the person's union when they have exactly one.
- **Sibling:** if the person has kin parents, the new sibling gets the same ones (full), or one of
  them (half). If they have none, two placeholders ("Parent of X", "Other parent of X") are created
  with a marriage between them, and both children are linked to it. Placeholders carry a "To
  confirm" field, so they show up in the Missing data tab. If the *other* person already has parents,
  those are reused instead of making placeholders.
- **Cousin:** an `others` entry with `kind: 'cousin'` (label "cousin" by default, editable), drawn
  as a round-dotted line. Unlike other bonds, cousin lines are drawn even when "other
  relationships" is off, because they stand in for a structural link. No placeholder grandparents
  are made: the user asked for the common ancestor to be noted, not drawn. When the real
  connection is found, add the parent links and delete the cousin bond.
- **Drag to connect:** the ⇢ handle on a card's corner starts a rubber-band line (it doesn't pan).
  Dropping on another card opens "A is the partner / parent / child / sibling / cousin / other of B".
- **Not connected tray:** connected components over every link type. The component holding the
  focus person (or the largest one) is "the family", and every other group is listed largest first,
  so whiteboard clusters can be dragged in one person at a time. Pointer events are used, so touch
  works too.
The data format is unchanged except for the optional `kind` on an `others` entry (v1 files without
it load as before).

**Missing data tab (0.4.0).**
*The need:* a family entered from a whiteboard is mostly names. Surnames, sex, dates and places
need filling in, often the same value for many people (a whole branch shares a surname). The gaps
also need to be visible as a research list.
*What was built:* `js/missing.js`, a table with one row per person and an input in every cell, so
typing saves immediately. A cell counts as missing when it is empty. Sex counts when it is
"unknown". Death date and place count only for people ticked as deceased, because the model can't
tell "alive" from "not recorded". Other names and custom fields are shown but never counted, so a
"To confirm" note stays visible as a column. Column badges give the count per field and filter to
those rows. The bulk bar sets one field on the ticked rows. By default it fills only empty cells,
so applying a surname to a mixed selection doesn't overwrite a married name. Each bulk edit stores
a snapshot of the people it touched, so it can be undone (20 steps, per session; there's still no
general undo). Partnerships get their own small table, because their start dates drive the
timeline. The table isn't rebuilt while the cursor is in it, so Tab moves cell to cell without
losing focus.

**Siblings ordered by age (0.4.0).**
In every view, children of a family are laid out left to right by birth date. Dated siblings take
the dated siblings' slots in birth order, and undated ones keep their entry position. The layout's
barycentre sweeps can swap siblings to shorten lines, so a pass after the sweeps puts each family's
sibling blocks back in age order before the final positioning. A block holding children of two
families (cousins who married) is left alone.

**Timeline: collapsed vs expanded (0.4.0).**
*The need:* see chronology without losing the generation structure: which aunt is only a few years
older than her niece, when marriages happened. The compact view should stay compact.
*Collapsed* (default) is the generation layout, with siblings by age and each band labelled with
its birth-year range ("born 1946–1960"), which shows where generations overlap at no cost in space.
*Expanded* (the "Timeline" toggle, in both tree views) keeps the horizontal layout from the
generation engine and sets each card's height from its birth year at 6 px/year. A 28-year
generation then takes about one compact row, so generations still cluster. Choices the user made:
- **Undated people are estimated from relatives**, not parked in a separate lane: parents' year +28,
  children's −28, partners' year, a union's start −24, averaged and iterated
  (`L.estimateYears`). People with no dated relative at all fall back to their generation. Estimated
  cards are faded and dashed and show "≈ b. 1948". With no dates at all, year labels are hidden and
  the toolbar says positions are estimates.
- **Partners sit at their own birth years.** The partner line slopes between them, and a dotted
  stem runs down to a diamond at the union's start year (dashed when estimated: earliest child −1,
  otherwise the elder partner +24). Children hang from that diamond.
- **Collisions:** the horizontal layout is still per generation, so cards from different
  generations can meet. The later card is pushed down just enough to clear, and a small tick marks
  its true year. A full 2-D layout was judged too big for the gain.
Decade gridlines (stronger every 50 years) replace the generation bands.

**Colour means family branch.** (Chosen over surname or sex; theme direction "botanical" chosen
over "heirloom" and "bright modern".)
A *founding family* is a set of kin parents with no kin parents of their own, together with their
children. Its branch is the founders plus all kin descendants. People descended from several
branches carry all of them: the card stripe is split, and the tint follows the earliest-founded
branch (ordered by union start date, then the children's births). If one branch holds ≥ 75% of the
branched people (6+), it is split into its children's lines ("Anil's line"…) and its founders stay
neutral. Otherwise a tree under a single patriarch would be all one colour. Married-in people with
no recorded parents are neutral until their parents are added. Surname colouring was rejected
because married names and unrelated same-surname families mislead. Sex moved to a glyph so that
colour can carry lineage.

**Palette: green / yellow / blue, with a paper texture.** It took three iterations, all on 2026-11-27:
1. *Botanical, all green* (0.2.0): forest bar, sage background, green accent. The verdict was "an
   overload of green".
2. *Blue / yellow* (0.2.1): navy bar, blue accent, yellow (`--sun`) primary button and highlights,
   cream background. The blue bar read as "sterile / corporate".
3. *Current* (0.2.2): forest-to-teal-green gradient bar, teal-green accent. Blue is kept as the
   first branch hue on cards, and yellow is kept for the primary action, the focus glow and the
   heading bullets. The aim is a mix of the three, with none dominating.

The background texture is SVG fractal noise inlined as a data URI (`--texture`). Image files were
avoided to keep the tool a self-contained offline folder. The noise alpha is deliberately low,
because the first attempt was too strong. It sits on `body` and the top bar, and the tree `<svg>`
is transparent, so the grain stays fixed while the tree pans.

**No build step, no ES modules.**
Plain `<script>` files that share a `window.GT` namespace, so the page works when opened directly
from disk (module scripts are blocked on `file://`) as well as when hosted.

## Rejected or deferred

| Option | Why not (yet) |
|---|---|
| dagre / ELK for the whole-family graph | needs a network/CDN or a vendored library; doesn't model couples; see above |
| JSZip | the user picked the dependency-free option; `DecompressionStream` covers reading deflated zips |
| GEDCOM import/export in v1 | deferred by the user. GEDCOM can't express parallel unions or informal raising cleanly, so it would be lossy. Tracked in TODO |
| Storing siblings/cousins | goes stale; derived instead |
| Strict date pickers | false precision for genealogical data |
