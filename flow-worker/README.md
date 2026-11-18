# Google Flow Playwright Worker

A local companion process for AI Kids Content Studio. It launches a visible Playwright-controlled browser, lets the user sign in to Google Flow manually, prepares character-view prompts, and imports a user-downloaded image into the existing Character Studio API.

This is a **human-in-the-loop browser workflow**, not an official Google Flow API integration.

## Why this is a separate process

The backend may run in Docker or on a remote host, while the Google account session belongs to the user's desktop. Keep Playwright on the user's computer with a persistent browser profile. The worker communicates with the existing backend over HTTP and reuses these existing routes:

- `POST /api/character-studio/characters/:id/import-flow` — saves the image file.
- `POST /api/character-studio/characters/:id/assets` — registers the image as a character asset.

The worker does not store Google passwords, read browser cookies, use private Flow endpoints, bypass CAPTCHA/MFA, or run headless.

## Requirements

- Node.js 20.19 or newer.
- Google Chrome or Playwright's bundled Chromium.
- AI Kids Content Studio backend reachable from the same computer.
- A Google account that can use Google Flow.

## Install

From the repository root:

```bash
cd flow-worker
npm install
npx playwright install chromium
cp .env.example .env
npm start
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

The worker binds to `127.0.0.1` only. On startup it prints a bearer token. Keep the terminal private. You can set a stable `FLOW_WORKER_TOKEN` in `.env`; otherwise a random token is generated for that process.

## Workflow

### 1. Open Google Flow

Send an authenticated request to:

```http
POST http://127.0.0.1:4177/session/open
Authorization: Bearer <token>
Content-Type: application/json

{}
```

A visible browser opens at Google Flow. Sign in manually if necessary. Open the project containing the reusable Google Flow character you want to use.

You can pass a project URL if you already have it:

```json
{ "projectUrl": "https://labs.google/fx/tools/flow" }
```

Only HTTPS URLs on `labs.google` or `flow.google.com` are accepted.

### 2. Prepare a character-view job

```http
POST http://127.0.0.1:4177/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "characterId": "YOUR_STUDIO_CHARACTER_ID",
  "characterName": "Sammy",
  "view": "front-left",
  "assetType": "custom",
  "isMasterReference": false
}
```

Supported view keys:

- `front`
- `front-left`
- `front-right`
- `left`
- `right`
- `back-left`
- `back-right`
- `back`

The worker fills a prompt editor only when it can identify one unambiguously. If the Flow UI changes or multiple prompt fields are visible, it stops and reports that `FLOW_PROMPT_SELECTOR` needs to be configured.

The prompt includes an `@Sammy` character reference. In Google Flow, select the actual saved character suggestion from the @-mention picker. Do not proceed until the intended character reference is visibly attached.

### 3. Confirm generation

Generation may use your Google Flow allowance. The worker therefore requires two explicit confirmations:

```json
{
  "confirmGenerate": true,
  "referenceConfirmed": true
}
```

Send this to `POST /jobs/<jobId>/generate` only after verifying the prompt, selected Flow character, project and generation settings in the visible browser.

The worker clicks only the exact visible button named **Generate Image**. If it cannot identify exactly one such button, it does not guess; click Generate Image manually in the browser. The worker will still listen for the subsequent image download.

### 4. Download and import

When the generated image is ready, use Google Flow's normal Download action. Playwright captures that browser download, checks the actual PNG/JPEG/WebP file signature, then:

1. Calls the existing character-scoped `import-flow` endpoint to save the file.
2. Calls the existing character `assets` endpoint to register the asset and its direction.
3. Reports completion in the job status.

The worker captures only an image download while a confirmed job is active. Do not download unrelated files during an active job.

If file import succeeds but metadata registration fails, the job enters `import_metadata_failed`; call `POST /jobs/<jobId>/retry-import` instead of downloading again.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/session/open` | Launch visible browser and open Flow |
| GET | `/session/status` | Browser/session status |
| POST | `/session/close` | Close browser but retain profile |
| POST | `/jobs` | Create and prepare a character-view job |
| POST | `/jobs/:id/prepare` | Retry prompt preparation after manual login |
| POST | `/jobs/:id/generate` | Explicitly confirm and request generation |
| GET | `/jobs/:id` | Read job status |
| POST | `/jobs/:id/retry-import` | Retry asset metadata registration |
| DELETE | `/jobs/:id` | Cancel the active job |

All endpoints except `GET /health` require:

```http
Authorization: Bearer <token>
```

## Example PowerShell commands

After starting the worker, copy the token printed in the terminal:

```powershell
$token = "PASTE_LOCAL_WORKER_TOKEN"
$headers = @{ Authorization = "Bearer $token" }

Invoke-RestMethod -Uri "http://127.0.0.1:4177/session/open" -Method Post -Headers $headers -ContentType "application/json" -Body "{}"

$job = Invoke-RestMethod -Uri "http://127.0.0.1:4177/jobs" -Method Post -Headers $headers -ContentType "application/json" -Body (@{
  characterId = "YOUR_STUDIO_CHARACTER_ID"
  characterName = "Sammy"
  view = "front-left"
  assetType = "custom"
  isMasterReference = $false
} | ConvertTo-Json)

$job.job

$confirm = @{ confirmGenerate = $true; referenceConfirmed = $true } | ConvertTo-Json
Invoke-RestMethod -Uri ("http://127.0.0.1:4177/jobs/" + $job.job.id + "/generate") -Method Post -Headers $headers -ContentType "application/json" -Body $confirm

Invoke-RestMethod -Uri ("http://127.0.0.1:4177/jobs/" + $job.job.id) -Method Get -Headers $headers
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `FLOW_WORKER_HOST` | `127.0.0.1` | Loopback address only |
| `FLOW_WORKER_PORT` | `4177` | Local HTTP port |
| `FLOW_WORKER_TOKEN` | Random per process | Local bearer token |
| `FLOW_BROWSER_CHANNEL` | Playwright Chromium | Optional `chrome` channel |
| `FLOW_PROFILE_DIR` | User home app-data folder | Persistent Google Flow browser profile |
| `FLOW_DOWNLOAD_DIR` | User home app-data folder | Download and diagnostic files |
| `FLOW_BACKEND_URL` | `http://127.0.0.1:5001` | Existing backend base URL |
| `FLOW_PROMPT_SELECTOR` | Auto-detected | Optional unique prompt editor selector |
| `FLOW_WORKER_ALLOWED_ORIGINS` | Empty | Allowed browser origins |

## Current boundaries

- The user must sign in and complete MFA/CAPTCHA manually.
- The user must select the correct saved Flow character reference in the visible UI.
- The user confirms every credit-consuming generation.
- The worker uses the documented visible Flow interface; it does not call hidden endpoints or intercept generation APIs.
- The worker currently requires the user to click Flow's normal Download control. It does not scrape internal asset URLs.
- Job state is in memory; keep the worker process running until the download is imported.
- The API worker is a local companion, not a multi-user server. Do not expose it to the LAN or internet.
- Google Flow's UI can change; selectors and generation controls may need an update.
- Verify Google's current terms and product rules before using the automation at scale.

## Official Flow guides

- [Create and edit images in Google Flow](https://support.google.com/flow/answer/16729550)
- [Create and manage reusable characters](https://support.google.com/labs/answer/16935308)
- [Google Flow terms and product guidance](https://labs.google/fx/tools/flow)
