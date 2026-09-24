# CLAUDE_problems.md -- Failure Patterns and Mitigations (Tagged)

**Tags:** [GENERAL] = applies to all projects | [WEB] = Flask/Python web projects | [VBA] = Excel/VBA projects | [GIT] = git/version control

**Purpose:** RCA and context for known failure modes. Read when something goes wrong, when diagnosing unexpected behaviour, or when onboarding a new session phase. NOT required reading every session turn — that's `STANDING_RULES.md`.

**Actionable rules distilled from this file live in:** `STANDING_RULES.md` — read that every session.

**Last updated:** 2026-09-16 19:05 EDT (P038 added)

---

## META-RULE -- Error Documentation Standing Order (2026-06-11)

**Standing order from Ben:** Whenever any error occurs during any session, Claude MUST:
1. Review CLAUDE_problems.md immediately for any related prior pattern
2. Document the new error with: error description, root cause, mitigation applied, and prevention steps
3. Write the entry to CLAUDE_problems.md before continuing work -- do not defer
4. Nothing should be lost to a compaction event -- document while the error is fresh

This applies to ALL error types: Python exceptions, Flask bugs, bash failures, tool failures, VBA errors, file corruption, subprocess issues, session bugs, and any unexpected behavior requiring a workaround.

---

## P001 [GENERAL] -- Context Compaction Corrupts Structured Data

**Severity:** High
**Pattern:** When a session runs long, conversation history is summarized (compacted). Structured data — especially tables with similar-looking values (numbered lists, matrices, codes) — is vulnerable to silent corruption. Values get transposed, substituted, or lost. Claude then uses the corrupted data confidently, with no awareness that an error occurred.

**Rule:**
- Never trust in-session memory for structured reference data after a long session.
- Always read source documents directly before any work that depends on structured data (mappings, formulas, named ranges, schema definitions, etc.).
- If a project has a reference file (e.g., CLAUDE.md), read it — but then verify its structured sections against the live source before relying on them.

---

## P002 [GENERAL] -- Reference Documents Written from Memory Inherit Compaction Errors

**Severity:** High
**Pattern:** A reference document (like CLAUDE.md) was created to survive compaction. But it was authored during an already-compacted session, so it encoded wrong data with false confidence. The document intended to prevent the problem became a vehicle for propagating it.

**Rule:**
- Never write or update a reference document from session memory alone.
- Always read the relevant source files directly before authoring or updating any reference document.
- After writing, read back the critical sections and verify them against the source before saving.

---

## P003 [GENERAL] -- Edit Tool Truncates End of Large Files

**Severity:** Medium
**Pattern:** The Edit tool drops trailing lines when editing large files — confirmed on JS scripts, Python scripts, and docx XML. The file appears intact when read from the middle, but the tail is silently missing. For scripts, the result is a silent syntax/runtime failure; for XML, a validation error on repack. The truncation recurs even after recovery if the Edit tool is used again on the same file.

**Primary workflow — PREVENTION (use this by default):**
- **Never use the Edit tool on large JS or Python scripts.** Use Python string replacement exclusively:
  ```python
  content = open('file.js').read()
  content = content.replace('old string', 'new string')
  open('file.js', 'w').write(content)
  ```
- For docx XML files (`word/document.xml` and similar), use the Edit tool only for small, isolated changes nowhere near the end of the file. For any change within the last ~20% of a large XML file, use Python string replacement instead.
- After any write — Python or otherwise — verify the tail before running: `tail -5 filename`

**Fallback — if truncation has already occurred:**
- Identify the last clean line with `tail -20 filename`
- Strip to the last clean point and reconstruct the tail in Python:
  ```python
  content = open('file.js').read()
  cut = content.rfind('\n[last known clean line]')
  open('file.js', 'w').write(content[:cut] + reconstructed_tail)
  ```
- For docx XML: find the last complete `>`, strip everything after it, then reconstruct the proper closing tags (`</w:rPr>`, `</w:r>`, `</w:p>`, `</w:tc>`, `</w:tr>`, `</w:tbl>`, `</w:body>`, `</w:document>`) based on context.

**Additional pattern — mixed-tool conflict (noted 2026-05-31):**
After Python rewrites a file, the Edit tool will refuse the next operation with "file modified since read." This is a secondary symptom of the same root cause: the Edit tool is not safe for large files that are also being modified by Python. The fix is the same — use Python for all edits on that file, not just some.

**Last updated:** 2026-06-11 18:46 EDT (P024-P026 added; meta-rule standing order added)

---

## P004 [GENERAL] -- soffice PDF Conversion Times Out in Long Sessions

**Severity:** Low-Medium
**Pattern:** The `python scripts/office/soffice.py` wrapper times out in long bash sessions, causing PDF conversion steps (needed for visual QA of .pptx files) to fail silently.

**Rule:**
- In long sessions, call soffice directly rather than through the Python wrapper:
  ```bash
  soffice --headless --convert-to pdf file.pptx --outdir /path/to/dir/ &
  sleep 20
  ```

---

## P005 [GENERAL] -- User Preference: No Multi-Select Questions

**Severity:** Medium (user experience)
**Pattern:** Claude used multiple-choice / multi-select question formats. User stated explicitly this is not acceptable: answers will always be given in free text.

**Rule:**
- Never use multi-select or multiple-choice question formats with this user.
- Ask clarifying questions in plain prose only.

---

## P006 [GENERAL] -- Providing Unverified URLs / The URL Rule

**Core principle:** Research is useless unless it can be human verified.

**Severity:** Medium
**Pattern:** Claude cited a URL as a source without first fetching it to verify it was accessible and pointed to the expected content. The URL redirected to an unrelated page, making the citation useless and eroding trust in the research.

**Rule:**
- Never cite a URL as a source without first fetching it with `mcp__workspace__web_fetch` to confirm it (a) resolves without redirect to an unrelated page, and (b) contains the content being cited.
- If a URL cannot be fetched or redirects, do not cite it. Either find an alternative source or disclose that the source could not be verified.
- Receiving partial content from a fetch is not sufficient verification. Community forums, gated portals, and login-walled pages often return snippet content publicly before requiring authentication for the full page. Verify that the fetched content actually contains the specific claim being cited — not just that the fetch returned something.
- This applies to all URLs, including those returned by web search results.

---

## P007 [GENERAL] -- Claiming Prior Work Was Not Done Without Reading the Transcript

**Severity:** High
**Pattern:** When asked whether a prior task had been completed, Claude said it could not confirm and offered to redo the work — without first reading the session transcript. The transcript was accessible the entire time and contained the answer. The failure had two compounding causes: (1) Claude misread a compacted summary that noted gaps as meaning the work was not done, rather than substantially done with specific gaps remaining; (2) Claude did not apply the obvious fix — read the transcript — before responding.

**Rule:**
- Any time the question is "has X already been done?" or "was X researched/completed?", read the session transcript before answering. Do not rely on session summaries for work completion status.
- Session summaries are lossy. They note gaps and open items prominently. "Gaps exist" does not mean "work not done."
- The transcript is the primary source for what actually happened. It is accessible via the .jsonl file in the project outputs folder. Use it.
- Never offer to redo work before verifying whether it was already done.
- **Last added:** 2026-05-31

---

## P008 [GENERAL] -- Within-Session State Loss on Multi-Item Tracking Tasks

**Severity:** High
**Pattern:** During a long session involving a multi-item checklist (e.g., 15 benefits, each with 6 content slots), Claude reached a correct resolution for several items mid-session, then later reconstructed the open/closed list from scratch — contradicting earlier conclusions without noticing. Specifically: B6, B9, B10 Gain 2 were correctly marked resolved, then re-added to the open list in a subsequent turn. This is distinct from P001 (cross-session compaction) and P007 (transcript blindness before claiming work undone). The failure is within a single session: conclusions decay across turns when the context is large.

