# AI Implementation Log

## Phase 1 — Shared AI Service + J4 Administration
**Status:** Complete  
**Date:** 2026-07-17  
**Branch:** AI-API-and-Assistance

---

### Files Created

| File | Purpose |
|---|---|
| `types/ai.d.ts` | Global TypeScript declarations: `AiProvider`, `AiFeature`, `AiImageQuality`, `AiBudgetScopeType`, `AiUsageRecord`, `AiBudgetConfig`, `AiSiteConfig`, `AiCreditSummary`, `AiUsageAggregates` |
| `lib/ai/costs.ts` | Model pricing tables for Claude + OpenAI text/image. Cost estimation helpers. |
| `lib/ai/budget.ts` | Budget enforcement: `checkBudget()`, `getMemberCreditSummary()`, `recordUsage()`. Queries `ai_usage` collection per month per scope. |
| `lib/ai/providers/anthropic.ts` | Claude adapter: `callAnthropicText()`. Singleton Anthropic client cached in module scope. |
| `lib/ai/providers/openai.ts` | OpenAI adapter: `callOpenAiText()`, `callOpenAiImageGenerate()`, `callOpenAiImageEdit()`. |
| `lib/ai/service.ts` | Main orchestrator: `callText()`, `callImageGenerate()`, `callImageEdit()`, `estimateTextCost()`, `estimateImageCost()`. Reads site config, resolves provider/model, enforces budget, records usage. |
| `app/api/ai/config/route.ts` | GET/PUT site-wide AI configuration (J4 only). |
| `app/api/ai/budgets/route.ts` | GET/POST/DELETE budget configs (J4 only). |
| `app/api/ai/usage/route.ts` | GET usage stats with groupBy, scope, pagination (J4 only). |
| `app/api/ai/estimate/route.ts` | POST pre-request cost estimate — returns estimated cost + budget check result. |
| `app/api/me/ai-credits/route.ts` | GET member credit summary — used by member-facing credit display in later phases. |
| `app/dashboard/j4/tabs/AIAdminTab.tsx` | J4 AI Admin tab: Overview (monthly stats, breakdown, recent requests), Budgets (CRUD), Settings (global toggle, provider config). |

### Files Modified

| File | Change |
|---|---|
| `lib/mongo.ts` | Added `aiUsage`, `aiBudgets`, `aiConfig` collections. |
| `lib/permissions.ts` | Added `ai.manage` (J4 only) and `ai.use` (ASOT Member). |
| `.env.template` | Added `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. |
| `app/dashboard/j4/J4AdminPanel.tsx` | Added import + tab 6 for AI Administration. |
| `package.json` | Added `@anthropic-ai/sdk`, `openai` dependencies. |

### New MongoDB Collections

| Collection | Schema |
|---|---|
| `ai_usage` | `AiUsageRecord` — per-request usage/cost log |
| `ai_budgets` | `AiBudgetConfig` — scoped budget configurations |
| `ai_config` | `AiSiteConfig` — singleton site config (document `_id: 'main'`) |

### New Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### AI Credit Rules Implemented

Consumes credits (tracked in `ai_usage`):
- Claude text generation (`callText`)
- OpenAI image generation (`callImageGenerate`)
- OpenAI image edit (`callImageEdit`)

Does NOT consume credits:
- Crop/resize/reposition (client-side only — no AI call)
- Camera overlay application (client-side overlay)
- Swapping to an already-generated image
- Deleting images

### Budget Scope Hierarchy

Checked in order (any hard-stop blocks request):
1. Site-wide
2. Department
3. Role(s)
4. Member
5. Feature

### Manual Testing Required

- [ ] Set `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in `.env`
- [ ] Navigate to J4 dashboard → AI Admin tab
- [ ] Verify Overview tab loads (empty state expected on fresh install)
- [ ] Add a site-wide budget (e.g. $10/month, hard stop)
- [ ] Add a member budget for a test user
- [ ] Verify Settings tab shows provider key status (Key set / No key)
- [ ] Toggle global AI enable and save
- [ ] Call `POST /api/ai/estimate` with a text request and confirm estimated cost returned
- [ ] Call `GET /api/me/ai-credits` and confirm credit summary returned

---

## Phase 2 — Intel Image Creator
**Status:** Complete  
**Date:** 2026-07-17  
**Branch:** AI-API-and-Assistance

---

### Files Created

