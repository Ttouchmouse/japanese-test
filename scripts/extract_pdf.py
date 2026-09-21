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

# The book prints readings for proper names and places in kana immediately
# before the Korean translation. Keep those readings as study metadata and
# render the Korean translation as natural Korean instead of dropping the
# subject while splitting the bilingual line.
KANA_TO_KOREAN = {
    "たけうち": "다케우치",
    "なかむら": "나카무라",
    "なかやま": "나카야마",
    "はしもと": "하시모토",
    "とうきょう": "도쿄",
    "きょうと": "교토",
    "おおさか": "오사카",
    "あすか": "아스카",
    "えぐち": "에구치",
    "かねこ": "가네코",
    "さとう": "사토",
    "さとる": "사토루",
    "しばた": "시바타",
    "しゅん": "슌",
    "すずき": "스즈키",
    "たむら": "다무라",
    "なかの": "나카노",
    "はらだ": "하라다",
    "まえだ": "마에다",
    "まなぶ": "마나부",
    "めぐみ": "메구미",
    "ゆうな": "유나",
    "わだ": "와다",
    "おの": "오노",
    "なら": "나라",
    "はら": "하라",
    "みか": "미카",
}

KANA_TO_SURFACE = {
    "たけうち": "竹内",
    "なかむら": "中村",
    "なかやま": "中山",
    "はしもと": "橋本",
    "とうきょう": "東京",
    "きょうと": "京都",
    "おおさか": "大阪",
    "あすか": "明日香",
    "えぐち": "江口",
    "かねこ": "金子",
    "さとう": "佐藤",
    "さとる": "悟",
    "しばた": "柴田",
    "しゅん": "駿",
    "すずき": "鈴木",
    "たむら": "田村",
    "なかの": "中野",
    "はらだ": "原田",
    "まえだ": "前田",
    "まなぶ": "学",
    "めぐみ": "恵",
    "ゆうな": "優奈",
    "わだ": "和田",
    "おの": "小野",
    "なら": "奈良",
    "はら": "原",
}


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


def localize_korean_readings(value: str) -> str:
    localized = normalize_korean(value)
    for kana in sorted(KANA_TO_KOREAN, key=len, reverse=True):
        localized = localized.replace(kana, KANA_TO_KOREAN[kana])
    for korean_name in set(KANA_TO_KOREAN.values()):
        localized = localized.replace(f"{korean_name}씨", f"{korean_name} 씨")
        localized = localized.replace(f"{korean_name} 씨(의)", f"{korean_name} 씨의")
        localized = localized.replace(f"{korean_name}(의)", f"{korean_name}의")
    return normalize_korean(localized)


def proper_noun_reading(japanese: str, raw_translation: str) -> str:
    readings: list[str] = []
    translation_tokens = set(re.findall(r"[ぁ-んー]+", raw_translation))
    for kana, surface in KANA_TO_SURFACE.items():
        if kana not in translation_tokens or surface not in japanese:
            continue
        label = f"{surface}({kana})"
        if label not in readings:
            readings.append(label)
    return " · ".join(readings)


def pattern_line_parts(line: dict[str, Any]) -> tuple[str, str]:
    """Separate 10.2pt Japanese source text from the smaller translation."""
    text = line_text(line)
    japanese = japanese_main_text(line)
    if not japanese:
        return "", text
    if text.startswith(japanese):
        return japanese, text[len(japanese) :].strip()
    hangul = HANGUL_RE.search(text)
    if hangul and re.sub(r"\s+", "", text[: hangul.start()]) == re.sub(r"\s+", "", japanese):
        return japanese, text[hangul.start() :].strip()
    return japanese, ""


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
        pending_japanese = ""
        pending_top: float | None = None

        def append_pair(japanese: str, raw_korean: str) -> None:
            japanese = normalize_japanese(japanese)
            punctuation = re.match(r"^([。？！?!]+)\s*", raw_korean)
            if punctuation:
                japanese = normalize_japanese(japanese + punctuation.group(1))
                raw_korean = raw_korean[punctuation.end() :]
            korean = localize_korean_readings(raw_korean)
            if not valid_sentence_pair(japanese, korean):
                return
            item: dict[str, Any] = {
                "id": stable_id("pattern", lesson_range.number, japanese, korean),
                "lessonId": lesson_range.number,
                "type": "pattern",
                "japanese": japanese,
                "korean": korean,
                "sourcePage": page_index + 1,
            }
            reading = proper_noun_reading(japanese, raw_korean)
            if reading:
                item["reading"] = reading
            items.append(item)

        for line in page_lines(page):
            if line["top"] < min_top or line["top"] > 585:
                continue
            top = float(line["top"])
            japanese, raw_korean = pattern_line_parts(line)

            if japanese and HANGUL_RE.search(raw_korean):
                pending_japanese = ""
                pending_top = None
                append_pair(japanese, raw_korean)
                continue

            if japanese:
                if pending_japanese and pending_top is not None and top - pending_top <= 16.5:
                    pending_japanese = normalize_japanese(pending_japanese + japanese)
                else:
                    pending_japanese = japanese
                pending_top = top
                continue

            if (
                pending_japanese
                and pending_top is not None
                and top - pending_top <= 16.5
                and HANGUL_RE.search(raw_korean)
            ):
                append_pair(pending_japanese, raw_korean)
                pending_japanese = ""
                pending_top = None
            elif pending_top is not None and top - pending_top > 16.5:
                pending_japanese = ""
                pending_top = None
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


