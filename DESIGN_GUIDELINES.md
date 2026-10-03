# Maher Mail — Design Guidelines

How this app looks, moves and behaves, and why. It follows Apple's Human Interface Guidelines (Liquid Glass materials, fluid motion, the eight design principles). It also uses the visual identity of **[drmahermahmoud.com](https://drmahermahmoud.com)**, so the mail client feels like part of the clinic's brand.

Every token named here lives in [`app/globals.css`](app/globals.css). If you change a value, change it there and update this file.

---

## 1. Principles

These are the decisions we fall back on when a design question comes up.

| Principle | What it means here |
| --- | --- |
| **Purpose** | This is a focused mail client for one clinic address. No folders, labels or rules engine until there's a real need. |
| **Agency** | You stay in control: **Undo send**, drafts saved automatically on close, and scheduled mail that can be canceled. Confirmation dialogs only appear for things that can't be undone, like canceling a scheduled send. |
| **Responsibility** | Each mailbox signs in separately and only ever sees its own mail. Received mail is untrusted. It renders in a script-less sandbox, remote images (tracking pixels) are blocked by default, and quoted replies are sanitized. |
| **Familiarity** | Gmail and Apple Mail conventions: Compose top-left, star and Important markers, Reply / Reply all / Forward, and Gmail keyboard shortcuts. |
| **Flexibility** | Light, dark or automatic theme. Comfortable or compact density. Reduce transparency. Layouts for desktop, tablet and phone. |
| **Simplicity** | The common path comes first (read → reply). Advanced options sit one level deeper (schedule menu, formatting bar, settings). |
| **Craft** | Every spacing, radius, timing and color comes from a token. Nothing is random. |
| **Delight** | It should feel **calm and confident**, like the clinic. Delight comes from smooth motion and clarity, not decoration. |

---

## 2. Brand foundation (from drmahermahmoud.com)

| Token | Value | Use |
| --- | --- | --- |
| `--navy` | `#0b2d4d` | Primary brand color: primary buttons, the logo disc |
| `--navy-2` | `#0b3558` | Start of the primary gradient |
| `--blue` | `#176b9c` | Accent: selection, links, active nav (light mode) |
| `--blue-bright` | `#2d9cdb` | Canvas glows; accent in dark mode |
| `--ice` | `#edf7fc` | Pale brand tint |
| Text | `#17212b` / `#3d4b5c` / `#667085` | Primary / secondary / tertiary (same as the website) |

**Primary button.** We use the website's `.btn`: `linear-gradient(135deg, #0b3558, #0b2d4d)`, which shifts to `linear-gradient(135deg, #176b9c, #0b527d)` on hover, with a soft navy shadow. In Liquid Glass it becomes a **capsule** (`border-radius: 999px`).

**Typeface.** We use **Inter**, the same as the website, loaded through `next/font`. If it can't load, it falls back to `-apple-system` / Segoe UI.

**Signature glows.** The website's hero uses soft radial blue glows. We reuse them as the app canvas, so the glass has brand color to refract.

### Semantic colors

| Token | Light | Purpose |
| --- | --- | --- |
| `--star` | `#f2a900` | Starred (gold) |
| `--important` | `#e8710a` | Important marker (amber-orange, distinct from the star) |
| `--danger` | `#d92d20` | Destructive actions, invalid addresses, drafts |
| `--success` | `#12805c` | Delivered status, switches when on |

Color always comes with a second signal, such as a filled vs outline icon or a text label. Status never relies on color alone.

---

## 3. Liquid Glass materials

Glass is a **floating functional layer**. It structures the interface without competing with the content. There are three weights:

| Class | Fill (light) | Blur | Use |
| --- | --- | --- | --- |
| `.glass-thick` | `rgba(255,255,255,.62)` | 40px | Structure that floats above everything: **sidebar, compose sheet, settings sheet, menus** |
| `.glass` | `rgba(255,255,255,.52)` | 28px | Content panels: **message list, reader, search field** |
| `.glass-thin` | `rgba(255,255,255,.40)` | 16px | Small controls on top of other glass: **toolbar capsules, attachment cards** |

Every glass surface has:
- `backdrop-filter: blur() saturate(180%)`. The saturation boost keeps colors behind the glass lively instead of muddy.
- A **specular sheen**: a 160° gradient from `--sheen` to transparent over the top-left 38%, like light catching the edge.
- A **bright top edge** (`inset 0 1px 0 var(--edge)`) and a faint dark bottom edge. These give the surface thickness.
- A soft, two-layer drop shadow. Bigger surfaces use `--shadow-lg`, so they read as thicker.

