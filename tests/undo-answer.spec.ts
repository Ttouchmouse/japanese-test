import { expect, test } from "@playwright/test";

for (const mode of ["직접 입력", "생각하고 풀기", "빠른 복습"]) {
  test(`${mode}: undo returns to the same unanswered question and survives reload`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(mode) }).click();
    await page.locator(".lesson-card").first().click();
    await page.locator(".count-option.is-all").click();
    await page.getByRole("button", { name: "복습 시작", exact: true }).click();
    const prompt = await page.locator("#question-prompt").innerText();

    const submit = async () => {
      if (mode === "직접 입력") {
        await page.getByRole("textbox", { name: "일본어 답" }).fill("123");
      }
      if (mode === "빠른 복습") {
        await page.locator(".answer-option").first().click();
      } else {
        await page.getByRole("button", { name: "정답 확인", exact: true }).click();
      }
    };

    await expect(page.getByRole("button", { name: "잘 못 눌렀어요" })).toHaveCount(0);
    await submit();
    await page.getByRole("button", { name: "헷갈려요" }).click();
    await page.getByRole("button", { name: "잘 못 눌렀어요" }).click();
    await expect(page.locator(".answer-reveal")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다음 문제", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "헷갈려요" })).toHaveAttribute("aria-pressed", "true");
    if (mode === "직접 입력") {
      await expect(page.getByRole("textbox", { name: "일본어 답" })).toBeFocused();
      await expect(page.getByRole("textbox", { name: "일본어 답" })).toHaveValue("");
    }
    if (mode === "빠른 복습") {
      await expect(page.locator(".answer-option:not(:disabled)")).toHaveCount(5);
      await expect(page.locator(".answer-icon")).toHaveCount(0);
    }

    await page.reload();
    await expect(page.locator("#question-prompt")).toHaveText(prompt);
    await expect(page.getByRole("button", { name: "잘 못 눌렀어요" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다음 문제", exact: true })).toBeDisabled();
    await submit();
    await expect(page.getByRole("button", { name: "다음 문제", exact: true })).toBeEnabled();
    if (mode !== "빠른 복습") {
      await expect(page.getByRole("button", { name: "일본어 음성 정지" })).toBeVisible();
    }
  });
}
