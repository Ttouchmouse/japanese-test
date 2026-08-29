#!/usr/bin/env python3
"""Build per-question audio clips from the book's lesson MP3 files.

The source tracks have a stable layout:

* ``NN-2.mp3``: vocabulary
* ``NN-3.mp3``: patterns
* ``NN-4-1.mp3``: conversation

The script uses the book audio's repeated item structure for vocabulary and
patterns, and local speech recognition for conversation tracks. It aligns the
Japanese utterances with ``question-bank.json`` in lesson order, exports small
MP3 clips, and writes the audio cue manifest consumed by the app. Conversation
transcripts are cached outside the repository by default so extending the
lesson range does not repeat ASR work.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable, Sequence

from pykakasi import kakasi


TYPE_TRACK = {
    "vocabulary": "2",
    "pattern": "3",
    "conversation": "4-1",
}
MANUAL_CUES = {
    # These dialogue lines contain a long intentional pause or a very short
    # greeting that word-level ASR cannot reliably span.
    "l08-c-68738268b8f7": ("08-4-1.mp3", 292.36, 297.84),
    "l15-c-a734c420176f": ("15-4-1.mp3", 63.90, 64.30),
    "l19-c-389153d135b9": ("19-4-1.mp3", 56.90, 62.66),
    "l22-c-2e439a12d825": ("22-4-1.mp3", 282.58, 284.10),
    "l23-c-32d0785d0fff": ("23-4-1.mp3", 236.22, 236.96),
    "l23-c-7ac6d3d94b47": ("23-4-1.mp3", 239.26, 240.44),
    "l23-c-3381661ce912": ("23-4-1.mp3", 242.78, 251.14),
    "l23-c-188fe8d99814": ("23-4-1.mp3", 256.90, 259.78),
}
JAPANESE_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff々〆ヶー0-9A-Za-z]")
HANGUL_RE = re.compile(r"[\uac00-\ud7af]")
KAKASI = kakasi()


@dataclass(frozen=True)
class Word:
    start: float
    end: float
    text: str
    probability: float


@dataclass(frozen=True)
class Candidate:
    start: float
    end: float
    score: float
    transcript: str


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    # Compare by reading so kana and kanji spellings such as まじめ/真面目 match.
    value = "".join(part["hira"] for part in KAKASI.convert(value))
    chars: list[str] = []
    for char in value:
        code = ord(char)
        if 0x30A1 <= code <= 0x30F6:
            char = chr(code - 0x60)
        if JAPANESE_RE.match(char):
            chars.append(char.lower())
    return "".join(chars)


def load_question_bank(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def source_track(source_dir: Path, lesson_id: int, item_type: str) -> Path:
    path = source_dir / f"{lesson_id:02d}-{TYPE_TRACK[item_type]}.mp3"
    if not path.exists():
        raise FileNotFoundError(f"Missing source audio: {path}")
    return path


def transcript_cache_path(cache_dir: Path, audio_path: Path, model_name: str) -> Path:
    signature = f"{audio_path.resolve()}:{audio_path.stat().st_size}:{audio_path.stat().st_mtime_ns}:{model_name}"
    digest = hashlib.sha256(signature.encode()).hexdigest()[:16]
    return cache_dir / f"{audio_path.stem}-{digest}.json"


def transcribe(
    model,
    audio_path: Path,
    cache_dir: Path,
    model_name: str,
) -> list[Word]:
    cache_path = transcript_cache_path(cache_dir, audio_path, model_name)
    if cache_path.exists():
        with cache_path.open(encoding="utf-8") as handle:
            return [Word(**word) for word in json.load(handle)["words"]]

    segments, _ = model.transcribe(
        str(audio_path),
        language="ja",
        beam_size=5,
        word_timestamps=True,
        vad_filter=False,
        condition_on_previous_text=False,
    )
    words: list[Word] = []
    for segment in segments:
        for word in segment.words or []:
            if word.start is None or word.end is None:
                continue
            words.append(
                Word(
                    start=round(float(word.start), 3),
                    end=round(float(word.end), 3),
                    text=word.word.strip(),
                    probability=round(float(word.probability), 4),
                )
            )

    cache_dir.mkdir(parents=True, exist_ok=True)
    with cache_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {"audio": audio_path.name, "model": model_name, "words": [asdict(word) for word in words]},
            handle,
            ensure_ascii=False,
            indent=2,
        )
        handle.write("\n")
    return words


def structured_utterance_groups(audio_path: Path) -> list[list[tuple[float, float]]]:
    """Split the book's vocabulary/pattern track into item and utterance groups."""
    duration = float(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nw=1:nk=1",
                str(audio_path),
            ],
            text=True,
        ).strip()
    )
    process = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(audio_path),
            "-af",
            "silencedetect=noise=-35dB:d=0.22",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    silence_start: float | None = None
    silences: list[tuple[float, float, float]] = []
    for line in process.stderr.splitlines():
        start_match = re.search(r"silence_start: ([0-9.]+)", line)
        if start_match:
            silence_start = float(start_match.group(1))
        end_match = re.search(
            r"silence_end: ([0-9.]+) \| silence_duration: ([0-9.]+)",
            line,
        )
        if end_match and silence_start is not None:
            silences.append(
                (silence_start, float(end_match.group(1)), float(end_match.group(2)))
            )
            silence_start = None

    groups: list[list[tuple[float, float]]] = []
    utterances: list[tuple[float, float]] = []
    utterance_start: float | None = None
    utterance_end: float | None = None
    position = 0.0
    for start, end, silence_duration in silences:
        if start - position > 0.05:
            if utterance_start is None:
                utterance_start = position
            utterance_end = start
        if silence_duration >= 0.65 and utterance_start is not None and utterance_end is not None:
            utterances.append((utterance_start, utterance_end))
            utterance_start = None
            utterance_end = None
        if silence_duration >= 2.0 and utterances:
            groups.append(utterances)
            utterances = []
        position = end
    if duration - position > 0.05:
        if utterance_start is None:
            utterance_start = position
        utterance_end = duration
    if utterance_start is not None and utterance_end is not None:
        utterances.append((utterance_start, utterance_end))
    if utterances:
        groups.append(utterances)
    return groups


