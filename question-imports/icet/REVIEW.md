# ICET past-paper import — issues for review

Everything on this page needs a human (subject-expert) decision. It is generated
and appended as papers are transcribed from `/Users/paramesh/LP/materials` into
assessment-bank import files under `question-imports/icet/papers/`.

Last updated: 2026-07-25 · 1 of 25 usable papers complete (tg-icet-2025-06-08-s1: 188 of 200 imported).

> ## The rule
>
> **Only questions with a genuine, verified key go into the bank.** A question whose
> marked answer is wrong teaches a wrong method and marks a student who reasoned
> correctly as wrong — so anything doubtful is dropped, not patched.
>
> It is enforced at two levels:
>
> 1. **Whole papers** — `key-status.mjs` classifies every paper's key (genuine /
>    placeholder / absent / skewed) and writes `key-status.json`. `merge.mjs`
>    **refuses** to write questions from an untrusted paper. **5 of 30 papers are
>    dropped**, leaving 25 papers ≈ 5,000 questions.
> 2. **Individual questions** — every question is solved independently during
>    transcription. If the solution disagrees with the paper's tick, or the keyed
>    option is only defensible under a strained reading, the question is **excluded
>    and listed in §2** instead of imported.

---

## 1. Corpus-level findings

### 1.1 Papers whose printed answer key cannot be trusted — DROPPED

The papers are TCS-iON "Question Paper Preview" exports: a green tick marks the
correct option, a red cross the wrong ones. `extract-key.mjs` reads those marks
deterministically (no OCR). Three groups break that:

| Papers | Key status | Decision |
| --- | --- | --- |
| `TS ICET 2024` — 5 Jun S1, 5 Jun S2, 6 Jun S1 (`20996312_s1`, `20996315_s2`, `20996316_s3`) | **Placeholder** — the tick sits on option **1 for all 200 questions** ($\chi^2 = 600$) | **DROPPED (600 questions).** Verified wrong by solving two: p8 "Among four friends P,Q,R,S who is the tallest?" (I: Q>P; II: R<Q, R>S) needs **both** statements, and p100 "square ABCD + equilateral triangle EDC, shaded area" is $a^2/2$ = option 4. Both ticked "1". Nothing in these files states the real answer, so importing them would mean inventing keys. |
| `AP ICET 2019` — 26 Apr S1 & S2 (`1712574252phpSkvBIW`, `1712574288php3HtjQR`) | **Absent** — plain question papers (shiksha.com watermark), no ticks or crosses at all | **DROPPED (400 questions).** Same reason. |
| `AP ICET 2020` — 10 Sep S1 & S2 (`1712571043phppMwItv`, `1712571122phpXb6ku4`) | **Genuine but image-only scans** (no text layer; both print the tick notation and "Actual Answer Key: Yes", and varied ticks were confirmed on a question page) | **KEPT.** The deterministic extractor can't run, so numbering *and* key are read page by page during transcription, and every question is solved as usual. Slower, not less reliable. |

The other **23 papers** have a clean, machine-verified key: 800 markers = 200
questions × 4 options, exactly one tick per question, and an answer spread
consistent with a real key ($\chi^2$ between 0.1 and 13.0 against uniform; the
p = 0.001 threshold at 3 df is 16.27). `key-status.json` records the verdict per
paper and `merge.mjs` enforces it.

**A trusted key is still not a trusted answer.** These verdicts say the key is
*real*; they do not say all 200 marks in it are *right*. On the first paper completed,
hand-solving all 200 questions found **12 unusable** (§2): 5 where the printed key
contradicts the question, 3 where no option is correct at all, 2 unsolvable as printed,
1 needing a figure, 1 ambiguous. That is a **6% defect rate in a paper whose key is
genuine** — the reason every question is solved rather than trusted. Watch this rate
per paper: if one runs far above 6%, its key is unreliable in a subtler way than
TS 2024's and the whole paper should be dropped.

### 1.2 Data Sufficiency option labels are not printed in the papers

In most of these preview exports the Data Sufficiency options are printed as bare
numerals `1 2 3 4`, because the wording lives in a section-instruction block the
export omits. **`ap-icet-2026-05-02-s1` is the exception — it prints the block in
full on page 2**, and it reads exactly as the convention inferred earlier:

1. The question can be answered using statement I alone.
2. The question can be answered using statement II alone.
3. The question can be answered using both statements I and II together, but not by either statement alone.
4. The question cannot be answered even by using both statements together.

The AP 2026 paper's own phrasing ("Statement I alone is sufficient to answer the
question", … , "Statements I and II together are not sufficient … and additional data
is required") is used verbatim for that paper, so its option text is the paper's, not
an editorial reconstruction. Papers without the block keep the wording above, which
matches it in substance.

**Decide:** whether to keep this wording. Note it differs from the
data-sufficiency prefill in `app/dashboard/assessment-questions/assessment-question-editor.tsx`
(`DS_OPTIONS`), which uses the GMAT/CAT phrasing — including "Each statement alone
is sufficient", an option ICET does **not** offer. If the ICET wording is adopted,
that prefill should probably become a second preset rather than the only one.

