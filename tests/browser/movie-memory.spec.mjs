import { expect, test } from "@playwright/test";
import { createViewer, openTestDatabase, saveFact, sessionCookie } from "../support/fixtures.mjs";

let db;

test.beforeAll(() => {
  db = openTestDatabase();
});

test.afterAll(async () => {
  await db?.end();
});

async function signInAs(context, baseURL, viewer) {
  await context.addCookies([{ name: sessionCookie, value: viewer.token, url: baseURL }]);
}

async function moviesFor(viewer) {
  const { rows } = await db.query('SELECT title FROM "FavoriteMovie" WHERE "userId" = $1', [viewer.id]);
  return rows.map(({ title }) => title);
}

test("signed-out visitors see Google sign-in and cannot open the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/");
});

test("first visit saves a trimmed movie, shows a fact, and logs out", async ({ page, context, baseURL }) => {
  const viewer = await createViewer(db, { name: "Taylor Viewer" });
  await signInAs(context, baseURL, viewer);
  await page.goto("/");
  await expect(page).toHaveURL("/onboarding");
  await page.getByLabel("Movie title").fill("  Interstellar  ");
  await page.getByRole("button", { name: "Save favorite" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Interstellar" })).toBeVisible();
  await expect(page.getByText("Generated test fact for Interstellar")).toBeVisible();
  await expect(page.getByText("Taylor Viewer")).toBeVisible();
  await expect(page.getByText(viewer.email)).toBeVisible();
  expect(await moviesFor(viewer)).toEqual(["Interstellar"]);

  await page.goto("/");
  await expect(page).toHaveURL("/dashboard");
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/");
  // Also verify the original session can no longer be used.
  await signInAs(context, baseURL, viewer);
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/");
});

test("onboarding rejects invalid titles on the server and accepts the 120-character limit", async ({ page, context, baseURL }) => {
  const viewer = await createViewer(db);
  await signInAs(context, baseURL, viewer);
  await page.goto("/onboarding");
  const input = page.getByLabel("Movie title");
  // Bypass browser constraints so these submissions exercise server validation.
  await input.evaluate((element) => {
    element.removeAttribute("maxlength");
    element.removeAttribute("required");
  });
  for (const title of ["   ", "X".repeat(121)]) {
    await input.fill(title);
    const [response] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/onboarding"),
      page.getByRole("button", { name: "Save favorite" }).click(),
    ]);
    expect(response.ok()).toBe(true);
    await expect(page.locator("form").getByRole("alert")).toHaveText("Enter a movie title between 1 and 120 characters.");
    expect(await moviesFor(viewer)).toEqual([]);
  }
  const maxTitle = "A".repeat(120);
  await input.fill(maxTitle);
  await page.getByRole("button", { name: "Save favorite" }).click();
  await expect(page).toHaveURL("/dashboard");
  expect(await moviesFor(viewer)).toEqual([maxTitle]);
});

test("an already open onboarding tab cannot overwrite the saved movie or target another account", async ({ page, context, baseURL }) => {
  const viewer = await createViewer(db);
  const other = await createViewer(db);
  await signInAs(context, baseURL, viewer);
  const staleTab = await context.newPage();
  await Promise.all([page.goto("/onboarding"), staleTab.goto("/onboarding")]);
  await page.getByLabel("Movie title").fill("Jurassic Park");
  await page.getByRole("button", { name: "Save favorite" }).click();
  await expect(page).toHaveURL("/dashboard");

  await staleTab.getByLabel("Movie title").fill("Interstellar");
  await staleTab.locator("form").evaluate((form, userId) => {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "userId";
    field.value = userId;
    form.append(field);
  }, other.id);
  await staleTab.getByRole("button", { name: "Save favorite" }).click();
  await expect(staleTab).toHaveURL("/dashboard");
  await expect(staleTab.getByRole("heading", { name: "Jurassic Park" })).toBeVisible();
  expect(await moviesFor(viewer)).toEqual(["Jurassic Park"]);
  expect(await moviesFor(other)).toEqual([]);
  await page.goto("/onboarding");
  await expect(page).toHaveURL("/dashboard");
});

test("the onboarding action checks the session again when a form is submitted", async ({ page, context, baseURL }) => {
  const viewer = await createViewer(db);
  await signInAs(context, baseURL, viewer);
  await page.goto("/onboarding");
  await page.getByLabel("Movie title").fill("Interstellar");
  await context.clearCookies();
  await page.getByRole("button", { name: "Save favorite" }).click();
  await expect(page).toHaveURL("/");
  expect(await moviesFor(viewer)).toEqual([]);
});

test("the dashboard renders a profile photo and handles a missing profile", async ({ page, context, baseURL }) => {
  const image = "https://lh3.googleusercontent.com/test-profile";
  await page.route(image, (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>',
  }));
  const withPhoto = await createViewer(db, { title: "Photo example", image });
  await signInAs(context, baseURL, withPhoto);
  await page.goto("/dashboard");
  const account = page.getByRole("complementary", { name: "Your account" });
  await expect(account.locator("img")).toHaveAttribute("src", image);

  const withoutProfile = await createViewer(db, { title: "No profile example", name: null });
  await signInAs(context, baseURL, withoutProfile);
  await page.goto("/dashboard");
  await expect(account.getByText("Movie fan")).toBeVisible();
  await expect(account.locator("img")).toHaveCount(0);
});

test("saved facts render Markdown and math, and long emails stay on one line", async ({ page, context, baseURL }) => {
  const viewer = await createViewer(db, { title: "The Godfather" });
  const email = "very.long.email.address.for.the.movie.memory.dashboard@example.test";
  await db.query('UPDATE "User" SET email = $1 WHERE id = $2', [email, viewer.id]);
  await saveFact(db, viewer, [
    "*The Godfather* was directed by **Francis Ford Coppola**. Example math: $x^2$.",
    "- The film was released in 1972.",
    "- It stars Marlon Brando.",
    "![Image description](https://example.test/film.jpg)",
    "<div>Raw HTML should be ignored</div>",
  ].join("\n\n"));
  await signInAs(context, baseURL, viewer);
  await page.goto("/dashboard");

  const fact = page.locator(".fact-markdown");
  await expect(fact.locator("em")).toHaveText("The Godfather");
  await expect(fact.locator("strong")).toHaveText("Francis Ford Coppola");
  await expect(fact.getByRole("listitem")).toHaveCount(2);
  await expect(fact.locator("math")).toHaveCount(1);
  await expect(fact.getByText("Image description")).toBeVisible();
  await expect(fact.locator("img")).toHaveCount(0);
  await expect(fact.getByText("Raw HTML should be ignored")).toHaveCount(0);

  const account = page.getByRole("complementary", { name: "Your account" });
  const address = account.getByText(email);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(address).toHaveCSS("white-space", "nowrap");
    await expect(address).toHaveCSS("text-overflow", "ellipsis");
    await expect(address).toHaveAttribute("title", email);
    const factBox = await fact.boundingBox();
    const accountBox = await account.boundingBox();
    expect(accountBox.y).toBeGreaterThan(factBox.y + factBox.height);
  }
  expect(await address.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});
