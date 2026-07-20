# Proposal — Skills & Interest step, aligned to the Indian exam landscape

**Issue:** [#42 — Add Higher Education in the Career Aspirations with the options](https://github.com/parameshjava/careerlaunchpad/issues/42)
**Scope:** the student registration wizard, **Step 3 "Career Aspirations"** (expanding the options per #42) and the follow-on **skills preview** it drives.
**Status:** proposal for review — no code written yet.

### Career aspiration options (from issue #42, with proper names)

Three groups, capped at **3 selections**:

| Group | Option (label) | Full name |
|---|---|---|
| **Higher Education** | ICET (MBA / MCA) | Integrated Common Entrance Test |
| | PGCET (M.Sc / M.Com / M.A) | Post Graduate Common Entrance Test |
| | EDCET (B.Ed) | Education Common Entrance Test |
| | CAT (MBA – IIMs) | Common Admission Test |
| **Government Jobs** | RRB — Railways | Railway Recruitment Board |
| | SSC | Staff Selection Commission |
| | UPSC — Civil Services | Union Public Service Commission |
| | APPSC — State Services | Andhra Pradesh Public Service Commission |
| | DSC — Teacher Recruitment | District Selection Committee |
| **Private Sector** | IT / Software | Information Technology |
| | Mechanical | Mechanical Engineering |
| | Electrical | Electrical Engineering |
| | Civil | Civil Engineering |

> These replace/extend the current `ref_career_goal` seed (which today uses IT Sector / Core Jobs / Banking / Government / Other). **Open:** does Banking stay as a fourth group, or is it out of scope for #42? (Not listed in the issue.)

---

## 1. Why this needs to change

The registration form is a 6-step wizard (`components/students/registration-fields.tsx`, driven by `ref_*` tables):

| Step | Title                    | Source                                                                                                                                  |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | Career Aspirations       | `ref_career_goal` — **has a `category` column** (IT Sector, Core Jobs, Banking, Government, Other)                                      |
| 4    | Current Skill Assessment | `ref_skill_assessment_category` — rate 1–5 (communication, aptitude, programming, english_speaking, presentation, interview_confidence) |
| 5    | Skills & Interests       | `ref_skill` + `ref_interest` — **flat, ungrouped chip lists**                                                                           |

The mismatch the issue names: **`ref_skill` and `ref_interest` are a flat, IT-only list** — `java, python, sql, cpp, react, testing, ai, ml` and `coding, public_speaking, research, entrepreneurship, leadership, content_creation`. A student targeting **banking, SSC, railway, police, or higher studies sees nothing that reflects how those exams actually assess them.** Meanwhile Step 3 *already* knows the student's target sector but Step 5 ignores it.

**The decided direction (locks the design):** the student **picks their career aspirations (max 3)**, and the skills step then **shows the skill set they will build as part of our course** for those goals — grouped by competency domain. Skills are no longer a self-report the student toggles; they are a **derived preview of the curriculum** tied to the chosen aspirations. This turns the step into a value proposition ("here's what you'll gain with us") instead of a data-entry chore, and expresses skills as **competency domains that map to real exam sections**.

---

## 2. The exam landscape (what students here are actually preparing for)

Almost every recruitment/entrance exam in this space is built from the **same handful of assessed sections**, in different weightings. Understanding that is what lets one skills taxonomy serve all five sectors.

### 2.1 IT Sector (campus placement & recruitment)
- **Exams/tests:** TCS NQT, Infosys (InfyTQ / HackWithInfy), Wipro Elite NLTH, Cognizant GenC, Accenture, Capgemini, HCL; aggregator tests **AMCAT, eLitmus, CoCubes**; product-company coding rounds (Amazon/Microsoft-style DSA).
- **Assessed sections:** Quantitative Aptitude · Logical Reasoning · Verbal Ability (English) · **Coding** (C/C++/Java/Python) · Technical MCQs (DSA, DBMS, OS, OOPs, Networks).
- **Adjacent:** GATE (M.Tech + PSU recruitment via GATE score).

### 2.2 Banking Sector
- **Exams:** IBPS PO / Clerk / RRB (Officer Scale & Office Assistant), SBI PO / Clerk, RBI Grade B / Assistant, NABARD Grade A/B, SIDBI.
- **Assessed sections:** Quantitative Aptitude · Reasoning Ability · English Language · **General / Banking / Financial Awareness** · Computer Aptitude · (PO: Descriptive English — essay/letter).

### 2.3 Government Sector (SSC, Railway, State PSC, Police, Defence)
- **SSC:** CGL, CHSL, MTS, GD Constable, CPO (Sub-Inspector).
- **Railway (RRB):** NTPC, Group D, ALP, RPF Constable/SI.
- **State PSC:** APPSC / TSPSC Group I–IV (and other states).
- **UPSC:** Civil Services (Prelims GS + CSAT), CDS, NDA, CAPF.
- **Police:** State Constable / SI (written + physical PET/PST).
- **Defence:** NDA, CDS, AFCAT, Agniveer.
- **Assessed sections:** General Intelligence & Reasoning · Quantitative Aptitude / Numerical Ability · **General Awareness** (Current Affairs + Static GK: History, Polity, Geography, Economy, General Science) · English / Regional language · CSAT-style comprehension. Police/Defence add **physical eligibility** (not a "skill," but a real readiness factor).

### 2.4 Higher Studies (esp. B.Sc / B.Com, also engineering)
- **B.Com → :** CA (Foundation/Inter/Final), CMA, CS; MBA via **CAT / XAT / MAT / CMAT / NMAT**; M.Com; CUET-PG.
- **B.Sc → :** IIT-JAM (M.Sc), CUET-PG, UGC-NET/JRF, GATE (select subjects), research.
- **Engineering → :** GATE, MBA (CAT), MS abroad (**GRE + TOEFL/IELTS**).
- **Assessed sections:** Subject/domain core · Quantitative + Data Interpretation · Logical Reasoning · Verbal/English (CAT = VARC/DILR/QA; GRE = Verbal/Quant/AWA) · for abroad, English proficiency (IELTS/TOEFL).

### 2.5 Other exams / jobs
- **Teaching:** CTET, State TET, DSC/TRT, KVS/NVS.
- **Insurance:** LIC AAO/ADO, NIACL, GIC.
- **Others:** India Post GDS, staff nursing/paramedical, PSU non-technical, entrepreneurship / freelancing / digital-skills track.
- **Assessed sections:** same aptitude/reasoning/English/GA core + a domain layer (child development & pedagogy for teaching, insurance/financial awareness for insurance, etc.).

### 2.6 The unifying map

> Read down the left column: these seven competencies, in different mixes, cover **every** exam above.

| Competency domain                                                                 |  IT   |        Banking         | SSC/Railway |   State PSC / UPSC   | Police/Defence | Higher Studies |
| --------------------------------------------------------------------------------- | :---: | :--------------------: | :---------: | :------------------: | :------------: | :------------: |
| Quantitative Aptitude (Arithmetic)                                                |   ●   |           ●            |      ●      |          ●           |       ●        |       ●        |
| Logical & Analytical Reasoning                                                    |   ●   |           ●            |      ●      |          ●           |       ●        |       ●        |
| English / Verbal Ability                                                          |   ●   |           ●            |      ●      |          ●           |       ○        |       ●        |
| General Awareness / GK (CA, History, Polity, Geography, Economy, Science)         |   ○   |           ●            |      ●      |          ●           |       ●        |       ○        |
| Computer / Coding (languages, DSA, DBMS, OS)                                      |   ●   | ○ (computer awareness) |      ○      |          ○           |       –        |    ● (GATE)    |
| Domain / Core (engineering, commerce/accountancy, science subjects)               |   ●   |  ○ (banking/finance)   |      –      | ● (optional subject) |       –        |       ●        |
| Communication & Personality (public speaking, GD, interview, descriptive writing) |   ●   |      ● (PO desc.)      |      ○      |    ● (interview)     |       ●        |       ●        |

`●` = major/scored section  `○` = present/minor  `–` = not applicable

---

## 3. Proposed representation (decided direction)

Two linked steps, both driven by `ref_*` data:

### Step 3 — Career Aspirations: pick up to **3**

Keep the existing `GoalPicker` (goals grouped by the `ref_career_goal.category` sectors), but:
- **Cap the selection at 3** — the 4th tap is blocked with a gentle "You can pick up to 3 goals" hint; a counter shows `2 / 3`.
- Keep the ★ **primary** among the chosen goals (already supported).

### Step "Skills" — "Skills you'll build with us" (read-only preview)

Replace the self-select chip grid with a **derived preview**: the **union of the skill sets our course delivers for the chosen goals**, grouped by competency domain (§2.6). The student doesn't toggle anything here — it's the payoff screen that shows what the programme gives them for the goals they picked.

```
Your goals: ★ Banking Sector · SSC CGL · Data Analyst                    3 / 3

Skills you'll build with us
Everything our course covers for the goals you chose:

▸ Quantitative Aptitude     Arithmetic · Number Series · Data Interpretation · Percentages
▸ Reasoning                 Puzzles · Syllogism · Seating Arrangement · Coding-Decoding
▸ English / Verbal          Grammar · Reading Comprehension · Vocabulary
▸ General Awareness         Current Affairs · Banking Awareness · Economy · Polity
▸ Computer & Data           SQL · Excel · Python  (for Data Analyst)
▸ Communication             Public Speaking · Group Discussion · Interview Skills
```

- Each domain shows only the skills actually mapped to the chosen goals — so the list *changes as the student changes their goals*, making the choice feel consequential.
- Presented as **outcomes** ("you'll build"), not checkboxes — matches the "College to Corporate" promise and removes a data-entry burden from the student.
- Optional per-goal attribution (e.g. *"SQL · Excel — for Data Analyst"*) so the student sees which aspiration adds what.

### Alternatives considered (not chosen)

- **Student self-selects skills** (my earlier Option A) — rejected: the student rarely knows the exam syllabus; the course, not the student, defines the skill set.
- **Target-exam picker** (IBPS PO, SSC CGL…) — more precise but heavy content burden; the sector-level goal is enough for Phase 1.

---

## 4. Proposed data-model changes

**API-first (per CLAUDE.md): the form reads everything from `ref_*`; nothing hard-coded in the component.**

1. **`ref_skill`** — add `category text` (competency domain) and expand the seed:

   | category                    | example skills                                                                           |
   | --------------------------- | ---------------------------------------------------------------------------------------- |
   | Quantitative Aptitude       | Arithmetic, Number Series, Simplification, Data Interpretation, Percentages, Time & Work |
   | Reasoning                   | Puzzles, Syllogism, Coding-Decoding, Blood Relations, Seating Arrangement, Non-verbal    |
   | English / Verbal            | Grammar, Reading Comprehension, Vocabulary, Error Spotting, Para Jumbles                 |
   | General Awareness           | Current Affairs, History, Polity, Geography, Economy, General Science, Banking Awareness |
   | Computer & Data             | Java, Python, SQL, C++, DSA, DBMS, OS, Excel, AI/ML, Data Science                        |
   | Domain / Core               | Accountancy, Commerce, Mechanical, Electrical, Civil, Physics/Chem/Bio                   |
   | Communication & Personality | Public Speaking, Group Discussion, Interview Skills, Descriptive Writing                 |

2. **NEW `ref_career_goal_skill`** — the curriculum map: which skills each goal's course delivers.

   ```
   ref_career_goal_skill ( career_goal_slug → ref_career_goal.slug,
                           skill_slug       → ref_skill.slug,
                           sort_order )
   ```

   This is the source of truth for the preview. The skills screen = `union(skills WHERE career_goal_slug IN chosen goals)`, regrouped by `ref_skill.category`. Editable content (a mentor/admin curates each course's skill set).

3. **Career-goal cap = 3** — enforced in the `GoalPicker` UI **and** validated server-side on save (reject > 3), so the preview and any downstream logic can assume ≤ 3.

4. **`student_profile.skills`** — becomes **derived, not hand-entered**: persist the computed union at submit (keeps completeness scoring & analytics working on the existing slug array), but its source is the chosen goals, not free selection. `primary_career_goal_id` / `career_goal_ids` remain the real inputs.

5. **`ref_interest` / the "Interests" input** — **retire as a separate student choice.** With skills now derived from goals, interests were redundant (they overlapped the sector already captured in Step 3). Keep the table for back-compat; stop surfacing it. *(Resolves earlier open Q1.)*

6. **`ref_skill_assessment_category` (Step 4 self-assessment)** — keep "rate your current level," but **scope the rated rows to the domains present in the chosen goals' skill set**, so the ratings line up with what the course will actually teach.

Migrations are additive/idempotent and auto-apply via CI (per repo convention).

---

## 5. Impact

- **DB:** `category` column on `ref_skill`; **new `ref_career_goal_skill` map** + seed; reseed of skills & assessment categories. Additive.
- **API:** `GET /api/registration/refs` passes through `ref_skill.category` and the new goal→skill map. Save: **enforce ≤ 3 career goals**; `skills` computed from goals rather than accepted from the client.
- **UI:** Step 3 gains the 3-goal cap + counter; the old Step 5 chip picker becomes the read-only "Skills you'll build" preview; the Interests input is removed. Mobile-first (grouped list stacks).
- **Back-compat:** existing profiles with **> 3 goals** — allow them to persist as-is, enforce the cap only on new edits/submits (don't retroactively invalidate). `skills` stays a slug array, so completeness & analytics are unaffected.

---

## 6. Open questions for review

1. **Persist vs. compute** derived skills — persist the union on `student_profile.skills` at submit (recommended, zero downstream change), or compute on read every time?
2. **Curriculum ownership** — who maintains `ref_career_goal_skill`? Phase 1 seeds it in a migration; do we need an admin UI to edit it without a deploy (Phase 2)?
3. **Keep Step 4 self-assessment?** — retain it (scoped to chosen goals) as a baseline for progress tracking, or drop it to shorten the wizard?
4. **Existing > 3-goal profiles** — grandfather them (recommended) or force a re-pick on next edit?
5. **Depth shown in the preview** — domain + a few headline skills (recommended), or the full mapped list per goal?

---

## 7. Suggested phasing

- **Phase 1 (this issue):** add `category` to `ref_skill`; add + seed `ref_career_goal_skill`; cap career goals at 3 (UI + server); replace the skills picker with the read-only "Skills you'll build with us" preview; retire the Interests input; scope Step-4 self-assessment to chosen goals.
- **Phase 2 (later):** admin UI to curate the goal→skill curriculum map; optional per-exam granularity; progress tracking against the promised skill set.
