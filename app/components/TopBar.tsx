import Link from "next/link";
import { Phone, Mail } from "lucide-react";
import { PHONE_DISPLAY, PHONE_TEL, EMAIL } from "@/lib/contact";

// Thin utility strip above the navbar — the "real institution" signals Indian
// education audiences expect (phone, email, admissions notice). Scrolls away;
// only the navbar below is sticky.
export default function TopBar() {
  return (
    <div className="topbar">
      <div className="topbar-contacts">
        <a href={`tel:${PHONE_TEL}`} className="topbar-item">
          <Phone aria-hidden="true" />
          {PHONE_DISPLAY}
        </a>
        <a href={`mailto:${EMAIL}`} className="topbar-item topbar-item--mail">
          <Mail aria-hidden="true" />
          {EMAIL}
        </a>
      </div>
      {/* The year tail drops below 480px so phone + notice fit on 320px phones */}
      <Link href="/student/register" className="topbar-notice">
        Registrations open<span className="topbar-notice-year"> for 2026–27</span>{" "}
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
