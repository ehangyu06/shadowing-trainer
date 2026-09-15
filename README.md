# Shadowing Trainer

iPad에서 짧은 영어 영상 구간을 반복해 쉐도잉하는 독립 웹앱입니다.
기존 English listening reader 앱과 코드, 데이터, 설정을 공유하지 않습니다.

원본 영상과 앱은 분리되어 있습니다. GitHub에는 앱과 클립 metadata만 올리고, 영화 파일은 올리지 않습니다.

## 직장에서 열기 (GitHub Pages)

https://ehangyu06.github.io/shadowing-trainer/

Mac이 꺼져 있어도 앱 화면은 열립니다. 원본 영화가 없으면 Library 또는 Study 화면에서 **Select Video File**을 눌러 iPad Files의 mp4/mov를 고르면, 저장된 start/end로 공부합니다.

### Pages를 처음 켤 때

1. https://github.com/ehangyu06/shadowing-trainer/settings/pages
2. **Source** = GitHub Actions
3. main에 push되면 `.github/workflows/pages.yml`이 배포합니다.

집에서 클립을 새로 만들거나 수정한 뒤에는 `data/clips.json`이 갱신되도록 저장하고, 그 변경을 GitHub에 push해야 직장 iPad에도 반영됩니다.

## 집에서 실행

```bash
cd /Users/kimhangyu/shadowing-trainer
./start.sh
```

브라우저에서 `http://127.0.0.1:8765/` 를 엽니다.

같은 Wi-Fi의 iPad는 터미널에 표시된 `http://192.168.x.x:8765/` 로도 접속할 수 있습니다.

## 클립 데이터와 영상 파일

클립은 `video_id`만 저장합니다. Mac 절대 경로는 쓰지 않습니다.

`data/videos.json`:

```json
{ "id": "intern_01", "title": "The Intern", "filename": "intern.mp4" }
```

`data/clips.json`:

```json
{
  "id": 1,
  "video_id": "intern_01",
  "start": 125.2,
  "end": 130.4,
  "english": "I’m worried it’s not gonna live up to the hype.",
  "korean": "기대만큼 좋지 않을까 봐 걱정돼."
}
```

나중에 Mac mini가 오면 `js/videoSource.js`의 `resolveHomeServerUrl()`만 구현하면 됩니다.

## 클립 만들기

1. Library → **New Clip** 또는 **Edit Clip**
2. **Select Video File** 또는 집에서 `videos/` 폴더
3. **Set Start** / **Set End** / **Preview Loop**
4. 자막을 적고 **Save Clip**

## Settings

Phase 횟수와 재생 속도: `localStorage` 키 `shadowing-trainer:settings`  
구현: `js/settingsStore.js`

클립: `data/clips.json` + `localStorage` 키 `shadowing-trainer:clips`  
구현: `js/clipStore.js` (`getClips`, `saveClip`, `updateClip`, `deleteClip`)

기본 반복 횟수: `js/constants.js`의 `DEFAULT_PHASE_COUNTS` → `[3, 3, 3, 20, 20]`
