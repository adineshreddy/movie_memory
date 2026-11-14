"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { MAX_MOVIE_TITLE_LENGTH, saveFavoriteMovie } from "@/server/movies";

export async function submitFavoriteMovie(
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser();
  const input = formData.get("movieTitle");
  const title = typeof input === "string" ? input.trim() : "";

  if (!title || title.length > MAX_MOVIE_TITLE_LENGTH) {
    return `Enter a movie title between 1 and ${MAX_MOVIE_TITLE_LENGTH} characters.`;
  }

  await saveFavoriteMovie(user.id, title);
  redirect("/dashboard");
}
