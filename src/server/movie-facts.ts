import "server-only";
import { Prisma } from "@/generated/prisma/client";
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
  let source: ReturnType<typeof getFactSource> | undefined;
  try {
    const activeSource = getFactSource();
    source = activeSource;
    const latestFact = await findLatestFact(db.movieFact, movie.id, activeSource);
    if (latestFact && isFactFresh(latestFact.createdAt)) return latestFact;

    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '9s'`;
      const [lockedMovie] = await tx.$queryRaw<{ id: string; title: string }[]>`
        SELECT id, title
        FROM "FavoriteMovie"
        WHERE id = ${movie.id} AND "userId" = ${userId}
        FOR UPDATE
      `;
      if (!lockedMovie) return null;

      const factAfterLock = await findLatestFact(tx.movieFact, lockedMovie.id, activeSource);
      if (factAfterLock && isFactFresh(factAfterLock.createdAt)) return factAfterLock;

      const text = await generateMovieFact(lockedMovie.title, activeSource);
      return tx.movieFact.create({
        // The database default uses the transaction start time.
        data: { favoriteMovieId: lockedMovie.id, text, source: activeSource, createdAt: new Date() },
        select: { text: true, source: true, createdAt: true },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 2_000,
      timeout: 20_000,
    });
  } catch (error) {
    if (error instanceof FactGenerationError) {
      // The transaction has released the lock. A concurrent request may have saved a fact.
      return source ? findLatestFact(db.movieFact, movie.id, source) : null;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2028") return null;

      const adapterError = error.meta?.driverAdapterError as
        | { cause?: { originalCode?: string } }
        | undefined;
      if (error.code === "P2010" && adapterError?.cause?.originalCode === "55P03") {
        return null;
      }
    }
    throw error;
  }
}
