import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { findFavoriteMovie, MAX_MOVIE_TITLE_LENGTH } from "@/server/movies";
import { MovieForm } from "./movie-form";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (await findFavoriteMovie(user.id)) redirect("/dashboard");

  return (
    <main className="page">
      <section className="panel max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          What’s your favorite movie?
        </h1>
        <MovieForm maxLength={MAX_MOVIE_TITLE_LENGTH} />
      </section>
    </main>
  );
}
