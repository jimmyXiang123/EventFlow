# EventFlow — prototype

**From fragmented information to editable personal and collaborative workflows.**

A working front-end prototype for the CSI405 *Interactive Systems* group project. It turns a
pasted email, calendar entry, chat thread or assignment brief into an **editable workflow draft**
with stages, tasks, owners, dependencies and deadlines computed backwards from the final date —
for both personal and multi-person work.

- **Stack:** React 19 + TypeScript + Vite, state in Zustand, drag-and-drop via dnd-kit, dependency
  graph via React Flow + dagre.
- **Front-end only.** No server, no database, no account. State lives in memory and is mirrored to
  `localStorage`, so a demo survives a refresh. "Collaborators" are simulated locally.

---

## 1. Run it

```sh
pnpm install
pnpm dev          # http://localhost:5199
```

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 5199 |
| `pnpm build` | Typecheck (`tsc -b`) then production build to `dist/` |
| `pnpm preview` | Serve the built bundle on port 5199 |
| `pnpm test` | Run the pure-logic test suite (40 assertions) |
| `pnpm check:ui` | Drive the real app in headless Chrome and assert behaviour |
| `pnpm check` | `test` + `check:ui` |

Deep links are supported for demonstrating one screen at a time:

```
/?view=projects   /?view=draft   /?view=board   /?view=calendar   /?view=flow
```

### Two interface modes

The header has a **Detailed / Compact** switch. **Compact is the default.**

- **Compact** — just the working interface: tabs, the current project, the guidance level, the role
  switcher and the view itself. Explanatory paragraphs, requirement tags, legends and helper copy
  are hidden.
- **Detailed** — brings back the explanatory copy, the `R1`–`R4` requirement tags and the
  "how to read this map" panel. Useful the first time someone sees the prototype, and for
  screenshots in the report.

Nothing is *removed* in compact mode: every control stays reachable, and the explanation is one
click away. Requirement tags are a presentation device, not functionality.

### Two interface languages

The prototype is **demonstrated in Chinese and reported in English**, so the interface is bilingual
with a switch in the header (`EN` / `中文`). **Chinese is the default.**

Everything user-facing lives in `src/i18n/labels.ts` as a keyed table, and `useT()` returns a `t()`
function bound to the current language. Only presentation text is translated — the stored domain
values (`TaskStatus`, `TaskKind`, `SourceKind`, `Role`, `Familiarity`) keep their English
identifiers and are translated at display time, so switching language cannot alter data.

Two decisions worth knowing:

- **Stage and task names are written in whichever language was active when the project was created.**
  They are persisted with the project, so a plan built in Chinese stays Chinese when the chrome is
  switched to English. Only the interface re-renders on a switch.
- **Activity-feed entries store a translation key, not a sentence.** Storing rendered prose would
  freeze the feed in the language that happened to be active when each event occurred, leaving the
  Chinese interface half-translated.

The seeded demo projects are generated in Chinese to match the default, and **Reset** also returns
the interface to Chinese so the plan and the chrome cannot disagree.

### Text density

There are two independent ways to reduce on-screen text, and both default to the quieter setting.

| Control | What it governs | Default |
| --- | --- | --- |
| **Compact / Detailed** | Whether the page-level introduction paragraphs and requirement tags render at all | Compact |
| **Notes** | Whether the explanatory layer renders: on-screen hints, legends, panel descriptions, the source text | Off (terse) |

The density layer is applied declaratively: explanatory blocks carry `data-verbose`, and one CSS
rule hides them while `.app[data-density="terse"]`. Hiding rather than conditionally not rendering
keeps the strings in the DOM so the verification scripts can still assert on them, and keeps the JSX
readable — one attribute instead of a conditional wrapper around every sentence.

Two text cuts were made on product grounds rather than styling:

- **The reusable checklist was removed from task cards.** It is the same list for every task that
  came from one template, so on a six-stage board it repeated identically thirteen times and carried
  no per-task information. It is shown once, in the task detail panel, where it can be acted on.
- **The card hint block is hidden unless Notes is on.** Measured on the board, the hint layer was
  ~700 characters of the ~2,000 in the card area.

