#!/usr/bin/env python3
"""Extract the fixed textbook into a deterministic quiz bank.

The script is intentionally kept out of the runtime app. It reads the source
PDF during development and writes only structured lesson data to the client.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import pdfplumber


HANGUL_RE = re.compile(r"[가-힣]")
JAPANESE_RE = re.compile(r"[ぁ-んァ-ヶ一-龯々〆ヵヶ]")
KANA_RE = re.compile(r"[ぁ-んァ-ヶ]")
CIRCLED_RE = re.compile(r"[①②③④⑤⑥⑦⑧⑨⑩⓪❶❷❸❹❺❻❼❽❾❿]")
BRACKET_READING_RE = re.compile(r"\[([^\]]+)\]")
SPACE_RE = re.compile(r"\s+")
LEADING_STAGE_RE = re.compile(r"^\([^)]*\)\s*")
KOREAN_STAGE_RE = re.compile(r"\([^)]*[가-힣][^)]*\)")


@dataclass(frozen=True)
class LessonRange:
    number: int
    start_index: int
    end_index: int


def normalize_space(value: str) -> str:
    return SPACE_RE.sub(" ", unicodedata.normalize("NFKC", value)).strip()


def normalize_japanese(value: str) -> str:
    value = normalize_space(value)
    value = re.sub(r"\s+([。、！？?!])", r"\1", value)
    return value


def normalize_korean(value: str) -> str:
    value = normalize_space(value)
    return re.sub(r"\s+([.,!?。！？])", r"\1", value)


def stable_id(kind: str, lesson: int, japanese: str, korean: str) -> str:
    raw = f"{kind}|{lesson}|{normalize_space(japanese)}|{normalize_space(korean)}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"l{lesson:02d}-{kind[:1]}-{digest}"


def page_lines(page: Any) -> list[dict[str, Any]]:
    return page.extract_text_lines(strip=True, return_chars=True) or []


def line_text(line: dict[str, Any]) -> str:
    return normalize_space(line.get("text", ""))


def has_text(page: Any, needle: str) -> bool:
    return needle in (page.extract_text() or "")


def find_lesson_ranges(pdf: Any) -> list[LessonRange]:
    starts: list[tuple[int, int]] = []
    for index, page in enumerate(pdf.pages):
        if not has_text(page, "1단계 : 기본 단어 익히기"):
            continue
        top_line = next(
            (line_text(line) for line in page_lines(page) if line["top"] < 45 and re.match(r"^\d{1,2}\b", line_text(line))),
            "",
        )
        match = re.match(r"^(\d{1,2})\b", top_line)
        if not match:
            raise ValueError(f"Could not identify lesson number on PDF page {index + 1}")
        starts.append((int(match.group(1)), index))

    ranges: list[LessonRange] = []
    for position, (number, start) in enumerate(starts):
        end = starts[position + 1][1] - 1 if position + 1 < len(starts) else len(pdf.pages) - 1
        ranges.append(LessonRange(number=number, start_index=start, end_index=end))
    return ranges


def lesson_metadata(page: Any, number: int) -> tuple[str, str]:
    title_parts: list[str] = []
    for line in page_lines(page):
        if line["top"] > 108 or line["top"] < 42:
            continue
        chars = [
            char.get("text", "")
            for char in line.get("chars", [])
            if float(char.get("size", 0)) >= 14 and not HANGUL_RE.search(char.get("text", ""))
        ]
        text = normalize_space("".join(chars))
        if line["x0"] > 285 or not JAPANESE_RE.search(text):
            continue
        if "本책" in text or "본책" in text:
            continue
        title_parts.append(text.replace(" ", ""))

    title = "".join(title_parts)
    if not title:
        title = f"{number}과"
    page_text = page.extract_text() or ""
    speech_level = "반말" if "반말" in page_text else "존댓말" if "존댓말" in page_text else ""
    return title, speech_level


def header_top(page: Any, needle: str) -> float | None:
    for line in page_lines(page):
        if needle in line_text(line):
            return float(line["top"])
    return None


def exact_header_top(page: Any, needle: str) -> float | None:
    for line in page_lines(page):
        if line_text(line) == needle:
            return float(line["top"])
    return None


def split_vocab_text(line: dict[str, Any]) -> tuple[str, str] | None:
    text = line_text(line)
    if not text:
        return None
    hangul = HANGUL_RE.search(text)
    if hangul:
        return text[: hangul.start()].strip(), text[hangul.start() :].strip()

    # A handful of definitions are Latin abbreviations such as "PC". In the
    # source file the Japanese term is set at 8.2-10.2pt and the meaning at 6.8pt.
    large: list[str] = []
    small: list[str] = []
    for char in line.get("chars", []):
        target = large if float(char.get("size", 0)) >= 7.8 else small
        target.append(char.get("text", ""))
    term = "".join(large).strip()
    meaning = "".join(small).strip()
    return (term, meaning) if term and meaning else None


def parse_vocab_pair(raw_term: str, raw_meaning: str) -> tuple[str, str, str] | None:
    term = normalize_space(raw_term)
    meaning = normalize_korean(raw_meaning)
    reading_match = BRACKET_READING_RE.search(term)
    reading = normalize_space(reading_match.group(1)) if reading_match else ""
    term = BRACKET_READING_RE.sub("", term)
    term = CIRCLED_RE.sub("", term)
    if term.rstrip().endswith("("):
        term = term.rstrip()[:-1]
        meaning = "(" + meaning
    term = re.sub(r"\s+[15]$", "", term)
    term = normalize_japanese(term)
    meaning = CIRCLED_RE.sub("", meaning).strip()
    if not term or not meaning or not (JAPANESE_RE.search(term) or re.search(r"[A-Za-z]", term)):
        return None
    return term, reading, meaning


def extract_basic_vocabulary(page: Any, lesson: int, source_page: int) -> list[dict[str, Any]]:
    first = header_top(page, "1단계 : 기본 단어 익히기")
    second = header_top(page, "2단계 : 기본 문형 익히기")
    if first is None or second is None:
        return []

    items: list[dict[str, Any]] = []
    for left, right in ((70, 215), (215, 365)):
        crop = page.crop((left, first + 16, right, second - 4))
        for line in crop.extract_text_lines(strip=True, return_chars=True) or []:
            split = split_vocab_text(line)
            if not split:
                continue
            parsed = parse_vocab_pair(*split)
            if not parsed:
                continue
            japanese, reading, korean = parsed
            items.append(
                {
                    "id": stable_id("vocabulary", lesson, japanese, korean),
                    "lessonId": lesson,
                    "type": "vocabulary",
                    "japanese": japanese,
                    "reading": reading,
                    "korean": korean,
                    "sourcePage": source_page,
                }
            )
    return items


def split_bilingual_line(text: str) -> tuple[str, str] | None:
    match = HANGUL_RE.search(text)
    if not match:
        return None
    japanese = normalize_japanese(text[: match.start()])
    korean = normalize_korean(text[match.start() :])
    if japanese.rstrip().endswith("("):
        japanese = japanese.rstrip()[:-1].rstrip()
        korean = "(" + korean
    japanese = re.sub(r"([。？！?!])\s+[ぁ-んー\s]+$", r"\1", japanese)
    return (japanese, korean) if japanese and korean else None


def valid_sentence_pair(japanese: str, korean: str) -> bool:
    blocked = ("단계", "예문", "본책", ".mp3")
    if any(token in japanese or token in korean for token in blocked):
        return False
    if "~" in japanese or "～" in japanese:
        return False
    if re.match(r"^[0-9①-⑩]", japanese):
        return False
    if not JAPANESE_RE.search(japanese) or not HANGUL_RE.search(korean):
        return False
    if KANA_RE.search(korean):
        return False
    if len(japanese) > 90 or len(korean) > 120:
        return False
    return True


def extract_patterns(
    pdf: Any,
    lesson_range: LessonRange,
    conversation_index: int,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for page_index in range(lesson_range.start_index, conversation_index):
        page = pdf.pages[page_index]
        start = header_top(page, "2단계 : 기본 문형 익히기")
        min_top = (start + 16) if start is not None else 42
        for line in page_lines(page):
            if line["top"] < min_top or line["top"] > 585:
                continue
            pair = split_bilingual_line(line_text(line))
            if not pair:
                continue
            japanese, korean = pair
            if not valid_sentence_pair(japanese, korean):
                continue
            items.append(
                {
                    "id": stable_id("pattern", lesson_range.number, japanese, korean),
                    "lessonId": lesson_range.number,
                    "type": "pattern",
                    "japanese": japanese,
                    "korean": korean,
                    "sourcePage": page_index + 1,
                }
            )
    return items


def japanese_main_text(line: dict[str, Any]) -> str:
    chars = [c.get("text", "") for c in line.get("chars", []) if float(c.get("size", 0)) >= 9.2]
    return normalize_japanese(KOREAN_STAGE_RE.sub("", "".join(chars)))


def extract_japanese_turns(page: Any, dialogue_top: float) -> tuple[list[str], float | None]:
    turns: list[str] = []
    last_main_top: float | None = None
    for line in page_lines(page):
        if line["top"] <= dialogue_top or line["top"] > 575:
            continue
        main = japanese_main_text(line)
        if not main or (not JAPANESE_RE.search(main) and not re.fullmatch(r"[.…。!?！？]+", main)):
            continue
        last_main_top = float(line["top"])
        if ":" in line_text(line) or not turns:
            turns.append(main)
        else:
            turns[-1] = normalize_japanese(turns[-1] + main)
    return turns, last_main_top


def split_translation_records(lines: Iterable[tuple[float, str]]) -> list[tuple[float, str]]:
    turns: list[tuple[float, str]] = []
    for top, raw in lines:
        text = normalize_space(raw)
        if not text or re.fullmatch(r"\d{3}", text):
            continue
        if ":" in text:
            _, translation = text.split(":", 1)
            translation = normalize_korean(LEADING_STAGE_RE.sub("", translation))
            if translation:
                turns.append((top, translation))
        elif turns:
            start_top, previous = turns[-1]
            turns[-1] = (start_top, normalize_korean(previous + " " + text))
    return turns


def detect_translation_column_split(page: Any, top: float) -> float:
    """Find the right-hand speaker column without clipping long left translations."""
    words = [
        word
        for word in (page.extract_words() or [])
        if float(word["top"]) >= top and float(word["top"]) < 590
    ]
    rows: list[list[dict[str, Any]]] = []
    for word in sorted(words, key=lambda item: (float(item["top"]), float(item["x0"]))):
        if not rows or abs(float(rows[-1][0]["top"]) - float(word["top"])) > 2:
            rows.append([word])
        else:
            rows[-1].append(word)

    right_starts: list[float] = []
    for row in rows:
        ordered = sorted(row, key=lambda item: float(item["x0"]))
        colon_indexes = [index for index, word in enumerate(ordered) if ":" in str(word["text"])]
        if len(colon_indexes) < 2:
            continue
        second_colon = colon_indexes[1]
        candidate_gaps: list[tuple[float, int]] = []
        for index in range(1, second_colon + 1):
            gap = float(ordered[index]["x0"]) - float(ordered[index - 1]["x1"])
            candidate_gaps.append((gap, index))
        if candidate_gaps:
            _, right_index = max(candidate_gaps)
            right_starts.append(float(ordered[right_index]["x0"]))

    if right_starts:
        return max(150, min(245, statistics.median(right_starts) - 2))
    return 185


def korean_translation_turns(page: Any, top: float) -> list[str]:
    full_lines = [
        (float(line["top"]), line_text(line))
        for line in page_lines(page)
        if line["top"] >= top and line["top"] < 590
    ]
    if any(text.count(":") >= 2 for _, text in full_lines):
        records: list[tuple[float, str]] = []
        split = detect_translation_column_split(page, top)
        for left, right in ((70, split), (split, 365)):
            crop = page.crop((left, top, right, 590))
            crop_lines = [
                (float(line["top"]), normalize_space(line.get("text", "")))
                for line in crop.extract_text_lines(strip=True) or []
            ]
            records.extend(split_translation_records(crop_lines))
        return [text for _, text in sorted(records, key=lambda record: record[0])]
    return [text for _, text in split_translation_records(full_lines)]


def extract_conversation(
    pdf: Any,
    lesson_range: LessonRange,
    conversation_index: int,
) -> tuple[list[dict[str, Any]], tuple[int, int]]:
    japanese_turns: list[str] = []
    korean_turns: list[str] = []
    translation_start_by_page: dict[int, float] = {}
    dialogue_started = False

    for page_index in range(conversation_index, lesson_range.end_index + 1):
        page = pdf.pages[page_index]
        dialogue_header = exact_header_top(page, "회화")
        if dialogue_header is not None:
            dialogue_started = True
        elif not dialogue_started:
            continue
        dialogue_top = (dialogue_header + 16) if dialogue_header is not None else 42
        turns, last_main = extract_japanese_turns(page, dialogue_top)
        japanese_turns.extend(turns)
        if last_main is not None:
            translation_start_by_page[page_index] = last_main + 24
        else:
            translation_start_by_page[page_index] = dialogue_top

    for page_index in translation_start_by_page:
        page = pdf.pages[page_index]
        korean_turns.extend(korean_translation_turns(page, translation_start_by_page[page_index]))

    count = min(len(japanese_turns), len(korean_turns))
    items: list[dict[str, Any]] = []
    for index in range(count):
        japanese = normalize_japanese(japanese_turns[index])
        korean = normalize_korean(LEADING_STAGE_RE.sub("", korean_turns[index]))
        if not valid_sentence_pair(japanese, korean):
            continue
        items.append(
            {
                "id": stable_id("conversation", lesson_range.number, japanese, korean),
                "lessonId": lesson_range.number,
                "type": "conversation",
                "japanese": japanese,
                "korean": korean,
                "sourcePage": conversation_index + 1,
            }
        )
    return items, (len(japanese_turns), len(korean_turns))


def find_conversation_page(pdf: Any, lesson_range: LessonRange) -> int:
    for page_index in range(lesson_range.start_index, lesson_range.end_index + 1):
        if has_text(pdf.pages[page_index], "3단계 : 회화로 다지기"):
            return page_index
    raise ValueError(f"Conversation section not found for lesson {lesson_range.number}")


def dedupe_lesson_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    result: list[dict[str, Any]] = []
    for item in items:
        key = (
            item["type"],
            normalize_space(item["japanese"]).lower(),
            normalize_space(item["korean"]).lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def extract(source: Path) -> dict[str, Any]:
    lessons: list[dict[str, Any]] = []
    mismatch_report: list[dict[str, int]] = []
    with pdfplumber.open(source) as pdf:
        ranges = find_lesson_ranges(pdf)
        for lesson_range in ranges:
            start_page = pdf.pages[lesson_range.start_index]
            title, speech_level = lesson_metadata(start_page, lesson_range.number)
            conversation_index = find_conversation_page(pdf, lesson_range)
            vocabulary = extract_basic_vocabulary(
                start_page,
                lesson_range.number,
                lesson_range.start_index + 1,
            )
            patterns = extract_patterns(pdf, lesson_range, conversation_index)
            conversation, counts = extract_conversation(pdf, lesson_range, conversation_index)
            if counts[0] != counts[1]:
                mismatch_report.append(
                    {"lesson": lesson_range.number, "japaneseTurns": counts[0], "koreanTurns": counts[1]}
                )
            items = dedupe_lesson_items(vocabulary + patterns + conversation)
            lessons.append(
                {
                    "id": lesson_range.number,
                    "title": title,
                    "speechLevel": speech_level,
                    "startPage": lesson_range.start_index + 1,
                    "endPage": lesson_range.end_index + 1,
                    "items": items,
                }
            )

    return {
        "version": 1,
        "title": "일본어 무작정 따라하기 완전판",
        "lessons": lessons,
        "diagnostics": {"conversationTurnMismatches": mismatch_report},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    payload = extract(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    item_counts = {"vocabulary": 0, "pattern": 0, "conversation": 0}
    for lesson in payload["lessons"]:
        for item in lesson["items"]:
            item_counts[item["type"]] += 1
    print(f"Extracted {len(payload['lessons'])} lessons: {item_counts}")
    mismatches = payload["diagnostics"]["conversationTurnMismatches"]
    print(f"Conversation turn mismatches: {len(mismatches)}")
    if mismatches:
        print(json.dumps(mismatches, ensure_ascii=False))


if __name__ == "__main__":
    main()
