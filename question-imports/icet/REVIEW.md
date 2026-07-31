# ICET past-paper import — issues for review

Everything on this page needs a human (subject-expert) decision. It is generated
and appended as papers are transcribed from `/Users/paramesh/LP/materials` into
assessment-bank import files under `question-imports/icet/papers/`.

Last updated: 2026-07-31 · **7 of 25 usable papers complete — 1,347 questions imported, 53 excluded (3.8%).**

| Paper | Imported | Excluded |
| --- | --- | --- |
| tg-icet-2025-06-08-s1 | 188 | 12 |
| ap-icet-2026-05-02-s1 | 196 | 4 |
| ap-icet-2026-05-02-s2 | 198 | 2 |
| tg-icet-2025-06-09-s1 | 189 | 11 |
| tg-icet-2025-06-08-s2 | 192 | 8 |
| ap-icet-2025-05-07-s2 | 191 | 9 |
| ap-icet-2025-05-07-s1 | 193 | 7 |

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

A third gap appeared in `ap-icet-2025-05-07-s2`: **Data Interpretation & Data Sufficiency**
has Tables, Bar Graphs, Pie Charts and Caselets, but **no `Line Graphs` chapter**, and that
paper's Q53-55 read a line graph (exports-to-imports ratio over six years). Since the graph
is transcribed **as a table**, those three were filed under *Tables*. Adding a `Line Graphs`
chapter to the ICET taxonomy would be the cleaner fix.