def japanese_runs(words: Sequence[Word], cursor: float) -> list[list[Word]]:
    """Return Japanese-only word runs after cursor without crossing Korean narration."""
    runs: list[list[Word]] = []
    current: list[Word] = []
    previous_end: float | None = None
    for word in words:
        if word.end <= cursor:
            continue
        text = normalize(word.text)
        is_barrier = not text or bool(HANGUL_RE.search(word.text))
        has_long_gap = previous_end is not None and word.start - previous_end > 1.15
        if is_barrier:
            if current:
                runs.append(current)
                current = []
            previous_end = word.end
            continue
        if has_long_gap and current:
            runs.append(current)
            current = []
        current.append(word)
        previous_end = word.end
    if current:
        runs.append(current)
    return runs


def candidate_windows(run: Sequence[Word], target: str) -> Iterable[Candidate]:
    target_length = len(target)
    if not target_length:
        return
    for start_index in range(len(run)):
        raw_combined = ""
        transcript_parts: list[str] = []
        for end_index in range(start_index, min(len(run), start_index + target_length * 2 + 8)):
            word = run[end_index]
            raw_combined += word.text
            combined = normalize(raw_combined)
            if not combined:
                continue
            transcript_parts.append(word.text)
            if len(combined) < max(1, target_length // 2):
                continue
            if len(combined) > target_length * 2 + 5:
                break
            ratio = SequenceMatcher(None, target, combined).ratio()
            length_penalty = min(abs(len(combined) - target_length) / max(target_length, 1), 0.35)
            score = ratio - (length_penalty * 0.18)
            yield Candidate(
                start=run[start_index].start,
                end=word.end,
                score=score,
                transcript="".join(transcript_parts),
            )


def best_candidate(
    words: Sequence[Word],
    japanese: str,
    cursor: float,
    *,
    prefer_nearby: bool = False,
    max_start: float | None = None,
) -> Candidate:
    target = normalize(japanese)
    if not target:
        raise ValueError(f"Japanese text is empty after normalization: {japanese!r}")

    candidates: list[Candidate] = []
    for run in japanese_runs(words, cursor):
        candidates.extend(candidate_windows(run, target))
    if max_start is not None:
        candidates = [candidate for candidate in candidates if candidate.start <= max_start]
    if not candidates:
        raise ValueError(f"No Japanese speech found after {cursor:.2f}s for {japanese}")

    best_score = max(candidate.score for candidate in candidates)
    # Conversation turns should remain in the same dialogue block even when ASR
    # scores a later repetition slightly higher. Isolated vocabulary and pattern
    # tracks can use the closest-to-perfect occurrence instead.
    tolerance = 0.15 if prefer_nearby else 0.025
    threshold = min(best_score, max(0.80, best_score - tolerance))
    near_best = [candidate for candidate in candidates if candidate.score >= threshold]
    if prefer_nearby:
        earliest_start = min(candidate.start for candidate in near_best)
        local = [candidate for candidate in near_best if candidate.start <= earliest_start + 1.5]
        return max(
            local,
            key=lambda candidate: (
                candidate.score,
                -(candidate.end - candidate.start),
                -candidate.start,
            ),
        )
    return min(near_best, key=lambda candidate: (candidate.start, -candidate.score, candidate.end))


def confidence_for(score: float) -> str:
    if score >= 0.92:
        return "high"
    if score >= 0.80:
        return "review"
    return "review"


def conversation_start(words: Sequence[Word], items: Sequence[dict]) -> Candidate:
    """Pick the first turn from the dialogue block that matches the most later turns."""
    target = normalize(items[0]["japanese"])
    first_candidates: list[Candidate] = []
    for run in japanese_runs(words, 0.0):
        first_candidates.extend(candidate_windows(run, target))
    if not first_candidates:
        raise ValueError(f"No conversation start found for {items[0]['japanese']}")

    best_first_score = max(candidate.score for candidate in first_candidates)
    credible = [
        candidate
        for candidate in first_candidates
        if candidate.score >= max(0.80, best_first_score - 0.15)
    ]
    # Remove near-identical windows so long repeated tracks remain inexpensive.
    unique: list[Candidate] = []
    for candidate in sorted(credible, key=lambda value: (value.start, -value.score, value.end)):
        if any(abs(candidate.start - existing.start) < 0.25 for existing in unique):
            continue
        unique.append(candidate)

    ranked: list[tuple[int, float, float, Candidate]] = []
    for first in unique:
        matched = 1
        total_score = first.score
        cursor = first.end + 0.01
        for item in items[1:]:
            try:
                candidate = best_candidate(
                    words,
                    item["japanese"],
                    cursor,
                    prefer_nearby=True,
                    max_start=cursor + 18.0,
                )
            except ValueError:
                continue
            if candidate.score < 0.80:
                continue
            matched += 1
            total_score += candidate.score
            cursor = candidate.end + 0.01
        ranked.append((matched, total_score, -first.start, first))
    if not ranked:
        raise ValueError(f"No credible conversation start found for {items[0]['japanese']}")
    return max(ranked, key=lambda value: value[:3])[3]


def export_clip(source: Path, destination: Path, start: float, end: float) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    padded_start = max(0.0, start - 0.15)
    padded_end = end + 0.15
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{padded_start:.3f}",
            "-to",
            f"{padded_end:.3f}",
            "-i",
            str(source),
            "-map_metadata",
            "-1",
            "-af",
            "aresample=44100,aformat=sample_fmts=s16:channel_layouts=mono",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "64k",
            str(destination),
        ],
        check=True,
    )


