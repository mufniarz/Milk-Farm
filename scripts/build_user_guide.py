from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_LINE_SPACING

OUT = "docs/Milk-Farm-User-Guide.docx"
GREEN = RGBColor(0x2E, 0x5B, 0x3E)
GOLD = RGBColor(0xB8, 0x86, 0x2E)
GREY = RGBColor(0x5F, 0x63, 0x60)
LIGHT = "EEF2EC"
PALE_GOLD = "F5EEDC"

doc = Document()
sec = doc.sections[0]
sec.page_height = Cm(29.7)
sec.page_width = Cm(21.0)
sec.top_margin = Cm(2.0)
sec.bottom_margin = Cm(1.8)
sec.left_margin = Cm(2.2)
sec.right_margin = Cm(2.2)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Arial"
normal.font.size = Pt(10)
normal.paragraph_format.space_after = Pt(4)
normal.paragraph_format.line_spacing = 1.15

for name, size, color, before, after in [
    ("Heading 1", 20, GREEN, 0, 10),
    ("Heading 2", 13, GREEN, 14, 5),
    ("Heading 3", 11, GOLD, 10, 3),
]:
    st = styles[name]
    st.font.name = "Arial"
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = color
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True

def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hexcolor)
    tcPr.append(shd)

def set_col_widths(table, widths):
    for row in table.rows:
        for idx, width in enumerate(widths):
            row.cells[idx].width = width

def add_footer(section, text):
    p = section.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.size = Pt(8)
    run.font.color.rgb = GREY

def add_header(section, text):
    p = section.header.paragraphs[0]
    p.text = ""
    run = p.add_run(text)
    run.font.size = Pt(8)
    run.font.color.rgb = GREY
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

def para(text="", bold=False, italic=False, size=None, color=None, align=None, space_after=4):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    if size: r.font.size = Pt(size)
    if color: r.font.color.rgb = color
    return p

def bullets(items, style="List Bullet"):
    for item in items:
        p = doc.add_paragraph(style=style)
        p.paragraph_format.space_after = Pt(2)
        p.add_run(item)

def steps(items):
    for i, item in enumerate(items, 1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.7)
        p.paragraph_format.first_line_indent = Cm(-0.7)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(f"{i}.  ")
        r.bold = True
        r.font.color.rgb = GREEN
        p.add_run(item)

