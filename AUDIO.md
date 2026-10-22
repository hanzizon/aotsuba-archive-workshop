# Inline MP3 attachments

관리자 로그인 → 글 본문에서 삽입할 위치 선택 → **MP3 넣기** → 파일과 제목 선택 → **본문에 넣기** → 글 게시.
독자는 제목을 눌러 재생/일시정지할 수 있습니다. 키보드 Enter/Space도 지원하며, 다른 곡을 누르거나 글을 닫으면 이전 재생을 멈춥니다. 제목은 편집기 본문에서 수정하고, 링크를 삭제하면 글에서 첨부가 제거됩니다.

## Storage and deployment

- Maximum 8 MiB per MP3. Upload requires an existing valid administrator session. The Worker validates size (including streamed bodies) and an MP3 container/frame signature, not full audio decoding.
- Files are content-addressed at `media/audio/<sha256>.mp3` in the existing public GitHub repository. Posts/drafts store only a sanitized link and title; no audio base64 is embedded in archive JSON or localStorage.
- Existing `GITHUB_TOKEN` with repository Contents write access is reused. No R2 bucket, new binding, secret, or migration is required. Deploy the Worker **before** publishing the updated frontend:

  ```sh
  npm ci
  npm test
  npm run check:worker
  npx wrangler deploy --config cloudflare-worker/wrangler.jsonc
  ```

- Then merge/publish the frontend through the existing GitHub Pages workflow. If the Worker remains on its old version, uploads return 404. Existing posts continue working.
- Public GET/HEAD `/audio/<sha256>.mp3` serves audio/mpeg with nosniff, immutable browser caching and single byte-range support. This makes new uploads playable immediately without waiting for Pages to publish the file. Authorization credentials never enter saved links.
- Repository, Pages, and audio files are public. Removing a link does **not** remove the binary or its Git history. Abandoned uploads are retained to avoid deleting a file referenced by another post or draft. Manage storage manually after checking references.
- Reads use GitHub's Contents API, including range requests. High traffic can reach GitHub API/Worker limits; this design is intended for a small personal archive, not bulk media hosting. A future larger media library should use object storage/CDN caching.
- Upload timeouts can leave a successfully uploaded file unattached. Retrying the same bytes reuses its hash and does not overwrite unrelated files.

## Validation

`tests/audio.test.cjs` covers authenticated uploads, rejected origins/oversized/invalid files, duplicate uploads, binary preservation, ranges, preflight, and a real Chromium editor/playback flow using generated silent MP3 frames. It also checks rich draft restoration and unsafe title/link handling. Existing security/browser tests remain unchanged.
