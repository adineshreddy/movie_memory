import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
import { isFactFresh } from "./fact-cache.mts";
import { FactGenerationError, generateMovieFact, getFactSource } from "./fact-generator";
import { findFavoriteMovie } from "./movies";

function findLatestFact(
  facts: Prisma.TransactionClient["movieFact"],
  favoriteMovieId: string,
  source: ReturnType<typeof getFactSource>,
) {
  return facts.findFirst({
    where: { favoriteMovieId, source },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { text: true, source: true, createdAt: true },
  });
}

export async function getMovieFact(userId: string) {
  const movie = await findFavoriteMovie(userId);
  if (!movie) return null;

  const db = getDb();
  try {
    const source = getFactSource();
    const latestFact = await findLatestFact(db.movieFact, movie.id, source);
    if (latestFact && isFactFresh(latestFact.createdAt)) return latestFact;

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