A fourth gap surfaced in `ap-icet-2024-05-06-s2` Q73 ("in how many ways can the letters of
BANANA be arranged"): **Quantitative Aptitude has no `Permutations & Combinations` chapter**.
Arrangement-counting questions were filed under *Probability*, the chapter such counting is
normally taught alongside. Adding a dedicated chapter would be the cleaner fix.

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

**COMPLETE** — all 200 questions read: **196 imported, 4 excluded.**

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 160 | 89 | **Key measures the time from the wrong moment — excluded** | "Two cars start from one point in the same direction. The first moves at 90 km/hr. The second travels at 60 km/hr for the first 2 hours, then increases to 120 km/hr. **After how much time** will the second car be 100 km ahead of the first?" Measuring from the start (the plain reading), $120 + 120(t-2) - 90t = 100 \Rightarrow t = \frac{22}{3} = 7$ h 20 min — option 4. The keyed 5 h 20 min is $t - 2$, the time counted from the **speed change**. Both values are offered as options, so the ambiguity decides the mark. *(Found late, during a count reconciliation — see the note below.)* |
| 120 | 67 | **Keyed answer is factually wrong — excluded** | "The financial year statement showing profit or loss is called a ______" is keyed **balance sheet**. A balance sheet shows assets, liabilities and equity at a point in time; the statement that shows profit or loss is the **profit and loss (income) statement** — option 2, "profit statement", is the defensible answer. Importing this would teach a basic accounting error. |
| 85 | 51 | **Two options are synonymous — excluded** | "Choose the correct opposite of **Kindle**" offers both *extinguish* (keyed) and *put out*, which mean the same thing. A student who picks "put out" has answered correctly and would still be marked wrong, so the question cannot be used as printed. |
| 2 | 4 | **Statements contradict each other — excluded** | Figure: circle centred O with P on it, $\angle POQ = 90^\circ$, and QRO a semicircle on OQ. "What is the area of the circle with centre at O?" **I.** Area of $\triangle POQ$ is 30 $\Rightarrow \frac12 r^2 = 30 \Rightarrow r^2 = 60$, area $= 60\pi$. **II.** Length of QRO is $2.5\pi \Rightarrow$ the semicircle on diameter $OQ = r$ has arc $\frac{\pi r}{2} = 2.5\pi \Rightarrow r = 5$, area $= 25\pi$. Each statement alone determines the area, but they give **different** radii — the data is inconsistent. The paper keys option 3 ("together, but neither alone"), which is wrong either way. |

### `ap-icet-2024-05-06-s2` — AP ICET 2024, 6 May, Shift 2

In progress — Q1-125 transcribed: **109 imported, 16 excluded.** *(This paper prints the data-sufficiency instruction block in full on page 3, so its option wording is the paper's own — see §1.2.)*

> **⚠ This paper is running at roughly three times the usual defect rate** — 12 excluded in the first 104 questions (**11.5%**) against ≈4% across the six completed papers. The failures are not one recurring kind: three data-sufficiency items key the wrong sufficiency level (Q8, Q11, Q17), one has no question at all (Q18), one prints contradictory sample codes (Q15), the DI table's 2022 row contradicts its own Total (Q59), and four Communication Ability items key non-standard or plainly wrong English (Q91, Q94, Q99, Q102). Taken together they suggest this paper's key was set with less care than the others, so its remaining questions deserve a closer look before the bank is published.

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 122 | 87 | **Current-affairs answer that goes stale — excluded pending a policy decision** | "Who is the Chief Executive Officer of NITI Aayog?" The keyed **B.V.R. Subrahmanyam** was correct when the paper was sat (he took office in February 2023), and the option list also carries his predecessor, Parameswaran Iyer. Nothing is wrong with the key — but the answer changes with the post-holder, so importing it hard-codes a fact that will silently become false. **A reviewer should decide whether this bank carries office-holder questions at all**; if it does, this one can be restored as printed. |
| 121 | 86 | **Stem asks about a different word than the key answers — excluded** | "**Demonization** refers to:" is keyed "Act of tripping a current unit of its status or legal tender" — evidently *stripping a currency unit of its status as legal tender*, i.e. the definition of **demonetisation**. But *demonization* is a real and unrelated English word meaning to portray someone as evil. Importing the item as printed would attach a currency definition to the wrong word; the keyed option is itself misprinted twice ("tripping" for *stripping*, "current" for *currency*). |
| 116 | 84 | **Keyed answer states the opposite of the term — excluded** | "What is Bounce Rate in Business?" is keyed **"Frequent visiting of a website"**. Bounce rate is the percentage of visitors who arrive at a page and **leave without any further interaction** — a single-page visit — so frequent visiting is precisely what a *low* bounce rate indicates. None of the four options (price rise, slump, frequent visiting, prices falling) defines the term correctly, so the question cannot be used. |
| 113 | 82 | **Keyed answer is meaningless — excluded** | "The design that helps hackers is called ______" is keyed **megabyte** (option 2) — a unit of storage, which has nothing to do with hacking. **Trojan horse** (option 3) sits right there and is the textbook answer: malware disguised as legitimate software precisely so that it lets an attacker in. A student answering correctly is marked wrong. |
| 102 | 76 | **"and" is equally correct — excluded** | "He knows Telugu ________ Hindi." The keyed *as well as* is fine, but option 2, **and**, gives a perfectly ordinary English sentence — "He knows Telugu and Hindi" — and is if anything the more natural phrasing. With two defensible answers on the list, a student choosing *and* is marked wrong for correct English. |
| 99 | 74 | **Two options are both standard usage — excluded** | "This locality ______ different minerals." Both *abounds **in*** (keyed) and *abounds **with*** (option 3) are recognised: dictionaries list **abound in/with** as interchangeable ("the river abounds in/with fish"), and by the distinction some grammars draw — *abound with* for the container, *abound in* for what is plentiful — the **place** ought to take *with*. Either way option 3 cannot be marked wrong. |
| 94 | 71 | **Key breaks the subject-verb rule for "or" — excluded** | "My brother or my sister ______ to the marriage." When two **singular** subjects are joined by *or* (or *either…or* / *neither…nor*), the verb agrees with the **nearer** one and stays singular: *My brother or my sister **is** coming*. Option 1 ("Is coming") is therefore correct; the paper keys option 2, "are coming", which would need *and* rather than *or*. |
| 91 | 70 | **The standard preposition is not offered — excluded** | "He was astonished ______ his failure." English takes **astonished at** (or *astonished by*); neither is among the options — *with*, *for*, *in*, *while*. The keyed *with* is not a standard collocation with *astonished*, so importing it would teach a wrong preposition, which is exactly what a vocabulary/usage item must not do. |
| 68 | 55 | **Answer depends on how Independence Days are counted — excluded** | "On which day of the week will India celebrate its **150th** Independence Day?" Under the official convention — 15 August 1947 is the **1st** Independence Day, which is why 15 August 2022 was the 76th — the 150th falls on **15 August 2096**. Counting odd days from the known Friday of 15 August 1947 ($149$ years $\times$ 365 + 38 leap days $= 54423 \equiv 5 \pmod 7$) gives **Wednesday**, option 2. The keyed **Thursday** is 15 August **2097**, i.e. it treats 1948 as the first. Both days are offered, so the counting convention rather than the calendar arithmetic decides the mark. |
| 59 | 49 | **Only answerable from an arithmetically wrong Total — excluded** | The Q56-60 table's **2022 row** reads 18000, 14000, 16000, 14000, 20000 — which sums to **82,000** — but its Total column prints **80,000**. Q59 asks which model was 25% of the 2022 total: with the printed 80,000 the answer is E (20,000); with the row's true sum 82,000 the target is 20,500 and **no** model matches. The keyed E is reachable only by trusting a total the table contradicts. (Q56, Q57, Q58 and Q60 do not touch the 2022 total — Q58 gives 2019 whichever figure is used — so those four were kept, with the table transcribed exactly as printed.) Page re-rendered at 220 dpi to confirm the row and the total. |
| 33 | 27 | **Two different patterns fit, and both answers are options — excluded** | "Find the missing number: 6, 12, ___, 30, 42." Filling **20** gives differences $6, 8, 10, 12$ — and the terms become $n(n+1)$: $2{\cdot}3, 3{\cdot}4, 4{\cdot}5, 5{\cdot}6, 6{\cdot}7$. Filling **24** gives differences $6, 12, 6, 12$ — an alternating step. Both are clean, self-consistent rules; 20 is option 2 and 24 (the key) is option 3, so a student who spots the more standard $n(n+1)$ series is marked wrong. |
| 18 | 16 | **The stem has no question in it — excluded** | The whole item reads "If $A = B = C = D$" followed by "**I.** $A = 2B = C$  **II.** $D = 2B = C$" — no question is ever asked, so there is nothing for the two statements to be sufficient *for*. (Read against the given equality, each statement forces $A = 2A$, i.e. all four are zero, which no data-sufficiency option expresses either.) Keyed option 3. |
| 17 | 15 | **Together the statements still do not fix $a$ — excluded** | "If $a, b, c, d$ are positive integers, what is the value of $a$? **I.** The average of $a, b, c$ is 15. **II.** The average of $b, c, d$ is 20." The two give $a+b+c = 45$ and $b+c+d = 60$; subtracting eliminates $b+c$ and leaves only $d - a = 15$. Every $a$ from 1 to 43 still works (e.g. $a=1, b=1, c=43, d=16$ and $a=2, b=1, c=42, d=17$). The correct choice is option 4; the paper keys option 3. |
| 15 | 14 | **The two statements describe contradictory codes — excluded** | "How is PRODUCT written in that code language? **I.** AIEEE is written as BJFFF. **II.** GYPSY is written as FXORX." Statement I is a uniform $+1$ shift and would give PRODUCT → QSPEVDU; statement II is a uniform $-1$ shift and would give OQNCTBS. Each statement alone yields an answer, and the two answers **disagree**, so the pair cannot describe one code language. Neither the keyed option 3 ("together, but neither alone") nor any other option fits — ICET has no "each alone is sufficient" choice. |
| 11 | 11 | **Statement II has a second solution the key overlooks — excluded** | "If each pen is either 15 rupees or 18 rupees, how many 15-rupee pens did Anjali buy? **I.** 8 pens in total. **II.** Total value ₹135." Statement II gives $15a + 18b = 135 \Rightarrow 5a + 6b = 45$, which has **two** non-negative integer solutions: $(a,b) = (3,5)$ and $(a,b) = (\mathbf{9},\mathbf{0})$ — buying nine ₹15 pens and no ₹18 pens satisfies "each pen is either 15 or 18" perfectly well. So II alone does **not** fix the count; only with I ($a+b=8$) does it, making the correct choice option 3. The paper keys option 2. |
| 8 | 9 | **Two positions fit; the key ignores one — excluded** | "What is Nitin's rank from the top in a class of forty? **I.** There are ten students between Nitin and Deepak. **II.** Deepak is 20 from the top." No statement says *which side* of Deepak Nitin stands on, so Nitin is at $20 - 11 = \mathbf{9}$ or $20 + 11 = \mathbf{31}$ — both inside a class of 40. The two statements together therefore do not determine the rank, making option 4 correct; the paper keys option 3. |

### `ap-icet-2025-05-07-s1` — AP ICET 2025, 7 May, Shift 1

**COMPLETE** — all 200 questions read: **193 imported, 7 excluded.** *(This paper prints the data-sufficiency instruction block in full on page 3, so its option wording is the paper's own — see §1.2.)*

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 196 | 133 | **Key contradicts a basic property of the standard deviation — excluded** | "The mean and standard deviation of a set of values are 30 and 8. If a constant value 5 is added to each value, then the coefficient of variation of the new set is:" Adding a constant shifts every value equally, so the **mean rises to 35 while the SD stays 8**, giving $CV = \frac{8}{35}\times100 = 22.85\%$ — which is printed as option 2. The paper keys option 4, **37.14%**, which no route reaches (the untouched $\frac{8}{30} = 26.66\%$ is option 3). A student who applies the rule correctly is marked wrong. |
| 186 | 127 | **The keyed value is not derivable, and the premise is impossible — excluded** | "If $f(x) + 2f\left(\frac1x\right) = 5x+2$, **for a polynomial** $f(x)$, then $f(3) = ?$" Replacing $x \to \frac1x$ and eliminating gives $3f(x) = \frac{10}{x} + 2 - 5x$, so $f(3) = -\frac{29}{9}$ — and that function is not a polynomial at all, so the stem's own premise cannot be met. The four options are $\frac1{11}, \frac1{10}, \frac19, \frac18$ (keyed $\frac18$); none is reachable by any route. Page re-rendered at 220 dpi to confirm the equation and the options. |
| 185 | 126 | **The expression is a tautology; no option matches — excluded** | "$(\sim P \vee R) \vee (P \wedge (\sim R \vee Q))$ is equivalent to:" If $P$ is false the first disjunct is true; if $P$ is true and $R$ is true the first disjunct is true; if $P$ is true and $R$ is false the second is $T \wedge (T \vee Q) = T$. The expression is therefore **always true**. None of the four options is a tautology — each fails on some row (option 1, the key, is false whenever $R$ is false) — so the question has no correct answer as printed. Page re-rendered at 220 dpi to confirm the connectives. |
| 165 | 112 | **Two defensible readings, both offered as options — excluded** | "If today is Monday, then the next **314ᵗʰ day** from today falls on the day:" Counting 314 days *after* today, $314 = 44 \times 7 + 6$, so the answer is Monday $+6$ = **Sunday** (option 4). The keyed **Saturday** needs today itself counted as day 1, i.e. only 313 days forward ($313 = 44\times7 + 5$). Both days are on the option list, so the wording — not the arithmetic — decides the mark. Same defect class as `ap-icet-2026-05-02-s1` Q160. |
| 60 | 42 | **The sample itself is misprinted — excluded** | "If 'GREEN' is coded as 'IUGGP', how is 'BLACK' coded?" The keyed **DNCEM** is BLACK shifted uniformly by $+2$, and that is plainly the intended rule (the neighbouring Q57-Q59 are the same kind of uniform Caesar). But GREEN$+2$ is **ITGGP**, not the printed IUGGP — the second letter is wrong, so the worked example a student is given contradicts the rule they are asked to extract. The key is right; the stem is not, so it cannot be used as printed. |
| 56 | 40 | **No rule links the sample to the keyed answer — excluded** | "If 'SMART' is coded as 'UNCRV', how is 'SHARP' coded?" The companion question Q57 (LEMON → NGOQP) is a clean $+2$ Caesar, and $+2$ on SHARP gives **UJCTR** — not offered. Taking the printed sample at face value instead, the shifts are $+2, +1, +2, 0, +2$, which is not a single rule either; but SMART and SHARP share S, A and R in positions 1, 3, 4, so a consistent *letter* substitution ($S\to U$, $A\to C$, $R\to R$) forces **UJCRV** (option 2). The paper keys **UJBTV** (option 1), which contradicts the sample at two positions and matches no reading. Page re-rendered at 200 dpi to confirm UNCRV and the four options. |
| 7 | 7 | **Statement I alone settles it, but the key says "both together" — excluded** | "Is \(x > y\)? **I.** \(x - y = 4\)  **II.** \(x = 10\)". Statement I says the difference is a positive number, which *is* the answer: \(x - y = 4 > 0 \Rightarrow x > y\), with no need for either value individually. The correct choice is option 1; the paper keys option 3. A student who reasons correctly is marked wrong. |

### `ap-icet-2025-05-07-s2` — AP ICET 2025, 7 May, Shift 2

**COMPLETE** — all 200 questions read: **191 imported, 9 excluded.** *(This paper prints the data-sufficiency instruction block in full on page 3, so its option wording is the paper's own — see §1.2.)*

**Watch this paper:** two of its first thirteen data-sufficiency questions (Q4, Q8) fail the same way — **each statement alone settles the answer**, which ICET's four options cannot express. If the pattern keeps up through Q20, it is a flaw in how this paper's DS set was written rather than isolated slips.

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 148 | 112 | **Key needs "efficient" to mean "takes less time" — excluded** | "A completes a work in 12 minutes; B and C are 25% and $33\frac13\%$ **more efficient** than A. Working together they take ___ minutes." Efficiency is work per unit time, so B's rate is $1.25 \times \frac1{12}$ and C's is $\frac43 \times \frac1{12}$, giving a combined $\frac{43}{144}$ and a time of $\frac{144}{43} \approx 3.35$ min — **not offered**. The keyed $\frac{72}{23}$ instead assumes B takes 25% **less time** (9 min) and C $33\frac13\%$ less (8 min); but a 9-minute time is 33% more efficient, not 25%, so the key is internally inconsistent. |
| 121 | 91 | **Two options are correct — excluded** | "Which of the following is NOT a programming language?" offers Python, Java, **HTML** and **ChatGPT**, keyed ChatGPT. HTML is a **markup** language, not a programming language — one of the most commonly taught facts in exactly this kind of question — so a student choosing it has answered correctly and is still marked wrong. |
| 83 | 69 | **Keyed answer is plainly wrong — excluded** | "Choose the Antonym for **transparent**" is keyed **soluble** (option 3), while **opaque** — the standard antonym — sits right there as option 1. A student answering correctly is marked wrong. |
| 81 | 68 | **Keyed answer is plainly wrong — excluded** | "Choose the Antonym for **inhale**" is keyed **smell** (option 2), while **exhale** is offered as option 4. Same defect as Q83, two questions apart. The tick positions were re-checked against the eight surrounding vocabulary questions (Q82, Q84-90), whose keys are all correct, so this is the paper's error and not a mis-read of the marks. |
| 60 | 50 | **Key contradicts its own rule at one letter — excluded** | "PERFORMANCE is coded as GEIFFIDAECE; what is the code for LEGISLATIVE?" The sample is explained by reducing each alphabet position **modulo 9** into 1-9: $P(16)\to7=G$, $R(18)\to9=I$, $O(15)\to6=F$, $M(13)\to4=D$, $N(14)\to5=E$, letters 1-9 unchanged (and note both O and F map to F, confirming the reduction). Applying it to LEGISLATIVE gives **CEGIACABIDE**. The keyed CEGIJCABIDE agrees everywhere except the 5th letter, where S(19) is reduced only once to J(10) instead of to A(1) — while T(20)→B and V(22)→D in the same option *are* reduced fully. No consistent rule yields the keyed string, and the correct one is not offered. |
| 40 | 32 | **Key not derivable — excluded** | "$156 : ? :: 671 : 7$", keyed **14**. Every rule that produces 7 from 671 gives something else for 156: first + last digit ($6+1=7$) → 7; half the digit sum ($\frac{6+7+1}{2}$) → 6; the middle digit → 5; the plain digit sum → 12. None yields 14, and 14 is in fact the *digit sum of 671* — suggesting the two halves of the analogy were crossed when the key was set. |
| 26 | 24 | **Pattern not determinable — excluded** | "I, L, Q, X, S, V, M, ___" keyed to **F**. The first four letters step cleanly by \(+3, +5, +7\) (9, 12, 17, 24), but that would make the fifth term G (33 mod 26), not S. Taking the printed letters as given, the steps are \(+3, +5, +7, -5, +3, -9, ?\) — no rule fits, and splitting into alternate terms (9, 17, 19, 13 and 12, 24, 22, ?) or into pairs fails too. The keyed F needs a final \(-7\), which nothing justifies. |
| 8 | 9 | **Both statements work alone — excluded** | "\(2x+4y=10\), \(x+py=5\). What is the value of \(x\)?" Halving the first gives \(x+2y=5\); subtracting the second gives \((2-p)y=0\). **From I** (\(y=1\)): the first equation alone gives \(x=3\). **From II** (\(p>2\), so \(p \ne 2\)): \(y=0\) and hence \(x=5\). Each statement alone determines \(x\) — they simply describe different scenarios — so options 1 and 2 are both true; only option 1 is keyed. |
| 4 | 6 | **Both statements work alone, but the option set has no "either alone" — excluded** | "Which code word stands for 'good' in 'sin co bye' = 'He is good'?" **I.** 'co mot det' = 'They are good' — the only shared code word is *co* and the only shared meaning is *good*, so \(co = good\). **II.** 'sin mic bye' = 'He is honest' — *sin* and *bye* are shared, matching *He* and *is*, so again \(co = good\). Each statement alone settles it, so options 1 **and** 2 are both true; ICET offers no "each statement alone is sufficient" choice, and only option 2 is keyed. |

### `tg-icet-2025-06-08-s2` — TG ICET 2025, 8 June, Shift 2

**COMPLETE** — all 200 questions read: **192 imported, 8 excluded.**

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 147 | 119 | **Key contradicts the empirical formula — excluded** | "The mode of the distribution whose mean 25 and the median 24 is". The standard relation \(\text{Mode} = 3\,\text{Median} - 2\,\text{Mean}\) gives \(72 - 50 = 22\) — and 22 is not offered (options 26, 27, 28, 29; keyed 28). The sanity check agrees with 22: with mean > median the distribution is positively skewed, so the mode must be **below** the median, whereas every option is above it. |
| 145 | 118 | **Correct median is not among the options — excluded** | "8, 12, 11, 2, 4, 5, 10, 9, 10, 7, 8, 9" — twelve observations, so the median is the mean of the 6th and 7th of the sorted list 2, 4, 5, 7, 8, **8, 9**, 9, 10, 10, 11, 12, i.e. \(\frac{8+9}{2} = 8.5\). The options are 8, 11.5, 13.5, 14 — 8.5 is absent and the keyed 8 would be right only if one observation were dropped. Page re-rendered at 200 dpi to confirm the twelve values. |
| 119 | 98 | **No integer \(k\) satisfies the condition — excluded** | "If one root of \(x^2 - x + k = 0\) (\(k\) is an integer) is the square of the other, then \(k =\)". With roots \(\alpha, \alpha^2\): \(\alpha + \alpha^2 = 1\) and \(k = \alpha^3\). Cubing the first gives \(k^2 + 4k - 1 = 0 \Rightarrow k = -2 \pm \sqrt5\) — irrational, so the stem's "\(k\) is an integer" is unsatisfiable. Each option fails on inspection too: \(k=-1\) gives roots \(1.618, -0.618\) (neither is the other's square), \(k=-2\) gives 2 and \(-1\), and \(k = 1, 2\) give complex roots of equal modulus. The keyed \(-1\) is not derivable. Page re-rendered at 200 dpi to confirm the equation is \(x^2 - x + k\). |
| 92 | 75 | **Options lost their gain/loss labels — excluded** | "A wholesaler sells 50 articles at the marked price of 40 articles… Find the **gain or loss** percent of the retailer." The maths is clean (CP of 50 articles = 40 MP, SP = 50 MP, so a 25% gain), but the four options print as bare numbers **25, 30, 25, 30** — options 1 and 3 are the identical string and only option 1 is keyed. The intended set was evidently 25% gain / 30% gain / 25% loss / 30% loss; as printed, a student choosing option 3 has the right number and is marked wrong. Re-rendered at 200 dpi to confirm no label is present in either language. |
| 88 | 72 | **Correct order is not among the options — excluded** | "Ascending order of \(P = 2^{352}5^{411}3^{152}\), \(Q = 2^{352}5^{410}3^{153}\), \(R = 2^{350}5^{412}3^{419}\), \(S = 2^{353}5^{409}3^{150}\)". Taking logs, \(\log S \approx 463.7 < \log Q \approx 465.5 < \log P \approx 465.8 \lll \log R \approx 593.2\) — that \(3^{419}\) makes R larger than the others by a factor of about \(10^{127}\). The true order **S, Q, P, R** is not offered; the keyed S, R, Q, P would need R's exponent to be about \(3^{149}\). The page was re-rendered at 220 dpi to be sure of the digits, and both the English and Telugu copies print 419. |
| 75 | 62 | **Two identical options, only one keyed — excluded** | "If \(x \Delta y = xy + x - y\), then \(\sqrt{\dfrac{(3\Delta2)\Delta(3\Delta2)}{(2\Delta3)\Delta(2\Delta3)}} =\)". The arithmetic is clean — \(3\Delta2 = 7\), \(7\Delta7 = 49\), \(2\Delta3 = 5\), \(5\Delta5 = 25\), so the answer is \(\sqrt{49/25} = \frac75\). But **options 1 and 3 are both \(\frac75\)** and only option 1 is keyed, so a student who picks option 3 has answered correctly and is still marked wrong. |
| 58 | 48 | **Imported — but options 1 and 4 are the same string** | "JANITOR is coded as" prints **FEJQPSN** twice (options 1 and 4). Both duplicates are wrong and the keyed option 3 (FEJMPSN) is unique and correct, so no student is penalised for a right answer — unlike Q65 of `tg-icet-2025-06-09-s1`, where the duplicate *was* the correct string. Kept as printed; worth a glance if a repeated choice looks odd in the quiz UI. |
| 12 | 11 | **Statements contradict each other — excluded** | The same circle/semicircle data-sufficiency question as `ap-icet-2026-05-02-s1` Q2, with the same key (option 3). **I.** Area of \(\triangle POQ = 30 \Rightarrow \frac12 r^2 = 30 \Rightarrow\) circle area \(60\pi\). **II.** Arc \(QRO = 2.5\pi \Rightarrow \frac{\pi r}{2} = 2.5\pi \Rightarrow r = 5 \Rightarrow\) area \(25\pi\). Each statement alone settles the area, and they disagree — the data are inconsistent, so "both together, neither alone" is wrong either way. |
| 16 | 15 | **Data are physically impossible — excluded** | Cone of height 18 cm, half full; the water is poured into a cylinder. **I.** cylinder is 20 cm tall, radius 4 cm. **II.** the cone's base radius is half the water level \(h\) in the cylinder. Water volume \(= \frac12\cdot\frac13\pi R^2(18) = 3\pi R^2\), so \(h = \frac{3R^2}{16}\); with \(R = \frac h2\) this gives \(h = \frac{64}{3} \approx 21.3\) cm — **taller than the 20 cm vessel**, i.e. the water would overflow. The keyed option 3 is the answer to the algebra, but the three pieces of data cannot all hold at once. |

### `tg-icet-2025-06-09-s1` — TG ICET 2025, 9 June, Shift 1

**COMPLETE** — all 200 questions read: **189 imported, 11 excluded.**

| Q | Page | Issue | Detail |
| --- | --- | --- | --- |
| 170 | 124 | **Two options are both correct — excluded** | "The list of assets are ______ in the company's report" with *set out* (option 1) and *set forth* (option 3, keyed) both offered. Both phrasal verbs mean to present or state something in an organised way, and *set out* is if anything the more idiomatic choice for a document ("the report sets out the findings"). A student choosing option 1 answers correctly and is still marked wrong. |
| 134 | 101 | **Key contradicts the arithmetic — excluded** | "If \(A(2,3), B(5,k), C(3,4)\) form a triangle with the slope of AB being 2, what is the area of \(\triangle ABC\)?" Slope gives \(\frac{k-3}{3} = 2 \Rightarrow k = 9\), so \(B(5,9)\) and the area is \(\frac12\lvert 2(9-4) + 5(4-3) + 3(3-9)\rvert = \frac12\lvert 10+5-18\rvert = \frac32\) — option 4. The paper keys \(\frac92\), which would need \(k = 15\) (slope 4) or \(k = -3\). |
| 128 | 97 | **Figure-dependent, and my reconstruction contradicts the key — excluded** | "Three lines \(l_1, l_2, l_3\) are concurrent at O. Find \(k\)" — the angles \((3x+10)^\circ\), \(ky^\circ\), \(x^\circ\), \(y^\circ\), \(100^\circ\) are readable only from the small diagram. Reading the six angles round O in cyclic order gives the vertical pairs \(ky = x\) and \(y = 3x+10\), with \(x+y+100 = 180\) on the lower side; that yields \(x = 17.5, y = 62.5, k = \frac{7}{25}\) — not among the options (keyed \(\frac79\)). Either the diagram differs from my reading or the key is wrong; the figure cannot be transcribed faithfully into text either way. |
| 117 | 88 | **System is inconsistent — excluded** | "If \(\frac{12}{3x-y} + \frac{13}{2x+y} = 14\); \(\frac{18}{3x-y} + \frac{39}{2x+y} = 21\), then \(x-y=\)". Put \(u = \frac{1}{3x-y}, v = \frac{1}{2x+y}\): the equations become \(12u+13v=14\) and (dividing the second by 3) \(6u+13v=7\). Subtracting gives \(u = \frac76\), and back-substituting forces \(v = 0\) — impossible, since \(v\) is a reciprocal. No \((x,y)\) satisfies the printed system, so the keyed \(\frac{7}{10}\) cannot be derived. |
| 104 | 80 | **Correct answer not among the options — excluded** | "If a solid sphere of radius 10 cm is moulded into 8 spherical balls of equal radius, then the surface area of each ball is (in sq.cm.)". Volume is conserved: \(\frac43\pi(10)^3 = 8 \cdot \frac43\pi r^3 \Rightarrow r^3 = 125 \Rightarrow r = 5\), so each ball has surface area \(4\pi(5)^2 = 100\pi\). The options are \(500\pi, 250\pi, 510\pi, 75\pi\) — \(100\pi\) is absent, and the keyed \(510\pi\) matches nothing (not the total \(800\pi\) either). |
| 82 | 65 | **Stem and key disagree by one — excluded** | "Find the number of positive integers **less than 100** which are not relatively prime to 100." Among 1-99 there are \(\varphi(100)=40\) coprime to 100, so the answer is \(99-40=59\) — **not offered**. The keyed 60 counts the multiples of 2 or 5 in 1-**100** inclusive \((50+20-10)\), i.e. the stem should have said "not exceeding 100". A student who reads the stem as written gets a number that is not on the list. |
| 65 | 51 | **Two identical options — excluded** | "If CERTAIN is coded as NIATREC, then QUESTION is coded as". The rule is simple reversal, giving NOITSEUQ — but options **1 and 4 are the same string**, NOITSEUQ, and only option 4 is keyed. A student choosing option 1 has answered correctly and would still be marked wrong. |
| 52-55 | 40-43 | **Imported — Venn labels reconstructed** | The five-circle Venn diagram (English/Hindi/Telugu/Malayalam/Tamil, Spanish outside) is transcribed as a region table. The outer region values are read directly from the figure; the labels of the **inner** overlap regions were reconstructed, then checked against all four questions — the reconstruction reproduces every keyed answer (at-least-three 21%, exactly-two 41%, only-one 38%, non-Hindi 42%) and the regions total exactly 100%. Worth a glance at the original figure if you want certainty on which pair each inner region belongs to. |
| 36 | 27 | **Pattern not determinable — excluded** | "L, B, Z, T, P, F, ______" keyed to **Z**. Alphabet positions 12, 2, 26, 20, 16, 6 give steps of \(-10, -2, -6, -4, -10\) (mod 26) with no consistent rule, and splitting into alternate terms, pairing, or reading as complements all fail too. No honest worked solution can be written. |
| 27 | 21 | **Key contradicts the arithmetic — excluded** | \(2+\sqrt6 : 5\sqrt2+4\sqrt3 :: \underline{\quad} : 40\sqrt3+49\sqrt2\). The first pair multiplies by \((\sqrt2+\sqrt3)\): \((2+\sqrt6)(\sqrt2+\sqrt3) = 5\sqrt2+4\sqrt3\) ✓. Applying the same multiplier, the missing term is \((49\sqrt2+40\sqrt3)(\sqrt3-\sqrt2) = 22+9\sqrt6\) — option 1. Check forward: \((22+9\sqrt6)(\sqrt2+\sqrt3) = 49\sqrt2+40\sqrt3\) ✓, whereas the keyed \(20+9\sqrt6\) gives \(47\sqrt2+38\sqrt3\) ✗. The paper keys option 3. |
| 17 | 20 | **Key contradicts the deduction — excluded** | Six people round a table; "Are B and C adjacent?" **I.** E has C and F on either side (block C-E-F). **II.** B sits adjacent to F. Together, B can only take the seat on F's free side, giving the arc C-E-F-B, so the remaining two people sit between B and C — they are **not** adjacent. A definite "no" answers the question, so the correct choice is option 3; the paper keys option 4 (not answerable). |
| 26 | 20 | **Pattern not determinable — excluded** | "K7D : ______ :: Q12H : T19J" keyed to **N12F**. The letters follow \(+3\) and \(+2\) (K→N, D→F), but no consistent rule produces the middle numbers: the second pair steps \(12 \to 19\) \((+7)\) while the first would need \(7 \to 12\) \((+5)\), and neither matches any function of the flanking letters. Needs an expert eye, or drop it. |