Measured on the board view, `terse` reduced the card area from 1,974 to 1,454 characters.

### Error prevention and error messages

A planning tool is judged by what it stops you doing, so the prototype has an
explicit prevention layer. Two conventions:

| Prefix | Meaning | Where it appears |
| --- | --- | --- |
| `prev.` | **Prevention** — a risk explained, or an action made unavailable, *before* the user commits | Inline alerts, disabled options, disabled-button reasons |
| `err.` | **Error message** — shown only when something cannot proceed | Alert bars, toasts, the storage banner |

Every message goes through one `Alert` component, which is deliberately **not**
gated by the density layer: an alert is the one kind of text that must survive a
user turning the notes off.

The full inventory is in the user manual (§6). Three findings worth naming:

- **The dependency-cycle guard was upgraded from an error message to prevention.**
  The store already refused a loop, but only after the click — and a checkbox that
  springs back reads as a bug rather than as protection. Options that would create
  a loop are now disabled and labelled, with the reason on hover and a one-line
  explanation above the list. The store guard is kept as a second line of defence.
- **A failed `localStorage` write was being swallowed by `catch {}`.** The user
  believed their work was being saved when one refresh would lose it. All 24
  mutation sites now go through `commit()`, which raises a persistent banner — a
  banner rather than a toast, because "your work is not being saved" is a state,
  not an event, and it cannot be hidden by the density toggle.
- **`new Date(2026, 1, 31)` does not fail; it silently rolls over to 3 March.** So
  "due 31 February" used to become a wrong-but-plausible deadline that propagated
  into every computed task date. Every date candidate is now validated by
  round-tripping it, and impossible candidates are reported rather than dropped.

Each is covered by a test that exercises the real path: `qa/check-guards.js` pastes
a source really containing an impossible date, really sets a past deadline, really
finds a task with a loopy option, and really makes `setItem` throw.

---

## 2. What the four requirements map to

The four requirements come from the group's own user research (30 questionnaire responses).

| Requirement | Where to see it | How it works |
| --- | --- | --- |
| **R1** Create and integrate editable workflows from information sources | `New from source` → then `Board` | The source is analysed locally; a template is matched; a `Stage[] → Task[]` draft is generated with deadlines computed backwards from the final date. Every task can be renamed, reordered, reassigned, re-estimated, added or deleted. |
| **R2** Provide different auxiliary references based on familiarity | The **Auto / Novice / Expert** switch in the header | Novice mode shows step hints and explains *why* a template fits. Expert mode hides the hints and surfaces reusable checklists from past projects, listing previously-used processes first. |
| **R3** Support individual **and** multi-person tasks in the same project | `Board` — the `Individual` / `Collaborative` badge on every card | Each task carries `kind`, an accountable `ownerId`, and `collaboratorIds`. The same project mixes both. |
| **R4** Let collaborators follow progress synchronously | `Calendar` detail strip, `Dependencies` map, `Simulate member update` | Ownership, deadlines and status are visible to everyone; the coordinator additionally sees blockers, waiting relationships and which later tasks a delay pushes back. |

### The R4 role difference

Switch **Signed in as** in the header:

- **Jiawen Cai (coordinator)** — sees the whole project, a *Needs attention* panel listing every
  blocked or waiting task with what it is waiting for and how many later tasks it holds up, plus
  the activity feed.
- **Xinyu Wan (member)** — sees the shared schedule and their own tasks, with a status control, but
  the coordinator-only attention panel is not rendered.

Progress is not just displayed, it flows: press **⟳** in the header and another member's
task advances, the card flashes, the activity feed records it, and a confirmation names the person
and the task.

---

## 3. CW2 additions

CW2 (Prototype) requires the prototype to communicate the **sequence of interaction**, and states
that a static image or written description alone is not sufficient.

**Four user-group configurations (header "User group" control).** CW1 identified four situations:
individual/collaborative × familiar/unfamiliar with the process. Selecting a group switches the
signed-in participant, their role, the guidance level and the open project, so one prototype
visibly adapts instead of needing four separate mock-ups. Definitions are in
`src/domain/scenarios.ts` and quote the CW1 submission's wording.

