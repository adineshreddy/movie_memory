import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser, signOut } from "@/server/auth";
import { findFavoriteMovie } from "@/server/movies";
import { MovieFact } from "./movie-fact";

export default async function DashboardPage() {
  const user = await requireUser();
  const movie = await findFavoriteMovie(user.id);
  if (!movie) redirect("/onboarding");

  const displayName = user.name?.trim() || "Movie fan";
  const photo = user.image?.startsWith("https://lh3.googleusercontent.com/") ? user.image : null;

  return (
    <main className="page">
      <div className="mx-auto grid max-w-3xl gap-6">
        <section className="panel min-w-0">
          <p className="text-sm font-medium text-amber-300">Favorite movie</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-5xl">
            {movie.title}
          </h1>
          <div className="mt-8 border-t border-zinc-800 pt-6">
            <h2 className="mb-3 font-semibold">Fun fact</h2>
            <Suspense fallback={<p className="text-zinc-400" role="status">Finding a fact…</p>}>
              <MovieFact userId={user.id} />
            </Suspense>
          </div>
        </section>
        <aside className="panel flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Your account">
          <div className="flex min-w-0 items-center gap-3">
            {photo ? (
              <Image
                className="size-10 shrink-0 rounded-full"
                src={photo}
                width={40}
                height={40}
                alt=""
                unoptimized
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-800" aria-hidden="true">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="font-semibold">{displayName}</p>
              <p className="truncate text-sm text-zinc-400" title={user.email ?? undefined}>{user.email}</p>
            </div>
          </div>
          <form
            className="shrink-0"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="button button-secondary w-full">Logout</button>
          </form>
        </aside>
      </div>
    </main>
  );
}