**Root cause:** Claude regenerates state summaries from the full context window rather than from a persistent record. In a long session, earlier conclusions are present in context but are weighted less than recent content, and are silently dropped when Claude reconstructs a list.

**Rule:**
- For any task involving a multi-item checklist or tracking structure with more than ~6 items, maintain a persistent session state file on disk (e.g., `SESSION_STATE.md` in the project folder).
- Update the file immediately after any item is resolved — do not rely on in-context memory across turns.
- Before stating any item's status (open, closed, resolved), read the session state file. Do not reconstruct from memory.
- When a session state file exists, reference it explicitly: "Per SESSION_STATE.md, the open items are..."
- **Last added:** 2026-06-01

---

## P009 [GENERAL] -- Compaction Cascade: Second-Generation Summaries Are Increasingly Lossy

**Severity:** High
**Pattern:** A session that has already been compacted once contains a lossy summary at the top. When that session is compacted again, the new summary is generated from context that is itself already a summary — a second-generation compression. Each generation loses more detail, and errors introduced early propagate forward with increasing confidence. This project has already experienced at least one compaction cycle.

**Rule:**
- Never rely on compaction summaries as a source of truth for any structured data, decision, or completion status.
- The antidote is files, not context. Every decision, completion, and standing rule must be written to a persistent file (CLAUDE.md, CLAUDE_problems.md, PROJECT_STATE.md) before the session ends or risks compaction.
- At the start of any session that shows a compaction summary header, treat ALL in-context facts as unverified until cross-checked against source files.
- **Last added:** 2026-06-01

---

## P010 [GENERAL] -- Document Section Drift: No Canonical Map for Multi-Section Files

**Severity:** Medium
**Pattern:** BVF_Benefit_Headers.docx has grown through multiple sessions into a layered document with 4+ appended sections (original headers, 2+2+2 rewrite, research pass 2, B11 supplement). The authoritative content for any given benefit is distributed across sections with no index. A future session — or a later turn in this one — cannot reliably determine which paragraph contains the current version of a specific stat without reading hundreds of paragraphs.

**Rule:**
- Any document that grows through appending across sessions must have a section map maintained in PROJECT_STATE.md.
- When a new section is appended to a document, update the section map immediately.
- When editing content that exists in multiple sections, update all instances or explicitly mark earlier instances as superseded.
- Current BVF_Benefit_Headers.docx section map is in PROJECT_STATE.md.
- **Last added:** 2026-06-01

---

## P011 [GENERAL] -- Decision Decay: Session Decisions Not Written to Persistent Files

**Severity:** High
**Pattern:** Decisions made mid-session (stat choices, source substitutions, framing directions, standing rules given by Ben) live only in the conversation context. When the session is compacted or ends, these decisions are either lost or encoded imprecisely in a summary. Future sessions then re-litigate or contradict them. This session produced multiple decisions not yet in CLAUDE.md: B8/B14 "industry benchmark" attribution, B1 Pain 2 calculation method, B8 Pain 2 McKinsey substitution, IBM 2025 update, B1/B5 Gain 2 direction.

**Rule:**
- Any time Ben gives a direction that constitutes a standing decision (source choice, calculation method, attribution standard, content direction), write it to CLAUDE.md Key Decisions Log before the next tool call.
- Any time a new standing behavioral rule is stated by Ben, write it to CLAUDE_problems.md Standing Rules immediately.
- Do not accumulate decisions in context with the intention of writing them "at the end" — they will be lost if compaction occurs first.
- **Last added:** 2026-06-01

---

## P012 [GENERAL] -- Workbook Unreadable: Root Cause Unknown

**Severity:** Medium
**Pattern:** `ITSM Business Value Framework.xlsx` was unreadable to both the sandbox and LibreOffice. Excel was confirmed not open; no active Excel processes. The workaround was renaming the file — the renamed copy (`v0.01.xlsx`) opened successfully. This is distinct from the earlier mount/BytesIO issue — that was a path problem; this is a file-state problem.

**Status:** Workaround only — root cause unresolved and undiagnosed. Candidates include: GeniusDrive cloud sync holding a lock mid-sync, corrupted file state from a prior write operation, or a Windows permissions artifact. None confirmed.

**Mitigation:**
- If a read fails with a file-unreadable error, ask Ben whether a sync process may be active, then retry. If still unreadable, rename as a last resort.
- Do not state a confident diagnosis without evidence — the Excel shadow-copy explanation was incorrect.
- **Last added:** 2026-06-01

---

## P013 [GENERAL] -- Confabulation from Compacted Memory Presented as Verified Fact

**Severity:** Critical
**Pattern:** After compaction, Claude reconstructs file contents (cell values, paragraph text, URLs, cell references) from the compaction summary and states them with the same confidence as directly-read content. The fabricated Discovery cell references during T-04 (B36, B42, B44, B45, B46 — none of which contained the flagged content) are the clearest example. Ben received an unusable list of corrections and had no way to distinguish verified claims from invented ones. This forced granular per-item prompting as the only error-catching mechanism, wasting significant time.

**Root cause:** Claude has no internal flag distinguishing "read in this session" from "reconstructed from memory." Both feel equally certain. Compaction summaries are particularly dangerous because they are written in declarative language that encodes reconstructions as facts.

**Rule:**
- Before stating the contents of any cell, paragraph, shape, formula, or file location, read it in the current session. No exceptions.
- If content has not been read in the current session, say so explicitly: "I need to read that first."
- Never present a reconstruction from a compaction summary as a verified fact.
- Diagnoses and root causes must be supported by evidence read in the current session. Inferences must be labeled as such.
- **Last added:** 2026-06-01

---

---

## P014 [VBA] -- VBA: Application.Range() Fails for Sheet Names with Spaces When PowerPoint Is Open

**Severity:** High — causes silent skips with no visible error until the summary dialog
**Discovered:** W3-03 ExportToReport QA, 2026-06-07. Produced 4 skipped rows every run.
**Pattern:** `Application.Range("'Sheet Name'!A1:B10")` fails silently under `On Error Resume Next` when PowerPoint is the foreground application and a sheet name contains spaces. The range object returns `Nothing` even though the address is syntactically correct. The error manifests as a range-resolution failure on any row referencing a multi-word sheet name (e.g., `Business Value Summary`).

