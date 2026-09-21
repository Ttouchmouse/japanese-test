"""Source-checked corrections: booklet PDF pages 94–124, lessons 31–40.

Keep existing IDs when repairing text, so saved learning history still applies.
Only shaded grammar headings (not example rows) are removed. New rows are
inserted at their printed position, which also matches the original MP3 order.
Name readings below come from the PDF's Korean translation, not a name guess.
"""

UPDATES = {
    (31, "降りる 1"): {"japanese": "降りる", "korean": "(버스, 전철 등에서) 내리다"},
    (32, "シムさん、目が赤いですよ。夕べ、遅く寝ましたか。"): {"korean": "심(근석)씨, 눈이 빨개요. 어젯밤에 늦게 잤어요?"},
    (33, "お兄さん"): {"korean": "형, 오빠(높이는 호칭)"},
    (34, "病院"): {"korean": "병원"},
    (34, "大阪"): {"korean": "오사카(지명)"},
    (34, "京都"): {"korean": "교토(지명)"},
    (34, "百貨店"): {"korean": "백화점"},
    (34, "姉さん"): {"japanese": "お姉さん"},
    (34, "習"): {"japanese": "練習"},
    (34, "月"): {"japanese": "先月"},
    (35, "はく 5"): {"japanese": "はく"},
    (35, "ううん、明日から。明日の10時から会議がある。"): {"korean": "아니, 내일부터야. 내일 10시부터 회의가 있어."},
    (36, "降る 5"): {"japanese": "降る"},
    (36, "かぶる 5"): {"japanese": "かぶる"},
    (37, "ああ、こんにちは。息子さん、ちょうど今、着きましたよ。"): {"korean": "아~, 안녕하세요. 아드님, 마침 지금 도착했어요."},
    (37, "ああ、そうですか。"): {"korean": "아~, 그래요?"},
    (37, "今日、雪が降りましたから、ちょっと時間がかかりました。"): {"korean": "오늘 눈이 내렸기 때문에, 좀 시간이 걸렸습니다."},
    (37, "そうですか。もう雪が降りましたか。"): {"korean": "그렇군요. 벌써 눈이 내렸어요?"},
    (39, "さす 5"): {"japanese": "さす"},
    (39, "昨日、電車で妻が大きな声を出したから。"): {"korean": "어제 전철에서 아내가 큰 소리를 냈거든."},
    (39, "うん。電車の中が静かだったから、僕、すごく恥ずかしかったんだ。それで、すぐに電車を降りた。"): {"korean": "응. 전철 안이 조용했기 때문에, 나 엄청 민망했거든. 그래서, 바로 전철에서 내렸어."},
    (40, ") 切符"): {"japanese": "切符"},
}

HEADINGS = {
    33: {"した。", "しなかった。", "した?", "しなかった?"},
    34: {"しました。", "しませんでした。", "しましたか。", "しませんでしたか。"},
}

