-- ============================================================
-- SOP Platform — Seed: Aged Debtor Report KT Session
-- Source: docs/reference/Transcript.md
-- Session: 2025-12-31 | Client: Starboard Hotels
-- Runs after 001_initial_schema.sql (alphabetical order)
-- ============================================================

-- ── 1. Admin User ─────────────────────────────────────────
INSERT INTO users (id, email, name, role) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@infomate.com',
    'System Admin',
    'admin'
);

-- ── 2. SOP Master Record ──────────────────────────────────
INSERT INTO sops (
    id, title, status, meeting_date,
    meeting_participants, client_name, process_name, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Aged Debtor Report — Knowledge Transfer',
    'draft',
    '2025-12-31',
    '["Kanu Parmar","Lasya Bogavarapu","Suchith Peiris","Osada Jayampathi","Robinson Kumara","Sandun Mihiranga","Devindu Chandupa"]'::jsonb,
    'Starboard Hotels',
    'Aged Debtor Report',
    '00000000-0000-0000-0000-000000000001'
);

-- ── 3. SOP Steps (8 steps extracted from transcript) ──────
INSERT INTO sop_steps
    (id, sop_id, sequence, title, description, sub_steps, timestamp_start, timestamp_end)
VALUES

(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    1,
    'Log in to the Shared Folder',
    'Navigate to the SBH Accounts shared folder and locate the Aged Debtor report files within the Credit Check and Aged Date subfolders. Access is provisioned by the IT team on receipt of a GM authorisation email.',
    '["Open the SBH Accounts shared folder from the network drive","Navigate into the Credit Check subfolder","Open the Aged Date subfolder containing the fiscal year hierarchy","Locate the current fiscal year folder (e.g. 2025-2026) and the current month subfolder"]'::jsonb,
    32, 120
),
(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    2,
    'Share the Current Week Folder',
    'Create the weekly reporting folder for the current week and distribute a shared link to the full GM distribution list so each property can upload their AR and PM Folio reports.',
    '["Navigate to AR Reporting - SBH inside the current month folder","Create a new subfolder for the current week (e.g. 24th Dec)","Generate a shared link to the new folder","Send the shared link via email to all 44 GMs and management accountants"]'::jsonb,
    120, 280
),
(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    3,
    'Verify Uploaded Reports',
    'Check each property subfolder to confirm both the AR report (Excel and PDF) and the PM Folio report have been submitted. Note any missing files and chase the responsible GM immediately.',
    '["Check each hotel subfolder for AR report in both Excel and PDF format","Confirm that the PM Folio report PDF is present","Note any missing files in the tracker comments column","Send a chase email to the GM listing the exact missing file types","Record persistent non-compliance for escalation"]'::jsonb,
    280, 420
),
(
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    4,
    'Duplicate Previous Week Sheet',
    'Copy the most recent completed weekly tab to create the current week template. Updating the As At Date header automatically recalculates Column L (Movement since last report) via the existing formula.',
    '["Open the most recent completed _FINAL workbook (e.g. 17th Dec)","Right-click the latest week tab and select Move or Copy","Check the Create a copy checkbox and confirm","Rename the new tab with the current week date (e.g. 24th Dec)","Update the As At Date header cell to the current reporting date","Verify Column L has recalculated automatically — no manual intervention needed"]'::jsonb,
    420, 540
),
(
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    5,
    'Clear Previous Week Data',
    'Remove all data from the duplicated sheet to create a clean working slate for the current week. Clear both the main grid values and the Comments section, but do not delete any formulas.',
    '["Select all data cells in the main property grid","Press Delete to clear all previous week values","Navigate to the Comments section","Clear all comment text from the prior report","Confirm that no formula cells have been accidentally deleted"]'::jsonb,
    540, 600
),
(
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    6,
    'Update Aged Debtor Values',
    'Enter AR data for each property. Manually verify all bucket totals against the source PDF — never rely on GM-provided formula totals as these frequently contain errors. This is the critical quality control step.',
    '["Open each property AR report Excel file","Manually sum the Current, 30+, 60+, 90+, and 120+ day buckets","Compare the manual sum against the Total Balance on the source PDF — they must match","If values differ, flag the discrepancy to the GM before entering data","Paste verified values using Paste Values only (no formulas)","Enter negative balances separately — do not mix credits with debt totals"]'::jsonb,
    600, 900
),
(
    '20000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000001',
    7,
    'Verify PM Folio Values',
    'Cross-reference the Permanent Folio values in the sheet against the PM report PDF. Any balance aged over 2 days must be flagged for transfer to the AR Ledger (the previous 7-day rule has been updated to 2 days).',
    '["Open the PM Folio report PDF for each property","Locate the PM Account by Room breakdown","Identify any balance aged over 2 days (updated from the previous 7-day threshold)","Cross-reference the PM figure in the Excel sheet against the PDF total","Flag discrepancies in the comments column and request backup data if needed","Chase properties missing PM reports (e.g. Derby) before the Tuesday deadline"]'::jsonb,
    900, 1080
),
(
    '20000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000001',
    8,
    'Copy Notes and Finalise Report',
    'Carry forward any unresolved notes from the previous week, perform a final cross-check of all totals, then save and rename the file with _FINAL before distributing to all stakeholders.',
    '["Review the previous week comments for any ongoing issues","Copy unresolved notes that still apply to the current week","Perform a final cross-check of all property totals against source PDFs","Save the workbook","Rename the file with _FINAL suffix once all checks pass","Email the completed report to all 44 GMs, Directors, and management accountants before Tuesday lunch"]'::jsonb,
    1080, 1200
);

