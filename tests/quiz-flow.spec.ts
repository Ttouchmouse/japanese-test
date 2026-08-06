import { expect, test } from "@playwright/test";

const LESSON_ONE_READINGS: Record<string, string> = {
  "남자 친구": "かれし",
  "여자 친구": "かのじょ",
  "학생": "がくせい",
  "회사원": "かいしゃいん",
  "가수": "かしゅ",
  "주부": "しゅふ",
  "나(여자)": "わたし",
  "나(남자)": "ぼく",
};

test("direct input accepts a saved hiragana reading and survives refresh", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/일본어 복습 테스트/);
  await expect(page.getByRole("heading", { name: /배운 범위를 골라/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /직접 입력/ })).toHaveAttribute("aria-pressed", "true");

  await page.locator(".lesson-card").first().click();
  await page.locator(".count-option.is-all").click();
  await expect(page.locator(".count-option.is-all")).toContainText("8문제");
  await page.getByRole("button", { name: "복습 시작" }).click();

  await expect(page.getByText("1 / 8")).toBeVisible();
  const prompt = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";
  const reading = LESSON_ONE_READINGS[prompt];
  expect(reading, `알 수 없는 1과 단어: ${prompt}`).toBeTruthy();

  await page.getByRole("textbox", { name: "일본어 답" }).fill(reading);
  await page.getByRole("button", { name: "정답 확인" }).click();
  await expect(page.locator(".feedback strong")).toHaveText("정답이에요.");
  await page.reload();
  await expect(page.locator(".feedback strong")).toHaveText("정답이에요.");
  expect(browserErrors).toEqual([]);
});

test("tablet quick-review flow keeps answers and reaches results", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: /빠른 복습/ }).click();
  await page.locator(".type-option").filter({ hasText: "전체" }).click();

  const lessonCards = page.locator(".lesson-card");
  await expect(lessonCards).toHaveCount(60);
  await lessonCards.nth(0).click();
  await lessonCards.nth(1).click();
  await page.screenshot({ path: "/tmp/japanese-test-agent-browser/tablet-selection.png", fullPage: true });

  await page.getByRole("button", { name: "복습 시작" }).click();
  await expect(page.getByText("1 / 20")).toBeVisible();
  await expect(page.locator(".answer-option")).toHaveCount(5);
  await page.locator(".answer-option").first().click();
  await expect(page.locator(".feedback strong")).toBeVisible();
  await expect(page.locator(".answer-option:disabled")).toHaveCount(5);

  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.getByText("2 / 20")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 / 20")).toBeVisible();
  await page.getByRole("button", { name: "이전 문제" }).click();
  await expect(page.locator(".answer-option:disabled")).toHaveCount(5);
  await page.getByRole("button", { name: "다음 문제" }).click();

  for (let index = 1; index < 20; index += 1) {
    await page.locator(".answer-option").first().click();
    if (index < 19) {
      await page.getByRole("button", { name: "다음 문제" }).click();
    }
  }

  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page.getByRole("heading", { name: "답안을 확인하세요." })).toBeVisible();
  await expect(page.locator(".review-item")).toHaveCount(20);

  await page.getByRole("button", { name: "같은 과로 다시 풀기" }).click();
  await expect(page.getByText("1 / 20")).toBeVisible();
  await expect(page.locator(".answer-option:not(:disabled)")).toHaveCount(5);
  expect(browserErrors).toEqual([]);
});