**Four scripted walkthroughs, as a design record.** `src/domain/walkthroughs.ts` holds four scripts
— a 13-step coordinator sequence and shorter ones for the individual novice, the individual expert
and the error-prevention pass — each step recording the user action, the system response, how the
prototype represents it, and the design decision behind it. That is exactly the shape of the CW2
interaction-sequence table, which is generated from these scripts.

**The walkthrough *player* was removed from the prototype.** It used to be a sixth tab. On the
group's feedback it was cut: the content is the report's material and is reproduced in full in the
user manual, so shipping it inside the app as well made the interface busier without adding a
capability — and the brief asks for 2–3 blocks per screen. The scripts remain because the report
cites them.

Because there is no longer any clickable UI that would notice a mistake, the scripts are verified as
**data** by `qa/walkthroughs.test.mjs`: every step must name a view that still exists and a
`data-guide` anchor that is still present in the source. That test is what caught the calendar
rename and the retirement of the coordinator attention panel.

### CW2 report

`CW2/CSI405_EventFlow_CW2_Report.docx`, regenerated by `build_cw2_report.py` from the official CW2
template. 14 pages, within the 15-page limit, 12pt Times New Roman, double-spaced, 1-inch margins.

**Filled in:** the Prototype Overview, the requirement-mapping table, the prototyping method and
fidelity justification, the interaction-sequence table (derived from the walkthrough scripts, so the
report and the prototype cannot drift apart), the main functions, the representation discussion,
the limitations, and the AI-usage disclosure.

**Left as red `[[ TO BE COMPLETED BY THE GROUP ]]` placeholders**, because only the group can supply
it: the evidence column of the requirement mapping, the feedback/evaluation table, the peer-review
table, any references you add, and confirmation of the AI disclosure. Nothing was invented for
these.

`CW2/CSI405_EventFlow_CW2_TemplateChecklist.docx` reproduces the template's own questions as a
companion file, so the group can confirm every prompt is answered without spending report pages on
a checklist.

**A rendering caveat worth knowing.** The template's page format is unusual (8.27in × 11.69in).
Rendering it to images clips content slightly past the right margin — but it clips the template's
*own* tables and headings at the identical position, so this is an artefact of the template's
geometry rather than of the added content. Check the layout in Word before submitting.

---

## 4. Prototype base: what was found and what was actually used

Before writing code I searched GitHub for a repository to build on. The survey is summarised here
because the conclusion shapes the whole codebase.

**Finding: no existing repository covers R1–R4, and the closest match is the wrong framework.**

