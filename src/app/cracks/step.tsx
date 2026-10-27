// One numbered section of the new/edit crack form. `locked` fades the step
// and shows `lockedHint` until an earlier step is done.
export default function Step({
  number,
  badgeClass,
  title,
  hint,
  locked = false,
  lockedHint,
  children,
}: {
  number: number;
  badgeClass: string;
  title: string;
  hint?: string;
  locked?: boolean;
  lockedHint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex gap-4 rounded-xl border border-black/10 bg-surface p-4 transition-opacity dark:border-white/15 ${
        locked ? "opacity-50" : ""
      }`}
    >
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white ${badgeClass}`}
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h2 className="heading">{title}</h2>
          {(locked ? lockedHint : hint) && (
            <p className="text-sm opacity-80">{locked ? lockedHint : hint}</p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
