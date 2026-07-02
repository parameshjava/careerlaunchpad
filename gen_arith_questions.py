"""
Generate an Arithmetic question seed (batch 1: chapters 1-10) for the exam bank.

Correctness first: every numeric answer is COMPUTED here in Python, so the answer
key can't drift. Stems are in the style of ICET / TCS-Infosys / bank-PO aptitude
papers. Distractors are common-mistake values (wrong op, off-by, etc.). The
correct option's position is rotated so it isn't always "A".

Emits SQL that reuses the _seed_arith_q(chapter, difficulty, stem, opts[], correct)
helper (idempotent — skips a stem already present). Run: python3 gen_arith_questions.py
"""
import os, math
from fractions import Fraction

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "supabase/migrations/041_arith_questions_batch1.sql")

_lines = []
_ctr = 0

def esc(s: str) -> str:
    return str(s).replace("'", "''")

def _emit(chapter, level, stem, options, correct1):
    opts = "array[" + ", ".join("'" + esc(o) + "'" for o in options) + "]"
    _lines.append(f"select public._seed_arith_q('{esc(chapter)}', '{level}', '{esc(stem)}', {opts}, {correct1});")

def mcq(chapter, level, stem, correct, distractors):
    """Build a 4-option MCQ: correct + 3 distinct distractors, correct at a
    rotating position. All compared as strings so formatting stays stable."""
    global _ctr
    c = str(correct)
    ds = []
    for d in distractors:
        s = str(d)
        if s != c and s not in ds:
            ds.append(s)
        if len(ds) == 3:
            break
    # pad if a template gave too few distinct distractors — keep the format of
    # the correct answer (ints stay ints, not "7.0").
    pad = 1
    while len(ds) < 3:
        try:
            n = float(correct)
            cand = int(n) + pad if abs(n - round(n)) < 1e-9 else round(n + pad, 2)
            s = plain(cand)
        except (ValueError, TypeError):
            s = f"{correct} ({pad})"
        if s != c and s not in ds:
            ds.append(s)
        pad += 1
    pos = _ctr % 4
    _ctr += 1
    opts = ds[:3]
    opts.insert(pos, c)
    _emit(chapter, level, stem, opts, pos + 1)

def _num(x):
    try:
        return float(x)
    except Exception:
        return 0.0

def money(n):
    """Rupee formatting: no trailing .0 for whole rupees."""
    if abs(n - round(n)) < 1e-9:
        return f"Rs. {int(round(n))}"
    return f"Rs. {n:.2f}"

def plain(n):
    if isinstance(n, float) and abs(n - round(n)) < 1e-9:
        return str(int(round(n)))
    return str(n)

# ===========================================================================
# 1. Number System
# ===========================================================================
def number_system():
    ch = "Number System"
    # easy: unit digit / divisibility basics
    for a, p in [(2, 10), (3, 4), (7, 4), (4, 5), (9, 3), (8, 4), (6, 7), (2, 20)]:
        u = pow(a, p, 10)
        mcq(ch, "easy", f"What is the unit digit of {a}^{p}?", u, [(u + 1) % 10, (u + 2) % 10, (u + 5) % 10])
    # medium: divisibility & remainders
    for n, d in [(1234, 9), (2564, 11), (7896, 8), (5040, 7), (8642, 6), (99999, 9), (123456, 8), (45678, 11)]:
        r = n % d
        mcq(ch, "medium", f"The remainder when {n} is divided by {d} is", r, [(r + 1) % d, (r + 2) % d, (r + 3) % d if d > 3 else d - 1])
    # hard: largest number dividing / place value style
    for a, b in [(546, 764), (1305, 4665), (391, 425), (1517, 902), (1651, 2032), (12288, 19056), (2604, 1020), (4599, 5083)]:
        g = math.gcd(a, b)
        mcq(ch, "hard", f"The greatest number that divides both {a} and {b} exactly is", g, [g * 2, g + 1, g - 1 if g > 1 else g + 2])
    # very_hard: unit digit of large power sums / factorial trailing zeros
    for n in [10, 15, 20, 25, 30, 50, 100, 125]:
        z = 0
        p = 5
        while p <= n:
            z += n // p
            p *= 5
        mcq(ch, "very_hard", f"The number of trailing zeros in {n}! is", z, [z + 1, z - 1 if z > 0 else z + 2, z + 2])

