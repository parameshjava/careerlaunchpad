// Sample dataset for the students data grid. In a real app this comes from the
// /api/students route (or a DB); the shape here mirrors what the grid expects.
export type StudentStatus =
  | "Active"
  | "Placed"
  | "In Training"
  | "Dropped"
  | "Onboarding";

export type Student = {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  mentor: string;
  sector: "Banking" | "IT" | "Government" | "Other";
  progress: number; // 0-100
  joinedAt: string; // ISO date
};

const firstNames = [
  "Lakshmi", "Ravi", "Anusha", "Karthik", "Divya", "Suresh", "Meena", "Arjun",
  "Pooja", "Vijay", "Sneha", "Ramesh", "Kavya", "Naveen", "Swathi", "Manoj",
  "Harika", "Praveen", "Bhavana", "Rohit", "Tejaswi", "Sai", "Deepika", "Kiran",
];
const lastNames = [
  "Reddy", "Naidu", "Rao", "Sharma", "Kumar", "Devi", "Goud", "Varma",
  "Chowdary", "Patel", "Nair", "Das", "Yadav", "Bhat", "Menon", "Pillai",
];
const mentors = [
  "Lakshmi Narayana", "Paramesh K.", "Anita Desai", "Vikram Seth", "Priya Menon",
];
const sectors: Student["sector"][] = ["Banking", "IT", "Government", "Other"];
const statuses: StudentStatus[] = [
  "Active", "Placed", "In Training", "Dropped", "Onboarding",
];

// Deterministic generator (no Math.random) so SSR/CSR markup stays stable.
export function getStudents(count = 60): Student[] {
  const rows: Student[] = [];
  for (let i = 0; i < count; i++) {
    const first = firstNames[i % firstNames.length];
    const last = lastNames[(i * 7) % lastNames.length];
    const name = `${first} ${last}`;
    const day = ((i * 13) % 28) + 1;
    const month = ((i * 5) % 12) + 1;
    rows.push({
      id: `STU-${(1000 + i).toString()}`,
      name,
      email: `${first}.${last}`.toLowerCase() + "@careerlaunchpad.ai",
      status: statuses[(i * 3) % statuses.length],
      mentor: mentors[i % mentors.length],
      sector: sectors[(i * 2) % sectors.length],
      progress: (i * 17) % 101,
      joinedAt: `2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  return rows;
}