-- ── 4. Step Callouts ──────────────────────────────────────
-- Step 1: folder navigation landmarks (3 callouts)
INSERT INTO step_callouts
    (id, step_id, callout_number, label, element_type,
     target_x, target_y, confidence, match_method, ocr_matched_text, gemini_region_hint)
VALUES
(
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    1, 'SBH Accounts shared folder', 'folder',
    145, 210, 'ocr_exact', 'ocr_exact_text', 'SBH Accounts',
    'left sidebar, top-level shared folder'
),
(
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    2, 'Credit Check subfolder', 'folder',
    165, 265, 'ocr_exact', 'ocr_exact_text', 'Credit Check',
    'left sidebar, second item under SBH Accounts'
),
(
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    3, 'Aged Date subfolder', 'folder',
    182, 318, 'ocr_fuzzy', 'ocr_fuzzy_text', 'Aged Date',
    'left sidebar, third item under Credit Check'
);

-- Step 4: sheet duplication interface (2 callouts)
INSERT INTO step_callouts
    (id, step_id, callout_number, label, element_type,
     target_x, target_y, confidence, match_method, ocr_matched_text, gemini_region_hint)
VALUES
(
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000004',
    1, '17th Dec tab — right-click to copy', 'tab',
    412, 748, 'ocr_exact', 'ocr_exact_text', '17th Dec',
    'bottom tab bar, most recently completed week tab'
),
(
    '30000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000004',
    2, 'As At Date header — update to current week', 'cell',
    580, 142, 'gemini_only', 'gemini_coordinates', NULL,
    'top of sheet, date header cell in row 2'
);

-- ── 5. Transcript Lines (first 8 speaker turns) ───────────
-- Lines 5-8 linked to step 1 (folder navigation begins at 00:32)
INSERT INTO transcript_lines
    (id, sop_id, sequence, speaker, timestamp_sec, content, linked_step_id)
VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    1, 'Kanu Parmar', 0,
    'Morning Lasya.',
    NULL
),
(
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    2, 'Lasya Bogavarapu', 7,
    'Hi Kanu. Is it just you in the office today?',
    NULL
),
(
    '40000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    3, 'Kanu Parmar', 13,
    'Oh, just me and my ghost. (Laughs). Can you see my screen?',
    NULL
),
(
    '40000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    4, 'Suchith Peiris', 27,
    'Yes, yes.',
    NULL
),
(
    '40000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    5, 'Kanu Parmar', 32,
    'Okay, let me show this one here from this folder... which is the SBH Accounts shared folder. There is a Credit Check folder under that.',
    '20000000-0000-0000-0000-000000000001'
),
(
    '40000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    6, 'Suchith Peiris', 52,
    'Yeah, I am sorry to interrupt Kanu. Since this is a KT session, we will be asking questions from the beginning itself. For this particular folder path, we still do not have access, but we will be getting access, right?',
    '20000000-0000-0000-0000-000000000001'
),
(
    '40000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000001',
    7, 'Lasya Bogavarapu', 70,
    'Suchith, maybe you might... I mean, we might have a shared access folder. So we can create a new folder in that and we can do that. We wanted to create a new shared folder between Informat and Starboard. Either payment runs or everything, you can set it up in that folder.',
    '20000000-0000-0000-0000-000000000001'
),
(
    '40000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000001',
    8, 'Suchith Peiris', 93,
    'Okay, okay. Thank you, Lasya.',
    '20000000-0000-0000-0000-000000000001'
);

-- ── 6. SOP Sections (4 AI-generated sections) ─────────────
INSERT INTO sop_sections
    (id, sop_id, section_key, section_title, display_order, content_type, content_text, content_json)
VALUES

-- Purpose (prose text)
(
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'purpose', 'Purpose/Objective/Scope', 1, 'text',
    'This SOP defines the weekly process for compiling and distributing the Aged Debtor Report for Starboard Hotels. The process covers collection of AR and PM Folio data from approximately 44 General Managers, consolidation into a master Excel workbook, and distribution to senior management and finance stakeholders before Tuesday lunch each week. The scope applies to the InfoMate finance processing team responsible for weekly AR reporting.',
    NULL
),

