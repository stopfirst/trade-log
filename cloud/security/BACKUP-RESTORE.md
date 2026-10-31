# 매매일지 백업·복원 (2026-11)

## 지금 있는 백업 수단
| 수단 | 무엇 | 한계 |
|---|---|---|
| 앱 **설정 → 백업과 이전 → 사진 포함 JSON** (사이드바 '사진 포함 백업' 같은 기능) | 지금 보고 있는 일지(US 또는 HL) 1개의 전체 상태(거래·계획·복기·사진) | 수동, 일지별로 따로, 서버 표(키움 스냅샷·손실 한도 기록 등)는 없음 |
| 앱 '분석용 CSV' | 거래 표(사진 제외) | 복원용 아님 |
| Supabase `journal_cloud_history` + 앱 '이전 버전 되돌리기'(journal_restore) | 클라우드 저장 직전 버전 최근 5개 | 같은 DB 안, 5번 넘게 저장하면 밀려남 |
| **신규: 서버 일일 백업**(trade-alert 2.9.0 + alert13.sql) | 매일 06:40 KST, 두 일지 전체 + 서버 표 전부, gzip JSON, 30일 | Lightsail 디스크 안(서버가 통째로 사라지면 같이 사라짐 → 가끔 PC로 내려받기 권장) |

메모(앱 변경 안 함): 앱에 '두 일지 한 번에 내려받기'나 자동 백업은 없음. 필요하면 다음 앱 버전에서 검토.

## 서버 일일 백업 구성
- Supabase: `cloud/alert13.sql` → `public.backup_dump(token, part, scope, after)` (security definer, `search_path=''`, `kw_auth` 토큰 검사 + 분당 60회 공유 + 하루 400회, 본인 행만, **kw_collector 토큰 해시·auth 는 절대 안 내보냄**) + `public.backup_log`(RLS, 본인만 읽기).
  - part: `meta` · `journal`(US/HL, payload 전체 — 사진 포함) · `history`(이전 버전 목록, 내용 제외) · `server`(risk_state/days/events/flows, acct_snapshots, quick_reviews, hl_watch) · `kw_snapshots`(60행씩) · `hl_fills`/`hl_funding`(2000행씩).
  - 사진 판단: **포함이 기본** — 사진도 일지의 일부이고 앱 백업도 사진 포함. payload 는 앱이 24 MiB 로 막아 두어 하루 1개 × 30일이면 최대 수백 MB 수준. 디스크가 걱정되면 `.env` `BACKUP_PHOTOS=0`(서버에서 `data:image` 문자열만 표시로 바꿔 저장).
- Lightsail: `/opt/trade-alert/src/backup.mjs` + `trade-alert-backup.service`(oneshot, tradealert 사용자, 읽기 전용 시스템·백업 폴더만 쓰기) + `trade-alert-backup.timer`(매일 06:40 Asia/Seoul, ±10분, 꺼져 있던 동안 놓치면 켜질 때 1회).
  - 저장: `/opt/trade-alert/backups/trade-journal-YYYY-MM-DD-HHMM.json.gz` (0600) + `.sha256`. 30일보다 오래된 것 삭제(최신 3개는 항상 남김).
  - 호출 간격 2.5초(수집기·알림과 분당 60회 한도 공유), rate_limited 면 65초 쉬고 다시. 실패하면 텔레그램 ⚠️ 1회(`BACKUP_NOTIFY=fail` 기본, `always` = 매일 결과, `0` = 끔).
- 파일 형식: `{"format":"trade-journal-server-backup","version":1,"created_at",...,"user_id","journals":{"US":{revision,updated_at,payload},"HL":...},"history":{...},"server":{표: [행...]},"kw_snapshots":[...],"hl_fills":[...],"hl_funding":[...]}`

## 확인
```
sudo systemctl start trade-alert-backup ; sudo journalctl -u trade-alert-backup -n 5 --no-pager
sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/backup.mjs --list
systemctl list-timers trade-alert-backup.timer
sudo sh -c 'cd /opt/trade-alert/backups && sha256sum -c *.sha256'
```
PC로 내려받기(가끔): Lightsail 브라우저 SSH 는 파일 다운로드가 불편하므로 `scp`(키 사용) 또는 `sudo cp /opt/trade-alert/backups/<파일> /home/ubuntu/ && sudo chown ubuntu /home/ubuntu/<파일>` 후 SSH 창의 파일 다운로드 기능(있으면) 또는 scp 사용.

## 복원
### A. 일지(가장 흔한 경우: 실수로 지움·덮어씀)
1. 먼저 앱 '이전 버전 되돌리기'(최근 5개)로 되는지 본다.
2. 안 되면 서버 백업에서 꺼내기:
   ```
   sudo -u tradealert node /opt/trade-alert/src/backup.mjs --extract /opt/trade-alert/backups/<파일>.json.gz /tmp/restore
   ```
   → `/tmp/restore/trade-journal-usd-<날짜>-rev<N>.json`, `trade-journal-hyperliquid-…json` (클라우드 저장본 payload 그대로 = 앱 '사진 포함 JSON' 과 같은 모양).
3. 파일을 PC로 옮겨 앱 해당 일지에서 **설정 → 백업과 이전 → 기존 기록 가져오기** → 내용 확인 → 클라우드 저장.

### B. SQL 로 복원(서버 표, 또는 일지를 앱 없이)
```
sudo -u tradealert node /opt/trade-alert/src/backup.mjs --restore-sql /opt/trade-alert/backups/<파일>.json.gz > /tmp/restore.sql            # 서버 표만
sudo -u tradealert node /opt/trade-alert/src/backup.mjs --restore-sql /opt/trade-alert/backups/<파일>.json.gz --journal > /tmp/restore.sql  # + 일지
```
- 서버 표: `insert … select … from jsonb_populate_recordset(…) on conflict do nothing` — **백업에만 있는 행을 추가**, 이미 있는 행은 그대로. 다시 실행해도 같은 결과.
  hl_fills·hl_funding 의 id 는 새로 매김(내용·tid 는 같음).
- `--journal`: 일지가 없으면 만들고, 있고 내용이 다르면 `journal_archive_and_write` 로 교체 — **지금 저장본은 이전 버전으로 보관**되므로 앱 '이전 버전 되돌리기'로 원래대로 돌릴 수 있음.
- 다른 프로젝트·계정으로 옮길 때: `--user <새 auth.users id>`.
- 생성된 SQL 을 Supabase SQL Editor 에 붙여넣고 Run. 일지가 수 MB 이상이면 SQL Editor 가 무거우니 A 방법 권장.
- PGlite 왕복 검증: `cloud/alert/tests/alert13-sql.pglite.mjs`(수집 → 복원 SQL → 빈 DB → 행 수·내용 일치, 재실행 멱등, 일지 교체 시 history 보관).

## 끄기·되돌리기
- 타이머만 끄기: `sudo systemctl disable --now trade-alert-backup.timer` (파일은 남음)
- DB 쪽 제거: SQL Editor `drop function if exists public.backup_dump(text, text, text, bigint); drop table if exists public.backup_log;`
- 서버 코드 2.8.1 로: REPORT 의 되돌리기 한 줄(타이머 끄기 포함).
- 백업 파일 지우기: `sudo rm -rf /opt/trade-alert/backups/*`