### 1.3 Figure-dependent questions are skipped

Many questions depend on a diagram (geometry figures, bar charts, pie charts,
tables rendered as images). The assessment bank has a `stem_image_url` column but
there is no upload/hosting pipeline yet, so such questions are **not** imported —
each one is listed below with its paper and page so they can be added once images
can be hosted. Questions whose figure is fully describable in text (e.g. a data
table with few rows) are transcribed as Markdown tables instead.

### 1.4 Reading-comprehension passages

The assessment bank is standalone-MCQ only (no passage table, decision Q10 of
migration 143). For RC sets, the passage is embedded in **each** dependent
question's stem as a blockquote so every question stays self-contained. This
duplicates the passage text across 4-5 questions — acceptable, but flagged in case
you would rather skip RC altogether or add a passage table later.

### 1.5 Two taxonomy gaps (chapter choices worth confirming)

The ICET syllabus in migration 126 has four chapters under **Verbal Ability & Reading
Comprehension**: Vocabulary (Synonyms & Antonyms), Grammar & Usage, Reading
Comprehension, Business & Computer Terminology. The papers test two things that have
no exact home, so they were filed as follows — change the mapping if you disagree:

- **Idioms** ("bury the hatchet", "cold feet", "on cloud nine") → *Vocabulary
  (Synonyms & Antonyms)*, since what is tested is lexical meaning. Note migration 126
  does define an `Idioms & Phrases` chapter, but only under **MAT**, not ICET; adding
  it to ICET would be the cleaner fix.
- **Phrasal verbs** ("put off", "get along with") and articles/prepositions →
  *Grammar & Usage*.

Similarly, in **Quantitative Aptitude** the papers' symbol-substitution questions
("if $\otimes$ denotes $-$ …", "if $a * b = 2a+b$ …") were filed under
*Coding-Decoding* in Logical & Analytical Reasoning, since the skill is decoding
invented operators rather than arithmetic.

### 1.6 Only the English text is transcribed

Every paper is bilingual (English + Telugu, or English + Urdu). The Telugu/Urdu
renderings are dropped, per instruction. The Urdu-edition PDFs that duplicate a
paper already present in English were excluded as duplicates by
`build-manifest.mjs`; `TS ICET URDU 2023 27th May Shift 2` and
`TSICET URDU 2022 27th July Shift 2` were **kept**, because they are the only
copies of those two shifts and they contain the English text too.

---

## 2. Per-question issues

### `tg-icet-2025-06-08-s1` — TG ICET 2025, 8 June, Shift 1