def parse_lessons(value: str) -> list[int]:
    lesson_ids: set[int] = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start, end = (int(number) for number in part.split("-", 1))
            lesson_ids.update(range(start, end + 1))
        else:
            lesson_ids.add(int(part))
    return sorted(lesson_ids)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--question-bank", type=Path, default=Path("src/data/question-bank.json"))
    parser.add_argument("--manifest", type=Path, default=Path("src/data/audio-cues.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("public/audio"))
    parser.add_argument("--cache-dir", type=Path, default=Path("/private/tmp/japanese-audio-transcripts"))
    parser.add_argument("--lessons", default="1-18")
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Install faster-whisper before running this script.", file=sys.stderr)
        return 2

    lesson_ids = parse_lessons(args.lessons)
    bank = load_question_bank(args.question_bank)
    lessons = {lesson["id"]: lesson for lesson in bank["lessons"]}
    missing = [lesson_id for lesson_id in lesson_ids if lesson_id not in lessons]
    if missing:
        raise ValueError(f"Lessons not present in question bank: {missing}")

    print(f"Loading local speech model: {args.model}", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=8)

    cues: list[dict] = []
    reviews: list[dict] = []
    for lesson_id in lesson_ids:
        lesson = lessons[lesson_id]
        print(f"Lesson {lesson_id}: {len(lesson['items'])} items", flush=True)
        by_type = {
            item_type: [item for item in lesson["items"] if item["type"] == item_type]
            for item_type in TYPE_TRACK
        }
        for item_type, items in by_type.items():
            if not items:
                continue
            track = source_track(args.source_dir, lesson_id, item_type)
            if item_type in {"vocabulary", "pattern"}:
                groups = structured_utterance_groups(track)
                for item_index, item in enumerate(items):
                    # Lesson 13's source track includes 中国語, which is not a
                    # standalone item in the extracted question bank.
                    group_index = item_index
                    if item_type == "vocabulary" and lesson_id == 13 and item_index >= 8:
                        group_index += 1
                    # Lesson 22 reads 来月 between 今月 and 母, but 来月 is not
                    # a standalone vocabulary item in the question bank.
                    if item_type == "vocabulary" and lesson_id == 22 and item_index >= 6:
                        group_index += 1
                    if group_index >= len(groups) or not groups[group_index]:
                        raise ValueError(
                            f"Audio structure mismatch in {track.name}: "
                            f"item {item_index + 1}, {len(groups)} groups"
                        )
                    start, end = groups[group_index][-1]
                    destination = (
                        args.output_dir / f"lesson-{lesson_id:02d}" / f"{item['id']}.mp3"
                    )
                    if not args.dry_run:
                        export_clip(track, destination, start, end)
                    cues.append(
                        {
                            "sourceItemId": item["id"],
                            "src": f"/audio/lesson-{lesson_id:02d}/{item['id']}.mp3",
                            "audioFile": track.name,
                            "start": round(max(0.0, start - 0.15), 2),
                            "end": round(end + 0.15, 2),
                            "confidence": "high",
                        }
                    )
                continue
            words = transcribe(model, track, args.cache_dir, args.model)
            transcript_by_track: dict[Path, list[Word]] = {track: words}
            cursor = 0.0
            for item_index, item in enumerate(items):
                max_gap = 18.0 if item_type == "conversation" else 26.0
                candidate: Candidate | None = None
                candidate_track = track
                matched_in_sequence = False
                sequence_error = ""
                manual = MANUAL_CUES.get(item["id"])
                if manual:
                    filename, start, end = manual
                    candidate_track = args.source_dir / filename
                    candidate = Candidate(start, end, 1.0, item["japanese"])
                    matched_in_sequence = True
                else:
                    try:
                        if item_type == "conversation" and item_index == 0:
                            candidate = conversation_start(words, items)
                        else:
                            candidate = best_candidate(
                                words,
                                item["japanese"],
                                cursor,
                                prefer_nearby=item_type == "conversation",
                                max_start=None if item_index == 0 else cursor + max_gap,
                            )
                    except ValueError as error:
                        sequence_error = str(error)
                if candidate is not None and candidate.score >= 0.80:
                    matched_in_sequence = True
                else:
                    # Recover only the unresolved item without moving the sequence
                    # cursor. Early vocabulary can live in NN-1 while the remaining
                    # list is in NN-2; other misses are often ASR gaps in a repeated
                    # track and can be found by a global exact match.
                    recovery_tracks = [track]
                    if item_type == "vocabulary":
                        early_track = args.source_dir / f"{lesson_id:02d}-1.mp3"
                        if early_track.exists():
                            recovery_tracks.append(early_track)
                    recovered: list[tuple[Candidate, Path]] = []
                    for recovery_track in recovery_tracks:
                        if recovery_track not in transcript_by_track:
                            transcript_by_track[recovery_track] = transcribe(
                                model,
                                recovery_track,
                                args.cache_dir,
                                args.model,
                            )
                        try:
                            recovery_candidate = best_candidate(
                                transcript_by_track[recovery_track],
                                item["japanese"],
                                0.0,
                            )
                        except ValueError:
                            continue
                        recovered.append((recovery_candidate, recovery_track))
                    if recovered:
                        candidate, candidate_track = max(
                            recovered,
                            key=lambda value: (
                                value[0].score,
                                -(value[0].end - value[0].start),
                                -value[0].start,
                            ),
                        )

                if candidate is None or candidate.score < 0.80:
                    reviews.append(
                        {
                            "lesson": lesson_id,
                            "type": item_type,
                            "sourceItemId": item["id"],
                            "japanese": item["japanese"],
                            "heard": candidate.transcript if candidate else "",
                            "score": round(candidate.score, 3) if candidate else 0,
                            "status": "missing",
                            "note": sequence_error,
                        }
                    )
                    continue
                confidence = confidence_for(candidate.score)
                destination = args.output_dir / f"lesson-{lesson_id:02d}" / f"{item['id']}.mp3"
                if not args.dry_run:
                    export_clip(candidate_track, destination, candidate.start, candidate.end)
                cue = {
                    "sourceItemId": item["id"],
                    "src": f"/audio/lesson-{lesson_id:02d}/{item['id']}.mp3",
                    "audioFile": candidate_track.name,
                    "start": round(max(0.0, candidate.start - 0.15), 2),
                    "end": round(candidate.end + 0.15, 2),
                    "confidence": confidence,
                }
                cues.append(cue)
                if confidence != "high":
                    reviews.append(
                        {
                            "lesson": lesson_id,
                            "type": item_type,
                            "sourceItemId": item["id"],
                            "japanese": item["japanese"],
                            "heard": candidate.transcript,
                            "score": round(candidate.score, 3),
                            "start": cue["start"],
                            "end": cue["end"],
                        }
                    )
                if matched_in_sequence:
                    cursor = candidate.end + 0.01

    manifest = {
        "version": 2,
        "lessons": lesson_ids,
        "cues": cues,
        "review": reviews,
    }
    if args.dry_run:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
    else:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        with args.manifest.open("w", encoding="utf-8") as handle:
            json.dump(manifest, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

    high_count = sum(cue["confidence"] == "high" for cue in cues)
    print(
        f"Completed {len(cues)} cues: {high_count} high confidence, "
        f"{len(reviews)} to review",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
