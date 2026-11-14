import "server-only";
import { getDb } from "./db";
import { FactGenerationError, generateMovieFact, getFactSource } from "./fact-generator";
import { findFavoriteMovie } from "./movies";

export async function getMovieFact(userId: string) {
  const movie = await findFavoriteMovie(userId);
  if (!movie) return null;

  const db = getDb();
  try {
    const source = getFactSource();
    const text = await generateMovieFact(movie.title, source);
    return await db.movieFact.create({
      data: { favoriteMovieId: movie.id, text, source },
      select: { text: true, source: true, createdAt: true },
    });
  } catch (error) {
    if (error instanceof FactGenerationError) return null;
    throw error;
  }
}
