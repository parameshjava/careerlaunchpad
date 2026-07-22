"use client";

// Competitive-exam editor (issue #49). Record an exam (ICET, MAT, Bank PO…) and
// author its syllabus — subjects + the chapters in scope. Courses that target
// this exam inherit the syllabus. Talks only to /api/admin/competitive-exams*.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SubjectChapterPicker,
  type SubjectSelection,
} from "@/components/competitive-exams/subject-chapter-picker";
import type { SubjectWithChapters } from "@/lib/course-query";
import type { CompetitiveExamDetail } from "@/lib/competitive-exam-query";

export function CompetitiveExamEditor({ examId }: { examId?: string }) {
  const router = useRouter();
  const editing = Boolean(examId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [subjectsRef, setSubjectsRef] = useState<SubjectWithChapters[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [subjects, setSubjects] = useState<SubjectSelection[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refRes = await fetch("/api/admin/competitive-exams/reference");
        const ref = await refRes.json();
        if (!refRes.ok) throw new Error(ref.error ?? "Could not load subjects");
        if (cancelled) return;
        setSubjectsRef(ref.subjects ?? []);

        if (examId) {
          const res = await fetch(`/api/admin/competitive-exams/${examId}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Could not load exam");
          if (cancelled) return;
          const e = json.exam as CompetitiveExamDetail;
          setCode(e.code);
          setName(e.name);
          setDescription(e.description ?? "");
          setIsActive(e.isActive);
          setSubjects(e.subjects);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  async function save() {
    setFormError("");
    if (!code.trim()) return setFormError("A short code is required (e.g. ICET).");
    if (!name.trim()) return setFormError("A name is required.");

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim() || null,
      isActive,
      subjects,
    };

    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/competitive-exams/${examId}` : "/api/admin/competitive-exams",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      router.push("/dashboard/competitive-exams");
      router.refresh();
    } catch (e) {
      setFormError((e as Error).message);
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  if (loadError)
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-destructive text-sm">{loadError}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/dashboard/competitive-exams">Back to competitive exams</Link>
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {editing ? "Edit competitive exam" : "New competitive exam"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Record the exam and its syllabus. Courses that target it inherit this syllabus.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/competitive-exams">
            <ArrowLeft /> Back
          </Link>
        </Button>
      </header>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="e-code">
                  Code <span className="text-primary">*</span>
                </Label>
                <Input
                  id="e-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ICET"
                  className="uppercase"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-name">
                  Name <span className="text-primary">*</span>
                </Label>
                <Input
                  id="e-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Integrated Common Entrance Test"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="e-desc">Description</Label>
              <MarkdownEditor
                id="e-desc"
                value={description}
                onChange={setDescription}
                placeholder="About the exam — eligibility, pattern, notes…"
              />
            </div>
            {editing && (
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="e-status">Status</Label>
                <Select
                  value={isActive ? "active" : "inactive"}
                  onValueChange={(v) => setIsActive(v === "active")}
                >
                  <SelectTrigger id="e-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Syllabus</CardTitle>
          </CardHeader>
          <CardContent>
            <SubjectChapterPicker subjectsRef={subjectsRef} value={subjects} onChange={setSubjects} />
          </CardContent>
        </Card>

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/competitive-exams">Cancel</Link>
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {editing ? "Save changes" : "Create exam"}
          </Button>
        </div>
      </div>
    </div>
  );
}