# A few compact pages continue pattern rows above the conversation section or
# print Korean dialogue translations in two interleaved columns. PDF text
# extraction cannot recover that reading order reliably, so preserve the
# verified textbook pairs here. Existing item IDs stay unchanged when only the
# Korean text is corrected; newly recovered source items receive stable IDs.
KNOWN_KOREAN_CORRECTIONS = {
    (22, "vocabulary", "行って来る"): "갔다 오다, 다녀오다",
    (22, "conversation", "チャンミンさん、いつまた日本へ来ますか。"): "창민 씨, 언제 또 일본에 와요?",
    (22, "conversation", "来月です。来月は母を連れて来ます。"): "다음 달이요. 다음 달에는 어머니를 데려와요.",
    (22, "conversation", "絵美さんはキムチが好きですか。韓国のキムチはおいしいですよ。"): "에미 씨는 김치를 좋아해요? 한국 김치는 맛있어요.",
    (22, "conversation", "そうですか。でも、私はキムチはちょっと苦手です。"): "그래요. 그런데 저는 김치는 좀 잘 못 먹어요.",
    (22, "conversation", "じゃ、のりはどうですか。"): "그럼, 김은 어때요?",
    (22, "conversation", "韓国ののりはとても好きです。"): "한국 김은 무척 좋아해요.",
    (22, "conversation", "じゃ、のりを持って来ますね。"): "그럼, 김을 가져올게요.",
    (22, "conversation", "ありがとうございます。"): "고마워요.",
    (22, "conversation", "じゃ、また連絡します。"): "그럼, 또 연락할게요.",
    (22, "conversation", "じゃ、お気を付けて。"): "그럼, 조심히 갔다 오세요.",
    (23, "vocabulary", "お土産"): "(여행지 등에서 사 오는) 기념 선물",
    (
        23,
        "conversation",
        "そう?じゃ、あのお店に行く!何がいいかなぁ......。これ、かわいい!",
    ): "그래? 그럼 저 가게에 갈래! (가게에 들어가서) 뭐가 좋을까...... 이거 예쁘다!",
    (
        28,
        "conversation",
        "コンサートは8時からですから、一緒に晩ご飯も食べませんか。",
    ): "콘서트는 8시부터니까, 같이 저녁도 먹지 않을래요?",
    (
        29,
        "conversation",
        "それから......レポートを書く前に吸うことがある。",
    ): "그리고...... 리포트를 쓰기 전에 피우는 경우가 있어.",
}

KNOWN_JAPANESE_CORRECTIONS = {
    (28, "vocabulary", "ある 5"): "ある",
    (29, "vocabulary", "弾く 5"): "弾く",
    (29, "vocabulary", "吸う 5"): "吸う",
    (30, "vocabulary", "歌う 5"): "歌う",
}

