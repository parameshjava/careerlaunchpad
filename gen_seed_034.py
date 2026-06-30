"""
Generate supabase/migrations/034_degree_college_seed_01.sql from college_data.csv.

Why a generator: the CSV (scraper.py output) is the source of truth for the 1258
OAMDC degree colleges. The hand-edited 034 had dropped 13 rows, wiped the seeded
universities via a too-broad DELETE, and left ~117 colleges unlinked because their
affiliating university wasn't seeded. This rebuilds the migration cleanly:

  * widen college.ownership_type CHECK to the OAMDC categories (idempotent)
  * DELETE only OAMDC rows (college_code is not null) — never the universities
    (null code) or legacy 008 rows (null code)
  * seed ALL referenced universities idempotently (the 10 from 033 + 16 more),
    each a self-referential row (university_id = id) so it survives the delete
  * one INSERT for every college, resolving university_id by a LEFT JOIN on the
    canonical university name (null when unmatched)

Run:  python3 gen_seed_034.py
"""
import csv, re, os

ROOT = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(ROOT, "college_data.csv")
OUT = os.path.join(ROOT, "supabase/migrations/034_degree_college_seed_01.sql")

# CSV "Type of College" -> college.ownership_type enum value
TYPE_MAP = {
    "Private Un-Aided": "PRIVATE_UNAIDED",
    "Government": "GOVERNMENT",
    "Private Aided": "PRIVATE_AIDED",
    "University College": "UNIVERSITY_COLLEGE",
    "Private University": "PRIVATE_UNIVERSITY",
    "": None,
}

# CSV "University Name" (verbatim, stripped) -> canonical name in college table.
UNIV_CANON = {
    "ADIKAVI NANNAYA UNIVERSITY": "Adikavi Nannaya University",
    "ANDHRA UNIVERSITY": "Andhra University",
    "Andhra University": "Andhra University",
    "SRI VENKATESWARA UNIVERSITY": "Sri Venkateswara University",
    "Sri Venkateswara University": "Sri Venkateswara University",
    "ACHARYA NAGARJUNA UNIVERSITY": "Acharya Nagarjuna University",
    "Acharya Nagarjuna University": "Acharya Nagarjuna University",
    "KRISHNA UNIVERSITY": "Krishna University",
    "RAYALASEEMA UNIVERSITY": "Rayalaseema University",
    "DR BR AMBEDKAR UNIVERSITY": "Dr. B.R. Ambedkar University",
    "SRI KRISHNADEVARAYA UNIVERSITY": "Sri Krishnadevaraya University",
    "YOGI VEMANA UNIVERSITY": "Yogi Vemana University",
    "VIKRAMA SIMHAPURI UNIVERSITY": "Vikrama Simhapuri University",
    "ANDHRA KESARI UNIVERSITY": "Andhra Kesari University",
    "Andhra Kesari University": "Andhra Kesari University",
    "JNTUK": "Jawaharlal Nehru Technological University Kakinada",
    "JNTUA": "Jawaharlal Nehru Technological University Anantapur",
    "JNTUV": "Jawaharlal Nehru Technological University Gurajada Vizianagaram",
    "CLUSTER UNIVERSITY, KURNOOL": "Cluster University Kurnool",
    "SRI PADMAVATHI MAHILA VISWAVIDYALAYAM": "Sri Padmavathi Mahila Visvavidyalayam",
    "DRAVIDIAN UNIVERSITY KUPPAM": "Dravidian University",
    "Dr.Abdul Haq Urdu University Kurnool": "Dr. Abdul Haq Urdu University",
    "SRMUniversity AndhraPradesh": "SRM University Andhra Pradesh",
    "VITUniversity AndhraPradesh": "VIT-AP University",
    "BESTPU AndhraPradesh": "BEST Innovation University",
    "THE APOLLO UNIVERSITY": "The Apollo University",
    "Mohan Babu University": "Mohan Babu University",
    "GGU University": "Godavari Global University",
    "ANNAMACHARYA UNIVERSITY": "Annamacharya University",
    "ADITYA UNIVERISTY": "Aditya University",
}

