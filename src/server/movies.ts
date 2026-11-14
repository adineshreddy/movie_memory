import "server-only";
import { getDb } from "./db";

export const MAX_MOVIE_TITLE_LENGTH = 120;

export function findFavoriteMovie(userId: string) {
  return getDb().favoriteMovie.findUnique({ where: { userId } });
}

export async function saveFavoriteMovie(userId: string, title: string) {
  // PostgreSQL skips the insert atomically when onboarding was already completed.
  await getDb().favoriteMovie.createMany({
    data: [{ userId, title }],
    skipDuplicates: true,
  });
}