All 200 questions transcribed: **188 imported, 12 excluded.**

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 2 | 4 | **Paper key looks wrong — excluded** | "Find the digit in units place of the natural number $n$, where $62 \le n \le 83$." I: $n$ is a multiple of 12 → in that range only $n = 72$, so the units digit is 2 — statement I **alone** is sufficient. II: $n \equiv 2 \pmod 7$ → 65, 72, 79 → units digits 5, 2, 9 — insufficient. The correct choice is therefore option 1, but the paper ticks option 3 ("both together, neither alone"). Excluded rather than import a question whose marked answer contradicts its own solution. |
| 15 | 13 | **Figure required — excluded** | "What is the measure of the angle $x$ in the adjacent figure?" — needs the diagram (two lines cut by a transversal). Statement I is also printed incomplete in the paper: "(I) $= 80°$" with no subject for the equation. |
| 20 | 16 | **Paper key disputable — excluded** | "'They are fine' is coded as 'Lit monk Zip'; which code word stands for 'fine'?" II: "'They are rich' → 'dog Lit zip'" shares *They* and *are* with the original, leaving `monk` = *fine* — so statement II alone suffices (option 2), yet the paper ticks option 3. The key is only defensible if the case difference `Zip` vs `zip` is treated as meaningful, which reads like a typo. Needs an expert call. |
| 17 | 14 | **Ambiguous key — excluded** | 30 students, 18 English, 16 Maths, how many in both? Statement I gives 7 **and** statement II gives 7, so *either* alone is sufficient — but ICET's four options offer no "either alone" choice and the paper keys option 1. A student who correctly spots that statement II also works would be marked wrong, so the question is out. |
| 36 | 25 | **Series pattern not determinable — excluded** | "E, J, Z, X, R, ____, D, X" with options M / N / O / P; the paper keys **N**. No consistent rule fits the given letters (alphabet positions 5, 10, 26, 24, 18, ?, 4, 24 — no arithmetic, alternating or complement pattern works), so no honest worked solution can be written. Needs an expert eye, or drop it. |
| 21 | 16 | **Imported — paper prints a duplicate distractor** | Options 1 and 3 are both "VUxy". Kept verbatim; the correct answer (UVxy) is unaffected. |
| 58 | 42 | **Imported — paper prints a duplicate distractor** | Options 3 and 4 are both "#%G©*#". Kept verbatim; correct answer K%G©*K unaffected. |
| 88 | 63 | **No correct option — excluded** | "The ascending order of $a=\frac57,\ b=\frac{13}{16},\ c=\frac35,\ d=\frac{97}{104}$" — the values are $0.714,\ 0.813,\ 0.600,\ 0.933$, so ascending is **c, a, b, d**, which is not among the four options. The paper keys option 4 (`d, b, a, c`) — the *descending* order. Either the question means "descending" or an option is misprinted. |
| 192 | 138 | **Paper key contradicts the passage — excluded** | "What is 'the great moral renovator of society and government' according to the constitutional experts?" The passage says: "No right was deemed by the fathers of the Government more sacred than **the right of speech**. It was in their eyes … **the great moral renovator of society and government**." The answer is option 4, *Right of speech*; the paper keys option 2, *Thrones* — a word that appears only in the later clause about thrones trembling. |
| 180 | 130 | **Keyed option is factually wrong — excluded** | "MIME stands for" is keyed to *Multipurpose Internet Mail **Exchange***. MIME is **Multipurpose Internet Mail Extensions** (RFC 2045). The keyed option is the closest of the four and is clearly what was intended, but importing it would teach the wrong expansion. Re-add if you correct the option text to "Extensions". |
| 175 | 127 | **Paper key breaks the idiom — excluded** | "He hit him hard ______ the spur of the moment and regretted later." The fixed idiom is **on** the spur of the moment (option 3); the paper keys option 2, *with*. No register of English takes "with the spur of the moment". |
| 128 | 92 | **Misprint makes it unsolvable — excluded** | "In $\triangle ABC$, D and E are on AB and AC. If DE ∥ BC, $AD = x+3$, $BD = 2x-3$, $AE = x+1$, **BC** $= 2x-2$, then $x =$". The basic-proportionality theorem needs **EC**, not BC — as printed, $x$ is not determined. Reading it as $EC = 2x-2$ gives $\frac{x+3}{2x-3} = \frac{x+1}{2x-2} \Rightarrow x = \frac35$, which is the paper's keyed option, so the intended text is almost certainly EC. Worth re-importing with the typo fixed if you agree. |
| 103 | 74 | **Impossible premise — excluded** | "Area of a rectangular plot whose perimeter is 18 m and diagonal is 5 m." No such rectangle exists: $l+b = 9$ forces $l^2+b^2 \ge 2\left(\frac92\right)^2 = 40.5$, so a diagonal of 5 m $(l^2+b^2 = 25)$ is impossible — $l+b=9,\ lb=28$ has discriminant $81-112 < 0$. The keyed answer 28 comes from applying $(l+b)^2 = l^2+b^2+2lb$ to data that cannot describe a real figure. |
| 96 | 69 | **No correct option — excluded** | Pipes X (4 h) and Y (6 h) opened alternately for 15 min each starting with X. Each 30-min cycle fills $\frac1{16}+\frac1{24} = \frac5{48}$; after 9 cycles (4 h 30 min) the tank is at $\frac{45}{48}$ and X's next 15 min adds exactly $\frac3{48}$ — full at **4 h 45 min**, which no option offers. The paper keys "4 h 48 min", which is the *un-leaked* filling time computed in the very next question (Q97), so the two answers look crossed. |

---

## 3. Method notes (why explanations are authored, not extracted)

The papers carry no solutions — only the marked option. Every `explanation` in the
generated files is written from scratch to teach the method, then checked against
the paper's own key. Where that check fails, the question lands in §2 instead of
the import file. That cross-check is the main quality gate in this pipeline, and
it is what produced the findings in §1.1.

### `ap-icet-2026-05-02-s1` — AP ICET 2026, 2 May, Shift 1

In progress — Q1-119 transcribed: **117 imported, 3 excluded.**

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 120 | 67 | **Keyed answer is factually wrong — excluded** | "The financial year statement showing profit or loss is called a ______" is keyed **balance sheet**. A balance sheet shows assets, liabilities and equity at a point in time; the statement that shows profit or loss is the **profit and loss (income) statement** — option 2, "profit statement", is the defensible answer. Importing this would teach a basic accounting error. |
| 85 | 51 | **Two options are synonymous — excluded** | "Choose the correct opposite of **Kindle**" offers both *extinguish* (keyed) and *put out*, which mean the same thing. A student who picks "put out" has answered correctly and would still be marked wrong, so the question cannot be used as printed. |
| 2 | 4 | **Statements contradict each other — excluded** | Figure: circle centred O with P on it, $\angle POQ = 90^\circ$, and QRO a semicircle on OQ. "What is the area of the circle with centre at O?" **I.** Area of $\triangle POQ$ is 30 $\Rightarrow \frac12 r^2 = 30 \Rightarrow r^2 = 60$, area $= 60\pi$. **II.** Length of QRO is $2.5\pi \Rightarrow$ the semicircle on diameter $OQ = r$ has arc $\frac{\pi r}{2} = 2.5\pi \Rightarrow r = 5$, area $= 25\pi$. Each statement alone determines the area, but they give **different** radii — the data is inconsistent. The paper keys option 3 ("together, but neither alone"), which is wrong either way. |