| File | Purpose |
|---|---|
| `lib/ai/prompts/intel-image.ts` | Prompt builder: `buildIntelImagePrompt()` with per-style rendering instructions for all 9 camera styles. `getSizeForAspectRatio()` helper. |
| `app/api/ai/intel/generate/route.ts` | POST endpoint: validates request, builds prompt, calls `callImageEdit` (with source screenshot) or `callImageGenerate` (fresh), saves PNG + optional source to `uploads/ai-images/{userId}/{uuid}.png`, inserts `AiGeneratedImage` record. |
| `app/api/ai/images/route.ts` | GET (paginated library, scope=mine/all), DELETE (soft-delete + file removal), PATCH (link to operation/package, update overlay style, mark as used). |
| `app/api/ai/images/[id]/file/route.ts` | GET: streams PNG from filesystem; permission check: owner or `canViewAll`. |
| `components/ai/CameraOverlay.tsx` | Nine SVG HUD overlay components (DSLR, Helmet Cam, Bodycam, Drone/UAV, CCTV, Long-Range, Satellite/ISR, Thermal, Night Vision). Client-side only — no AI credits consumed. |
| `app/dashboard/j2/tabs/IntelImagesTab.tsx` | Main Phase 2 UI: Creator sub-tab (camera style picker, pose selector, scene form, debounced cost estimate, source screenshot upload), Result sub-tab (generated image + overlay, swap overlay, Use/Download/Discard), Library sub-tab (paginated grid, Mine/All scope, delete, quick-view). |

### Files Modified

| File | Change |
|---|---|
| `types/ai.d.ts` | Added `AiCameraStyle`, `AiPoseOption`, `AiGeneratedImage` global types. |
| `lib/mongo.ts` | Added `aiGeneratedImages` collection (`ai_generated_images`). |
| `lib/permissions.ts` | Added `intel.generateImages` (J2 Mission Making + HQ Staff) and `intel.viewAllImages`. |
| `app/dashboard/j2/J2Panel.tsx` | Added import + tab 5 for Intel Images. |
| `components/ai/CameraOverlay.tsx` | Fixed `Timestamp` `anchor` prop type narrowed to `'start' \| 'middle' \| 'end'` to satisfy SVG `textAnchor` type. |

### New MongoDB Collections

| Collection | Schema |
|---|---|
| `ai_generated_images` | `AiGeneratedImage` — generated image records with cost, metadata, link to operation |

### Camera Styles

| Style | Key Feature |
|---|---|
| DSLR | Corner brackets, focus reticle, exposure info bar |
| Helmet Cam | Radial vignette, REC dot, timestamp, battery |
| Bodycam | Top/bottom bars, RECORDING label, timestamp |
| Drone/UAV | Teal HUD, crosshair, altitude/GPS readout |
| CCTV | Camera icon, info bars, REC indicator |
| Long-Range | Mil-dot scope reticle with range scale |
| Satellite/ISR | Grid overlay, UNCLASSIFIED bar, coordinates |
| Thermal | FLIR temp gradient sidebar, THERMAL label |
| Night Vision | Green radial vignette, Gen3 phosphor crosshair |

### AI Credit Rules

- **Consumes credits**: `callImageGenerate` (fresh scene), `callImageEdit` (source screenshot provided)
- **Free**: camera overlay swap, download, link to operation, delete

### Manual Testing Required

- [ ] Navigate to J2 dashboard → Intel Images tab
- [ ] Pick a camera style, fill scene description, click Generate
- [ ] Verify generated image appears with correct overlay
- [ ] Swap overlay style (confirm no AI credit consumed)
- [ ] Upload a source screenshot and regenerate (verify `callImageEdit` path used)
- [ ] Use image → confirm status set to `used`
- [ ] Open Library tab → verify image appears
- [ ] Test Mine/All scope toggle (All only visible to J2/HQ Staff)
- [ ] Delete an image → verify soft-delete + file removal

---

## Phase 3 — Intel Package + CHQ Orders Rename (Pending)

Planned:
- New operation document type: `intel_package`
- Slide editor component based on `ASOT Intel Package Template` design reference
- Rename `Main Page` → `CHQ Orders` in operation document list
- Intel Package default document order: Intel Package → CHQ Orders → Zeus Notes → OCAP → AAR
- Yellow tab/colour for Intel Package documents

---

## Phase 4 — Recruitment Video (Pending)

Planned:
- Video player on `/join` with no-skip enforcement on first view
- `video_progress` MongoDB collection
- Resume from saved position
- Skip/Continue option after first completion

---

## Phase 5 — Training Hub Content Model (Pending)

Planned:
- Trainer's Document type (based on `Training document template design` reference)
- Draft/approval/versioning workflow
- Auto-versioning: <25% change → minor bump, ≥25% → major bump

---

## Phase 6 — Training Video + AI Review (Pending)

Planned:
- Video upload + checkpoint/question management
- Incorrect-answer retraining flow (replay relevant section)
- Claude written-answer review (`callText` with answer review rubric)
