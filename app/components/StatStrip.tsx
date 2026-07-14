// Platform facts, Sathya-style stat cards under the hero. Every number here is
// verifiable from the platform (question bank counts, journey steps, founder
// experience) — no invented "students trained" figures until we have them.
const stats: { value: string; label: string }[] = [
  { value: "8,000+", label: "Exam-grade practice questions" },
  { value: "50+", label: "Chapters across Arithmetic, Reasoning & English" },
  { value: "6-step", label: "Guided journey to job-readiness" },
  { value: "17+ yrs", label: "Industry experience behind our mentorship" },
];

export default function StatStrip() {
  return (
    <ul className="stat-strip">
      {stats.map((s) => (
        <li className="stat-card" key={s.label}>
          <span className="stat-value">{s.value}</span>
          <span className="stat-label">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
