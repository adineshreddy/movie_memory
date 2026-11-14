import { randomUUID } from "node:crypto";
import pg from "pg";

export function openTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/movie_memory_test") {
    throw new Error("Fixtures require the isolated Movie Memory test database");
  }
  return new pg.Pool({ connectionString: url.href });
}

export async function createViewer(db, {
  name = "Test Viewer", title, image = null, expired = false,
} = {}) {
  const id = randomUUID();
  const email = `${id}@example.test`;
  const token = randomUUID();
  const movieId = title ? randomUUID() : null;
  await db.query('INSERT INTO "User" (id, name, email, image) VALUES ($1, $2, $3, $4)', [id, name, email, image]);
  await db.query('INSERT INTO "Session" ("sessionToken", "userId", expires) VALUES ($1, $2, $3)', [
    token, id, new Date(Date.now() + (expired ? -3_600_000 : 3_600_000)),
  ]);
  if (movieId) {
    await db.query('INSERT INTO "FavoriteMovie" (id, "userId", title) VALUES ($1, $2, $3)', [movieId, id, title]);
  }
  return { id, email, token, movieId };
}

export async function saveFact(db, viewer, text, { ageMs = 0, source = "LIVE" } = {}) {
  const result = await db.query(
    `INSERT INTO "MovieFact" (id, "favoriteMovieId", text, source, "createdAt")
     VALUES ($1, $2, $3, $4, $5) RETURNING id, text, source, "createdAt"`,
    [randomUUID(), viewer.movieId, text, source, new Date(Date.now() - ageMs)],
  );
  return result.rows[0];
}

export async function savedFacts(db, viewer) {
  const result = await db.query(
    `SELECT id, text, source, "createdAt" FROM "MovieFact"
     WHERE "favoriteMovieId" = $1 ORDER BY "createdAt", id`, [viewer.movieId],
  );
  return result.rows;
}

export const sessionCookie = "authjs.session-token";
