import Staff from "../components/staff";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--page)] px-4 py-6 sm:px-6 sm:py-8 2xl:px-8">
      <div className="mx-auto w-full max-w-[1480px]">
        <header className="mb-6 border-b border-[var(--border)] pb-4">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">
            Chord Finder
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Write a melody, shape its harmony, and hear the result.
          </p>
        </header>

        <Staff />
      </div>
    </main>
  );
}
