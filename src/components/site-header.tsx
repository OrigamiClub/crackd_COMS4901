import Link from "next/link";
import AccountButton from "@/components/account-button";
import Wordmark from "@/components/wordmark";

// Top bar for every page except home (which has its own sidebar): the site
// name linking home on the left, the primary action and account on the
// right. Pages whose own main action is a form (posting, editing, the
// profile) hide "+ New Crack" so each screen has one primary button.
export default function SiteHeader({
  showNewCrack = true,
}: {
  showNewCrack?: boolean;
}) {
  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-4">
      <Wordmark tagline />
      <div className="flex items-center gap-3">
        {showNewCrack && (
          <Link href="/cracks/new" className="btn-primary">
            + New Crack
          </Link>
        )}
        <AccountButton />
      </div>
    </header>
  );
}
