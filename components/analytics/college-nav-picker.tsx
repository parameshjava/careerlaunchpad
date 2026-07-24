"use client";

// Analytics-dashboard college selector: the shared (controlled) CollegePicker
// wired to URL navigation. Picking a college pushes ?college=<id> (clearing it
// drops the param), which re-renders the server analytics page for that college.
// The shared component itself never navigates — the nav lives here, in the
// consumer. A College Admin is locked to their own college via `disabled`
// (renders the details panel with no Change/Clear).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CollegePicker, type College } from "@/components/colleges/college-picker";

export function CollegeNavPicker({
  selected,
  disabled = false,
}: {
  selected: College | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(c: College | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (c) params.set("college", c.id);
    else params.delete("college");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="max-w-md">
      <CollegePicker value={selected} disabled={disabled} onChange={navigate} />
    </div>
  );
}