def callout(title, body, fill=PALE_GOLD):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    shade(cell, fill)
    cell.margin_top = Cm(0.2); cell.margin_bottom = Cm(0.2)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    r.bold = True
    r.font.color.rgb = GREEN
    r.font.size = Pt(9)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    r2 = p2.add_run(body)
    r2.font.size = Pt(9)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def info_table(rows, widths=(Cm(3.4), Cm(13.2))):
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].text = ""
        p = cells[0].paragraphs[0]
        r = p.add_run(label)
        r.bold = True
        r.font.size = Pt(9)
        r.font.color.rgb = GREEN
        shade(cells[0], LIGHT)
        cells[1].text = ""
        p2 = cells[1].paragraphs[0]
        r2 = p2.add_run(value)
        r2.font.size = Pt(9)
    set_col_widths(table, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def feature(num, title, location, purpose, who, how, check):
    doc.add_page_break()
    doc.add_heading(f"{num}. {title}", level=1)
    info_table([
        ("Where", location),
        ("Why", purpose),
        ("Who", who),
    ])
    doc.add_heading("How to use it", level=2)
    steps(how)
    doc.add_heading("What to check", level=2)
    bullets(check)

# ── Cover ──────────────────────────────────────────────────────────────────
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(90)
r = p.add_run("MILK FARM")
r.font.size = Pt(42)
r.bold = True
r.font.color.rgb = GREEN
p2 = doc.add_paragraph()
r2 = p2.add_run("User Guide")
r2.font.size = Pt(30)
r2.font.color.rgb = GOLD
p3 = doc.add_paragraph()
r3 = p3.add_run("Ration formulation, feeding operations and margin control")
r3.font.size = Pt(13)
r3.font.color.rgb = GREY
p4 = doc.add_paragraph()
p4.paragraph_format.space_before = Pt(26)
r4 = p4.add_run("Edition 1.0  ·  27 November 2026")
r4.font.size = Pt(10)
r4.font.color.rgb = GREY
p5 = doc.add_paragraph()
p5.paragraph_format.space_before = Pt(36)
r5 = p5.add_run("Application: https://nicola-milk-farm.web.app")
r5.font.size = Pt(10)
r5.bold = True
r5.font.color.rgb = GREEN
p6 = doc.add_paragraph()
r6 = p6.add_run("For farm owners, farm admins, consultants and feeders.")
r6.font.size = Pt(9)
r6.italic = True
r6.font.color.rgb = GREY

callout("About this guide",
        "This guide describes the current staging deployment. Menu names are shown in English with the Italian label in brackets. "
        "Screens and permissions may differ slightly between farms. Figures are examples, not targets for your farm.")

# ── Contents ───────────────────────────────────────────────────────────────
doc.add_page_break()
doc.add_heading("Contents", level=1)
contents = [
    ("1", "Before you start: roles and navigation"),
    ("2", "Quick start: from feed to confirmed load"),
    ("3", "Dashboard"),
    ("4", "Feeds"),
    ("5", "Recipes"),
    ("6", "Recipe builder"),
    ("7", "Scenarios"),
    ("8", "Targets"),
    ("9", "Groups"),
    ("10", "Inventory"),
    ("11", "Loading"),
    ("12", "Accuracy"),
    ("13", "IOFC"),
    ("14", "How the figures are calculated"),
    ("15", "Troubleshooting"),
    ("16", "Glossary"),
]
for num, title in contents:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(f"{num}.  ")
    r.bold = True
    r.font.color.rgb = GOLD
    p.add_run(title)

# ── 1 Roles/navigation ─────────────────────────────────────────────────────
doc.add_page_break()
doc.add_heading("1. Before you start: roles and navigation", level=1)
doc.add_heading("Roles", level=2)
para("Access is controlled per farm. The same person can have different roles on different farms.")
role_rows = [
    ("Owner", "Full control of the farm, including targets, reports and settings.", "All features."),
    ("Farm admin", "Day-to-day management and target overrides.", "All operational and economic features."),
    ("Consultant", "Formulation, scenarios and reports for the farm.", "Feeds, recipes, scenarios, inventory, reports; no target override write."),
    ("Feeder", "Feeding and loading operations.", "Loading and confirmation; economic reports are hidden."),
]
table = doc.add_table(rows=1, cols=3)
table.style = "Table Grid"
hdr = table.rows[0].cells
for i, text in enumerate(("Role", "Typical use", "Access")):
    hdr[i].text = ""
    r = hdr[i].paragraphs[0].add_run(text)
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    shade(hdr[i], "2E5B3E")
for role, use, access in role_rows:
    cells = table.add_row().cells
    for i, text in enumerate((role, use, access)):
        cells[i].text = ""
        r = cells[i].paragraphs[0].add_run(text)
        r.font.size = Pt(9)
set_col_widths(table, (Cm(2.6), Cm(7.2), Cm(6.8)))
doc.add_paragraph()

doc.add_heading("Navigation map", level=2)
nav_rows = [
    ("Dashboard", "Overview and quick actions", "/dashboard"),
    ("Feeds [Alimenti]", "Feed library and composition", "/feeds"),
    ("Recipes [Ricette]", "Saved rations and the builder", "/recipes"),
    ("Scenarios [Scenari]", "Saved what-if variations", "/scenarios"),
    ("IOFC", "Margin per group and day", "/iofc"),
    ("Accuracy [Precisione]", "Called vs loaded analysis", "/accuracy"),
    ("Loading [Carico]", "Feeder loading and confirmation", "/loading"),
    ("Groups [Gruppi]", "Herd groups, head count, active ration", "/groups"),
    ("Inventory [Scorte]", "On-hand stock, deliveries, adjustments", "/inventory"),
    ("Targets [Obiettivi]", "Nutrient ranges and farm overrides", "/targets"),
]
table = doc.add_table(rows=1, cols=3)
table.style = "Table Grid"
hdr = table.rows[0].cells
for i, text in enumerate(("Menu", "What it is for", "Address")):
    hdr[i].text = ""
    r = hdr[i].paragraphs[0].add_run(text)
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    shade(hdr[i], "2E5B3E")
for menu, purpose, path in nav_rows:
    cells = table.add_row().cells
    for i, text in enumerate((menu, purpose, path)):
        cells[i].text = ""
        r = cells[i].paragraphs[0].add_run(text)
        r.font.size = Pt(9)
set_col_widths(table, (Cm(4.0), Cm(9.3), Cm(3.3)))
para("Visibility: feeders see Dashboard, Loading and their operational menus. Economic reports are available to owner, farm admin and consultant. Target override writes are limited to owner and farm admin; consultants can read targets. A menu not visible to your role is not an error.", size=9, italic=True, color=GREY)
doc.add_paragraph()

doc.add_heading("Language and session", level=2)
bullets([
    "Use the globe icon in the top bar to switch between Italian and English.",
    "Use the menu icon on a phone or narrow window; the sidebar collapses.",
    "Use Logout [Esci] at the bottom of the sidebar to end the session.",
])

# ── 2 Quick start ──────────────────────────────────────────────────────────
doc.add_page_break()
doc.add_heading("2. Quick start: from feed to confirmed load", level=1)
para("A complete first pass through the application. You can stop at any step and return later; saved data is per farm.")
steps([
    "Add or import feeds in Feeds [Alimenti]. Enter price, moisture and nutrient composition.",
    "Create or open a Recipe [Ricetta], choose the animal group and, optionally, the ad-hoc batch size (the group head count overrides it).",
    "Select feeds and quantities, or set the total dry matter and run Calculate [Calcola] to optimise cost.",
    "Review the nutrient analysis and any warnings. Save the recipe when it is acceptable.",
    "Create a Group [Gruppo], set the head count and assign the recipe as the active ration.",
    "Add stock items in Inventory [Scorte] and record the opening delivery.",
    "Open Loading [Carico], choose group and feeder, enter called and loaded quantities, save a draft or confirm.",
    "Confirming the load posts each tracked feed to inventory. Review any failure banner and retry or handle it.",
    "Check Accuracy [Precisione] for called-vs-loaded deviation, and IOFC for the margin on the group.",
])
callout("Rule of thumb",
        "A number is only as good as the data behind it: feed moisture and price drive the ration; head count drives group cost and stock; confirmed loads drive inventory and accuracy. "
        "Complete the operational steps before reading the economic reports.")

# ── Feature sections ───────────────────────────────────────────────────────
feature("3", "Dashboard", "Menu → Dashboard",
        "A one-screen health check: how many feeds and recipes exist, which feeds are available, and shortcuts to the most common actions.",
        "All signed-in users; figures visible depend on role.",
        [
            "Read the counts: Total feeds, Available feeds, Total recipes.",
            "Use New recipe [Nuova Ricetta] to open the builder.",
            "Use Manage feeds [Gestisci Alimenti] to maintain the library.",
            "Use View recipes [Vedi Ricette] to open the saved list.",
        ],
        [
            "A low number of available feeds usually explains an infeasible or poor optimisation.",
            "Counts are per farm, not global.",
        ])

feature("4", "Feeds", "Menu → Feeds [Alimenti]",
        "The feed library: the composition, price, moisture and availability used by every recipe and by the optimiser.",
        "Owner, farm admin and consultant. Feeders do not maintain the library.",
        [
            "Use Add feed [Aggiungi Alimento] to create an item: name, category (forage/concentrate), price per kg as fed, moisture %, availability and nutrients.",
            "Use Edit to correct a feed; changes affect future calculations, not saved snapshots.",
            "Use Import CSV/Excel [Importa CSV/Excel] for bulk entry. Nutrient percentages are read as percentages (50 = 50%); if your file stores fractions (0.5), confirm the conversion shown by the importer before saving.",
            "Use search and the category filter to find a feed.",
            "Set Available off for a feed you do not want the optimiser to use.",
        ],
        [
            "Nutrients are on a dry-matter basis; moisture is the as-fed percentage.",
            "Price is € per kg as fed, not per kg dry matter; the app uses €/kg consistently, not €/t.",
            "Deleting a feed used by a recipe can affect replay; prefer making it unavailable.",
            "Correcting a feed changes future calculations, including the cost of any group whose active ration uses it; saved snapshots and scenario snapshots keep their original values.",
            "Import errors name the row or value that failed; fix the file and retry.",
        ])

feature("5", "Recipes", "Menu → Recipes [Ricette]",
        "The library of saved rations. Open, duplicate, export or delete a recipe; create a new one.",
        "Owner, farm admin and consultant.",
        [
            "Use New recipe [Nuova Ricetta] or the plus button to open the builder.",
            "Open a card with Open [Apri].",
            "Use the card menu to Duplicate [Duplica], Export Excel [Esporta Excel] or Delete [Elimina].",
            "The export downloads an .xlsx with the ration lines, analysis and target comparison.",
            "Deleting asks for confirmation and cannot be undone.",
        ],
        [
            "The export is a point-in-time document; it does not update when feeds change.",
            "Duplicate is the safe way to create a variant without touching the original.",
            "A recipe with no feeds or zero dry matter is not a valid base for a group.",
        ])

feature("6", "Recipe builder", "Recipes → New recipe, or open a saved recipe",
        "Formulate a ration, optimise its cost, inspect nutrient compliance and save it. It is also where scenarios are created.",
        "Owner, farm admin and consultant.",
        [
            "Enter the recipe name and animal group (lactating, dry, heifer). Number of animals [Numero animali] is only the ad-hoc batch size used when no group is assigned; a group's head count overrides it for cost, daily use and IOFC. See Groups.",
            "Select feeds and enter kg as fed. The table shows kg dry matter, cost and the current analysis.",
            "Optional: set Total dry matter [SS Totale] and the minimum/maximum forage ratio under Constraints [Vincoli] (forage ratio = forage DM ÷ total DM; see Calculations).",
            "Press Calculate [Calcola]. The optimiser returns the least-cost ration; if the exact targets are unreachable it returns the closest feasible ration in relaxed mode.",
            "Read the status: Optimal — Soluzione ottimale trovata; Relaxed — Nessuna soluzione esatta; Infeasible — Nessuna soluzione fattibile.",
            "Review warnings: below minimum, above maximum, at-boundary (at the reference floor, or at your overridden target), or unreachable targets. Hover/expand for the limit and value.",
            "Review the nutrient profile and target ranges; adjust feeds, quantities or constraints.",
            "Save Recipe [Salva Ricetta] to store it, or Export Excel for a document.",
        ],
        [
            "A relaxed result is usable but flag it to the farm: some targets are not fully met.",
            "A strict infeasibility means the current feeds and ranges cannot produce a ration; change feeds, relax a target through Targets, or use relaxed mode.",
            "At-boundary warnings are fragility signals: a small feed-analysis change can push the ration outside the range.",
            "Saving a recipe does not change a group's active ration; assign it in Groups.",
            "Number of animals is not the group head count: when the recipe is assigned to a group, the group's head count is the source of truth.",
        ])

doc.add_heading("6a. Scenario changes inside the builder", level=2)
para("The Modifiche scenario panel turns the current ration into a what-if without changing the saved recipe.")
steps([
    "Choose a feed and add a new price, or a new kg as-fed inclusion.",
    "Choose a nutrient and add a min/max override.",
    "Use Clear [Pulisci] to reset the draft.",
    "Press Save scenario [Salva scenario], name it, and confirm. The scenario stores the builder base lines plus these changes.",
    "To reopen it, go to Scenarios [Scenari] and use Load [Apri].",
])
callout("What the scenario stores",
        "A scenario stores its base lines and change draft. Loading restores the base lines and populates the changes; the builder still displays current feed-library costs, so the base remains visible. "
        "A scenario with no changes is a saved base, not a what-if.")

feature("7", "Scenarios", "Menu → Scenarios [Scenari]",
        "A library of saved what-if variations, with their cost and divergence from the saved snapshot.",
        "Owner, farm admin and consultant.",
        [
            "Read the list: name, base recipe, saved date, status, cost and Variato [Diverged].",
            "Variato means the recomputed cost differs from the saved snapshot, for example because a feed price changed.",
            "The checkboxes are reserved for the back-office comparison export and currently have no action on this screen. There is no in-app export button in this edition; ask an administrator or consultant to generate the workbook.",
            "Use Load [Apri] to open a scenario in the builder. If there are unsaved changes, confirm before discarding them.",
            "Use Delete [Elimina] to remove a scenario. Deletion cannot be undone; the last exported workbook is the record.",
            "Use Refresh [Aggiorna] to reload the list.",
        ],
        [
            "Reserved selection is in memory only; reloading the page clears it and does not send anything to the back office.",
            "Deleted scenarios disappear from the list and cannot be re-exported. The last workbook generated by your administrator/consultant is the record.",
            "A scenario built from the builder keeps its captured base; a later recipe edit does not rewrite it.",
        ])

feature("8", "Targets", "Menu → Targets [Obiettivi]",
        "The nutrient ranges used by the optimiser and the analysis. The workbook reference remains the baseline; a farm can override a range with a reason.",
        "Owner and farm admin can edit. Consultants can read.",
        [
            "Choose the animal group.",
            "Compare the reference range with the farm range.",
            "Enter new Min/Max values and a reason of at least 10 characters.",
            "Save [Salva] to store the override, or Revert [Ripristina] to return to the reference.",
            "Read the fibre warning: an override below the reference minimum is a health-risk signal and needs a reason.",
        ],
        [
            "Overrides are audited with author, reason and time.",
            "A target change affects future solves and current-truth recomputes; saved scenario snapshots keep their audit value.",
            "If the optimiser is infeasible, check whether a target is tighter than the feeds can reach before changing feeds.",
        ])

feature("9", "Groups", "Menu → Groups [Gruppi]",
        "The bridge between a recipe and the herd: head count, active ration and the cost basis for inventory and IOFC.",
        "Owner, farm admin and consultant.",
        [
            "Use Create group [Crea gruppo] and enter a name, nutritional category and head count.",
            "Assign an active recipe. The group's head count drives group cost and daily stock use.",
            "Edit head count when the herd changes; the next calculation uses the new value.",
            "Use the delete action only for a group that should no longer exist; historical records are not rewritten.",
        ],
        [
            "A group with no active recipe shows zero feed cost and cannot support IOFC.",
            "Head count is the source for daily use and cost; correct it before reading reports.",
            "One active recipe per group at a time.",
        ])

feature("10", "Inventory", "Menu → Inventory [Scorte]",
        "On-hand feed stock in kg as fed, daily use and days of cover against the active rations.",
        "Owner, farm admin and consultant.",
        [
            "Use Add item [Aggiungi articolo] to track a feed: reorder threshold, location, unit cost.",
            "Record a delivery [Registra consegna] with quantity and note; the ledger records the receipt.",
            "Use Correct [Correggi] with a signed delta and reason for a physical-count adjustment.",
            "Read On hand [Giacenza], Daily use [Uso giornaliero] and Days [Giorni di copertura] (days = on hand / daily use; see Calculations).",
            "Use Register unposted loads [Registra carichi non scaricati] for confirmed loads whose stock posting is pending.",
            "Follow the urgent (under 5 days) and caution (5–10 days) alerts; open Loading for failures.",
        ],
        [
            "An item can go below zero if a load exceeds stock; the overdraw alert asks for a delivery or correction.",
            "Deliveries and adjustments are append-only ledger entries; they are not edits to history.",
            "A feed without an inventory item is untracked: loading still records quantities but does not post stock.",
        ])

feature("11", "Loading", "Menu → Loading [Carico]",
        "The feeder's daily sheet: called vs loaded quantities per group, refusals, confirmation and stock posting.",
        "Feeder for entry and confirmation of their own load. Owner and farm admin use the same loading screen for oversight of the failure queue.",
        [
            "Choose the group, the feeder and the date.",
            "Enter Called [Chiamato] and Loaded [Caricato] kg as fed for each feed; enter refusals [Rifiuti] where relevant.",
            "Check the deviation and the total called/loaded.",
            "Save Draft [Salva bozza] to return later, or Confirm load [Conferma carico] to post tracked feeds to inventory.",
            "If the load exceeds stock, tick the acknowledgement before confirming.",
            "If a failure banner appears, use Retry all [Riprova tutti], or open the specific failure to Retry, Write off [Scarica in perdita], Mark handled [Segna gestito] or Acknowledge no action [Nessuna scrittura necessaria].",
        ],
        [
            "A group can have only one confirmed load per day; a second confirmation is blocked to avoid double-posting inventory.",
            "Skipped feeds are marked not posted; they do not silently change stock.",
            "The stale-scan banner means automatic retries are not running; a pending load may need manual retry.",
            "A write-off records a loss; it does not invent stock. The loss appears in the inventory ledger and the failure record.",
            "Retention: manual adjustments and write-offs are kept permanently; other resolved/dead failure records expire after 90 days. Do not use Mark handled or Acknowledge as your long-term audit trail.",
        ])

feature("12", "Accuracy", "Menu → Accuracy [Precisione]",
        "Called-vs-loaded performance by feeder and group, including deviation, anomalies and worst feeds.",
        "Owner, farm admin and consultant.",
        [
            "Choose the period (last 7/30/90 days) and optionally a group.",
            "Read the summary: loads, lines, mean absolute deviation, weighted deviation and anomalies.",
            "Review Worst feeds [Peggiori alimenti] and the weekly trend.",
            "Read intake efficiency: 100 × (1 − refusals / loaded).",
            "Use Export CSV [Esporta CSV] for the current view.",
        ],
        [
            "Drafts are excluded; confirmed loads are included even if stock posting is still pending.",
            "A refusal larger than the loaded quantity is a data error and the row is excluded; fix the entry.",
            "The CSV is semicolon-separated with comma decimals for Italian Excel. If LibreOffice shows dots, the file is still correctly shaped for Excel it-IT; open it in Excel set to Italian.",
        ])

feature("13", "IOFC", "Menu → IOFC",
        "Income over feed cost: milk revenue minus ration cost, per group and per cow per day.",
        "Owner, farm admin and consultant. Not applicable to dry groups.",
        [
            "Choose the group and date.",
            "Enter milk kg for the group and the milk price €/kg; save the farm default price if it is stable.",
            "Press Save [Salva] to record the snapshot.",
            "Read revenue, feed cost, IOFC/day, IOFC/cow/day, milk per cow and feed cost per kg milk.",
            "Use Refresh snapshot [Aggiorna snapshot] when a confirmed load changes the head-count or cost basis.",
            "Review the 7-day trend.",
        ],
        [
            "A missing active recipe means zero feed cost and no reliable IOFC.",
            "If the snapshot is incomplete, use Refresh snapshot or reselect the date before saving.",
            "Dry groups are excluded by design.",
            "IOFC is a management figure; it is not a replacement for the accountant's margin statement.",
        ])

# ── 14 Calculations ────────────────────────────────────────────────────────
doc.add_page_break()
doc.add_heading("14. How the figures are calculated", level=1)
doc.add_heading("Dry matter and cost", level=2)
bullets([
    "Dry matter (DM) = kg as fed × (1 − moisture % / 100).",
    "Ration DM = sum of each feed's DM.",
    "Ration cost = sum of kg as fed × price per kg as fed.",
    "Cost per kg DM = ration cost / ration DM.",
    "Forage ratio = forage DM / total DM.",
])
doc.add_heading("Nutrient analysis", level=2)
para("Each feed contributes its nutrient percentage × its DM; the sum is divided by total DM. Derived nutrients such as NFC, pectine, hemicellulose, ADF/aNDF and uNDF/aNDF are calculated from the blended analysis.")
doc.add_heading("Optimiser", level=2)
bullets([
    "The optimiser minimises ration cost subject to the total DM, forage ratio and nutrient targets.",
    "Optimal (Soluzione ottimale trovata): all active targets are met.",
    "Relaxed (Nessuna soluzione esatta): the closest feasible ration is shown; some targets are missed and listed as warnings.",
    "Infeasible (Nessuna soluzione fattibile, strict): no ration can meet the targets with the current feeds; the response lists unreachable targets.",
    "At-boundary: the value is within a small band of a fibre-class limit; treat it as fragile, not as a violation. It does not block saving or feeding. The builder labels it at the reference floor or at your target.",
])
doc.add_heading("Accuracy and IOFC", level=2)
bullets([
    "Deviation % = (loaded − called) / called × 100.",
    "Mean absolute deviation = average of |deviation %| across lines.",
    "Weighted deviation = total absolute kg deviation / total called kg × 100.",
    "Intake efficiency = 100 × (1 − refusals / loaded).",
    "IOFC = milk revenue − ration cost. Milk revenue = milk kg × price €/kg.",
    "IOFC per cow = IOFC / head count.",
    "Days of cover = on hand / daily use.",
    "Milk per cow = milk kg / head count.",
])

# ── 15 Troubleshooting ─────────────────────────────────────────────────────
doc.add_page_break()
doc.add_heading("15. Troubleshooting", level=1)
trouble = [
    ("The optimiser says Infeasible", "A target cannot be met with the selected feeds. Try relaxed mode, add/change a feed, reduce a constraint, or review Targets."),
    ("The result is Relaxed", "Some targets are missed by design. Read the warnings, decide whether the miss is acceptable, and document the choice."),
    ("A group has no active recipe", "Assign one in Groups. Loading and IOFC need it."),
    ("The load will not confirm", "Check the overdraw acknowledgement, the once-per-day rule, and the failure banner."),
    ("Stock did not decrease after confirmation", "The feed may be untracked or the posting failed. Use the failure queue or Register unposted loads."),
    ("The scenario will not load", "It may have been deleted, or its base recipe is no longer available. There is no in-app export button in this edition; use the last exported workbook as the record."),
    ("IOFC is zero or incomplete", "Assign an active recipe, confirm a load or refresh the snapshot; dry groups are excluded."),
    ("Accuracy row is excluded", "A refusal larger than the loaded quantity is a data error; correct the load."),
    ("The scan-stale banner is visible", "Automatic retries are not running. Retry manually; do not assume stock has posted."),
    ("CSV shows dots instead of commas", "The file is correctly shaped for Excel it-IT; LibreOffice applies its own locale. Open it in Excel set to Italian."),
]
table = doc.add_table(rows=1, cols=2)
table.style = "Table Grid"
for i, text in enumerate(("Symptom", "What to do")):
    table.rows[0].cells[i].text = ""
    r = table.rows[0].cells[i].paragraphs[0].add_run(text)
    r.bold = True; r.font.size = Pt(9); r.font.color.rgb = RGBColor(0xFF,0xFF,0xFF)
    shade(table.rows[0].cells[i], "2E5B3E")
for sym, action in trouble:
    cells = table.add_row().cells
    for i, text in enumerate((sym, action)):
        cells[i].text = ""
        r = cells[i].paragraphs[0].add_run(text)
        r.font.size = Pt(9)
set_col_widths(table, (Cm(5.3), Cm(11.3)))

# ── 16 Glossary ────────────────────────────────────────────────────────────
doc.add_page_break()
doc.add_heading("16. Glossary", level=1)
gloss = [
    ("As fed (t.q.)", "The weight of the feed as it is handled, including its moisture."),
    ("Dry matter (SS)", "The feed or ration with water removed."),
    ("TMR", "Total mixed ration."),
    ("aNDF / ADF / uNDF", "Fibre fractions used to assess rumen safety and ration structure."),
    ("NFC", "Non-fibre carbohydrates, calculated from the other nutrients."),
    ("Relaxed", "A feasible ration that misses some targets; the closest available compromise."),
    ("Strict", "A solve that must meet every target; if it cannot, it is infeasible."),
    ("Snapshot", "A stored copy of the figures at save time, kept for audit even when current data changes."),
    ("Diverged", "The current recomputation differs from the saved snapshot."),
    ("IOFC", "Income over feed cost."),
    ("Called vs loaded", "The quantity the ration called for versus what the feeder actually loaded."),
]
for term, definition in gloss:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(term)
    r.bold = True
    r.font.color.rgb = GREEN
    p.add_run(". " + definition)

# ── Final note ─────────────────────────────────────────────────────────────
doc.add_paragraph()
callout("A note on this edition",
        "This guide reflects the staging deployment as of 27 November 2026. The comparison export and some scenario-analysis features are back-office tools and are not exposed as buttons on every screen. "
        "If a label differs from your farm's language or role, use the closest visible action and ask your farm administrator.")

add_header(sec, "Milk Farm — User Guide")
add_footer(sec, "Milk Farm User Guide · Edition 1.0 · 27 November 2026")

doc.core_properties.title = "Milk Farm — User Guide"
doc.core_properties.subject = "Feature guide: location, purpose and usage"
doc.core_properties.author = "Milk Farm"
doc.core_properties.comments = "Edition 1.0, 27 November 2026"
doc.save(OUT)
print(OUT)
