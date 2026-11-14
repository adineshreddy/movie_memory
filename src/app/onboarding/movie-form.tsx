"use client";

import { useActionState } from "react";
import { submitFavoriteMovie } from "./actions";

export function MovieForm({ maxLength }: { maxLength: number }) {
  const [error, action, pending] = useActionState(submitFavoriteMovie, null);

  return (
    <form action={action} className="mt-7 space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="movieTitle">
          Movie title
        </label>
        <input
          id="movieTitle"
          name="movieTitle"
          type="text"
          required
          maxLength={maxLength}
          placeholder="Interstellar"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "title-error" : undefined}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-amber-300"
        />
        {error && (
          <p id="title-error" className="mt-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Saving…" : "Save favorite"}
      </button>
    </form>
  );
}
