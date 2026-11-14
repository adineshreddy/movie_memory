"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <section className="panel max-w-xl">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <button type="button" className="button button-secondary mt-5" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