**Rules**
1. **Never stack light glass on light glass at the same weight.** Only thin glass may sit on regular or thick glass.
2. **Put color on a solid layer, not the glass.** Primary buttons, avatars and tags are opaque.
3. **Text on glass uses full-strength tokens** (`--text`, `--text-2`), never lighter grays.
4. **No hard dividers under floating chrome.** The reader's sticky toolbar uses a *scroll-edge effect* (blur + gradient mask) instead of a 1px border.
5. **Email bodies always render on an opaque white card**, even in dark mode. Senders design for white, and their colors must stay legible.

**Accessibility fallbacks** (built in, no extra work needed):
- `prefers-reduced-transparency: reduce`, or **Settings → Appearance → Reduce transparency**, swaps glass for the solid `--glass-solid`.
- `prefers-contrast: more` gives solid surfaces with defined borders.

---

## 4. Layout

```
List view                                     Message view (opens over the list)
┌──────────┬──────────────────────────────┐   ┌──────────┬──────────────────────────────┐
│ Sidebar  │ [☰] ( Search … / )     ( ⚙ ) │   │ Sidebar  │ [☰] ( Search … / )     ( ⚙ ) │
│ (thick)  ├──────────────────────────────┤   │          ├──────────────────────────────┤
│ Compose  │ Inbox                    ↻ ✓ │   │          │ ← Back        2 of 9 (↑)(↓) …│
│ Inbox    │ ● Sender        Subject  10:4│   │          │     Subject                  │
│ Sent     │   Sender        Subject  Oct1│   │          │     sender · to · date       │
│ ── Tags  │   …                          │   │          │     ┌ email (white card) ┐   │
│ Starred  │                              │   │          │     └────────────────────┘   │
│ Important│                              │   │          │ ╭ 📎 2 attachments · 1 MB ˅ ╮│
│ …        │                              │   │          │ │ [XLSX file] [PDF file] → ││ ← sticky
└──────────┴──────────────────────────────┘   └──────────┴──────────────────────────────┘
```

- **Panels float.** There's a 14px gutter on every side and between panels, so the canvas shows through and the surfaces read as separate layers.
- **Collapsible sidebar** (desktop). The sidebar narrows from 252px to a 76px icon rail using the toggle next to the logo, the `[` key, or Settings → Appearance. The column width animates with `--spring`. In the rail, section labels become hairline dividers, counts become badges on the icons, and every item gets a tooltip. The choice is saved with your settings. Phones always use the full drawer.
- **One pane at a time.** An open message takes the whole content area, like Gmail. The reader keeps the text at a readable width (980px max, centered). **Back** / Esc returns to the list at the exact scroll position you left. The **↑ / ↓ pager** (and J / K) steps through the list without going back.
- **Attachments dock.** A message's files sit in a thick-glass bar **stuck to the bottom of the reader**, so they stay one click away however long the email is. Cards are color-coded by type (PDF red, sheet green, doc blue, image violet), scroll sideways, and the dock can be folded away.
- **Breakpoints**
  - `≤ 860px`: the sidebar becomes a slide-in drawer with a scrim. Compose and settings go full screen.
- **Wayfinding.** Every screen answers *where am I?* (large list title plus the active nav item), *what's here?* (counts and subtitles) and *how do I get out?* (Back, Esc, Done).

### Spacing and shape

| Token | Value | Use |
| --- | --- | --- |
| `--r-xl` | 28px | Panels, sheets, sidebar |
| `--r-lg` | 22px | Menus, drop zones |
| `--r-md` | 16px | Rows, attachment cards, email frame, setting groups |
| `--r-sm` | 12px | Nav items, banners |
| `--pill` | 999px | Buttons, search, capsules, chips, tags, toast |

Spacing follows a 2-4-6-8-10-12-14-16-20-28px rhythm. Rows use `--row-pad` (12px comfortable, 7px compact).

**Hit targets.** Icon buttons are 36px (30px inside dense capsules). Rows are at least 62px tall in comfortable density. Nav items are 38px.

---

## 5. Typography

We use Inter and build hierarchy from **size, weight and tracking together**. Tracking tightens as size grows, and leading tightens with it.

