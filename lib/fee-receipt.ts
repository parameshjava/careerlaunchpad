// Fee-receipt model + money helpers (issue #49). A receipt is generated for one
// `payment` against a `student_enrollment`, and shows the real ledger: the
// batch's fee lines, the concession, what was paid before, this payment, and the
// remaining balance. Built by getFeeReceipt() in lib/enrollment-query.ts.
//
// Money is carried in PAISE (integer) end-to-end; formatINR / rupeesInWords are
// the only place it becomes human-readable.

export type PaymentMode = "cash" | "upi" | "card" | "online";

export const MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  online: "Online",
};

/** Reference-number caption per mode (cash has none). */
export const MODE_REFERENCE_LABEL: Record<PaymentMode, string> = {
  cash: "Reference No.",
  upi: "UPI Txn ID",
  card: "Card Auth Code",
  online: "Payment ID",
};

export type ConcessionType = "none" | "discount" | "scholarship" | "full_waiver";

/** Label for the concession line on the receipt. */
export const CONCESSION_LABEL: Record<ConcessionType, string> = {
  none: "Concession",
  discount: "Discount",
  scholarship: "Scholarship",
  full_waiver: "Fee waiver",
};

/** One billed line on the receipt (a batch fee component). */
export type ReceiptLineItem = {
  description: string;
  note?: string;
  amountPaise: number;
};

/** The student/college identity block printed on the receipt. */
export type ReceiptStudent = {
  fullName: string;
  rollNumber?: string | null;
  registrationNumber?: string | null;
  apaarId?: string | null;
  /** Academic course context, e.g. "B.Tech · CSE". */
  course?: string | null;
  yearOfStudy?: string | null;
  collegeName?: string | null;
  collegeAddress?: string | null;
};

/** Everything the receipt needs — a payment joined to its enrolment/batch/course. */
export type FeeReceipt = {
  receiptNo: string;
  issueDate: string;
  paidOn: string;
  academicYear?: string | null;
  student: ReceiptStudent;
  /** The CareerLaunchpad course/program the fee is for (the batch's course). */
  courseName: string;
  batchName?: string | null;
  /** The fee structure — the batch's fee components. */
  lineItems: ReceiptLineItem[];
  grossFeePaise: number;
  concessionType: ConcessionType;
  concessionPaise: number;
  /** Net fee owed = gross − concession. */
  totalFeePaise: number;
  /** Paid before this receipt's payment. */
  previouslyPaidPaise: number;
  /** This receipt's payment. */
  thisPaymentPaise: number;
  /** Remaining after this payment. */
  balancePaise: number;
  mode: PaymentMode;
  referenceNo?: string | null;
};

const INR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format paise as Indian-grouped rupees, e.g. 1800000 → "₹ 18,000.00". */
export function formatINR(paise: number): string {
  return `₹ ${INR.format(paise / 100)}`;
}

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = n % 10;
  return o ? `${t} ${ONES[o]}` : t;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Whole rupees → words, Indian numbering (crore / lakh / thousand). */
function rupeesWhole(rupees: number): string {
  if (rupees === 0) return "Zero";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}

/** e.g. 1800000 → "Rupees Eighteen Thousand only". */
export function rupeesInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const paisePart = paise % 100;
  const rupeeWords = `Rupees ${rupeesWhole(rupees)}`;
  if (paisePart === 0) return `${rupeeWords} only`;
  return `${rupeeWords} and ${twoDigits(paisePart)} Paise only`;
}
