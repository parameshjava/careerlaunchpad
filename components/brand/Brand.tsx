import Link from "next/link";
import Image from "next/image";

// The CareerLaunchpad brand lockup (logo + wordmark + tagline). Styled with the
// marketing semantic classes in app/landing.css, so render it only where that
// stylesheet is loaded (marketing routes and the /style-guide page).
export function Brand({
  href = "/",
  showTagline = true,
}: {
  href?: string;
  showTagline?: boolean;
}) {
  return (
    <Link href={href} className="brand">
      <Image
        className="brand-logo"
        src="/letterhead-logo.png"
        alt="Career Launchpad logo"
        width={530}
        height={600}
        priority
      />
      <span className="brand-text">
        <span className="brand-name">
          <span className="brand-mark">Career</span>
          <span className="brand-accent">Launchpad</span>
        </span>
        {showTagline && (
          <span className="brand-tagline">
            Connecting Rural Talent with Global Opportunities
          </span>
        )}
      </span>
    </Link>
  );
}