| Role | Size / weight | Tracking | Leading |
| --- | --- | --- | --- |
| Reader subject (h1) | 26px / 700 | −0.025em | 1.15 |
| List title (h2) | 22px / 700 | −0.025em | 1.1 |
| Settings title | 20px / 700 | −0.02em | — |
| Brand name | 16px / 700 | −0.02em | — |
| Body / rows | 14px / 400–600 | 0 | 1.45 |
| Section labels | 11–13px / 600, UPPERCASE | +0.04 to +0.06em | — |
| Meta (dates, counts) | 12px, `tabular-nums` | 0 | — |

- **Unread is shown with weight** (700 sender, 600 subject) plus a blue dot, not with color alone.
- **Numbers that update** (counts, dates, sizes) use `font-variant-numeric: tabular-nums`, so they don't shift.
- The compose editor uses the user's chosen **email font** (Settings → Compose). That font goes out with the email; the app's own UI stays in Inter.

---

## 6. Motion

Motion is a conversation with the user, not decoration. We use **springs**, written as CSS `linear()` curves sampled from real spring physics.

| Token | Physics | Use |
| --- | --- | --- |
| `--spring` | Critically damped (damping 1.0), ~420ms | The default: menus, toast, sidebar drawer, settings sheet, segmented controls |
| `--spring-bounce` | Damping 0.8 (about 1.5% overshoot), ~600ms | Things that arrive with energy: **compose sheet materializing, chips and attachments popping in, switch knobs** |
| `--t-fast` | 120ms ease-out | Press feedback, hovers |

**Rules**
1. **Feedback on press, not release.** Buttons scale to 0.97 (icon buttons to 0.9) on `:active`, within 100–120ms.
2. **Materialize, don't just fade.** Glass surfaces enter with opacity, scale (0.94 → 1), a 24px rise and blur (10px → 0) together, as if the material is condensing.
3. **Spatial consistency.** Compose grows from the bottom-right, where it lives (`transform-origin: 100% 100%`). The schedule menu grows from its button. The toast rises from and returns to the bottom edge. The drawer slides in from and back to the left.
4. **Bounce only where there's energy.** A menu that appears gets no overshoot. A chip you just created gets a little.
5. **Animate only `transform`, `opacity` and `filter`**, plus panel size changes on compose, which are cheap at that size.
6. **Reduced motion** (`prefers-reduced-motion: reduce`) turns movement into short 200ms cross-fades. Nothing slides or bounces, but feedback stays.

---

## 7. Components

### Buttons
- **Primary** (`.btn.primary`): navy gradient capsule. Use at most one per surface: Compose, Send, Done.
- **Ghost** (`.btn.ghost`): text and icon only, with a tint on hover. Used for Reply / Reply all / Forward and "Load older".
- **Danger** (`.btn.danger`): red text. Only for actions that destroy or cancel something.
- **Icon** (`.icon-btn`): 36px circle. Related icon buttons are grouped in a **thin glass capsule** (`.capsule.glass-thin`) and placed next to the thing they affect.

### Rows (message list)
`[avatar] [sender · 📎 · date] / [subject] / [snippet] / [tags]` with `[★ / ⟫]` marks on the right.
- **Unread vs read.** Unread mail is a **bright raised card** (`--unread-bg`), with a blue dot, bold sender and subject, and the time in blue. Mail you've read sits back on a **quiet tinted row** (`--read-bg`) with muted text, the way Gmail does it. Sent mail and drafts are neither.
- **The message you just read stays highlighted** (accent tint) after you go Back, so you never lose your place.
- **Starred and Important are labels, not just buttons.** A flagged row gets a colored edge on the left (gold = starred, orange = important, split = both) and a pill in its tag line (*Important* is solid orange, *Starred* is gold-outlined). That makes them easy to spot while scrolling.
- A set star is **large (22–24px), gold and glowing**, and always visible. Unset star and Important buttons appear on hover (always on touch screens), and they pop with a spring when you turn them on.
- **Avatars are Gravatar photos** where the address has one, loaded through `/api/avatar/{sha256}`. The API key stays on the server, and photos are cached on disk for a day. Until a photo arrives, or if there isn't one, the stable brand-colored initials show, so nothing jumps.

### Tags
Small capsules (20px, 11px/600). Every tag has an icon or plain-text meaning: Important, Starred, Inbox, Scheduled, Canceled, Draft, and delivery status (delivered / opened / bounced …).

### Star and Important
- **Star** = "come back to this" (gold, `starFill` / `star`). Shortcut **S**.
- **Important** = "this matters" (amber chevron, `importantFill` / `important`). Shortcut **I**.
- Both are independent, saved on the server, and each has its own sidebar section under **Tags**. Toggles update the screen immediately and roll back if the server rejects them.