| Candidate | Stack | Verdict for EventFlow |
| --- | --- | --- |
| [kanriapp/kanri](https://github.com/kanriapp/kanri) | Nuxt 3 / Vue 3 / Tauri | Closest *architecture* match — front-end-only, single local JSON file, no account, no backend to strip. But it is **Vue, not React**, so it cannot be a base for this stack. |
| [go-vikunja/vikunja](https://github.com/go-vikunja/vikunja) | Go + Vue 3 | Has task relations ("blocking task") and real R3/R4 thinking, but is AGPL and backend-coupled. Useful as a **design reference only**. |
| [makeplane/plane](https://github.com/makeplane/plane) | React + Django | React, but "stripping to front-end-only" is a rewrite, not a deletion. Rejected as a base. |
| [mattermost-community/focalboard](https://github.com/mattermost-community/focalboard) | Go + React | No dependency model. Rejected. |
| [hcengineering/platform](https://github.com/hcengineering/platform) (Huly) | TS monorepo, Svelte | Genuine finish-to-start dependency cascade in its Gantt, but a very heavy EPL-2.0 monorepo. Rejected as a base. |
| [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) | Node CLI | **Adopted as the data model.** Tasks live in JSON with a `dependencies` array, and "what can start now" is the first task whose dependencies are satisfied. That is exactly `Task.dependsOn` + `readyToStart`. Licence is "MIT with Commons Clause" — fine for coursework, but it is not copied, only imitated. |
| [github/spec-kit](https://github.com/github/spec-kit) | Templates | **Adopted as the R1/R2 generation approach.** Rule- and template-based spec generation that needs no API key — deterministic and inspectable, which is the right choice for a graded prototype. |

**What was therefore built:** a fresh React + TypeScript application that takes kanri's
*architecture* (front-end-only, one local store, no backend), claude-task-master's *dependency
model*, and spec-kit's *template-driven generation*, and adds the four things none of them have:
source-to-workflow extraction, familiarity-adaptive guidance, mixed individual/collaborative
tasks, and backwards deadline scheduling.

Reusable libraries, all permissively licensed and actively maintained:

| Concern | Package | Licence |
| --- | --- | --- |
| Dependency / DAG view | `@xyflow/react` (React Flow v12) | MIT |
| Graph layout | `@dagrejs/dagre` | MIT |
| Drag-and-drop reordering | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | MIT |
| State | `zustand` | MIT |

One deliberate omission: **no Gantt library.** The most commonly recommended React Gantt
(`gantt-task-react`) was last pushed in August 2024 and is archived. The backwards deadline
calculation is ~60 lines of pure functions in `src/lib/domainEngine.ts`, which is easier to explain
in the report and demos better than a third-party widget.

---

## 5. Where the logic lives

```
src/
  domain/types.ts          Domain model: Task, Stage, Project, User, statuses
  lib/
    sourceAnalyser.ts      R1: text -> deadline, obligations, scale, missing detail
    domainEngine.ts        R1: template library, draft generation, backwards scheduling
                           R4: dependency analysis (blocked / affects / overdue)
    llmAdapter.ts          The single seam where a real model call would go
    seed.ts                Mock users, example information sources, demo projects
  state/projectStore.ts    All application state and actions
  components/ui.tsx        Shared UI: avatars, badges, status control, guidance bar
  views/
    ProjectsView.tsx       Several projects in parallel
    DraftView.tsx          R1 + R2: source -> draft, template choice, preview
    BoardView.tsx          R3 + R4: stages, tasks, assignment, drag-and-drop, detail panel
    CalendarView.tsx       R1 + R4: month grid, backwards-computed bars, role emphasis
    FlowView.tsx           R4: dependency map, tracing, intervention
qa/                        Verification scripts (see below)
```

### Design decisions worth defending in the report

1. **The generator is rule-based, not an LLM.** Deterministic output means a demo is reproducible
   and a marker can inspect the reasoning. `src/lib/llmAdapter.ts` defines a `DraftExtractor`
   interface with a rule-based implementation and a clearly-marked placeholder for a networked one,
   so swapping in a model changes one file and nothing in the UI.

2. **The analyser shows what it could *not* find.** 20 of 30 respondents worried that automatic
   suggestions would misunderstand their goal. So the analyser never silently invents detail: it
   reports "not stated in the source" explicitly and the draft warns that placeholders were used.
   Every task also keeps a link back to the sentence it came from.

3. **Deadlines are computed, not stored.** `scheduleBackwards` walks the task graph from the final
   deadline, then makes a forward pass so a task never starts before its dependencies finish.
   Changing an estimate, a dependency or the final deadline recomputes the whole schedule. A
   dependency that would create a cycle is refused rather than allowed to hang the UI.

4. **Slack is effort vs. calendar, not "distance to the deadline".** `scheduleBackwards` pins the
   last task to the final deadline by construction, so measuring slack that way is always zero and
   the "you do not have time for this plan" warning is unreachable. Slack is therefore
   `calendar days remaining − total effort`.

5. **Human-readable dates are formatted with an explicit locale.** Relying on the browser default
   produced mixed `27 Oct` / `10月27日` output on a Chinese-locale machine.

---

## 6. Verification

Two independent layers, both runnable offline.

```sh
pnpm test        # pure logic, no browser
pnpm check:ui    # drives the real app in headless Chrome
```

**`qa/logic.test.mjs`** — 40 assertions over the pure functions, importing the real `.ts` sources
(Node strips the types, so the tests cannot drift from the shipped logic). Covers date extraction
in English and Chinese, relative expressions, backwards scheduling, dependency invariants
(no task starts before its predecessor finishes), cycle tolerance, and draft generation
(owners, computed dates, collaborative tasks having collaborators, expert vs novice checklists).

**`qa/check-*.js` + `qa/cdp.mjs`** — a small Chrome DevTools Protocol driver navigates the running
app, clicks real controls and asserts on real rendered state: that the guidance toggle changes what
is shown, that clicking a card opens the detail panel, that toggling a dependency recomputes dates,
that a status change sticks, that simulated progress from a teammate arrives, that the month grid
draws every bar on the day span its own dates imply, that the Chinese/English switch translates the
chrome and is persisted, and that each error-prevention guard fires.

The calendar placement check is worth naming: the old Gantt positioned bars by percentage along one
axis, so "does a bar exist" was nearly the same question as "is it in the right place". A calendar
bar is positioned by week row *and* day column, so the check derives the expected column from each
bar's own date range and compares it with where the bar actually sits. Without that, every bar could
be drawn in the wrong week and the suite would still pass.

The driver pins the interface to English before the label-based assertions, and does so by clicking
the real header control rather than reaching into the store: `window.__EF` is dev-only and is absent
from the production bundle the checks run against.

`qa/walkthroughs.test.mjs` covers the walkthrough scripts as data, since the player that used to
drive them is gone (see §3 above).

```sh
node --experimental-strip-types qa/logic.test.mjs
node --experimental-strip-types qa/walkthroughs.test.mjs
node qa/cdp.mjs "http://localhost:5199/?view=board" --file qa/check-board.js
node qa/cdp.mjs "http://localhost:5199/?view=board" --file qa/check-calendar.js
node qa/cdp.mjs "http://localhost:5199/?view=board" --file qa/check-i18n.js
node qa/cdp.mjs "http://localhost:5199/?view=draft" --file qa/check-guards.js
```

Both layers found real bugs during development, which is the point of having them. The most
serious were:

- the deadline analyser matched `"5 minutes of questions"` as a date candidate and then invented a
  deadline instead of continuing to the real `"27 October 2026"` later in the same paragraph;
- `TaskDetail` selected a store method that returned a **new `Map` on every call**, so React's
  `useSyncExternalStore` looped until it threw *Maximum update depth exceeded* and blanked the page;
- the dependency map held its nodes in `useNodesState`, which snapshots the initial value — so
  tracing a task updated the side panel while the map itself never faded.

**Known limits.** Dates are not adjusted for weekends or public holidays; effort is estimated from
template weights rather than from the user's own history; the collaborator simulation is local and
probabilistic, not real multi-user sync; "familiarity" is a per-user setting rather than inferred
from behaviour. These are the honest next steps, and each is isolated behind a single
function or interface.

---

## 7. Demo script (about 4 minutes)

The interface opens in **Compact** mode. Press **Detailed** in the header first if you want the
requirement tags and the explanatory copy visible while you talk.

1. **`Projects`** — two projects in parallel; point out the mixed individual/collaborative counts
   and the blocked/overdue counters.
2. **`New from source`** — paste the coursework brief. Show the deadline found in the text, the
   obligations list, and the *not stated in the source* panel. Switch the header control to
   **Novice** and back to **Expert** to show the same data presented two ways. Point at the draft
   preview dates, then **Create project**.
3. **`Board`** — drag a card between stages; set a status; open a card and add a dependency, and
   note that the dates recompute. Point out the hint (novice) versus the reused checklist (expert).
4. **`Calendar`** — every bar is computed backwards from 27 Oct, and the whole plan fits one screen.
   Switch the signed-in user to a **member** to show other people's bars de-emphasise, then press
   **⟳** in the header to show progress arriving from a teammate.
5. **`Dependencies`** — click a task to trace what it waits for and what it holds up. Explain the
   coordinator's job: find the red nodes and intervene.
6. **Error prevention** (optional, and it lands well) — paste a source containing "31 February", or
   open a task whose "waits for" list has a greyed-out option. See the user manual §6 for the full
   inventory of guards.