# ===========================================================================
# 2. H.C.F. and L.C.M. of Numbers
# ===========================================================================
def hcf_lcm():
    ch = "H.C.F. and L.C.M. of Numbers"
    for a, b in [(12, 18), (24, 36), (15, 20), (8, 12), (9, 27), (14, 21), (16, 24), (10, 25)]:
        g = math.gcd(a, b)
        mcq(ch, "easy", f"The H.C.F. of {a} and {b} is", g, [g * 2, a, b])
    for a, b in [(12, 18), (24, 36), (15, 20), (8, 12), (9, 27), (14, 21), (16, 40), (21, 35)]:
        l = a * b // math.gcd(a, b)
        mcq(ch, "medium", f"The L.C.M. of {a} and {b} is", l, [l // 2, a * b, l + a])
    # hard: product relation / three numbers
    for a, b, c in [(6, 8, 12), (10, 15, 20), (9, 12, 18), (14, 21, 28), (8, 10, 12), (4, 6, 9), (15, 25, 35), (12, 16, 24)]:
        l = a * b // math.gcd(a, b)
        l = l * c // math.gcd(l, c)
        mcq(ch, "hard", f"The L.C.M. of {a}, {b} and {c} is", l, [l // 2, a * b * c, l + c])
    # very_hard: word problem — greatest length / bells
    for x, y, z in [(2, 4, 6), (3, 5, 7), (4, 6, 8), (6, 8, 12), (5, 10, 15), (9, 12, 15), (8, 12, 16), (10, 12, 15)]:
        l = x * y // math.gcd(x, y)
        l = l * z // math.gcd(l, z)
        mcq(ch, "very_hard",
            f"Three bells toll at intervals of {x}, {y} and {z} seconds. If they toll together now, after how many seconds will they next toll together?",
            l, [l // 2, x * y * z, l + z])

# ===========================================================================
# 3. Decimal Fractions
# ===========================================================================
def decimals():
    ch = "Decimal Fractions"
    for a, b in [(0.5, 0.2), (0.25, 0.4), (1.5, 0.5), (0.75, 0.25), (2.5, 0.5), (0.6, 0.3), (1.2, 0.4), (0.8, 0.2)]:
        s = round(a + b, 4)
        mcq(ch, "easy", f"{a} + {b} = ?", plain(s), [plain(round(a - b, 4)), plain(round(a * b, 4)), plain(round(s + 0.1, 4))])
    for a, b in [(0.6, 0.2), (1.2, 0.3), (0.9, 0.3), (2.4, 0.6), (0.15, 0.5), (0.36, 0.6), (1.44, 1.2), (0.81, 0.9)]:
        p = round(a * b, 4)
        mcq(ch, "medium", f"{a} × {b} = ?", plain(p), [plain(round(a + b, 4)), plain(round(a / b, 4)), plain(round(p * 10, 4))])
    for a, b in [(6.4, 0.8), (2.5, 0.5), (9.9, 1.1), (7.2, 0.9), (4.5, 1.5), (8.1, 0.9), (12.5, 2.5), (3.6, 1.2)]:
        d = round(a / b, 4)
        mcq(ch, "hard", f"{a} ÷ {b} = ?", plain(d), [plain(round(a * b, 4)), plain(round(a - b, 4)), plain(round(d + 1, 4))])
    # very_hard: recurring / simplify expression
    for a, b, c in [(0.2, 0.3, 0.5), (1.1, 0.5, 0.2), (0.4, 0.25, 0.1), (2.5, 0.5, 1.5), (0.6, 0.2, 0.3), (1.2, 0.4, 0.8), (0.9, 0.3, 0.1), (3.3, 1.1, 0.5)]:
        v = round(a * b + c, 4)
        mcq(ch, "very_hard", f"Evaluate: {a} × {b} + {c}", plain(v), [plain(round((a + b) * c, 4)), plain(round(a * (b + c), 4)), plain(round(v + 0.5, 4))])

# ===========================================================================
# 4. Simplification (BODMAS)
# ===========================================================================
def simplification():
    ch = "Simplification"
    for a, b, c in [(2, 3, 4), (5, 2, 3), (6, 1, 2), (8, 4, 2), (7, 2, 5), (9, 3, 1), (4, 5, 6), (10, 2, 3)]:
        v = a + b * c
        mcq(ch, "easy", f"{a} + {b} × {c} = ?", v, [(a + b) * c, a * b + c, v + 1])
    for a, b, c, d in [(12, 4, 2, 3), (20, 5, 2, 1), (18, 3, 3, 2), (24, 6, 2, 4), (30, 5, 3, 2), (16, 4, 2, 5), (36, 9, 2, 1), (40, 8, 3, 2)]:
        v = a // b + c * d
        mcq(ch, "medium", f"{a} ÷ {b} + {c} × {d} = ?", v, [a // (b + c) * d, (a // b + c) * d, v + 2])
    for a, b, c in [(3, 4, 5), (6, 2, 8), (5, 5, 5), (7, 3, 2), (9, 1, 10), (4, 6, 2), (8, 8, 1), (2, 9, 4)]:
        v = a * a + b * c
        mcq(ch, "hard", f"{a}² + {b} × {c} = ?", v, [(a + b) * c, a * a * b + c, v + a])
    for a, b, c, d in [(2, 3, 4, 5), (6, 2, 3, 1), (4, 4, 2, 2), (5, 1, 6, 3), (3, 5, 2, 4), (8, 2, 1, 3), (7, 2, 2, 2), (9, 3, 1, 2)]:
        v = (a + b) * (c - d) if c != d else a * b + c
        v = (a + b) * c - d
        mcq(ch, "very_hard", f"({a} + {b}) × {c} − {d} = ?", v, [a + b * c - d, (a + b) * (c - d), v + c])

# ===========================================================================
# 5. Square Roots and Cube Roots
# ===========================================================================
def roots():
    ch = "Square Roots and Cube Roots"
    for n in [16, 25, 49, 81, 121, 144, 169, 225]:
        r = int(math.isqrt(n))
        mcq(ch, "easy", f"√{n} = ?", r, [r + 1, r - 1, r + 2])
    for n in [8, 27, 64, 125, 216, 343, 512, 729]:
        r = round(n ** (1/3))
        mcq(ch, "medium", f"The cube root of {n} is", r, [r + 1, r - 1, n // 4])
    for r in [12, 15, 18, 21, 24, 32, 45, 55]:
        n = r * r
        mcq(ch, "hard", f"√{n} = ?", r, [r + 2, r - 2, r + 5])
    for a, b in [(4, 9), (16, 25), (36, 49), (64, 81), (100, 121), (9, 16), (25, 36), (49, 64)]:
        v = int(math.isqrt(a)) + int(math.isqrt(b))
        mcq(ch, "very_hard", f"√{a} + √{b} = ?", v, [int(math.isqrt(a + b)), v + 1, abs(int(math.isqrt(b)) - int(math.isqrt(a)))])

# ===========================================================================
# 6. Average
# ===========================================================================
def average():
    ch = "Average"
    sets = [[10, 20, 30], [4, 8, 12, 16], [5, 15, 25], [2, 4, 6, 8, 10], [100, 200, 300],
            [7, 14, 21], [3, 6, 9, 12], [50, 60, 70, 80]]
    for s in sets:
        a = sum(s) / len(s)
        mcq(ch, "easy", f"The average of {', '.join(map(str, s))} is", plain(round(a, 2)), [plain(sum(s)), plain(round(a + 1, 2)), plain(round(a - 1, 2))])
    for n, a in [(5, 20), (10, 15), (8, 25), (6, 30), (12, 10), (4, 45), (7, 14), (9, 22)]:
        tot = n * a
        mcq(ch, "medium", f"The average of {n} numbers is {a}. Their sum is", tot, [tot + n, a // n if n else a, tot - a])
    for n, a, x in [(5, 20, 32), (4, 15, 25), (6, 10, 24), (10, 30, 41), (3, 12, 20), (8, 18, 36), (5, 40, 58), (7, 21, 35)]:
        # new average when one more number x is added
        new = (n * a + x) / (n + 1)
        mcq(ch, "hard", f"The average of {n} numbers is {a}. If {x} is included, the new average is", plain(round(new, 2)),
            [plain(round(a + 1, 2)), plain(round((n * a + x) / n, 2)), plain(round(new + 1, 2))])
    for n, a, wrong, right in [(10, 25, 36, 63), (8, 20, 25, 52), (5, 30, 40, 70), (12, 15, 20, 50), (6, 18, 10, 40), (9, 22, 30, 60), (7, 16, 12, 40), (4, 45, 50, 80)]:
        # avg corrected after a misread value replaced
        new = (n * a - wrong + right) / n
        mcq(ch, "very_hard",
            f"The average of {n} numbers is {a}. Later one number {wrong} was found to be actually {right}. The correct average is",
            plain(round(new, 2)), [plain(a), plain(round(new + 1, 2)), plain(round(new - 1, 2))])

# ===========================================================================
# 7. Problems on Numbers
# ===========================================================================
def problems_numbers():
    ch = "Problems on Numbers"
    for s, d in [(20, 4), (30, 6), (50, 10), (16, 2), (24, 8), (40, 4), (18, 6), (60, 20)]:
        x = (s + d) // 2  # larger
        mcq(ch, "easy", f"The sum of two numbers is {s} and their difference is {d}. The larger number is", x, [s - x, s // 2, x + d])
    for s, d in [(20, 4), (30, 6), (50, 10), (16, 2), (24, 8), (40, 4), (18, 6), (60, 20)]:
        y = (s - d) // 2  # smaller
        mcq(ch, "medium", f"The sum of two numbers is {s} and their difference is {d}. The smaller number is", y, [s - y, s // 2, y + d])
    for total, more in [(45, 3), (60, 8), (100, 10), (75, 5), (50, 6), (84, 4), (90, 12), (36, 2)]:
        # x + (x+more) = total
        x = (total - more) // 2
        mcq(ch, "hard", f"Two numbers differ by {more} and add up to {total}. The two numbers are",
            f"{x} and {x + more}", [f"{x+1} and {x+more-1}", f"{x} and {total-x-1}", f"{x-1} and {x+more+1}"])
    for a, b in [(3, 27), (4, 48), (5, 75), (2, 18), (6, 96), (3, 48), (5, 45), (4, 64)]:
        # one number is a times the other and product = b -> other = sqrt(b/a)
        other = int(round((b / a) ** 0.5)) if (b / a) ** 0.5 == int((b / a) ** 0.5) else None
        # ensure integer by construction: pick product = a * k^2
        k = int(round((b / a) ** 0.5))
        prod = a * k * k
        mcq(ch, "very_hard",
            f"One number is {a} times another and their product is {prod}. The smaller number is",
            k, [k + 1, a * k, k - 1 if k > 1 else k + 2])

# ===========================================================================
# 8. Problems on Ages
# ===========================================================================
def ages():
    ch = "Problems on Ages"
    for age, yrs in [(20, 5), (30, 10), (15, 3), (40, 8), (25, 7), (12, 4), (50, 15), (18, 6)]:
        mcq(ch, "easy", f"A person is {age} years old now. His age {yrs} years ago was", age - yrs, [age + yrs, age, age - yrs + 2])
    for age, yrs in [(20, 5), (30, 10), (15, 3), (40, 8), (25, 7), (12, 4), (50, 15), (18, 6)]:
        mcq(ch, "medium", f"A person is {age} years old now. His age {yrs} years hence will be", age + yrs, [age - yrs, age, age + yrs - 2])
    # hard: father-son ratio now
    for f, s in [(40, 10), (36, 12), (45, 15), (50, 20), (30, 6), (48, 16), (35, 7), (42, 14)]:
        ratio = f // math.gcd(f, s)
        rs = s // math.gcd(f, s)
        mcq(ch, "hard", f"A father is {f} and his son is {s}. The ratio of their ages is",
            f"{ratio}:{rs}", [f"{rs}:{ratio}", f"{ratio+1}:{rs}", f"{f}:{s}"])
    # very_hard: sum & ratio -> ages
    for total, r1, r2 in [(45, 4, 5), (60, 2, 3), (35, 3, 4), (72, 5, 7), (50, 2, 3), (28, 3, 4), (66, 5, 6), (40, 3, 5)]:
        part = total / (r1 + r2)
        a1, a2 = round(part * r1), round(part * r2)
        mcq(ch, "very_hard",
            f"The ages of two persons are in the ratio {r1}:{r2} and their sum is {total} years. Their ages are",
            f"{a1} and {a2}", [f"{a2} and {a1+2}", f"{a1+1} and {a2-1}", f"{r1} and {r2}"])

# ===========================================================================
# 9. Surds and Indices
# ===========================================================================
def surds_indices():
    ch = "Surds and Indices"
    for a, p, qx in [(2, 3, 2), (3, 2, 3), (5, 2, 1), (2, 4, 1), (10, 2, 1), (4, 2, 2), (2, 5, 2), (3, 3, 2)]:
        v = a ** (p + qx)
        mcq(ch, "easy", f"{a}^{p} × {a}^{qx} = ?", f"{a}^{p+qx} = {v}", [f"{a}^{p*qx} = {a**(p*qx)}", f"{a}^{p+qx+1} = {a**(p+qx+1)}", f"{2*a}^{p+qx}"])
    for a, p, qx in [(2, 5, 2), (3, 4, 2), (10, 3, 1), (5, 3, 1), (2, 6, 3), (4, 3, 1), (7, 2, 1), (3, 5, 3)]:
        v = a ** (p - qx)
        mcq(ch, "medium", f"{a}^{p} ÷ {a}^{qx} = ?", f"{a}^{p-qx} = {v}", [f"{a}^{p//qx if qx else p}", f"{a}^{p-qx+1} = {a**(p-qx+1)}", f"{v+1}"])
    for a, p, qx in [(2, 3, 2), (3, 2, 2), (2, 2, 3), (5, 2, 2), (10, 2, 2), (2, 4, 2), (3, 3, 2), (4, 2, 2)]:
        v = a ** (p * qx)
        mcq(ch, "hard", f"({a}^{p})^{qx} = ?", f"{a}^{p*qx} = {v}", [f"{a}^{p+qx} = {a**(p+qx)}", f"{v//a}", f"{v+a}"])
    for a in [2, 3, 5, 7, 4, 6, 8, 10]:
        # a^0 + a^1
        v = 1 + a
        mcq(ch, "very_hard", f"{a}^0 + {a}^1 = ?", v, [a, a * a, v + 1])

# ===========================================================================
# 10. Logarithms
# ===========================================================================
def logarithms():
    ch = "Logarithms"
    for b, n in [(2, 8), (3, 9), (10, 1000), (5, 25), (2, 16), (4, 16), (10, 100), (3, 27)]:
        v = round(math.log(n, b))
        mcq(ch, "easy", f"log base {b} of {n} = ?", v, [v + 1, v - 1, b])
    for b in [2, 3, 5, 10, 7, 4, 6, 8]:
        mcq(ch, "medium", f"log base {b} of 1 = ?", 0, [1, b, -1])
    for b in [2, 3, 5, 10, 7, 4, 6, 8]:
        mcq(ch, "hard", f"log base {b} of {b} = ?", 1, [0, b, -1])
    # very_hard: log a + log b = log(ab), base 10 simple
    for a, b in [(2, 5), (4, 25), (20, 5), (2, 50), (25, 4), (8, 125), (10, 10), (50, 2)]:
        prod = a * b
        v = round(math.log10(prod))
        mcq(ch, "very_hard", f"log 10 of {a} + log 10 of {b} = ? (i.e. log₁₀({prod}))", v, [v + 1, v - 1, a + b])

CHAPTERS = [number_system, hcf_lcm, decimals, simplification, roots,
            average, problems_numbers, ages, surds_indices, logarithms]

def main():
    for fn in CHAPTERS:
        fn()
    header = [
        "-- ============================================================================",
        "-- 041_arith_questions_batch1.sql",
        "-- Arithmetic question bank — BATCH 1 (chapters 1-10: Number System … Logarithms).",
        "-- GENERATED by gen_arith_questions.py. Every numeric answer is computed, not",
        "-- transcribed. 8 questions per (chapter × difficulty). Idempotent (the helper",
        "-- skips a stem already present). Depends on 023 (subject + chapters).",
        "-- ============================================================================",
        "create or replace function public._seed_arith_q(",
        "  p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int",
        ") returns void language plpgsql as $$",
        "declare v_subj uuid; v_chap uuid; v_qid uuid; i int;",
        "begin",
        "  select id into v_subj from public.subject where lower(name) = 'arithmetic' limit 1;",
        "  if v_subj is null then raise exception 'Arithmetic subject not found (run 023 first)'; end if;",
        "  select id into v_chap from public.chapter",
        "    where subject_id = v_subj and lower(name) = lower(p_chapter) limit 1;",
        "  if v_chap is null then raise exception 'Chapter % not found', p_chapter; end if;",
        "  if exists (select 1 from public.question where chapter_id = v_chap and stem = p_stem) then return; end if;",
        "  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem)",
        "  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem) returning id into v_qid;",
        "  for i in 1 .. array_length(p_opts, 1) loop",
        "    insert into public.question_option (question_id, label, is_correct, position)",
        "    values (v_qid, p_opts[i], i = p_correct, i - 1);",
        "  end loop;",
        "end;",
        "$$;",
        "",
    ]
    footer = ["", "drop function public._seed_arith_q(text, text, text, text[], int);", ""]
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(header) + "\n".join(_lines) + "\n" + "\n".join(footer))
    print(f"Wrote {OUT}")
    print(f"  questions: {len(_lines)}")

if __name__ == "__main__":
    main()
