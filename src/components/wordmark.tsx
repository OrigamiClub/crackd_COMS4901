import Link from "next/link";

// The site's brand: "crackd" in heavy type, optionally with the full name
// beneath it as a tagline. Links home.
export default function Wordmark({
  tagline = false,
  className = "",
}: {
  tagline?: boolean;
  className?: string;
}) {
  return (
    <Link href="/" className={`flex flex-col gap-1 hover:opacity-80 ${className}`}>
      <span className="wordmark">crackd</span>
      {tagline && (
        <span className="text-xs opacity-75">cracking jokes in the city of new york</span>
      )}
    </Link>
  );
}
