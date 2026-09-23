# README FIRST -- Web Project Template

**Start here every time you begin a new xlsx+pptx-to-web project.**

---

## What This Folder Is

This is the template folder for all future web-based business value tools. It contains:
- Reference docs for Claude (CLAUDE.md, STANDING_RULES.md, CLAUDE_problems.md, PLATFORM.md)
- Project tracking shells (PROJECT_STATE.md, SESSION_LOG.md)
- Planning tools (WBS.md)
- Design tools (WORKBOOK_CONVENTIONS.md, PPT_CONVENTIONS.md, Design_Questionnaire.docx)
- Platform modules (modules/ folder -- hosting, data capture, email, auth)

The starter code repository lives separately at:
**https://github.com/bspinsky-sketch/web-project-starter**

---

## Step-by-Step: Starting a New Project

### Before your first Claude session

1. **Create the project folder**
   Copy this entire template folder to a new location:
   `C:\Users\Ben\Documents\GENIUS DRIVE\[GD or Non-GD Projects]\[Project Name]\`

2. **Clone the starter repo into the project folder**
   ```powershell
   cd "C:\Users\Ben\Documents\GENIUS DRIVE\[GD or Non-GD Projects]\[Project Name]"
   git clone https://github.com/bspinsky-sketch/web-project-starter app
   ```
   Rename the `app/blueprints/project_name/` folder to the project codename.

3. **Create a new GitHub repo for this project**
   On bspinsky-sketch account; initialize with README; enable Git LFS.

4. **Run the pre-project workbook audit**
   See WORKBOOK_CONVENTIONS.md Part 2. Confirm named ranges are present and complete
   before building the calculations engine.

5. **Run the pre-project PPT audit**
   See PPT_CONVENTIONS.md Part 2. Confirm all dynamic shapes are named.

6. **Complete the design questionnaire**
   Open Design_Questionnaire.docx. Fill in brand inputs. Agree on skin before Phase 8.

7. **Fill CLAUDE.md placeholders**
   Replace all [PROJECT], [CLIENT], [DELIVERABLE] placeholders with real values.
   Cross-verify the challenge-benefit matrix against the live workbook.

### In your first Claude session

Tell Claude:
> "New project session. Read README_first.md, CLAUDE.md, PROJECT_STATE.md,
> STANDING_RULES.md, and CLAUDE_problems.md before doing anything else."

Claude will read all five files, then you can begin the WBS planning conversation.

---

## Document Map

| File | When to read | Purpose |
|------|-------------|---------|
| README_first.md (this file) | Before first session | Entry point |
| CLAUDE.md | Every session start | Project reference -- challenge matrix, decisions log |
| STANDING_RULES.md | Every session start + before every build | Behavioral rules -- file writing, git, compaction |
| CLAUDE_problems.md | When something goes wrong | Full RCA log -- failure patterns and fixes |
| PLATFORM.md | Before any build operation | Web stack patterns -- Flask, openpyxl, python-pptx |
| PROJECT_STATE.md | Every session start | Current open/closed items, decisions log |
| SESSION_LOG.md | Every session start/end | Timestamped session record |
| WBS.md | Planning phase | Phase-level WBS with task stubs and gates |
| WORKBOOK_CONVENTIONS.md | Before Phase 3 | Named range requirements; workbook audit |
| PPT_CONVENTIONS.md | Before Phase 4/9 | Shape naming requirements; template audit |
| Design_Questionnaire.docx | Before Phase 8a | Agree on skin (colors, fonts, logo) in one shot |
| modules/hosting_*.md | Phase 7 | Hosting setup for chosen platform |
| modules/datacapture_*.md | Phase 10 | Data capture setup for chosen platform |
| modules/email_gmail_smtp.md | Phase 5 | Email delivery setup |
| modules/auth_auth0.md | Phase 6 | Auth0 scaffold setup |

---

## Shared venv

All web projects share one Python environment:
```powershell
& "C:\Users\Ben\venvs\webprojects\Scripts\Activate.ps1"
```

Never create a project-specific venv -- it wastes 175MB per project.
Install new packages into the shared venv; they are available to all projects.

---

## Key Constraints (standing rules)

- **Never use the Write or Edit tools on any project file.** Always use bash.
- **Explicit confirmation required before proceeding on any plan.** Do not assume proceed from context.
- **No em dashes** -- use en dashes (--) or restructure.
- **Timestamp all SESSION_LOG.md entries** using the eastern-time skill.
- **Document errors immediately** -- before continuing work. See CLAUDE_problems.md META-RULE.