**Additional finding (Ben's observation):** The sourceID string as stored in the Report sheet contained the sheet name in single-quotes with an extra trailing single quote — e.g. `'Business Value Summary'!O2:R16'` — which the original `ResolveRangeAddress` was not stripping, compounding the failure.

**Root cause:** Two compounding issues: (1) `Application.Range()` is unreliable for cross-sheet references when PPT holds focus; (2) the source string had an extra trailing quote that wasn't being cleaned.

**Fix applied in `Macro - ExportToReport (complete).txt`:**
Rewrote `ResolveRangeAddress` to:
1. Parse sheet name and range part separately using `InStr(addr, "!")` as the split point
2. Strip ALL leading and trailing single quotes from both parts using `Do While` loops (handles any number of quote characters, not just one)
3. Use `For Each ws In ThisWorkbook.Worksheets` + `StrComp` to locate the sheet (immune to focus/foreground issues under `On Error Resume Next`)
4. Fall back to `Application.Range("'" & sheetPart & "'!" & rangePart)` only as strategy 2

**Rule for next project:**
- Never use `Application.Range(addr)` for ranges that may include multi-word sheet names — use the `For Each ws` worksheet loop as the primary strategy from the start.
- Strip trailing/leading quotes from both the sheet name and the range part using `Do While` loops — not a single `Trim` or `Replace`, which misses doubled quotes.
- After building ExportToReport for a new project, run a full push with PPT open before declaring it functional. Sheet-name space issues will not surface in test runs where PPT is closed.

---

## P015 [VBA] -- VBA: Chart.Export Produces Empty PNG When PowerPoint Is Open

**Severity:** High — chart images push silently but render as blank shapes in the deck
**Discovered:** W3-03 ExportToReport QA, 2026-06-07. All chart images on slides 20–27 were blank/missing in the first test run.
**Pattern:** `ChartObject.Chart.Export "path.png"` silently produces an empty or zero-byte PNG file when PowerPoint is the foreground application and has taken rendering focus from Excel. The subsequent `AddPicture` call reads the empty file and creates a shape with no embedded image — no error is raised at any point.

**Root cause:** Excel's chart rendering engine cannot export to file when another Office application holds the rendering context. The failure is completely silent.

**Fix applied:**
Replaced `Chart.Export` + `AddPicture` with clipboard-based approach for ALL image pushes (both chart and range):
```vba
DoEvents   ' <-- only BEFORE CopyPicture
cht.CopyPicture Appearance:=xlScreen, Format:=xlPicture
' NO DoEvents here — go straight to Paste (see P016)
Dim pasted As Object
Set pasted = slide.Shapes.Paste()
```
After paste, resize and position the new shape, then delete the placeholder.

**Rule for next project:**
- Never use `Chart.Export` + `AddPicture` in any ExportToReport implementation where PowerPoint will be open during the macro run. Use `CopyPicture` + `Shapes.Paste()` exclusively.
- Apply the same clipboard approach to range images (`rng.CopyPicture`) — do not mix strategies between chart and range cases.
- The placeholder shape is deleted AFTER the paste and rename, not before — deleting it first removes the positioning target.

---

## P016 [VBA] -- VBA: DoEvents Between CopyPicture and Paste Clears the Clipboard

**Severity:** High — causes a runtime error: "Clipboard is empty or contains data which may not be pasted here"
**Discovered:** W3-03 ExportToReport QA, 2026-06-07. Affected Benefit 10 (B10) after the P015 chart fix was applied; all other benefits passed. Root cause took one full debug cycle to identify.
**Pattern:** A `DoEvents` call between `CopyPicture` and `Shapes.Paste()` yields control to Windows, which processes pending window messages. One of those messages clears the clipboard. The subsequent `Paste()` then fails with a runtime error because the clipboard is empty.

**Why B10 specifically:** The B10 benefit slide had an extra processing step between the CopyPicture and Paste calls compared to other slides, making the timing window wider. Once `DoEvents` was removed, B10 passed on the same run as all other slides.

**Root cause:** `DoEvents` is a yielding mechanism — it allows Windows message processing, which includes clipboard-clearing operations from background processes. Clipboard contents are not guaranteed to persist across a `DoEvents` call.

**Fix applied:**
Remove ALL `DoEvents` calls between `CopyPicture` and `Paste()`. Keep exactly one `DoEvents` immediately BEFORE `CopyPicture` (to let Excel finish rendering), and go straight to `Paste()` after. No intermediate `DoEvents`.

```vba
DoEvents                                              ' OK — before copy
cht.CopyPicture Appearance:=xlScreen, Format:=xlPicture
' ← NO DoEvents here ←
Set pasted = slide.Shapes.Paste()                    ' must be immediate
```

**Rule for next project:**
- Never place `DoEvents` between any `CopyPicture` call and the corresponding `Shapes.Paste()`.
- One `DoEvents` before `CopyPicture` is correct and necessary — it is the `DoEvents` AFTER that causes the failure.
- If B10 (or any specific slide) is the only one failing a clipboard paste, suspect a `DoEvents` or any other yielding call in the code path between the copy and paste.

---

## P017 [VBA] -- PPTX Template: Text Formatting Not Inherited Without Explicit endParaRPr Attributes

**Severity:** Medium — VBA push succeeds but text renders with wrong formatting (font, size, bold, color)
**Discovered:** W3-03 ExportToReport QA, 2026-06-07. `txt_annual` and `txt_3yr` shapes on all 15 benefit slides showed incorrect formatting (not Calibri 28pt White Bold) after text was pushed via ExportToReport.
**Pattern:** A PowerPoint shape's `endParaRPr` (end-of-paragraph run properties) defines the formatting of any text pushed into that paragraph by VBA. If `endParaRPr` omits explicit attributes (`b`, `solidFill`, `latin` typeface), VBA-pushed text inherits nothing and renders with default formatting — even if the shape visually appears correctly formatted when viewed in PowerPoint with placeholder text.

**Why it's hard to catch in design:** In PowerPoint's normal editing mode, placeholder text may display correctly because formatting is inherited from a theme or layout master. After a VBA text push, that inheritance chain is bypassed and only the explicit XML attributes in `endParaRPr` are applied.

**Root cause:** The template's benefit slide shapes had `<a:endParaRPr lang="en-US" sz="2800" dirty="0"/>` — correct size, but missing `b="1"` (bold), `<a:solidFill>` (white), and `<a:latin typeface="Calibri"/>`. VBA-pushed text therefore rendered as non-bold, black, default-font.

**Fix applied:**
Updated `endParaRPr` on all 15 benefit slides in the template via python-pptx:
```xml
<a:endParaRPr lang="en-US" sz="2800" b="1" dirty="0">
  <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
  <a:latin typeface="Calibri"/>
</a:endParaRPr>
```
Also updated existing `<a:r><a:rPr>` runs in the same shapes to carry the same explicit attributes.

**Rule for next project:**
- After building any slide template that will receive VBA-pushed text, inspect the raw XML of each target shape's `endParaRPr`. Verify it has ALL required formatting attributes explicitly — `b`, `sz`, `solidFill` with color, `latin` typeface.
- Do not trust the visual appearance of shapes in PowerPoint's editing view — placeholder text rendering does not reflect what VBA will produce.
- The fix is always at the template level (XML), not in the VBA push code. If text looks wrong after a push, open the PPTX, unpack it, find the shape's XML, and add the missing `endParaRPr` attributes.
- Script the template XML fix in python-pptx and run it against the template before any ExportToReport testing — doing it after the first failed run wastes a full test cycle.

---

## P019 [VBA] -- VBA: Worksheet_Calculate Event Causes Infinite Loop When Handler Modifies Sheet Structure

**Severity:** High — locks up Excel; requires Ctrl+Break or force-quit
**Discovered:** W3-05c QA, 2026-06-08. RunRowVisibility called from Data sheet Worksheet_Calculate; hiding/showing rows on Discovery and Framework sheets triggered recalculation, re-firing Worksheet_Calculate.
**Pattern:** Any `Worksheet_Calculate` handler that modifies row/column visibility, cell values, or any other property that can trigger recalculation will re-fire the event, creating an infinite loop.

**Fix:**
Wrap the entire handler body with `Application.EnableEvents = False` / `Application.EnableEvents = True`, including the `Failed` handler so events are always restored even on error.

```vba
Public Sub RunRowVisibility()
    On Error GoTo Failed
    Application.EnableEvents = False
    Application.ScreenUpdating = False
    ' ... all work here ...
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Exit Sub
Failed:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Sub
```

**Rule for next project:**
- Any `Worksheet_Calculate` or `Worksheet_Change` handler that writes back to Excel (hides rows, sets values, changes formatting) must use `Application.EnableEvents = False` as its first substantive line, restored unconditionally in both the normal exit and the error handler.

---

## P020 [VBA] -- VBA: ChartObject.CopyPicture Produces Empty Clipboard When Chart Is Hidden

**Severity:** Medium — silent failure; clipboard empty at Shapes.Paste (error -2147188160)
**Discovered:** W3-05c + ExportToReport integration, 2026-06-08. RowVisibility had hidden charts for deselected benefits (`co.Visible = False`). ExportToReport then attempted CopyPicture on those hidden charts before the slideDelete pre-pass (W3-05e) eliminated the wasted pushes.
**Pattern:** `ChartObject.CopyPicture` on a chart where `Visible = False` completes without raising an error but leaves the clipboard empty. Same external symptom as P018 chart case (error -2147188160 at Shapes.Paste) but different cause.

**Fix (defensive, still present in code):**
Temporarily show the chart before copying, then restore its visibility:

```vba
Dim chtWasVisible As Boolean
chtWasVisible = cht.Visible
If Not chtWasVisible Then
    Application.ScreenUpdating = False
    cht.Visible = True
End If
' ... CopyPicture ...
If Not chtWasVisible Then
    cht.Visible = False
    Application.ScreenUpdating = True
End If
```

**Note:** With the slideDelete pre-pass (W3-05e) in place, ExportToReport never attempts to push a chart on a slide that will be deleted — so in practice this code path is rarely hit. The fix is retained as a defensive measure.

---

## P021 [VBA] -- VBA: Application.Goto Fails on Protected Sheets with xlUnlockedCells Selection

**Severity:** Medium — runtime error 1004; macro aborts
**Discovered:** W3-05b QA, 2026-06-08. Nav buttons on modNavigation used `Application.Goto ws.Cells(1,1), True` to scroll to the top of the target sheet after activating it. This fails when `ApplyUserMode` is active and sheets are protected with `EnableSelection = xlUnlockedCells` — row 1 contains the nav button shapes and title, which are locked cells.
**Pattern:** `Application.Goto` with `Scroll:=True` attempts to select the target cell. If the cell is locked and the sheet's `EnableSelection = xlUnlockedCells`, the select fails with error 1004.

**Fix:**
Replace `Application.Goto` with direct scroll — no cell selection required:

```vba
With ThisWorkbook.Worksheets(targetSheet)
    .Activate
    ActiveWindow.ScrollRow = 1
    ActiveWindow.ScrollColumn = 1
End With
```

**Rule for next project:**
- Never use `Application.Goto` for navigation in sheets that will be protected with `xlUnlockedCells`. Use `Activate` + `ScrollRow`/`ScrollColumn` instead.
- The same applies to `Workbook_Open` navigation stubs — remove any `.Cells(1,1).Select` after `ApplyUserMode` has run.

**Rule for next project:**
- Never call `CopyPicture` on a hidden ChartObject. Always check `cht.Visible` first and show temporarily if needed.
- The slideDelete pre-pass (standard architecture — see Key Decisions Log) eliminates most cases where this would occur; the explicit visibility check is belt-and-suspenders.

---

## P022 [VBA] -- VBA: ChartObject.CopyPicture Fails Silently Under DrawingObjects:=True Sheet Protection

**Severity:** High — silent failure; clipboard empty; Shapes.Paste error -2147188160
**Discovered:** W3-06b end-to-end test, 2026-06-08. ExportToReport ran successfully in dev mode but failed on img_comboChart (slide 18, ROI Analysis) once user mode was active. Same clipboard-empty symptom as P018/P020 but different cause.
**Pattern:** `ChartObject.CopyPicture` silently produces an empty clipboard when the chart's parent sheet is protected with `DrawingObjects:=True`. The protection call succeeds and the chart is visible — the failure is specific to the interaction between DrawingObjects protection and CopyPicture.

**Fix:**
Add `UnprotectAll` and `ReprotectAll` helpers to modDevMode. Call them at the start and end of ExportToReport:

```vba
' In ExportToReport, after PPT minimize:
modDevMode.UnprotectAll

' In ExportToReport, before PPT window restore:
modDevMode.ReprotectAll
```

`UnprotectAll` unprotects workbook structure and all sheets using DEV_PASSWORD.
`ReprotectAll` re-applies full user-mode protection (DrawingObjects:=True, Contents:=True, etc.) without touching app-level chrome.

**Rule for next project:**
- ExportToReport must always call `modDevMode.UnprotectAll` at the start of its run and `modDevMode.ReprotectAll` at the end when the workbook uses user-mode sheet protection.
- Do not assume VBA bypasses DrawingObjects protection for CopyPicture — it does not.

---

## P018 [VBA] -- VBA: CopyPicture Fails When PowerPoint Has Screen Rendering Focus

**Severity:** High — silent failure at runtime; error only surfaces in the summary dialog
**Discovered:** W3-05c QA, 2026-06-08. Manifested across three runs on rows 38, 46 (ranges), and 363 (chart).
**Pattern:** `CopyPicture Appearance:=xlScreen` fails when PowerPoint has screen rendering focus. For ranges, this produces error 1004 ("CopyPicture method of Range class failed"). For charts, it fails silently — no error raised, but the clipboard is left empty, causing `Shapes.Paste` to fail with error -2147188160 ("Clipboard is empty or contains data which may not be pasted here"). Both failure modes share the same root cause: `xlScreen` requires Excel to hold screen rendering focus, which PPT steals when open or being edited.

**Fix — ranges, iteration 1 (insufficient):**
Added `ThisWorkbook.Activate` + `rng.Parent.Activate` + `DoEvents` before `rng.CopyPicture Appearance:=xlScreen`. Resolved rows 38 and 46 but failed on row 40 when PowerPoint was actively being edited — more aggressive focus stealing than a passive open.

**Fix — ranges, iteration 2 (final):**
Replaced `Appearance:=xlScreen` with `Appearance:=xlPrinter`. The print pipeline has no screen focus dependency.

**Fix — charts, iteration 1 (insufficient):**
xlPrinter attempted for charts. Raises error 5 ("Invalid procedure call or argument") on every chart — `Appearance:=xlPrinter` is not a valid argument for `ChartObject.CopyPicture`. Only valid for `Range.CopyPicture`.

**Fix — charts, iteration 2 (discarded — functional but unacceptable UX):**
Minimized PPT window before each chart copy, restored after. Eliminated error but produced repeated minimize/restore animation on every chart push — unacceptable for end users.

**Fix — charts, iteration 3 (insufficient — PPT window restores mid-run):**
Minimize PPT once at the start of `ExportToReport`. Confirmed this resolves early chart copies. But in W3-06b testing: after UnprotectAll/ReprotectAll (P022) was added and early charts started succeeding, a later chart (B13/img_barChart, row 369) still failed intermittently. Exactly one chart fails per run; which chart fails changes across runs. Pattern: `Shapes.Paste` calls earlier in the run apparently restore the PPT window on some executions, returning screen rendering focus to PPT and causing the next `xlScreen CopyPicture` to silently produce an empty clipboard.

Added per-chart re-minimize (`pres.Windows(1).WindowState = 2` before every chart `CopyPicture`). This suppresses the failure for the early chart (B1) but the failure moves to a later chart (B13) — the root cause (PPT window restoration by Shapes.Paste) persists.

**Fix — charts, final (confirmed working 2026-06-08):**
Retry loop in PushImage chart case: up to 3 attempts, with 1-second wait between retries. Each attempt: re-minimize PPT, activate workbook+sheet, DoEvents, CopyPicture, then Paste with `On Error Resume Next` to catch -2147188160 without aborting. On success, position shape and exit function. On 3 consecutive failures, surface error with attempt count.

```vba
For chtTry = 1 To 3
    ' Show chart temporarily if hidden (P020)
    chtWasVisible = cht.Visible
    If Not chtWasVisible Then
        Application.ScreenUpdating = False
        cht.Visible = True
    End If

    ' Re-minimize PPT (P018)
    On Error Resume Next
    pres.Windows(1).WindowState = 2
    On Error GoTo Failed
    ThisWorkbook.Activate
    cht.Parent.Activate
    DoEvents
    cht.CopyPicture Appearance:=xlScreen, Format:=xlPicture
    ' No DoEvents here — P016

    If Not chtWasVisible Then
        cht.Visible = False
        Application.ScreenUpdating = True
    End If

    ' Catch clipboard-empty error to allow retry
    chtPasteErr = 0
    On Error Resume Next
    Set chtPasted = slide.Shapes.Paste()
    chtPasteErr = Err.Number
    On Error GoTo Failed

    If chtPasteErr = 0 And Not chtPasted Is Nothing And chtPasted.Count > 0 Then
        Exit For    ' success
    End If
    If chtTry < 3 Then Application.Wait Now + TimeValue("0:00:01")
Next chtTry
```

The chart case handles positioning and exits the function directly; the shared paste block after `End Select` handles Range only.

**Rule for next project:**
- For `Range.CopyPicture`: use `Appearance:=xlPrinter` — print pipeline, no screen focus dependency.
- For `ChartObject.CopyPicture`: `xlPrinter` is NOT valid (error 5). Use `xlScreen` with the full retry loop above.
- The retry loop is the final resolution — do not attempt to debug PPT window restoration order.
- `pptPres.Windows(1).WindowState = 2` minimizes the PPT window. Object model calls remain fully functional while minimized.
- Note: xlScreen failure mode differs by object type: Range → error 1004 (raised); Chart → silent empty clipboard (caught at Shapes.Paste as -2147188160).
- Do not confuse with P015 (Chart.Export) or P016 (DoEvents clipboard race).

---

## P023 [VBA] -- VBA: Or/And Operators Do Not Short-Circuit

**Severity:** High — causes error 91 (Object variable or With block variable not set) in compound conditions involving Object properties
**Discovered:** W3-06b end-to-end test, 2026-06-08. Retry loop's post-loop check raised error 91 instead of surfacing the actual paste failure message.
**Pattern:** VBA's `Or` and `And` operators **always evaluate all operands** — they never short-circuit. Compound conditions like `If obj Is Nothing Or obj.Count = 0` or `If err = 0 And Not obj Is Nothing And obj.Count > 0` evaluate `obj.Count` even when `obj Is Nothing`, raising error 91.

```vba
' ❌ WRONG — VBA evaluates chtPasted.Count even when chtPasted Is Nothing:
If chtPasteErr <> 0 Or chtPasted Is Nothing Or chtPasted.Count = 0 Then ...
If chtPasteErr = 0 And Not chtPasted Is Nothing And chtPasted.Count > 0 Then ...

' ✅ CORRECT — separate Ifs guarantee safe evaluation order:
If chtPasteErr <> 0 Then ...       ' check error first
If chtPasted Is Nothing Then ...   ' then nil check
If chtPasted.Count = 0 Then ...    ' only reached when not Nothing
```

**Rule for next project:**
- Never use compound `Or`/`And` conditions that mix `Is Nothing` checks with property access on the same object in VBA. Split into separate `If` statements.
- This applies to any Object variable whose validity is in question: ShapeRange, Range, Worksheet, etc.

---

## Standing Rules
See `STANDING_RULES.md` — that is the single authoritative list. Do not maintain a duplicate here.

---

## P024 [WEB] -- Flask: session.modified Not Always Set by Nested Dict Assignment

**Severity:** High -- causes session data to be silently dropped from the cookie; symptoms appear as 500 errors or redirect loops on the results page
**Discovered:** ITSMweb Phase 3, 2026-06-11. session['kpis'] = kpis executed without error and the 302 redirect was returned, but decoding the Set-Cookie header showed kpis absent from the cookie.
**Root cause:** Flask's session (SecureCookieSession, a subclass of CallbackDict) calls on_update (sets modified = True) via __setitem__. In practice -- particularly when a long-running subprocess (LibreOffice) runs between two session assignments -- the modification flag does not reliably propagate to the final serialized cookie. The CPython/Flask version interaction is not fully characterized; the mitigation is deterministic and free.

Symptom sequence:
1. POST handler sets session['priorities'] = priorities (mod flag set)
2. Subprocess runs (LibreOffice recalculation -- several seconds)
3. session['kpis'] = kpis executes without raising
4. Handler returns redirect(...) -- 302 with Set-Cookie
5. Decoding Set-Cookie: only 'profile' and 'priorities' present -- 'kpis' missing
6. Subsequent GET to /submitted: Jinja2 raises UndefinedError: 'kpis' is undefined

Fix:
    session['kpis'] = kpis
    session.modified = True   # explicit -- never rely on implicit detection after long-running work

Rule for all future Flask projects:
- After any session mutations that include a long-running operation (subprocess, network call, file I/O), always set session.modified = True explicitly after the last mutation.
- Treat implicit modification detection as unreliable whenever a subprocess runs mid-handler.
- When debugging "session key missing after redirect": decode the Set-Cookie header on the response directly -- session_transaction() reads/rewrites the cookie and can mask the bug.

---

## P025 [WEB] -- Bash: cat-append-heredoc Corrupts Existing Code Files

**Severity:** High -- silently mangles the target file, producing SyntaxError on next import
**Discovered:** ITSMweb Phase 3, 2026-06-11. Attempted to append a debug route to routes.py using cat >> routes.py with a heredoc. The heredoc body contained Python string literals whose quotes interacted with the shell, truncating routes.py mid-line.
**Root cause:** cat >> file << HEREDOC appends a heredoc to an existing file. If the heredoc body contains shell-significant characters (quotes, dollar signs, backslashes), the shell corrupts the boundary between existing and new content.

Fix: Restore from known-good content using Python write:
    with open('path/to/file.py', 'w') as f:
        f.write(full_correct_content)

Rule for all future projects:
- Never use cat >> file with heredoc to append to existing code files. Use Python writes or the Edit tool.
- After any file write or append, always verify syntax: python3 -c "import ast; ast.parse(open('file.py').read()); print('OK')"
- To append safely: read full file in Python, concatenate new content, write complete result.

---

## P026 [GENERAL] -- Write Tool: Truncates Long Files at ~50-60 Lines

**Severity:** High -- file appears written successfully (no error) but tail content is missing; discovered only at runtime via TemplateSyntaxError or ImportError
**Discovered:** ITSMweb Phase 3, 2026-06-11. Write tool used to create submitted.html (~120 lines). Tool reported success but file was truncated at line 53, ending mid-attribute. Jinja2 raised: TemplateSyntaxError: Unexpected end of template. Jinja was looking for 'endblock'.
**Root cause:** The Write tool has an undocumented line-length limit (~50-60 lines observed). Files exceeding this threshold are written partially with no error signal. Previously documented as P003 in the Accertify CLAUDE_problems.md for identical behavior.

Fix: Write long files via bash cat-heredoc with SINGLE-QUOTED delimiter (prevents variable expansion):
    cat > /path/to/file.html << 'ENDOFFILE'
    ...full content...
    ENDOFFILE
    echo "Lines: $(wc -l < /path/to/file.html)"
    tail -3 /path/to/file.html

Rule for all future projects:
- Never use the Write tool for files longer than ~40 lines. Use bash cat-heredoc with single-quoted delimiter.
- Always verify file length and tail after writing: wc -l and tail -3.
- For HTML templates: verify closing tag (e.g., endblock) is present. For Python: run ast.parse.
- The Edit tool is safe for targeted modifications to existing files -- it sends a diff, not a full rewrite.

---

## P027 [WEB] -- Flask: request.app Does Not Exist -- Use current_app

**Severity:** Medium -- raises AttributeError on every request, taking down all routes
**Discovered:** ITSMweb Phase 6, 2026-06-12. before_request_hook used request.app.config to read app config. Every request failed with: AttributeError: 'Request' object has no attribute 'app'.
**Root cause:** Flask's request context object does not expose the application as request.app. The correct accessor is current_app from flask, which is a context local proxy to the active Flask application during a request.

Fix:
    from flask import current_app
    # Wrong:  request.app.config.get(...)
    # Right:  current_app.config.get(...)

Rule for all future Flask projects:
- Never use request.app -- it does not exist.
- Always import and use current_app when accessing app config, extensions, or logger from within a request context (before_request hooks, view functions, etc.).
- request gives you: method, args, form, json, headers, endpoint, blueprint, url -- not the app.

---

## P028 [WEB] -- LibreOffice OOM on Render Free Tier

**Severity:** Critical -- calculation engine fails on every production request
**Discovered:** ITSMweb Phase 10 production testing, 2026-06-12 17:05 EDT

LibreOffice subprocess requires ~300MB RAM at startup. Render free tier provides 512MB total. With Flask/gunicorn using ~100-150MB, the container runs out of memory when LibreOffice launches, producing an empty stderr with return code 1 (SIGKILL -- no cleanup output).

Sequence of failures encountered:
1. javaldx launch failure (missing Java) -- stubbed javaldx
2. javaldx path read failure -- made stub echo /tmp
3. Empty stderr, return code 1 (OOM kill) -- fundamental resource limit

**Fix:** Replace LibreOffice formula recalculation with xlcalculator (pure Python, in-process). calculator.py rewritten to use ModelCompiler + Evaluator -- no subprocess, no memory spike, reads formulas directly from the xlsx workbook. xlcalculator added to requirements.txt.

LibreOffice remains in the Docker image for PDF conversion (emailer.py) but is no longer used for recalculation.

**Rule for all future projects on free-tier hosting:**
- Never use LibreOffice for formula recalculation on Render free tier (512MB RAM).
- Use xlcalculator for Python-based formula evaluation instead.
- If LibreOffice is needed for PDF conversion, budget RAM accordingly or upgrade to a paid plan.

---

## P029 [WEB] -- .dockerignore Excluded *.xlsx and *.pptx

**Severity:** High -- workbook and PPT template missing from Docker image; calculation and report generation both fail
**Discovered:** ITSMweb Phase 10 production testing, 2026-06-12

.dockerignore contained lines: `*.xlsx`, `*.xlsm`, `*.pptx`. These excluded the master workbook (ITSM Business Value Framework v1.xlsx) and PPT template (ITSM_BVF_Report_v1.pptx) from the Docker build, even though both were committed to git.

Error seen: `[Errno 2] No such file or directory: '/app/ITSM Business Value Framework v1.xlsx'`

**Fix:** Remove *.xlsx, *.xlsm, *.pptx lines from .dockerignore.

**Rule for all future projects:**
- Never add *.xlsx, *.xlsm, or *.pptx to .dockerignore unless those files are truly build artifacts.
- Reference data files that are committed to git must not be in .dockerignore.

---

## P030 [WEB] -- python-pptx: Writing to Pre-Baked Template Shapes Overwrites Formatted Content

**Severity:** High -- silently corrupts pre-filled slide content; formatting is lost even if text is the same
**Discovered:** ITSMweb Phase 9, 2026-06-15. First draft of report.py would have pushed Pain1_text, Pain1_callout, Whatif_text, Gain_text, Benefit_category, Benefit_name from BENEFIT_HEADERS and a catch-all `values` dict. These shapes are pre-filled in the 36-slide template with correctly formatted text. Caught by inspecting template content before executing the code.

**Pattern:** When working with a PPTX template that has 15+ per-benefit slides, it is easy to assume all benefit text must be pushed by the generator. In reality, static content (headers, callouts, citations) is baked into each slide at template build time; only dynamic values (callouts tied to user inputs, tbl_calc data cells, chart images) need runtime population. Pushing to pre-baked shapes replaces formatted runs with plain-text runs, stripping bold, color, size, and font.

**Root cause:** Generated code assumed all content was dynamic without inspecting the template's existing text content first.

**Detection:** `python3 -c "from pptx import Presentation; prs = Presentation('template.pptx'); [print(f'[{s.name}]: {s.text_frame.text[:80]}') for slide in prs.slides for s in slide.shapes if s.has_text_frame and s.text_frame.text.strip()]"` -- run this before writing any populate loop.

**Rule for all future python-pptx projects:**
- Before writing any shape-population code, inspect the template to identify which shapes are pre-filled vs. which are empty placeholders.
- Only push to shapes that are confirmed EMPTY (or whose content is intentionally replaced). Leave pre-filled shapes alone.
- The inspection command above is fast (~2 seconds) and should be run as the first step of any report generator build, not inferred from slide structure diagrams.
- For benefit/section slides that are duplicated across a template (e.g., 15 identical-structure slides), inspect ONE representative slide's shape content before assuming any shape is empty.

---

## Standing Rules
See `STANDING_RULES.md` -- that is the single authoritative list. Do not maintain a duplicate here.

---

## P031 [GENERAL] -- Write/Edit tools truncate headers.py silently (2026-06-15)

**Error:** Both the Write tool and Edit tool silently truncate `headers.py` at approximately line 79-80, always at the same byte boundary. The tool reports "file updated successfully" but the resulting file is incomplete. The `try/except` block assigning `BENEFIT_HEADERS` and `CALC_ROWS` is missing, so `CALC_ROWS` is never defined at module level.

**Symptom:** `ImportError: cannot import name 'CALC_ROWS' from 'app.itsmbvf.headers'` -- or worse, silent fallback to empty dicts if the except clause runs partially.

**Root cause:** Unknown -- appears to be a file size or content-triggered truncation in the Write/Edit tools for this specific file. The truncation point is consistent (~3KB) but the cause was not identified.

**Mitigation applied:** Write the file via bash `cat > /path/to/headers.py << 'ENDOFFILE' ... ENDOFFILE`. This writes the complete file correctly.

**Prevention:**
- **Never use Write or Edit tools to modify headers.py.** Always use bash cat-heredoc.
- After any write to headers.py, verify with: `wc -l /path/to/headers.py` (should be ~89 lines) and `tail -5` to confirm the try/except block is present.
- Verify import works: `python3 -B -c "import importlib.util; spec = importlib.util.spec_from_file_location('h', 'app/itsmbvf/headers.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print('CALC_ROWS' in dir(m))"`

---

## P032 [GENERAL] -- Edit tool truncates routes.py at the same ~3KB boundary (2026-06-15)

**Error:** The Edit tool truncated `routes.py` mid-line at line 449 when inserting `_fmt_calc` near line 77. Same silent truncation as P031. The tool reported success; the resulting file had a partial line (`@itsmbvf_bp.route('/assumptions', methods=['GET', 'P`) that caused a SyntaxError.

**Additional impact:** The `cat >> heredoc` append landed AFTER the truncated line, so the file had a stray partial line followed by the correct content. Fixed with `sed -i '449d'` to remove the stray line.

**Affected files confirmed:** `headers.py`, `routes.py`. Treat ALL files in this project as vulnerable to Write/Edit tool truncation.

**Rule:** Use bash (`sed` for targeted replacements, `cat > file << 'EOF'` for full rewrites, `cat >> file << 'EOF'` only for clean appends to syntactically complete files). After any modification, always run `python3 -c "import ast; ast.parse(open('file.py').read()); print('OK')"`.

---

## P033 [GENERAL] -- Write/Edit tools truncate HTML templates silently (2026-06-15)

**Severity:** Critical -- same truncation pattern as P031/P032 but now confirmed to affect HTML files, not just Python files. Previously the standing rule only prohibited Write/Edit on Python files; HTML files were still being modified with those tools, causing two silent truncations in a single session.

**Affected files this session:**
- `app/templates/itsmbvf/base.html` -- truncated to 37 lines (was ~183). Truncated mid-CSS, ending at `background:var(--ltblue);color:var(`. Entire HTML body, nav, blocks, and most CSS rules were lost.
- `app/templates/itsmbvf/assumptions.html` -- truncated to 183 lines. Truncated mid-attribute inside a tooltip `title="..."` string, losing the input close tag, two closing divs, nav buttons, form close, and `{% endblock %}`.

**Discovered:** Session 10 post-compaction truncation audit, 2026-06-15 13:xx EDT.

**Impact:** Both files silently appeared "successfully updated" in tool output. The truncation of base.html caused 500 errors on all routes (Jinja2 could not compile the broken template). The truncation of assumptions.html caused the assumptions page to render a broken form with no submit button and no `{% endblock %}`.

**Root cause:** The Write and Edit tools in this environment silently truncate file output at approximately 3KB regardless of file size or type. This is a transport-layer or buffer limit -- it is NOT specific to Python files. Every file written by these tools is at risk. The truncation is always silent: the tool reports success.

**Pattern:** The 3KB limit applies across all file types: `.py`, `.html`, `.md`, `.js`, `.css`. Any file larger than approximately 40-50 lines is potentially at risk. The truncation point is consistent within a session but may vary between sessions.

**Mitigation applied:**
- `base.html`: Reconstructed full file via `cat > file << 'EOF'` heredoc (183 lines).
- `assumptions.html`: Removed truncated last line with `sed -i '{n}d'`, then appended tail via `cat >> file << 'EOF'`.

**Prevention -- STANDING RULE UPDATE (extends P031/P032 from Python-only to ALL files):**
- **Never use the Write or Edit tools on ANY file in this project.** The 3KB truncation applies to .py, .html, .md, .js, .css, and all other file types.
- For full file writes: `cat > /path/to/file << 'EOF' ... EOF` via bash.
- For targeted line replacements: `sed -i 's/old/new/g'` or `sed -i '{n}s/.*/new_content/'` via bash.
- For appends to syntactically complete files: `cat >> file << 'EOF' ... EOF` via bash.
- **After every write, run `check_files.sh`** (or at minimum: `wc -l filename && tail -5 filename`).
- For HTML templates, always verify the tail contains `{% endblock %}`.
- For Python files, always run `python3 -c "import ast; ast.parse(open('f').read()); print('OK')"`.

**Detection -- post-write checklist:**
```bash
wc -l filename          # Does line count match expectation?
tail -5 filename        # Does the file end where it should?
grep "endblock\|</html>" filename  # For HTML: closing structure present?
python3 -c "import ast; ast.parse(open('file.py').read()); print('OK')"  # For Python
```

---

## P034 [WEB] -- Missing JS function detection (check_js.py)

**Date:** 2026-06-15
**Symptom:** A JS function is called in an event handler (onclick, onchange) in a template but the function definition was deleted, truncated away, or never written -- resulting in a silent "function is not defined" error at runtime only.
**Root cause:** Static analysis was not previously applied to JS. Truncation events (see P033) could remove a `<script>` block without check_files.sh detecting it, because the HTML tail ({% endblock %}) would still be intact.
**Detection:**
- `check_js.py`: Extracts all function calls from event handler attributes across all templates. Extracts all function definitions from `<script>` blocks. Flags any call with no matching definition.
- Wired into `check_files.sh` as the "JS function coverage" layer.
**Prevention:** Run `check_files.sh` after every write. Any new JS function called in a template must also be defined in a `<script>` block in that template (or added to the GLOBAL_FUNS set in check_js.py for library functions).
**Note:** check_js.py uses static regex analysis only -- it does not evaluate JS. It will not catch logic errors inside functions, only missing definitions.

---

## P035 [WEB] -- Route smoke test / Python logic error detection (check_routes.py)

**Date:** 2026-06-15
**Symptom:** A Python route returns 500, 302-loops, or renders with missing content -- catching errors that syntax checking (check_structure.py) cannot detect. Examples: a template variable referenced in a template but not passed by `render_template()`; a session guard redirecting because the wrong key name is used; `run_calculation()` missing an output key that a template expects.
**Root cause:** Syntax checks (`ast.parse`) confirm the file is valid Python but cannot verify runtime behavior. Logic errors, missing context variables, and broken session flows are invisible to static analysis.
**Detection:**
- `check_routes.py`: Uses Flask's built-in test client (no server needed). Seeds a realistic session, hits every route, asserts HTTP 200 and presence of expected content strings.
- Also calls `run_calculation()` directly and verifies all required KPI output keys are present.
- Wired into `check_files.sh` as the "Route smoke test" layer.
**Known limitation:** KPI values (payback, benefit_3y, etc.) will show WARN "blank/zero" in the sandbox because openpyxl does not recalculate Excel formulas without the full engine. This is expected -- treat it as a WARN, not a FAIL.
**CRITICAL: `GET /` calls `session.clear()`** -- it must be tested with a separate test client from the seeded-session routes. Failing to do this causes all subsequent routes to see an empty session and redirect, making the test useless. check_routes.py handles this by using separate `with app.test_client()` blocks.
**Prevention:** Run `check_files.sh` after every write. When adding a new route, add it to ROUTES or FRESH_ROUTES in check_routes.py and add at least one expected content string.

---

## P036 [WEB] -- Session cleared on back-navigation (session persistence bug)

**Date:** 2026-06-15
**Symptom:** User advances to Summary or Challenges, then navigates back to Profile or Challenges. All previously entered inputs (company name, revenue, employees, challenge priorities) are blank -- session appears empty.
**Root cause:** `GET /` calls `session.clear()` -- this is intentional for fresh-start behavior. However, the Profile nav link in `base.html` and the "← Profile" back button in `step2_challenges.html` both pointed to `/`, so any mid-flow back-navigation wiped the session.
**Fix:**
1. `app/templates/itsmbvf/base.html` -- Profile nav link: change `href="/"` to `href="{% if step and step > 1 %}/edit_profile{% else %}/{% endif %}"`. Mid-flow (step > 1) routes to `/edit_profile` which pre-fills from session. Fresh start (step 1 or no step) still routes to `/` as intended.
2. `app/templates/itsmbvf/step2_challenges.html` -- back button: change `href="/"` to `href="/edit_profile"`.
**The `/edit_profile` route:** `GET /edit_profile` pre-fills the Profile form from `session['profile']` without clearing the session. All other session data (priorities, kpis, assumptions) is preserved.
**Prevention:** Any "back" or "edit" navigation link that appears after step 1 must point to `/edit_profile`, not `/`. Only the "Start over" or initial entry point should point to `/`.

---

## P037 [GENERAL] -- Edit tool used in violation of STANDING_RULES, caused routes.py truncation (Session 13)

**Date:** 2026-06-17
**Symptom:** After using the Edit tool to update the POST /assumptions handler in routes.py (a 4-line replacement around line 504), the file was truncated to 705 lines. Last readable line was `            sen` (mid-line). Syntax parse reported `SyntaxError: expected 'except' or 'finally' block` at line 706.
**Root cause:** STANDING_RULES explicitly prohibits the Write and Edit tools on ALL files in this project: "Never use the Write or Edit tools on ANY file in this project. Always use bash." The Edit tool silently truncates files at ~3KB. The Edit tool always reports success regardless.
**Contributing factor:** Compaction event at session start caused Claude to lose standing-rule memory. The truncation rule was re-read from STANDING_RULES.md only after the damage was done.
**Fix:**
1. Identified the truncated tail: `tail -3 file | cat -A` showed the line ending mid-word
2. Calculated missing lines from known git HEAD (698 lines) + prior edits
3. `head -n -1 routes.py > /tmp/routes_fixed.py` to remove the truncated line
4. `cat >> /tmp/routes_fixed.py << 'EOF'` to append the 8 missing lines
5. `cp /tmp/routes_fixed.py routes.py`
6. Verified: 713 lines, clean `ast.parse`, clean `check_files.sh`
**Prevention:**
- After every compaction event, read STANDING_RULES.md BEFORE touching any file
- Never use the Write or Edit tools on ANY file in this project under any circumstances
- If tempted to use Edit for a "small" change: use `sed -i` for single-line replacements, `sed -i 'Nr /dev/stdin'` with heredoc for block insertions, `cat >>` for appends

---

## P038 [GENERAL] -- Bash: python3 -c with embedded quotes truncated the script, and the unguarded write step after it still overwrote the live file with the failed run's (empty) output

**Date:** 2026-09-16
**Severity:** High -- destroyed CLAUDE.md's entire content in place; only recoverable because the original text happened to still be quoted verbatim earlier in the same conversation
**Symptom:** While adding three rows to CLAUDE.md's Key Decisions Log, the edit script was passed inline as `python3 -c "<content>"` inside a bash double-quoted argument. The replacement text itself contained a literal double-quoted phrase (a reference to the page's "Did you know" callout). Bash's double-quoting does not escape embedded `"` characters -- it closed the outer argument early, and the remainder of the intended script was split into separate, malformed shell tokens. Python received a truncated script and raised `SyntaxError: unterminated triple-quoted string literal`, writing nothing to stdout. The redirected temp file (`/tmp/claude_md_patched.md`) was therefore empty. The very next command, `cat /tmp/claude_md_patched.md > CLAUDE.md`, ran anyway -- it was a separate statement with no dependency on the previous command's exit status -- and truncated CLAUDE.md to 0 bytes.
**Root cause:** Two independent gaps that only cause real damage in combination:
1. Generated or hand-authored multi-line replacement text was passed through an inline interpreter argument (`python3 -c "..."`). That quoting context cannot safely carry text containing `"`, `` ` ``, `$`, or `\` -- and prose describing UI copy routinely contains quote marks. There is no reliable way to escape for both bash and the target language at once in a hand-written inline command.
2. The "generate patched content" step and the "commit patched content over the live file" step were chained as two independent commands with no exit-code gate (`&&`) and no validation of the intermediate file (non-empty, contains an expected anchor string) before the second, destructive step ran.
**Contributing factor:** This project's mounted folder does not permit `mv` to replace an existing file (`device_bash` cannot remove the target -- see the delete-permission restriction noted elsewhere), so file edits are committed with `cat patched > realfile`, a plain truncate-and-write with no atomic all-or-nothing guarantee and no OS-level undo.
**Fix (this incident):** Recovered CLAUDE.md verbatim from this same conversation's own earlier context, where the full original file had already been quoted in full at session start; restored it via a quoted bash heredoc (`cat > CLAUDE.md << 'CLAUDEMDEOF'`), verified the restored file's structure (line count, full list of `## ` section headers) matched the pre-incident file before reapplying the intended edits, this time via heredoc-script files rather than inline `-c` arguments.
**Prevention:**
1. Never pass generated or hand-authored multi-line text through an inline interpreter argument (`python3 -c "..."`, `node -e "..."`, or similar). Always write the script to its own file first with a quoted heredoc delimiter -- `cat > /tmp/patch.py << 'PYEOF' ... PYEOF` -- which is immune to embedded quotes, `$`, and backticks of any kind, then run it as `python3 /tmp/patch.py`. This is not a style preference: inline `-c`/`-e` is banned outright for anything beyond a short, hand-verified one-liner containing no quote characters.
2. Never chain a "write patched content to a temp file" step and a "commit temp file over the live file" step as unguarded separate commands. Gate the destructive step on the first step's success and the temp file's validity in one line, e.g.: `python3 /tmp/patch.py > /tmp/out.md && test -s /tmp/out.md && grep -q '<known-anchor-string>' /tmp/out.md && cat /tmp/out.md > realfile.md`. A non-zero exit, an empty file, or a missing anchor string must abort before the live file is touched.
3. Before any in-place overwrite of a tracked doc (CLAUDE.md, PROJECT_STATE.md, SESSION_LOG.md, or any file on a mount where `mv`-based atomic replace is unavailable), take a backup copy in the same command block as the write -- e.g. `cp CLAUDE.md /tmp/CLAUDE.md.bak-$(date +%s)` immediately before the `cat > CLAUDE.md` step -- so recovery never depends on the file's prior content still being visible in conversation context or scrollback. In this incident, recovery worked only because the content happened to still be quoted verbatim earlier in the same conversation; in a fresh session, or once that content had scrolled out of context, this would have been unrecoverable.
4. Immediately after any write to a tracking doc, verify non-triviality, not just a zero exit code: `wc -l` compared against a sane expected minimum, plus a `grep` for anchor strings known to exist near both the top and the bottom of the file. A 0-line or drastically-shorter-than-expected result is a write failure requiring immediate investigation before any further edits are layered on top.


---

## P039 [GENERAL] -- Multiple-choice question picker used despite STANDING_RULES ban (Session 11)

**Date:** 2026-09-22
**Severity:** Low -- no file damage; Ben's answers were still usable
**Symptom:** At the start of the HubSpot scoping conversation, Claude asked Ben four clarifying questions through a multiple-choice picker. STANDING_RULES.md says: "No multiple-choice question pickers. Ask in plain prose. Ben's answers are always free text."
**Root cause:** The session-start protocol (read CLAUDE.md, PROJECT_STATE.md, STANDING_RULES.md, CLAUDE_problems.md before any substantive work) was only partly followed. README_first.md, PROJECT_STATE.md and PLATFORM.md were read; STANDING_RULES.md was not read until just before the build step.
**Fix:** Rules re-read before any file write; all file writes this session used bash heredoc/sed per STANDING_RULES; no further pickers used.
**Prevention:** Read STANDING_RULES.md as part of the very first exploration step of any session in this project, before asking Ben anything, even for tasks that start as "walk me through" conversations rather than builds.

## P040 [GENERAL] -- sed replacement text containing `&` inserted the matched line instead of a literal ampersand (Session 18)

**What happened:** Editing mailer/Dockerfile with `sed -i 's|<whole RUN line>|<new text with && and ||>|'`. In a sed replacement, an unescaped `&` means "the whole match", so every `&&` became two copies of the original line and the Dockerfile's RUN instruction was mangled. Caught immediately by printing the lines back after the edit, before any build or commit.
**Fix:** Deleted the affected lines by number and inserted the correct block from a heredoc temp file with `sed -i '<n>r /tmp/file'` -- no replacement-string escaping involved.
**Rule:** For any multi-line or shell-syntax replacement (anything containing `&`, `\`, `|` or newlines), do not use `s///` -- write the new block to a temp file with a quoted heredoc and splice it in with `sed '<n>d'` + `sed '<n>r file'`. Always print the edited region back immediately (the Write/Edit-truncation rule's `tail` check, applied to sed too).

## P041 [AWS] -- reservedConcurrentExecutions copied from the PMTC handoff kit failed the first VlgMail deploy (Session 18, 2026-09-23 21:44 EDT)

**What happened:** First `npx cdk deploy VlgMail` (Ben's machine; the Docker image built and deployed fine) rolled back at the Lambda: "Specified ReservedConcurrentExecutions for function decreases account's UnreservedConcurrentExecution below its minimum value of [10]." Account 019163347448's total Lambda concurrency quota is low (evidently well under the 1000 default -- a new-account limit), so reserving even 5 is refused. Nothing else in the stack was at fault; the rollback deleted everything cleanly.
**Root cause of the miss:** Copied `reservedConcurrentExecutions: 5` from handoff/infra/lib/mail-stack.ts (the kit's default) without checking it against K1x's live PmtcMail, which -- in the same account -- sets none. An account quota is invisible to synth; only the real service enforces it (same family as K1x P044/P045/P052).
**Fix:** Removed the setting from infra/lib/mail-stack.ts (comment left in place explaining why). Re-synthesized clean.
**Rule:** When two sibling sources disagree on a setting, prefer the one that is LIVE in the same account (PmtcMail) over the generic kit. Account-level quotas (concurrency, memory above 3008MB) are shared across every tool here; never reserve concurrency in this account without asking first.