# Every university referenced by a college, seeded idempotently here so links
# resolve and the set self-heals if a prior buggy DELETE removed them.
# The first 10 are copied verbatim from 033 (authoritative). The remaining 16
# carry best-effort place/district/pincode/year from public knowledge — only the
# name + ownership_type are authoritative for those (ponytail: good enough to
# link colleges; refine metadata later if it matters).
# name: (place, address, district, state, established_in, ownership_type)
UNIV_SEED = {
    "Andhra University": ("Visakhapatnam", "Andhra University, Visakhapatnam - 530003, Andhra Pradesh", "Visakhapatnam", "Andhra Pradesh", 1926, "GOVERNMENT", "530003"),
    "Adikavi Nannaya University": ("Rajamahendravaram", "Adikavi Nannaya University, Rajamahendravaram - 533296, Andhra Pradesh", "East Godavari", "Andhra Pradesh", 2006, "GOVERNMENT", "533296"),
    "Acharya Nagarjuna University": ("Guntur", "Nagarjuna Nagar, Guntur - 522510, Andhra Pradesh", "Guntur", "Andhra Pradesh", 1976, "GOVERNMENT", "522510"),
    "Krishna University": ("Machilipatnam", "Krishna University, Machilipatnam - 521004, Andhra Pradesh", "Krishna", "Andhra Pradesh", 2008, "GOVERNMENT", "521004"),
    "Sri Venkateswara University": ("Tirupati", "Sri Venkateswara University, Tirupati - 517502, Andhra Pradesh", "Tirupati", "Andhra Pradesh", 1954, "GOVERNMENT", "517502"),
    "Vikrama Simhapuri University": ("Nellore", "Vikrama Simhapuri University, Nellore - 524324, Andhra Pradesh", "SPSR Nellore", "Andhra Pradesh", 2008, "GOVERNMENT", "524324"),
    "Yogi Vemana University": ("Kadapa", "Yogi Vemana University, Kadapa - 516005, Andhra Pradesh", "YSR Kadapa", "Andhra Pradesh", 2006, "GOVERNMENT", "516005"),
    "Rayalaseema University": ("Kurnool", "Rayalaseema University, Kurnool - 518007, Andhra Pradesh", "Kurnool", "Andhra Pradesh", 2008, "GOVERNMENT", "518007"),
    "Sri Krishnadevaraya University": ("Anantapur", "Sri Krishnadevaraya University, Anantapur - 515003, Andhra Pradesh", "Anantapur", "Andhra Pradesh", 1981, "GOVERNMENT", "515003"),
    "Dr. B.R. Ambedkar University": ("Srikakulam", "Etcherla, Srikakulam - 532410, Andhra Pradesh", "Srikakulam", "Andhra Pradesh", 2008, "GOVERNMENT", "532410"),
    # --- not in 033: best-effort metadata ---
    "Andhra Kesari University": ("Ongole", None, "Prakasam", "Andhra Pradesh", 2022, "GOVERNMENT", None),
    "Jawaharlal Nehru Technological University Kakinada": ("Kakinada", None, "Kakinada", "Andhra Pradesh", 2008, "GOVERNMENT", "533003"),
    "Jawaharlal Nehru Technological University Anantapur": ("Anantapur", None, "Anantapur", "Andhra Pradesh", 2008, "GOVERNMENT", "515002"),
    "Jawaharlal Nehru Technological University Gurajada Vizianagaram": ("Vizianagaram", None, "Vizianagaram", "Andhra Pradesh", 2021, "GOVERNMENT", "535003"),
    "Cluster University Kurnool": ("Kurnool", None, "Kurnool", "Andhra Pradesh", 2020, "GOVERNMENT", None),
    "Sri Padmavathi Mahila Visvavidyalayam": ("Tirupati", None, "Tirupati", "Andhra Pradesh", 1983, "GOVERNMENT", "517502"),
    "Dravidian University": ("Kuppam", None, "Chittoor", "Andhra Pradesh", 1997, "GOVERNMENT", "517426"),
    "Dr. Abdul Haq Urdu University": ("Kurnool", None, "Kurnool", "Andhra Pradesh", 2016, "GOVERNMENT", None),
    "SRM University Andhra Pradesh": ("Amaravati", None, "Guntur", "Andhra Pradesh", 2017, "PRIVATE_UNIVERSITY", "522502"),
    "VIT-AP University": ("Amaravati", None, "Guntur", "Andhra Pradesh", 2017, "PRIVATE_UNIVERSITY", "522237"),
    "BEST Innovation University": ("Gorantla", None, "Sri Sathya Sai", "Andhra Pradesh", 2022, "PRIVATE_UNIVERSITY", None),
    "The Apollo University": ("Chittoor", None, "Chittoor", "Andhra Pradesh", 2022, "PRIVATE_UNIVERSITY", "517127"),
    "Mohan Babu University": ("Tirupati", None, "Tirupati", "Andhra Pradesh", 2022, "PRIVATE_UNIVERSITY", "517102"),
    "Godavari Global University": ("Rajamahendravaram", None, "East Godavari", "Andhra Pradesh", 2024, "PRIVATE_UNIVERSITY", "533296"),
    "Annamacharya University": ("Rajampet", None, "Annamayya", "Andhra Pradesh", 2023, "PRIVATE_UNIVERSITY", "516126"),
    "Aditya University": ("Surampalem", None, "Kakinada", "Andhra Pradesh", 2024, "PRIVATE_UNIVERSITY", "533437"),
}


def q(v):
    """SQL literal: NULL for None/empty, single-quoted (escaped) otherwise."""
    if v is None:
        return "null"
    s = str(v).strip()
    return "null" if s == "" else "'" + s.replace("'", "''") + "'"


