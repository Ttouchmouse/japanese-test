import { expect, test } from "@playwright/test";
import bank from "../src/data/question-bank.json" with { type: "json" };
import manifest from "../src/data/audio-cues.json" with { type: "json" };

test("every lesson 31–40 study item has a served, playable MP3 file", async ({ request }) => {
  const items = bank.lessons.filter((l) => l.id >= 31 && l.id <= 40).flatMap((l) => l.items);
  expect(items).toHaveLength(434);
  for (const item of items) {
    const cues = manifest.cues.filter((cue) => cue.sourceItemId === item.id);
    expect(cues, item.id).toHaveLength(1);
    const response = await request.get(cues[0].src);
    expect(response.status(), item.id).toBe(200);
    expect(response.headers()["content-type"], item.id).toContain("audio/mpeg");
    expect((await response.body()).length, item.id).toBeGreaterThan(1000);
  }
});

for (let lesson = 31; lesson <= 40; lesson++) {
  test(`lesson ${lesson} reveals its Japanese answer and plays its own audio`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByRole("button", { name: /생각하고 풀기/ }).click();
    await page.locator(".lesson-card").nth(lesson - 1).click();
    await page.getByRole("button", { name: "복습 시작" }).click();
    const korean = (await page.locator("#question-prompt").innerText()).trim();
    const loaded = page.waitForResponse((response) => response.url().includes(`/audio/lesson-${lesson}/`));
    await page.getByRole("button", { name: "정답 확인" }).click();
    const answer = (await page.locator(".answer-reveal-text strong").innerText()).trim();
    const item = bank.lessons[lesson - 1].items.find((i) => i.japanese === answer && i.korean === korean);
    expect(item, `${korean} → ${answer}`).toBeDefined();
    const cue = manifest.cues.find((c) => c.sourceItemId === item!.id)!;
    const response = await loaded;
    expect(new URL(response.url()).pathname).toBe(cue.src);
    expect([200, 206]).toContain(response.status());
    await expect(page.getByRole("button", { name: "일본어 음성 정지" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