# lesson, type, page, before, Japanese, Korean, optional source reading
ADDITIONS = [
    (31, "vocabulary", 94, "電話", "単語", "단어", "たんご"),
    (31, "conversation", 96, "ううん、まだ。", "はい、上田です。", "네, 우에다입니다.", "上田(うえだ)"),
    (31, "conversation", 96, "ううん、まだ。", "もしもし、私。陸はもう起きた?", "여보세요, 나야. 리쿠는 이제 일어났어?", "陸(りく)"),
    (31, "conversation", 96, "もう出かけた?", "陸は夕べ早く寝なかったから......。七海は起きた?", "리쿠는 어젯밤에 일찍 안 잤으니까……. 나나미는 일어났어?", "陸(りく) · 七海(ななみ)"),
    (31, "conversation", 96, "もう出かけた?", "うん、七海はもう出かけた。", "응, 나나미는 벌써 나갔어.", "七海(ななみ)"),
    (32, "pattern", 97, "昨日、朝9時に子供と出かけました。", "3時にタクシーを降りました。", "3시에 택시에서 내렸어요.", ""),
    (33, "vocabulary", 100, "準備", "期末", "기말", "きまつ"),
    (33, "pattern", 102, None, "うん、説明しなかった。", "응, 설명하지 않았어.", ""),
    (33, "pattern", 102, None, "ううん、した。", "아니, 했어.", ""),
    (33, "conversation", 102, "うん、持って来た。", "嵩、今日は宿題、持って来た?", "다카시, 오늘은 숙제 가져왔어?", "嵩(たかし)"),
    (33, "conversation", 102, "ねえ、中間試験の準備、した?", "そう。よかった。昨日、嵩、宿題持って来なかったから。", "그래. 다행이다. 어제 다카시 숙제 안 가져왔으니까 (걱정돼서).", "嵩(たかし)"),
    (33, "conversation", 102, "うん!する、する!", "中間試験の準備?桃子のノート、コピーした。", "중간고사 준비? 모모코의 노트 복사했어.", "桃子(ももこ)"),
    (33, "conversation", 102, "うん!する、する!", "桃子のノート?", "모모코의 노트라고?", "桃子(ももこ)"),
    (33, "conversation", 102, "うん!する、する!", "うん。桃子のノートが一番いいから。嵩もコピーする?", "응. 모모코의 노트가 가장 좋으니까. 다카시도 복사할래?", "桃子(ももこ) · 嵩(たかし)"),
    (34, "vocabulary", 103, "お姉さん", "姉", "누나, 언니(높이지 않는 호칭)", "あね"),
    (34, "pattern", 105, None, "いいえ、行って来ました。", "아니요, 갔다 왔어요.", ""),
    (34, "pattern", 105, None, "はい、しませんでした。", "네, 안 했습니다.", ""),
    (34, "pattern", 105, None, "いいえ、しました。", "아니요, 했어요.", ""),
    (34, "conversation", 105, "友達のうちに行って来ました。今日は友達のうちで歌の練習をしました。", "大阪へ行って来ました。", "오사카로 갔다 왔습니다.", "大阪(おおさか)"),
    (34, "conversation", 105, "友達のうちに行って来ました。今日は友達のうちで歌の練習をしました。", "そうですか。大阪はどうでしたか。", "그렇군요. 오사카는 어땠어요?", "大阪(おおさか)"),
    (34, "conversation", 105, "友達のうちに行って来ました。今日は友達のうちで歌の練習をしました。", "とても賑やかでした。阿部さんはどこへ行って来ましたか。", "아주 번화했습니다. 아베 씨는 어디로 갔다 왔습니까?", "阿部(あべ)"),
    (35, "pattern", 107, "お店で上着を脱いだ。", "5時に空港に着いた。", "5시에 공항에 도착했어.", ""),
    (35, "conversation", 109, "うん。今、着いたよ。さっき飛行機、降りた。", "あ、拓海?", "어, 다쿠미야?", "拓海(たくみ)"),
    (36, "conversation", 112, "ううん、会わなかった。", "そうだね。科学館で森田さんに会わなかった?", "그러네. 과학관에서 모리타 씨를 만나지 않았어?", "森田(もりた)"),
    (36, "conversation", 112, "ううん、会わなかった。", "森田さん?", "모리타 씨?", "森田(もりた)"),
    (36, "conversation", 112, "ううん、会わなかった。", "うん。森田さんも昨日、科学館に行ったから。", "응. 모리타 씨도 어제 과학관에 갔거든.", "森田(もりた)"),
    (37, "conversation", 115, "ああ、こんにちは。息子さん、ちょうど今、着きましたよ。", "はい、中野でございます。", "네, 나카노입니다.", "中野(なかの)"),
    (37, "conversation", 115, "ああ、こんにちは。息子さん、ちょうど今、着きましたよ。", "中野さん、こんにちは。ホ・ヨナです。", "나카노 씨, 안녕하세요(낮 인사). 허연아입니다.", "中野(なかの)"),
    (37, "conversation", 115, "はい、わかりました。", "中野さん、息子をよろしくお願いします。", "나카노 씨, 아들을 잘 부탁드리겠습니다.", "中野(なかの)"),
    (38, "conversation", 118, "うん。", "1時間?!", "한 시간?!", ""),
    (39, "conversation", 121, "知らない。", "おはよう。あれ?陽子さんは?", "안녕(아침 인사). 어라? 요코 씨는?", "陽子(ようこ)"),
    (39, "conversation", 121, "僕がうちの鍵を無くしたから。", "何で陽子さん、大きな声出したの?", "왜 요코 씨, 큰 소리 낸 거야?", "陽子(ようこ)"),
    (39, "conversation", 121, "ううん、昨日は妻と全然話さなかった。", "陽子さんとよく話した?", "요코 씨와 잘 이야기했어?", "陽子(ようこ)"),
    (40, "conversation", 124, "そうですか。色々とありがとうございました。", "あ、ありがとうございます。すみません。あのう、上野行きは何番線ですか。", "아, 감사합니다. 잠깐만요. 저어, 우에노행은 몇 번 승강장이에요?", "上野(うえの)"),
    (40, "conversation", 124, "そうですか。色々とありがとうございました。", "上野ですか。2番線ですよ。", "우에노요? 2번 승강장이에요.", "上野(うえの)"),
]


def apply_reviewed_corrections(lesson, items, stable_id):
    result = []
    for original in items:
        if original["type"] == "pattern" and original["japanese"] in HEADINGS.get(lesson, set()):
            continue
        item = dict(original)
        item.update(UPDATES.get((lesson, original["japanese"]), {}))
        result.append(item)
    for number, kind, page, before, japanese, korean, reading in ADDITIONS:
        if number != lesson or any(i["type"] == kind and i["japanese"] == japanese for i in result):
            continue
        if before is None:
            # Continuation rows above the next page's conversation section.
            index = max(i for i, item in enumerate(result) if item["type"] == kind) + 1
        else:
            matches = [i for i, item in enumerate(result) if item["type"] == kind and item["japanese"] == before]
            if len(matches) != 1:
                raise ValueError(f"Missing/ambiguous PDF correction anchor: {lesson} {before}")
            index = matches[0]
        item = {"id": stable_id(kind, lesson, japanese, korean), "lessonId": lesson,
                "type": kind, "japanese": japanese, "korean": korean, "sourcePage": page}
        if reading:
            item["reading"] = reading
        result.insert(index, item)
    return result