### Compose sheet
Thick glass with a bounce when it materializes. It can be minimized to a 340px bar, maximized with a dimming scrim (a modal task), or shown full screen on phones. Recipients are chips, and invalid ones turn red as you type rather than on submit. Attachments show a running total against the 40 MB limit.

### File previewer (Quick Look)
Clicking any attachment (received, sent, or one you've just attached while writing) opens it in a full-window viewer modeled on macOS Quick Look. The page behind dims and blurs, and a glass toolbar shows the file badge, name, type, size, a **Download** button, *Open in new tab* and Close. ← / → move between the message's files and Esc closes.
- **Shown directly:** images, PDF, video, audio, plain text and code (wrap toggle), JSON (pretty-printed), CSV/TSV (table), HTML (rendered *or* source), Word `.docx` (laid-out pages), Excel/ODS (one tab per sheet), and ZIP (list of contents).
- **Everything else** (PowerPoint, programs, formats this browser can't decode) gets a **file card**: a large badge, the name, type and size, and a plain-language reason, with Download.
- Documents sit on a white "paper" sheet in both themes, just like email bodies.
- **Safety:** how a file is shown is decided by its name, never by what it claims to be. Bytes reach the browser as an opaque download, and HTML, Word and Excel render in sandboxed frames with scripts and remote loading blocked. Very large text is cut off at 2 MB, and tables at 2,000 rows.

### Sign-in
Modeled on the macOS login window. A single thick-glass card sits on the brand canvas with the clinic logo above it.
1. **Choose your mailbox.** Accounts are listed as rows (avatar · name · address). The one used last on this computer comes first, marked *Last used*.
2. **Enter your password.** There's a large avatar, the name and address, and a capsule password field with a round arrow button inside it. Return also signs in.
- A wrong password **shakes the field** (a horizontal shake, skipped under reduced motion), turns its outline red, clears it and keeps focus. The message appears below in plain words.
- After 5 wrong tries the mailbox is locked for a minute, and the message says so.
- **Keep me signed in** is a switch, on by default.
- *Choose a different mailbox* goes back. Mailboxes without a password in `.env` are shown dimmed and can't be picked.

### Settings sheet
Modal sheet with a scrim. A side tab list (top tabs on phones) leads to grouped rows of **switches**, **segmented controls** and **selects**. **Changes apply immediately**, as in Apple's Settings. Text fields save on blur. There is no Save button, only **Done**.

### Toast
A dark glass capsule at the bottom center. It holds at most one action (Undo / View) and closes itself. It announces through `aria-live="polite"`.

### Banners
Inline, warm-tinted strips inside the reader for status that matters: remote images blocked, scheduled send pending, load errors.

---

## 8. Feedback

The four kinds of feedback, and where each appears:

| Kind | Example |
| --- | --- |
| **Status** | Unread count in the sidebar and tab title; "Sending…" with Undo; delivery tag in the reader |
| **Completion** | "Message sent · View", "Draft saved", "Marked as important" |
| **Warning** | Remote images blocked banner; no-subject confirmation (can be turned off); attachment over the size limit |
| **Error** | Invalid address chips (inline, as you type); "Couldn't send: …" with the compose window reopened and nothing lost |

---

## 9. Accessibility checklist

- [ ] Every icon-only button has a `title`. Toggles use `aria-pressed`, and switches use `role="switch"`.
- [ ] Contrast for body text and controls is at least 4.5:1 on glass in both themes. Check over the brightest part of the canvas.
- [ ] Full keyboard use: rows are focusable (Enter opens), and the shortcuts are listed in Settings → Shortcuts.
- [ ] `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast` are all respected.
- [ ] Focus is visible: a 2px accent `:focus-visible` ring.
- [ ] No information is carried by color alone.

---

## 10. Do and don't

| Do | Don't |
| --- | --- |
| Use tokens (`var(--…)`) for every color, radius and duration | Hard-code hex values or `ms` in components |
| Use thick glass for structure, regular for content, thin for controls | Put regular glass on regular glass |
| Keep one primary button per surface | Make secondary actions navy |
| Use springs (`--spring`, `--spring-bounce`) | Use `ease-in-out` for UI motion |
| Render email bodies in the sandboxed white frame | Inject received HTML into the page |
| Name things by what they contain ("Starred", "Scheduled") | Use vague labels ("Other", "Misc") |
