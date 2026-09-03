# CareCircle

A phone app for one caretaker looking after two people with long-term conditions.

It tracks whether treatment is actually being taken, escalates to the caretaker when it
is not, and turns 90 days of that record into a summary a doctor can read in the two
minutes before a consultation.

Everything runs offline on a single shared device. There is no account, no server, and no
data leaves the phone.

---

## Quick start

```bash
npm install
npm run setup      # pins every Expo package to the versions SDK 57 expects
npx expo start
```

Scan the QR code with **Expo Go** on an Android or iOS phone.

| Who | Role | PIN |
| --- | --- | --- |
| Anita Rao | Caretaker — sees both patients | `1111` |
| Meera Nair | Patient — sees only her own record | `2222` |
| Ravi Menon | Patient — sees only his own record | `3333` |

The app ships with 90 days of seeded history, so every chart and the doctor summary have
something real to show on first launch.

> **Phone only, on purpose.** `app.json` declares `ios` and `android` and nothing else, and
> `App.js` refuses to render on web. The whole design rests on a device that stays with the
> patient and can raise a notification at 06:30; a desktop browser satisfies neither.

---

## What it does

**Medication and adherence**
Schedules, per-dose reminders, and a two-tap *Taken / Not taken* on every slot. Missed doses
are tracked per drug and per time-of-day, not just as one number.

**Escalation to the caretaker**
Each dose gets a grace window — 45 minutes for a medicine flagged critical, 90 minutes
otherwise. When it closes with nothing logged, the dose is written as missed, an alert is
raised, and the phone is notified. This is the "if the thyroxine is not taken, tell the
caretaker" requirement, and it also fires for repeated misses, week-on-week adherence drops,
red-flag symptoms, overdue follow-ups, and abnormal labs.

**Conditions and treatment commitment**
Each condition carries the doctor's actual treatment goal. Medicines link to conditions, so
adherence is reported against what was prescribed rather than against a generic target. Both
the patient and the caretaker can add and edit.

**Vitals, labs and visits**
Blood pressure, sugar, weight, SpO₂ and temperature, charted against their target band.
Lab panels — Basic Metabolic Panel, thyroid, lipid, HbA1c, CBC — entered by hand with
reference ranges pre-filled and each value flagged as you type. Visits record attendance,
outcome and the next follow-up date; a follow-up that passes unbooked raises an alert.

**Symptoms and emergencies**
Red-flag symptoms are pre-classified rather than left to the person's judgement, so someone
frightened at 2am does not have to decide whether chest tightness counts. Choosing one alerts
the caretaker immediately. A separate Emergency screen shows rescue medication instructions
in full, plus blood group, allergies and active conditions.

**Doctor view**
The part worth the most. See below.

---

## The doctor view

A clinician gets ten minutes. So the summary answers three questions and shows its working
for each.

**1. Is the treatment actually being taken?** — and if not, precisely where the gap is: which
drug, which time slot, which day of the week.

**2. Are the numbers moving?** — vitals against their target band, lab analytes against their
reference range, with the direction of travel.

**3. Is there a link between the two?** — readings are split by whether every scheduled dose
was taken *the day before*, which separates *"this drug is not working"* from *"this drug is
not being taken"*. That distinction decides whether the doctor escalates therapy or fixes the
routine, and it is the thing a paper diary cannot tell them.

Exports as a PDF through the phone's share sheet, or as plain text to paste into a message.

Both are stated on the output itself:

```
Adherence % = taken ÷ (expected − clinically held) × 100
```

Doses a clinician told the patient to hold are recorded separately and removed from the
denominator — they are not the patient's failure. Doses not yet due are excluded entirely, so
this morning's untaken tablet cannot drag the number down.

### What the seeded data demonstrates

The demo history is a causal story, not decorated noise. Each morning's vitals are generated
from the previous day's actual dose record, which is why the analysis below is *found* rather
than asserted:

**Meera Nair** — 82.3% adherence over 90 days.

- Levothyroxine at 06:30: **97.8%**. Metformin at 20:30: **49.4%**. Same person, same week.
- The engine reports: *"Evening doses fail — 49.4% vs 91.9% in the morning"* and concludes the
  problem is specific to the slot, not general disorganisation.
- Consequence: *"Fasting glucose runs 25.5 mg/dL higher the day after doses are missed."*
  Her HbA1c has gone 6.9 → 7.8%.
- The clinical point: **her regimen is not failing, her evening routine is.** A second agent
  would treat the wrong problem.

**Ravi Menon** — 76.6% adherence, and a much sharper pattern.

