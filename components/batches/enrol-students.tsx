"use client";

// Full-page enrol screen (issue #49, Phase 4): search registered students by
// name/roll/registration, filter by college and year, multi-select into a
// basket, set a per-student concession + payment option, and bulk-enrol. Scales
// to thousands (server-side search). Talks to /api/admin/students/search,
// /api/colleges/search, and POST /api/admin/batches/[id]/enrollments.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Search, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rupeesToPaise } from "@/lib/course-query";
import { CONCESSION_LABEL, formatINR, type ConcessionType } from "@/lib/fee-receipt";
import type { BatchFee, EnrollableStudent } from "@/lib/enrollment-query";

const CONCESSION_TYPES: ConcessionType[] = ["none", "discount", "scholarship", "full_waiver"];

type BasketRow = {
  student: EnrollableStudent;
  concessionType: ConcessionType;
  concessionAmount: string;
  concessionReason: string;
  paymentOption: "full" | "installments";
  installmentCount: string;
};

export function EnrolStudents({
  batchId,
  batch,
  enrolledIds,
  embedded = false,
  onDone,
  onClose,
}: {
  batchId: string;
  batch: BatchFee;
  enrolledIds: string[];
  /** Rendered inside the Students-tab drawer: drop the page header/back link and
   * finish via onDone (close the drawer + refresh the roster) instead of the
   * "Back to roster" link. */
  embedded?: boolean;
  /** After a successful enrol — close the drawer and refresh the roster. */
  onDone?: () => void;
  /** Cancel/dismiss — close the drawer without refetching. */
  onClose?: () => void;
}) {
  const router = useRouter();
  const gross = batch.grossPaise;
  const enrolled = useMemo(() => new Set(enrolledIds), [enrolledIds]);

  // search + filters
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [college, setCollege] = useState<{ id: string; name: string } | null>(null);
  const [collegeQuery, setCollegeQuery] = useState("");
  const [collegeResults, setCollegeResults] = useState<{ id: string; name: string }[]>([]);
  const [results, setResults] = useState<EnrollableStudent[]>([]);
  const [searching, setSearching] = useState(false);

  // basket + submit
  const [basket, setBasket] = useState<BasketRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ enrolled: number; skipped: { studentId: string; reason: string }[] } | null>(null);

  // student search (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (college) params.set("collegeId", college.id);
        if (year.trim()) params.set("year", year.trim());
        const res = await fetch(`/api/admin/students/search?${params.toString()}`);
        const json = await res.json();
        setResults(json.students ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, college, year]);

  // college filter typeahead
  async function searchColleges(v: string) {
    setCollegeQuery(v);
    if (v.trim().length < 2) return setCollegeResults([]);
    try {
      const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(v.trim())}`);
      const json = await res.json();
      setCollegeResults(((json.results ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name })));
    } catch {
      setCollegeResults([]);
    }
  }

  const inBasket = (id: string) => basket.some((b) => b.student.userId === id);
  const toggleStudent = (s: EnrollableStudent) =>
    setBasket((prev) =>
      prev.some((b) => b.student.userId === s.userId)
        ? prev.filter((b) => b.student.userId !== s.userId)
        : [
            ...prev,
            {
              student: s,
              concessionType: "none",
              concessionAmount: "",
              concessionReason: "",
              paymentOption: "full",
              installmentCount: "2",
            },
          ]
    );
  const removeRow = (id: string) => setBasket((prev) => prev.filter((b) => b.student.userId !== id));
  const patchRow = (id: string, patch: Partial<BasketRow>) =>
    setBasket((prev) => prev.map((b) => (b.student.userId === id ? { ...b, ...patch } : b)));

  const rowConcessionPaise = (b: BasketRow) => {
    if (b.concessionType === "none") return 0;
    if (b.concessionType === "full_waiver") return gross;
    const p = rupeesToPaise(b.concessionAmount);
    return Number.isFinite(p) ? p : 0;
  };
  const rowNet = (b: BasketRow) => Math.max(0, gross - rowConcessionPaise(b));
  const total = basket.reduce((s, b) => s + rowNet(b), 0);

  async function submit() {
    setError("");
    if (basket.length === 0) return setError("Select at least one student.");
    setSubmitting(true);
    try {
      const enrollments = basket.map((b) => ({
        studentId: b.student.userId,
        collegeId: b.student.collegeId,
        concessionType: b.concessionType,
        concessionPaise: rowConcessionPaise(b),
        concessionReason: b.concessionReason.trim() || null,
        paymentOption: b.paymentOption,
        installmentCount: b.paymentOption === "installments" ? Number(b.installmentCount) || 0 : 0,
      }));
      const res = await fetch(`/api/admin/batches/${batchId}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollments }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not enrol");
      setSummary({ enrolled: json.enrolled ?? 0, skipped: json.skipped ?? [] });
      setBasket([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const backHref = `/dashboard/batches/${batchId}#students`;

  if (summary) {
    const skippedNames = summary.skipped.map((s) => {
      const b = basket.find((x) => x.student.userId === s.studentId);
      return `${b?.student.name ?? s.studentId} (${s.reason})`;
    });
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-full">
          <Check className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Enrolled {summary.enrolled} student{summary.enrolled === 1 ? "" : "s"}</h1>
        {summary.skipped.length > 0 && (
          <div className="text-muted-foreground mt-3 text-sm">
            Skipped {summary.skipped.length}: {skippedNames.join(", ")}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-2">
          {embedded ? (
            <Button onClick={() => onDone?.()}>Done</Button>
          ) : (
            <Button asChild>
              <Link href={backHref}>Back to roster</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => setSummary(null)}>
            Enrol more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? undefined : "mx-auto max-w-6xl"}>
      {!embedded && (
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Enrol students</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {batch.name} · fee {formatINR(gross)} / student — search, select, set concessions, enrol.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={backHref}>
              <ArrowLeft /> Back
            </Link>
          </Button>
        </header>
      )}

      <div className={embedded ? "grid gap-6" : "grid gap-6 lg:grid-cols-[1fr_1.1fr]"}>
        {/* Find students */}
        <section className="grid content-start gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Find students</h2>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-2.5 size-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, roll no. or registration no.…" className="pl-8" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Input
                value={college ? college.name : collegeQuery}
                onChange={(e) => {
                  if (college) setCollege(null);
                  searchColleges(e.target.value);
                }}
                placeholder="Filter by college…"
              />
              {!college && collegeResults.length > 0 && (
                <div className="bg-popover absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border shadow-md">
                  <ul className="divide-y">
                    {collegeResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCollege(c);
                            setCollegeQuery("");
                            setCollegeResults([]);
                          }}
                          className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {college && (
                <button
                  type="button"
                  onClick={() => setCollege(null)}
                  className="text-muted-foreground hover:text-destructive absolute right-2 top-2.5"
                  aria-label="Clear college filter"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year (e.g. 4th)" />
          </div>

          <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
            {searching ? (
              <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">No students match.</p>
            ) : (
              <ul className="divide-y">
                {results.map((s) => {
                  const isEnrolled = enrolled.has(s.userId);
                  return (
                    <li key={s.userId}>
                      <label className={`flex items-center gap-3 p-2.5 text-sm ${isEnrolled ? "opacity-60" : "cursor-pointer"}`}>
                        <Checkbox
                          checked={inBasket(s.userId)}
                          disabled={isEnrolled}
                          onCheckedChange={() => toggleStudent(s)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {[s.collegeName, s.rollNumber].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                        {isEnrolled && <Badge variant="secondary">Enrolled</Badge>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="text-muted-foreground text-xs">Showing up to 25 matches — refine the search to narrow.</p>
        </section>

        {/* Basket */}
        <section className="grid content-start gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Selected ({basket.length})</h2>
            {basket.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setBasket([])}>Clear all</Button>
            )}
          </div>

          {basket.length === 0 ? (
            <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
              Tick students on the left to add them here.
            </div>
          ) : (
            <div className="grid gap-3">
              {basket.map((b) => (
                <div key={b.student.userId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{b.student.name}</div>
                      <div className="text-muted-foreground truncate text-xs">
                        {[b.student.collegeName, b.student.rollNumber].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(b.student.userId)}
                      aria-label="Remove"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid items-end gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Concession</Label>
                      <Select value={b.concessionType} onValueChange={(v) => patchRow(b.student.userId, { concessionType: v as ConcessionType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CONCESSION_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t === "none" ? "None (full fee)" : CONCESSION_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(b.concessionType === "discount" || b.concessionType === "scholarship") && (
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Amount (₹)</Label>
                        <Input inputMode="decimal" value={b.concessionAmount} onChange={(e) => patchRow(b.student.userId, { concessionAmount: e.target.value })} placeholder="0" />
                      </div>
                    )}
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Payment</Label>
                      <Select value={b.paymentOption} onValueChange={(v) => patchRow(b.student.userId, { paymentOption: v as "full" | "installments" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Pay in full</SelectItem>
                          <SelectItem value="installments">Installments</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {b.paymentOption === "installments" && (
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Installments</Label>
                        <Input inputMode="numeric" value={b.installmentCount} onChange={(e) => patchRow(b.student.userId, { installmentCount: e.target.value })} placeholder="2" />
                      </div>
                    )}
                  </div>
                  {b.concessionType !== "none" && (
                    <div className="mt-3 grid gap-1.5">
                      <Label className="text-xs">Reason (optional)</Label>
                      <Input value={b.concessionReason} onChange={(e) => patchRow(b.student.userId, { concessionReason: e.target.value })} placeholder="e.g. merit scholarship" />
                    </div>
                  )}
                  <div className="text-muted-foreground mt-2 text-right text-xs">
                    Net fee <span className="text-foreground font-semibold tabular-nums">{formatINR(rowNet(b))}</span>
                  </div>
                </div>
              ))}

              <div className="bg-muted/40 flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{basket.length} student{basket.length === 1 ? "" : "s"} · total net fee</span>
                <span className="font-semibold tabular-nums">{formatINR(total)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            {embedded ? (
              <Button variant="outline" onClick={() => onClose?.()}>
                Cancel
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href={backHref}>Cancel</Link>
              </Button>
            )}
            <Button onClick={submit} disabled={submitting || basket.length === 0}>
              {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Enrol {basket.length || ""}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