def clean_name(n):
    n = re.sub(r"\s+", " ", (n or "")).strip()
    n = re.sub(r"\s+swrn\s+a2$", "", n, flags=re.I)         # scrape junk
    n = re.sub(r"\s+college code\s*\d+$", "", n, flags=re.I)  # scrape junk
    n = re.sub(r"\s+\d{3}\s+\d{3}$", "", n)                  # trailing "091 304"
    return n.strip()


def pincode(addr):
    runs = re.findall(r"\d{6}", addr or "")
    return runs[-1] if runs else None


def year(y):
    y = (y or "").strip()
    return int(y) if re.fullmatch(r"(19|20)\d{2}", y) else None


def main():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8-sig")))
    unmapped = sorted({r["University Name"].strip() for r in rows
                       if r["University Name"].strip() and r["University Name"].strip() not in UNIV_CANON})
    assert not unmapped, f"University names with no canonical mapping: {unmapped}"

    out = []
    w = out.append
    w("-- ============================================================================")
    w("-- 034_degree_college_seed_01.sql  -  AP degree colleges (OAMDC / APSCHE)")
    w("-- GENERATED by gen_seed_034.py from college_data.csv (scraper.py output).")
    w(f"-- {len(rows)} colleges + {len(UNIV_SEED)} affiliating universities.")
    w("--")
    w("-- Idempotent + re-runnable: widens the ownership_type CHECK, clears prior")
    w("-- OAMDC rows (college_code is not null) WITHOUT touching universities or the")
    w("-- legacy 008 rows (both null code), re-seeds every referenced university as a")
    w("-- self-referential row (university_id = id), then inserts each college with")
    w("-- university_id resolved by name. Universities not in the 033 seed carry")
    w("-- best-effort place/district/year; only name + ownership_type are authoritative.")
    w("-- ============================================================================")
    w("")
    w("alter table public.college drop constraint if exists college_ownership_type_check;")
    w("alter table public.college add constraint college_ownership_type_check")
    w("  check (ownership_type in (")
    w("    'GOVERNMENT', 'PRIVATE',            -- legacy values (008_*)")
    w("    'PRIVATE_UNAIDED', 'PRIVATE_AIDED', 'PRIVATE_UNIVERSITY', 'UNIVERSITY_COLLEGE'")
    w("  ));")
    w("")
    w("-- Clear only OAMDC-coded colleges (re-runnable); universities + 008 rows have")
    w("-- a null college_code and are left untouched.")
    w("delete from public.college where college_code is not null;")
    w("")
    w("-- Seed/repair affiliating universities (self-referential rows). where-not-exists")
    w("-- keeps it idempotent; the update self-associates any not yet pointing at itself.")
    for name, (place, addr, dist, state, est, own, pin) in UNIV_SEED.items():
        w(f"insert into public.college (name, place, address, district, state, pincode, established_in, ownership_type)")
        w(f"select {q(name)}, {q(place)}, {q(addr)}, {q(dist)}, {q(state)}, {q(pin)}, {est if est else 'null'}, {q(own)}")
        w(f"where not exists (select 1 from public.college where name = {q(name)} and place is not distinct from {q(place)});")
    w("update public.college set university_id = id")
    names = ", ".join(q(n) for n in UNIV_SEED)
    w(f"  where name in ({names}) and university_id is distinct from id;")
    w("")
    w("-- Colleges. university_id resolves via LEFT JOIN on the canonical university")
    w("-- name (null when the college's university isn't one we seed).")
    w("insert into public.college")
    w("  (college_code, name, place, address, district, state, pincode, established_in, ownership_type, university_id)")
    w("select v.code, v.name, v.place, v.address, v.district, v.state, v.pincode,")
    w("       v.established_in, v.ownership_type, u.id")
    w("from (values")
    vals = []
    for r in rows:
        code = r["Institute Code"].strip()
        name = clean_name(r["Institute Name"])
        place = r["Place"].strip()
        addr = r["Address"].strip()
        dist = r["District"].strip()
        est = year(r["Year of EST"])
        own = TYPE_MAP.get(r["Type of College"].strip(), None)
        pin = pincode(addr)
        canon = UNIV_CANON.get(r["University Name"].strip())
        est_sql = str(est) if est is not None else "null"
        vals.append(
            f"  ({q(code)}, {q(name)}, {q(place)}, {q(addr)}, {q(dist)}, "
            f"'Andhra Pradesh', {q(pin)}, {est_sql}, {q(own)}, {q(canon)})"
        )
    w(",\n".join(vals))
    w(") as v(code, name, place, address, district, state, pincode, established_in, ownership_type, univ_name)")
    w("left join public.college u on u.name = v.univ_name and u.university_id = u.id")
    w("on conflict do nothing;")
    w("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print(f"Wrote {OUT}")
    print(f"  colleges: {len(rows)}  universities: {len(UNIV_SEED)}")
    linked = sum(1 for r in rows if UNIV_CANON.get(r['University Name'].strip()))
    print(f"  colleges with a resolvable university: {linked} / {len(rows)}")


if __name__ == "__main__":
    main()