- Mon–Fri **85%**. Sat–Sun **52%**.
- The engine names it: *"Adherence tracks the caregiving routine rather than the illness. This
  is a support-availability problem, not a motivation problem."*
- Consequence: *"Systolic BP runs 5.1 mmHg higher the day after doses are missed"* — his high
  Monday readings are a downstream effect of the weekend gap, not a hard-coded Monday spike.
- Alongside a falling eGFR (45 → 40) and rising creatinine, that weekend gap is the most
  actionable thing on the page.

---

## Design decisions worth knowing

**The in-app Alert Center is the source of truth, not the notification.** OS notifications get
denied, silenced, or swiped away, and on Android in Expo Go local notification support is
limited. Every escalation is therefore written to the database first; the notification is a
convenience layer that is allowed to fail. For reliable notifications, use a development
build rather than Expo Go.

**Nothing marks a dose missed at the instant it is due.** People take tablets late. The grace
window exists so the app is not crying wolf at 06:31, and it is shorter for critical drugs
because the cost of a late escalation is higher there.

**Correlations are reported even when there is no signal.** *"Systolic BP is unchanged by
whether doses were taken"* is as useful to a prescriber as the opposite — it is the case where
escalating therapy actually is justified. Suppressing null results would let the doctor assume
non-adherence explains everything.

**Severity is graded by magnitude, not by crossing a line.** A glucose of 101 against a
70–100 range is a rounding error. Calling it critical teaches the reader to ignore the word,
so the engine grades exceedance as a fraction of the reference width, and lab alerts split into
two tiers: dangerous thresholds escalate individually as critical, everything else is grouped
into one alert per panel.

**Charts are hand-drawn SVG.** A charting library is another dependency to break on an SDK
upgrade, and every chart here needs a clinical reference band, which most libraries make
awkward. Same reasoning for the icons.

**Timestamps are local wall-clock strings, never UTC.** A dose scheduled for 06:30 must stay
06:30. `Date.toISOString()` is deliberately never used, and there is a test for it.

---

## Limitations — read before trusting this with anyone's health

- **Not a medical device.** No regulatory clearance of any kind. It supports a conversation
  with a clinician; it does not replace one.
- **All clinical data is self-reported.** Vitals and lab values are typed in by hand and are
  never verified against a device or laboratory feed.
- **The PIN is not security.** It is stored in plain text in the local database. It keeps
  household members out of each other's records; it would not survive anyone with the phone
  and intent.
- **There is no backup.** Uninstalling the app deletes everything permanently. Export a PDF of
  anything that matters.
- **The adherence–outcome comparison is observational and unadjusted.** It is a prompt for a
  clinician to look closer, not evidence of causation.
- **One device only.** By design, per the architecture chosen. Two phones would need a sync
  backend — see below.

---

## Architecture

```
App.js                      web guard, providers
src/
  db/
    schema.js               tables, reference ranges, red-flag list
    database.js             expo-sqlite handle, init, reset
    seed.js                 90 days of causally coherent demo history
    queries.js              the only module that writes SQL
  services/
    schedule.js             medication records -> concrete dose slots
    adherence.js            the adherence maths
    patterns.js             the pattern engine behind the doctor view
    alerts.js               escalation sweep, de-duplicated
    notifications.js        local reminders (allowed to fail)
    pdf.js                  doctor summary -> HTML -> PDF
  components/               UI kit, SVG charts, SVG icons, DoseCard
  context/AppContext.js     session, foreground sweep, data invalidation
  navigation/               role-based navigators
  screens/                  login, patient/, caretaker/, shared/
tools/verify.js             57-assertion verification pass
```

**Stack:** Expo SDK 57 · React Native 0.86 · expo-sqlite · React Navigation 7 ·
react-native-svg · expo-notifications · expo-print.

### If you later need two phones

The data layer is already isolated behind `src/db/queries.js`, and every write goes through
it. Adding Firebase or Supabase means implementing that one interface against a remote
store and moving the escalation sweep server-side. No screen would change.

---

## Verifying

`tools/verify.js` runs the real database, seed, schedule, adherence, alert and pattern code
on plain Node against an in-memory SQLite, and asserts the numbers — including that the
patterns deliberately planted in the seed are the ones the engine actually finds. It also
parses all 39 source files so a syntax error cannot reach a phone.

It caught two real bugs during development: labs that were merely out of range raised no
alert at all, and the adherence–outcome comparison was stratifying on the wrong day.

See `tools/README.md` for how to run it — it needs a few test doubles for the native modules.

---

## Licence

MIT.
