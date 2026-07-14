// Marketing route group. The bespoke landing-page CSS is scoped here (loaded
// only for marketing routes) so its global reset never leaks into the
// Tailwind/shadcn application surfaces under /dashboard etc.
import "../landing.css";
import TopBar from "../components/TopBar";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar />
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
