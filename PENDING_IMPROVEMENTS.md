# SOP Platform — Pending Improvements

Last updated: 2026-04-10

---

## 1. Transcript Sync — Workflow 1 Fixed, Re-run Pending
- [x] Add `maxOutputTokens: 65536` to Workflow 1 transcription node (fixes 30-min truncation on 47-min video)
- [x] Update transcription prompt to enforce VERBATIM word-for-word transcription (Gemini was paraphrasing)
- [ ] Re-import updated Workflow 1 JSON into n8n
- [ ] Re-run Workflow 1 on the SOP (upload MP4 to new SharePoint folder OR SQL reset of processed_sharepoint_files)
- [ ] Verify full 47-min transcript is captured and content matches actual speech

---

## 2. Callout Cleanup ✅ Prompt Fixed 2026-04-10
- [x] Updated Workflow 3c prompt: ONLY 1–3 elements directly interacted with
- [x] Explicitly excludes toolbars, navigation menus, breadcrumbs, passive elements
- [x] Added tiebreaker: "fewer callouts are better than more"
- [ ] Re-import Workflow 3c into n8n
- [ ] Re-run Workflow 3c after Workflow 2 completes (pipeline triggers automatically)
- [ ] Re-render annotated screenshots (POST `/api/steps/{id}/render-annotated`) after callout update

---

## 3. Frame Capture — Capture All Screen-Share Screens
- [ ] Investigate why only 11 frames were captured for a 47-min video
- [ ] Check Workflow 2 frame extraction settings (scene detection threshold too high?)
- [ ] Adjust PySceneDetect threshold to capture more unique screens
- [ ] Re-run Workflow 2 after threshold adjustment

---

## 4. Document Export Format
- [ ] Receive export format/template from user
- [ ] Update DOCX template to use annotated screenshots (not raw screenshots)
- [ ] Ensure `annotated_screenshot_url` is used in export, fallback to `screenshot_url`
- [ ] Test PDF export with annotated images

---

## 5. Process Map (SVG)
- [ ] Generate SVG process map for the full SOP session using Mermaid or direct SVG
- [ ] Include in exported DOCX/PDF document
- [ ] Decide: Gemini-generated Mermaid → rendered SVG, or hardcoded flow from steps

---

## 6. "From the KT Session" Sync
- [ ] KT quote block in StepCard right panel should show transcript lines matching current video timestamp
- [ ] Currently shows static linked transcript lines — needs real-time sync with `currentVideoTime`
- [ ] Update StepCard to read `currentVideoTime` from store and display matching lines

---

## 7. Step Description Workflow (Workflow 5) ✅ COMPLETED 2026-04-09
- [x] Fix splitInBatches loop output connection (main[1] = loop, main[0] = done)
- [x] Remove broken Check If All Done + All Steps Done? nodes
- [x] Fix Mark Pipeline Complete to use $('Setup Config') / $('Extract Run Info') references
- [x] Fix Authorization header format across all HTTP nodes
- [x] Fix Get Transcript Lines — query by timestamp range (not linked_step_id)
- [x] Add gemini_description as fallback context for steps with no transcript
- [x] Increase maxOutputTokens 1024 → 8192 (Gemini 2.5 Flash thinking token budget)
- [x] All 11 steps for SOP 58eeee02 populated with title + description + sub_steps ✅

---

## Priority Order (suggested)
1. ~~Workflow 5 (Step Descriptions)~~ — ✅ Done
2. ~~Transcript Workflow 1 fixes~~ — ✅ Done (re-run pending separately)
3. Callout cleanup (Workflow 3 prompt update)
4. Frame capture threshold
5. "From the KT session" sync
6. Document export format (wait for template)
7. Process map SVG
