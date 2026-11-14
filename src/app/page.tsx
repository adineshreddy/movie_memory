import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { findFavoriteMovie } from "@/server/movies";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();

  if (session?.user?.id) {
    const movie = await findFavoriteMovie(session.user.id);
    redirect(movie ? "/dashboard" : "/onboarding");
  }

  const { error } = await searchParams;

  return (
    <main className="page">
      <div className="max-w-xl">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
          Movie Memory
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-zinc-300">
          Save your favorite movie and discover a fact about it.
        </p>
        {error && (
          <p className="mt-5 text-sm text-red-300" role="alert">
            Google sign-in couldn’t be completed. Please try again.
          </p>
        )}
        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="button button-primary" type="submit">
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