KNOWN_MISSING_ITEMS = {
    20: [
        {
            "after": "じゃ、明後日は?",
            "type": "conversation",
            "japanese": "いいですよ。石田さんも一緒にどうですか。",
            "korean": "좋아요. 이시다 씨도 같이 보는 게 어때요? (이시다 씨도 함께 어때요?)",
            "sourcePage": 63,
        },
        {
            "after": "いいですよ。石田さんも一緒にどうですか。",
            "type": "conversation",
            "japanese": "え?石田さんもですか。",
            "korean": "에? 이시다 씨도요?",
            "sourcePage": 63,
        },
    ],
    21: [
        {
            "after": "ううん、持って来る。",
            "type": "pattern",
            "japanese": "うん、しない。",
            "korean": "응, 안 해.",
            "sourcePage": 66,
        },
        {
            "after": "うん、しない。",
            "type": "pattern",
            "japanese": "ううん、よくする。",
            "korean": "아니, 자주 해.",
            "sourcePage": 66,
        },
        {
            "after": "へえ、ヘアモデル。",
            "type": "conversation",
            "japanese": "祐介もヘアモデルする?",
            "korean": "유스케도 헤어모델 할래?",
            "sourcePage": 66,
        },
    ],
    22: [
        {
            "after": "今月",
            "type": "vocabulary",
            "japanese": "来月",
            "reading": "らいげつ",
            "korean": "다음 달",
            "sourcePage": 67,
        },
        {
            "after": "いいえ、父も連れて来ます。",
            "type": "pattern",
            "japanese": "はい、しません。",
            "korean": "네, 안 해요.",
            "sourcePage": 69,
        },
        {
            "after": "はい、しません。",
            "type": "pattern",
            "japanese": "いいえ、します。",
            "korean": "아니요, 할 거예요.",
            "sourcePage": 69,
        },
        {
            "after": "来月です。来月は母を連れて来ます。",
            "type": "conversation",
            "japanese": "そうですか。",
            "korean": "그렇군요.",
            "sourcePage": 69,
        },
    ],
    25: [
        {
            "before": "そう。",
            "type": "conversation",
            "japanese": "ここが大阪城?桜がきれい!",
            "korean": "여기가 오사카성이야? 벚꽃이 예쁘다!",
            "sourcePage": 78,
        },
        {
            "after": "ここが大阪城?桜がきれい!",
            "type": "conversation",
            "japanese": "大阪城は桜が有名なんだ。",
            "korean": "오사카성은 벚꽃이 유명하거든.",
            "sourcePage": 78,
        },
        {
            "after": "はい、チーズ!",
            "id": "l25-c-791637fcfb8b",
            "type": "conversation",
            "japanese": "竜也も写真撮らない?",
            "korean": "류야도 사진 찍지 않을래?",
            "sourcePage": 78,
        },
        {
            "after": "撮らないの?",
            "type": "conversation",
            "japanese": "うん、撮らない。そこのお店でちょっと休まない?",
            "korean": "응, 안 찍을래. 거기 있는 가게에서 잠깐 쉬지 않을래?",
            "sourcePage": 78,
        },
    ],
    26: [
        {
            "after": "あ、こんにちは。",
            "type": "conversation",
            "japanese": "今日、真奈美に飴を渡しますか。",
            "korean": "오늘, 마나미에게 사탕을 줄 거예요?",
            "sourcePage": 81,
        },
        {
            "after": "渡さないんですか。",
            "type": "conversation",
            "japanese": "ええ。僕は真奈美さんが好きじゃありません。",
            "korean": "네. 나는 마나미 씨를 좋아하지 않아요.",
            "sourcePage": 81,
        },
    ],
    27: [
        {
            "after": "本当?!おめでとう!",
            "type": "conversation",
            "japanese": "恵子は結婚しないつもり?",
            "korean": "게이코는 결혼하지 않을 생각이야?",
            "sourcePage": 84,
        },
    ],
    28: [
        {
            "after": "イェウンさん、今度の日曜日、何をしますか。",
            "type": "conversation",
            "japanese": "うちでゆっくり休むつもりです。森さんは?",
            "korean": "집에서 푹 쉴 생각이에요. 모리 씨는요?",
            "sourcePage": 87,
        },
    ],
    29: [
        {
            "after": "ギター",
            "type": "vocabulary",
            "japanese": "シャワー",
            "korean": "샤워",
            "sourcePage": 88,
        },
        {
            "after": "たばこ",
            "type": "vocabulary",
            "japanese": "外",
            "reading": "そと",
            "korean": "밖, 바깥",
            "sourcePage": 88,
        },
        {
            "before": "うん。よく吸うよ。",
            "type": "conversation",
            "japanese": "あれ?雄太、たばこ吸うの?",
            "korean": "어라? 유타, 담배 피우는 거야?",
            "sourcePage": 90,
        },
    ],
    30: [
        {
            "after": "そうですか。いいですね。",
            "type": "conversation",
            "japanese": "遠藤さんは何で行きますか。",
            "korean": "엔도 씨는 뭘 타고(뭘로) 갑니까?",
            "sourcePage": 93,
        },
    ],
}


def apply_known_corrections(lesson: int, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    corrected = [dict(item) for item in items]
    for item in corrected:
        correction_key = (lesson, item["type"], item["japanese"])
        korean = KNOWN_KOREAN_CORRECTIONS.get(correction_key)
        if korean:
            item["korean"] = korean
        japanese = KNOWN_JAPANESE_CORRECTIONS.get(correction_key)
        if japanese:
            item["japanese"] = japanese

    for missing in KNOWN_MISSING_ITEMS.get(lesson, []):
        if any(
            item["type"] == missing["type"] and item["japanese"] == missing["japanese"]
            for item in corrected
        ):
            continue
        new_item = {
            "id": missing.get(
                "id",
                stable_id(missing["type"], lesson, missing["japanese"], missing["korean"]),
            ),
            "lessonId": lesson,
            "type": missing["type"],
            "japanese": missing["japanese"],
            "korean": missing["korean"],
            "sourcePage": missing["sourcePage"],
        }
        if missing.get("reading"):
            new_item["reading"] = missing["reading"]
        if missing.get("before"):
            insert_at = next(
                (
                    index
                    for index, item in enumerate(corrected)
                    if item["type"] == missing["type"]
                    and item["japanese"] == missing["before"]
                ),
                len(corrected),
            )
        else:
            insert_at = next(
                (
                    index + 1
                    for index, item in enumerate(corrected)
                    if item["type"] == missing["type"]
                    and item["japanese"] == missing["after"]
                ),
                len(corrected),
            )
        corrected.insert(insert_at, new_item)
    from reviewed_lessons_31_40 import apply_reviewed_corrections

    return apply_reviewed_corrections(lesson, corrected, stable_id)


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
            items = apply_known_corrections(
                lesson_range.number,
                dedupe_lesson_items(vocabulary + patterns + conversation),
            )
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
        "version": 2,
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