-- Inputs (JSON list)
(
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'inputs', 'Input', 2, 'list',
    NULL,
    '["SBH Accounts shared folder access (IT team provisioned via GM email authorisation)","AR report files from each GM property in both Excel and PDF formats","PM Folio report PDFs from each property","Previous week completed and verified Aged Debtor Excel workbook (_FINAL)"]'::jsonb
),

-- Outputs (JSON list)
(
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'outputs', 'Output', 4, 'list',
    NULL,
    '["Completed Aged Debtor Report Excel workbook with _FINAL suffix","Management PDF exported from the final Excel workbook","Distribution email sent to all 44 GMs, Directors, and management accountants before Tuesday lunch"]'::jsonb
),

-- Risks (JSON table with risk/mitigation pairs)
(
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'risks', 'Description of Risks', 5, 'table',
    NULL,
    '[{"risk":"GM-provided Excel totals do not match the source PDF balance due to manual formula errors","mitigation":"Always manually sum Current, 30+, 60+, 90+, and 120+ day buckets and compare against PDF Total Balance before entering any data"},{"risk":"Properties submit PDF only without the required Excel AR report","mitigation":"Chase the GM via email listing the exact missing files; record non-compliance and escalate if not received before Tuesday deadline"},{"risk":"Negative balances mixed into debt totals create a misleadingly low Total Debt figure","mitigation":"Separate Aged Debt and Credits into two tables: Table A for actual Aged Debt, Table B for Credits and Refunds"},{"risk":"Report not distributed by Tuesday lunch causing director-level escalation on Wednesday","mitigation":"Set Monday morning as internal target; if delayed, send before Tuesday lunch to prevent escalation email chain"}]'::jsonb
);

-- ── 7. Step Discussions (2 contextual Q&A items) ──────────
INSERT INTO step_discussions
    (id, step_id, summary, discussion_type,
     transcript_refs, transcript_start, transcript_end, speakers)
VALUES

-- Discussion 1: folder access clarification on Step 1
(
    '60000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Suchith raised that the InfoMate team does not yet have access to the SBH Accounts shared folder. Lasya clarified that a new shared folder will be set up between InfoMate and Starboard to provide access for payment runs and reporting, eliminating the need to share the existing client folder directly.',
    'clarification',
    '["40000000-0000-0000-0000-000000000006","40000000-0000-0000-0000-000000000007"]'::jsonb,
    52, 93,
    '["Suchith Peiris","Lasya Bogavarapu"]'::jsonb
),

-- Discussion 2: manual summing warning on Step 6
(
    '60000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000006',
    'Kanu demonstrated using Wyndermere as an example that GM-provided Excel totals frequently do not reconcile with the PDF balance due to manual formula errors. This is a critical quality control point — the processor must always manually sum all aged debt buckets and verify against the source PDF. Relying on the GM total is not acceptable.',
    'warning',
    '[]'::jsonb,
    675, 855,
    '["Kanu Parmar","Lasya Bogavarapu","Suchith Peiris"]'::jsonb
);

-- ── 8. Property Watchlist (5 entries from transcript) ─────
INSERT INTO property_watchlist
    (id, sop_id, property_name, known_issues, status, required_actions)
VALUES

(
    '70000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Gatwick',
    'Model property: consistently provides AR report in both Excel and PDF, and PM Folio report in PDF. Filing format and naming convention is always correct.',
    'model_property',
    'Use Gatwick as the gold standard reference for all other properties. Include a screenshot of the Gatwick folder structure as the expected format example in the SOP.'
),
(
    '70000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Wyndermere',
    'Consistently uses incorrect formats. Manual totals in the Excel file rarely match the formula results. Bucket values frequently do not reconcile with the PDF Total Balance.',
    'active',
    'Always manually re-sum all bucket values before entry. Instruct the GM to use the standard Gatwick format. Escalate recurring format issues to the Account Manager if corrections are repeatedly required.'
),
(
    '70000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Derby',
    'Habitually misses submission deadlines. Sends PDF only — rarely provides the Excel version of the AR report. PM Folio reports are frequently absent.',
    'active',
    'Send a mandatory chase email to Derby GM every Monday before noon if files are not received. Log each missed submission. Escalate to Director if pattern continues beyond two consecutive weeks.'
),
(
    '70000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'Burnley',
    'Sends AR reports with handwritten annotations on the PDF. Data must be manually transcribed, which is time-consuming and error-prone compared to properties submitting typed Excel files.',
    'active',
    'Request Burnley GM to provide a clean typed Excel file alongside the annotated PDF. If handwritten PDFs continue, manually transcribe and double-check all values before entry. Flag cumulative time cost to the Account Manager.'
),
(
    '70000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'Tamworth',
    'Sends Excel AR reports but consistently omits the PM Folio backup data. The PM figure appears in the sheet without supporting evidence, making cross-verification impossible.',
    'active',
    'Always request the PM Folio PDF from Tamworth separately. Do not enter PM figures without backup data. If PM report is not received, mark as unverified in comments and chase before the Tuesday deadline.'
);
