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
  await page.getByRole("button", { name: "헷갈려요" }).click();
  await page.reload();
  await expect(page.locator(".feedback strong")).toHaveText("정답이에요.");
  await expect(page.getByRole("button", { name: "헷갈려요" })).toHaveAttribute("aria-pressed", "true");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "나가기" }).click();
  await page.getByRole("button", { name: "헷갈린 표현 모아보기" }).click();
  await expect(page.getByRole("heading", { name: "표시해 둔 표현을 모았어요." })).toBeVisible();
  await expect(page.locator(".confusion-item")).toHaveCount(1);
  await page.locator(".confusion-remove").click();
  await expect(page.getByRole("heading", { name: "아직 헷갈린 표현이 없어요." })).toBeVisible();
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
  await page.getByRole("button", { name: "헷갈려요" }).click();

  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.getByText("2 / 20")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 / 20")).toBeVisible();
  await page.getByRole("button", { name: "이전 문제" }).click();
  await expect(page.locator(".answer-option:disabled")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "헷갈려요" })).toHaveAttribute("aria-pressed", "true");
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
  await expect(page.locator(".review-confusion")).toHaveCount(1);

  await page.getByRole("button", { name: "같은 과로 다시 풀기" }).click();
  await expect(page.getByText("1 / 20")).toBeVisible();
  await expect(page.locator(".answer-option:not(:disabled)")).toHaveCount(5);
  expect(browserErrors).toEqual([]);
});

test("sentence recall reveals the book answer and records self-assessment", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: /생각하고 풀기/ }).click();
  await expect(page.getByRole("group", { name: /문제 유형/ })).toHaveCount(0);
  await page.locator(".lesson-card").first().click();
  await page.getByRole("button", { name: "10 문제" }).click();
  await page.getByRole("button", { name: "복습 시작" }).click();

  await expect(page.getByText("1 / 10")).toBeVisible();
  await expect(page.getByText("한국어 → 일본어")).toBeVisible();
  await expect(page.locator(".recall-answer")).toHaveCount(0);

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole("button", { name: "정답 확인" }).click();
    await expect(page.locator(".recall-answer")).toBeVisible();
    const confusionToggle = page.getByRole("button", { name: "헷갈려요" });
    await expect(confusionToggle).toHaveAttribute("aria-pressed", "false");
    if (index === 0) {
      await confusionToggle.click();
      await expect(confusionToggle).toHaveAttribute("aria-pressed", "true");
    }

    if (index < 9) {
      await page.getByRole("button", { name: "다음 문제" }).click();
    }
  }

  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page.getByText("기억한 문장 9개 · 헷갈린 문장 1개")).toBeVisible();
  await expect(page.getByRole("heading", { name: "문장을 확인하세요." })).toBeVisible();
  await expect(page.locator(".review-item.is-review")).toHaveCount(1);
  expect(browserErrors).toEqual([]);
});

test("lesson 12 reveals and plays the matched book audio", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: /생각하고 풀기/ }).click();
  await page.locator(".lesson-card").nth(11).click();
  await page.getByRole("button", { name: "10 문제" }).click();
  await page.getByRole("button", { name: "복습 시작" }).click();

  await expect(page.getByRole("button", { name: "일본어 음성 재생" })).toHaveCount(0);
  await page.getByRole("button", { name: "정답 확인" }).click();

  const audioButton = page.getByRole("button", { name: "일본어 음성 재생" });
  await expect(audioButton).toBeVisible();
  const audioResponse = page.waitForResponse(
    (response) => response.url().includes("/audio/lesson-12/") && response.request().method() === "GET",
  );
  await audioButton.click();
  const response = await audioResponse;

  expect([200, 206]).toContain(response.status());
  expect(response.headers()["content-type"]).toContain("audio/mpeg");
  await expect(page.getByRole("button", { name: "일본어 음성 정지" })).toContainText("재생 중");
  expect(browserErrors).toEqual([]);
});
