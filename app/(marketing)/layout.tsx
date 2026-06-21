// Marketing route group. The bespoke landing-page CSS is scoped here (loaded
// only for marketing routes) so its global reset never leaks into the
// Tailwind/shadcn application surfaces under /dashboard etc.
import "../landing.css";
import Navbar from "../components/Navbar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
