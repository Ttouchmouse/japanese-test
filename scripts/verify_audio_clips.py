#!/usr/bin/env python3
"""Independently transcribe generated clips and compare them with study items."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

from faster_whisper import WhisperModel
from pykakasi import kakasi
from build_audio_cues import alignment_text


KAKASI = kakasi()


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = "".join(part["hira"] for part in KAKASI.convert(value))
    return "".join(char.lower() for char in value if char.isalnum() or "ぁ" <= char <= "ヿ")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--bank", type=Path, default=Path("src/data/question-bank.json"))
    parser.add_argument("--manifest", type=Path, default=Path("src/data/audio-cues.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--lessons", default="25-30")
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--item-ids", default="")
    parser.add_argument("--cache-dir", type=Path, default=Path("/private/tmp/japanese-clip-verification"))
    args = parser.parse_args()

    first_lesson, last_lesson = (int(value) for value in args.lessons.split("-", 1))
    bank = json.loads(args.bank.read_text(encoding="utf-8"))
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    items = {
        item["id"]: item
        for lesson in bank["lessons"]
        if first_lesson <= lesson["id"] <= last_lesson
        for item in lesson["items"]
    }
    selected_ids = {value.strip() for value in args.item_ids.split(",") if value.strip()}
    cues = [
        cue
        for cue in manifest["cues"]
        if cue["sourceItemId"] in items
        and (not selected_ids or cue["sourceItemId"] in selected_ids)
    ]
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=8)

    results = []
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    for index, cue in enumerate(cues, 1):
        item = items[cue["sourceItemId"]]
        audio_path = args.root / "public" / cue["src"].lstrip("/")
        signature = hashlib.sha256(audio_path.read_bytes() + item["japanese"].encode() + args.model.encode()).hexdigest()
        cached = args.cache_dir / f"{signature}.json"
        if cached.exists():
            result = json.loads(cached.read_text(encoding="utf-8"))
            result["score"] = round(SequenceMatcher(None, normalize(alignment_text(item)), normalize(result["heard"])).ratio(), 3)
            results.append(result)
            continue
        segments, _ = model.transcribe(
            str(audio_path),
            language="ja",
            beam_size=5,
            word_timestamps=True,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        segment_list = list(segments)
        heard = "".join(segment.text.strip() for segment in segment_list)
        words = [word for segment in segment_list for word in (segment.words or [])]
        score = SequenceMatcher(None, normalize(alignment_text(item)), normalize(heard)).ratio()
        results.append(
            {
                "lesson": item["lessonId"],
                "type": item["type"],
                "sourceItemId": item["id"],
                "target": item["japanese"],
                "heard": heard,
                "score": round(score, 3),
                "speechStart": round(words[0].start, 3) if words else None,
                "speechEnd": round(words[-1].end, 3) if words else None,
                "clipDuration": round(cue["end"] - cue["start"], 3),
            }
        )
        cached.write_text(json.dumps(results[-1], ensure_ascii=False), encoding="utf-8")
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if index % 20 == 0 or index == len(cues):
            print(f"verified {index}/{len(cues)}", flush=True)

    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    flagged = [result for result in results if result["score"] < 0.88]
    print(f"complete: {len(results)} clips, {len(flagged)} below 0.88", flush=True)
    for result in flagged:
        print(
            f"{result['sourceItemId']} {result['score']:.3f} "
            f"{result['target']} => {result['heard']}",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
