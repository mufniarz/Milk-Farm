from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = "docs/Milk-Farm-Guida-Utente.docx"
GREEN = RGBColor(0x2E, 0x5B, 0x3E)
GOLD = RGBColor(0xB8, 0x86, 0x2E)
GREY = RGBColor(0x5F, 0x63, 0x60)
LIGHT = "EEF2EC"
PALE_GOLD = "F5EEDC"

doc = Document()
sec = doc.sections[0]
sec.page_height = Cm(29.7); sec.page_width = Cm(21.0)
sec.top_margin = Cm(2.0); sec.bottom_margin = Cm(1.8)
sec.left_margin = Cm(2.2); sec.right_margin = Cm(2.2)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Arial"; normal.font.size = Pt(10)
normal.paragraph_format.space_after = Pt(4)
normal.paragraph_format.line_spacing = 1.15
for name, size, color, before, after in [
    ("Heading 1", 20, GREEN, 0, 10),
    ("Heading 2", 13, GREEN, 14, 5),
    ("Heading 3", 11, GOLD, 10, 3),
]:
    st = styles[name]
    st.font.name = "Arial"; st.font.size = Pt(size); st.font.bold = True
    st.font.color.rgb = color
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True

def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd"); shd.set(qn("w:fill"), hexcolor); tcPr.append(shd)

def set_col_widths(table, widths):
    for row in table.rows:
        for idx, width in enumerate(widths):
            row.cells[idx].width = width

def add_footer(section, text):
    p = section.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text); r.font.size = Pt(8); r.font.color.rgb = GREY

def add_header(section, text):
    p = section.header.paragraphs[0]; p.text = ""
    r = p.add_run(text); r.font.size = Pt(8); r.font.color.rgb = GREY
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

def para(text="", bold=False, italic=False, size=None, color=None, align=None, space_after=4):
    p = doc.add_paragraph()
    if align is not None: p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    r = p.add_run(text); r.bold = bold; r.italic = italic
    if size: r.font.size = Pt(size)
    if color: r.font.color.rgb = color
    return p

def bullets(items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(2)
        p.add_run(item)

def steps(items):
    for i, item in enumerate(items, 1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.7)
        p.paragraph_format.first_line_indent = Cm(-0.7)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(f"{i}.  "); r.bold = True; r.font.color.rgb = GREEN
        p.add_run(item)

def callout(title, body, fill=PALE_GOLD):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0); shade(cell, fill)
    cell.margin_top = Cm(0.2); cell.margin_bottom = Cm(0.2)
    p = cell.paragraphs[0]; p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title); r.bold = True; r.font.color.rgb = GREEN; r.font.size = Pt(9)
    p2 = cell.add_paragraph(); p2.paragraph_format.space_after = Pt(0)
    r2 = p2.add_run(body); r2.font.size = Pt(9)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def info_table(rows, widths=(Cm(3.4), Cm(13.2))):
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"; table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].text = ""
        p = cells[0].paragraphs[0]
        r = p.add_run(label); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = GREEN
        shade(cells[0], LIGHT)
        cells[1].text = ""
        p2 = cells[1].paragraphs[0]
        r2 = p2.add_run(value); r2.font.size = Pt(9)
    set_col_widths(table, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def feature(num, title, location, purpose, who, how, check):
    doc.add_page_break()
    doc.add_heading(f"{num}. {title}", level=1)
    info_table([("Dove", location), ("Perché", purpose), ("Chi", who)])
    doc.add_heading("Come si usa", level=2)
    steps(how)
    doc.add_heading("Cosa controllare", level=2)
    bullets(check)

# ── Copertina ──────────────────────────────────────────────────────────────
p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(90)
r = p.add_run("MILK FARM"); r.font.size = Pt(42); r.bold = True; r.font.color.rgb = GREEN
p2 = doc.add_paragraph(); r2 = p2.add_run("Guida utente"); r2.font.size = Pt(30); r2.font.color.rgb = GOLD
p3 = doc.add_paragraph(); r3 = p3.add_run("Formulazione della razione, gestione del carico e controllo del margine")
r3.font.size = Pt(13); r3.font.color.rgb = GREY
p4 = doc.add_paragraph(); p4.paragraph_format.space_before = Pt(26)
r4 = p4.add_run("Edizione 1.0  ·  27 novembre 2026"); r4.font.size = Pt(10); r4.font.color.rgb = GREY
p5 = doc.add_paragraph(); p5.paragraph_format.space_before = Pt(36)
r5 = p5.add_run("Applicazione: https://nicola-milk-farm.web.app")
r5.font.size = Pt(10); r5.bold = True; r5.font.color.rgb = GREEN
p6 = doc.add_paragraph(); r6 = p6.add_run("Per titolari, amministratori, consulenti e addetti alla stalla.")
r6.font.size = Pt(9); r6.italic = True; r6.font.color.rgb = GREY
callout("Informazioni sulla guida",
        "Questa guida descrive l'ambiente di staging attuale. I nomi dei menu sono in italiano; tra parentesi è riportata la versione inglese quando utile. "
        "Schermate e permessi possono variare leggermente tra aziende. I valori mostrati sono esempi, non obiettivi per la tua azienda.")

# ── Indice ─────────────────────────────────────────────────────────────────
doc.add_page_break(); doc.add_heading("Indice", level=1)
for num, title in [
    ("1", "Prima di iniziare: ruoli e navigazione"),
    ("2", "Avvio rapido: dall'alimento al carico confermato"),
    ("3", "Dashboard"),
    ("4", "Alimenti"),
    ("5", "Ricette"),
    ("6", "Formulatore razione"),
    ("7", "Scenari"),
    ("8", "Obiettivi"),
    ("9", "Gruppi"),
    ("10", "Scorte"),
    ("11", "Carico"),
    ("12", "Precisione"),
    ("13", "IOFC"),
    ("14", "Come si calcolano i valori"),
    ("15", "Risoluzione problemi"),
    ("16", "Glossario"),
]:
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(3)
    r = p.add_run(f"{num}.  "); r.bold = True; r.font.color.rgb = GOLD
    p.add_run(title)

# ── 1 Ruoli/navigazione ────────────────────────────────────────────────────
doc.add_page_break(); doc.add_heading("1. Prima di iniziare: ruoli e navigazione", level=1)
doc.add_heading("Ruoli", level=2)
para("L'accesso è controllato per azienda. La stessa persona può avere ruoli diversi in aziende diverse.")
table = doc.add_table(rows=1, cols=3); table.style = "Table Grid"
for i, text in enumerate(("Ruolo", "Uso tipico", "Accesso")):
    table.rows[0].cells[i].text = ""
    r = table.rows[0].cells[i].paragraphs[0].add_run(text)
    r.bold = True; r.font.size = Pt(9); r.font.color.rgb = RGBColor(0xFF,0xFF,0xFF)
    shade(table.rows[0].cells[i], "2E5B3E")
for role, use, access in [
    ("Titolare", "Controllo completo dell'azienda, obiettivi, report e impostazioni.", "Tutte le funzioni."),
    ("Amministratore", "Gestione quotidiana e modifica degli obiettivi.", "Tutte le funzioni operative ed economiche."),
    ("Consulente", "Formulazione, scenari e report per l'azienda.", "Alimenti, ricette, scenari, scorte, report; obiettivi in sola lettura."),
    ("Addetto", "Carico e conferma in stalla.", "Carico e conferma; report economici nascosti."),
]:
    cells = table.add_row().cells
    for i, text in enumerate((role, use, access)):
        cells[i].text = ""
        r = cells[i].paragraphs[0].add_run(text); r.font.size = Pt(9)
set_col_widths(table, (Cm(2.8), Cm(7.0), Cm(6.8)))
doc.add_paragraph()

doc.add_heading("Mappa dei menu", level=2)
table = doc.add_table(rows=1, cols=3); table.style = "Table Grid"
for i, text in enumerate(("Menu", "A cosa serve", "Indirizzo")):
    table.rows[0].cells[i].text = ""
    r = table.rows[0].cells[i].paragraphs[0].add_run(text)
    r.bold = True; r.font.size = Pt(9); r.font.color.rgb = RGBColor(0xFF,0xFF,0xFF)
    shade(table.rows[0].cells[i], "2E5B3E")
for menu, purpose, path in [
    ("Dashboard", "Panoramica e azioni rapide", "/dashboard"),
    ("Alimenti", "Libreria alimenti e composizione", "/feeds"),
    ("Ricette", "Razioni salvate e formulatore", "/recipes"),
    ("Scenari", "Variazioni what-if salvate", "/scenarios"),
    ("IOFC", "Margine per gruppo e per giorno", "/iofc"),
    ("Precisione", "Analisi chiamato vs caricato", "/accuracy"),
    ("Carico", "Carico e conferma in stalla", "/loading"),
    ("Gruppi", "Capi, razione attiva, base di costo", "/groups"),
    ("Scorte", "Giacenze, consegne, correzioni", "/inventory"),
    ("Obiettivi", "Range nutrizionali e deroghe aziendali", "/targets"),
]:
    cells = table.add_row().cells
    for i, text in enumerate((menu, purpose, path)):
        cells[i].text = ""
        r = cells[i].paragraphs[0].add_run(text); r.font.size = Pt(9)
set_col_widths(table, (Cm(3.8), Cm(9.5), Cm(3.3)))
para("Visibilità: gli addetti vedono Dashboard, Carico e i menu operativi. I report economici sono disponibili per titolare, amministratore e consulente. La modifica degli obiettivi è riservata a titolare e amministratore; il consulente può leggerli. Un menu non visibile al tuo ruolo non è un errore.", size=9, italic=True, color=GREY)
doc.add_paragraph()

doc.add_heading("Lingua e sessione", level=2)
bullets([
    "Usa l'icona del globo nella barra in alto per passare da italiano a inglese.",
    "Su telefono o finestra stretta usa l'icona menu: la barra laterale si chiude.",
    "Usa Esci in fondo alla barra laterale per terminare la sessione.",
])

# ── 2 Avvio rapido ─────────────────────────────────────────────────────────
doc.add_page_break(); doc.add_heading("2. Avvio rapido: dall'alimento al carico confermato", level=1)
para("Un primo percorso completo nell'applicazione. Puoi fermarti a qualsiasi passo e riprendere più tardi; i dati sono salvati per azienda.")
steps([
    "Aggiungi o importa gli alimenti in Alimenti. Inserisci prezzo, umidità e composizione nutrizionale.",
    "Crea o apri una Ricetta, scegli il gruppo animale e, facoltativamente, la dimensione del lotto (il numero capi del gruppo prevale).",
    "Seleziona alimenti e quantità, oppure imposta la sostanza secca totale e premi Calcola per ottimizzare il costo.",
    "Controlla l'analisi nutrizionale e gli avvisi. Salva la ricetta quando è accettabile.",
    "Crea un Gruppo, imposta il numero capi e assegna la ricetta come razione attiva.",
    "Aggiungi gli articoli in Scorte e registra la consegna iniziale.",
    "Apri Carico, scegli gruppo e addetto, inserisci quantità chiamate e caricate, salva una bozza o conferma.",
    "La conferma scarica le scorte per gli alimenti tracciati. Controlla l'eventuale banner di errore e riprova o gestisci.",
    "Controlla Precisione per lo scostamento chiamato-caricato e IOFC per il margine del gruppo.",
])
callout("Regola pratica",
        "Un numero vale quanto i dati che lo alimentano: umidità e prezzo guidano la razione; il numero capi guida costo e scorte; i carichi confermati guidano scorte e precisione. Completa i passi operativi prima di leggere i report economici.")

# ── Sezioni ────────────────────────────────────────────────────────────────
feature("3", "Dashboard", "Menu → Dashboard",
        "Un controllo rapido: quanti alimenti e ricette esistono, quali alimenti sono disponibili e le scorciatoie alle azioni più usate.",
        "Tutti gli utenti autenticati; i dati visibili dipendono dal ruolo.",
        ["Leggi i conteggi: alimenti totali, alimenti disponibili, ricette totali.",
         "Usa Nuova Ricetta per aprire il formulatore.",
         "Usa Gestisci Alimenti per mantenere la libreria.",
         "Usa Vedi Ricette per aprire l'elenco salvato."],
        ["Un numero basso di alimenti disponibili spiega spesso un'ottimizzazione difficile o impossibile.",
         "I conteggi sono per azienda, non globali."])

feature("4", "Alimenti", "Menu → Alimenti",
        "La libreria alimenti: composizione, prezzo, umidità e disponibilità usati da ogni ricetta e dall'ottimizzatore.",
        "Titolare, amministratore e consulente. Gli addetti non modificano la libreria.",
        ["Usa Aggiungi Alimento per creare un articolo: nome, categoria (foraggio/concentrato), prezzo €/kg tal quale, umidità %, disponibilità e nutrienti.",
         "Usa Modifica per correggere un alimento; le modifiche valgono per i calcoli futuri, non per gli snapshot salvati.",
         "Usa Importa CSV/Excel per l'inserimento massivo. Le percentuali sono lette come percentuali (50 = 50%); se il file usa frazioni (0,5), controlla la conversione mostrata prima di salvare.",
         "Usa ricerca e filtro categoria per trovare un alimento.",
         "Imposta Disponibile su off per escludere un alimento dall'ottimizzatore."],
        ["I nutrienti sono sulla sostanza secca; l'umidità è la percentuale tal quale.",
         "Il prezzo è €/kg tal quale, non per kg di sostanza secca; l'app usa €/kg, non €/t.",
         "Eliminare un alimento usato da una ricetta può compromettere la riproduzione; meglio renderlo non disponibile.",
         "Correggere un alimento cambia i calcoli futuri, incluso il costo dei gruppi con quella razione attiva; gli snapshot salvati mantengono i valori originali."])

feature("5", "Ricette", "Menu → Ricette",
        "La libreria delle razioni salvate: apri, duplica, esporta o elimina una ricetta; creane una nuova.",
        "Titolare, amministratore e consulente.",
        ["Usa Nuova Ricetta o il pulsante + per aprire il formulatore.",
         "Apri una scheda con Apri.",
         "Dal menu della scheda: Duplica, Esporta Excel o Elimina.",
         "L'esportazione scarica un .xlsx con righe, analisi e confronto con gli obiettivi.",
         "L'eliminazione chiede conferma e non può essere annullata."],
        ["L'esportazione è un documento puntuale: non si aggiorna quando cambiano gli alimenti.",
         "Duplica è il modo sicuro per creare una variante senza toccare l'originale.",
         "Una ricetta senza alimenti o con sostanza secca zero non è una base valida per un gruppo."])

feature("6", "Formulatore razione", "Ricette → Nuova Ricetta, o apri una ricetta salvata",
        "Formula una razione, ottimizza il costo, controlla la conformità nutrizionale e salvala. Qui nascono anche gli scenari.",
        "Titolare, amministratore e consulente.",
        ["Inserisci nome e gruppo animale (lattazione, asciutta, manza). Il Numero animali è solo la dimensione del lotto ad hoc: se la ricetta è assegnata a un gruppo, prevale il numero capi del gruppo per costo, uso giornaliero e IOFC. Vedi Gruppi.",
         "Seleziona gli alimenti e inserisci i kg tal quale. La tabella mostra kg di sostanza secca, costo e analisi corrente.",
         "Facoltativo: imposta SS Totale e il rapporto foraggio minimo/massimo in Vincoli (rapporto foraggio = SS foraggio / SS totale; vedi Calcoli).",
         "Premi Calcola. L'ottimizzatore restituisce la razione di costo minimo; se gli obiettivi esatti non sono raggiungibili restituisce la razione fattibile più vicina in modalità rilassata.",
         "Leggi lo stato: Soluzione ottimale trovata, Nessuna soluzione esatta (rilassata) o Nessuna soluzione fattibile (impossibile).",
         "Controlla gli avvisi: sotto il minimo, sopra il massimo, al limite (al minimo di riferimento o al tuo obiettivo) o obiettivi non raggiungibili. Porta il cursore sopra o espandi per limite e valore.",
         "Controlla profilo nutrienti e range obiettivo; regola alimenti, quantità o vincoli.",
         "Salva Ricetta per memorizzarla, oppure Esporta Excel per un documento."],
        ["Un risultato rilassato è utilizzabile ma va segnalato: alcuni obiettivi non sono pienamente rispettati.",
         "Un'impossibilità stretta significa che alimenti e range attuali non producono una razione: cambia alimenti, allenta un obiettivo in Obiettivi o usa la modalità rilassata.",
         "Un avviso al limite è un segnale di fragilità: una piccola variazione dell'analisi può portare la razione fuori range. Non blocca il salvataggio o il carico.",
         "Salvare una ricetta non cambia la razione attiva di un gruppo: assegnala in Gruppi.",
         "Il Numero animali non è il numero capi del gruppo: quando la ricetta è assegnata a un gruppo, vale il numero capi del gruppo."])

doc.add_heading("6a. Modifiche scenario nel formulatore", level=2)
para("Il pannello Modifiche scenario trasforma la razione corrente in un what-if senza cambiare la ricetta salvata.")
steps(["Scegli un alimento e aggiungi un nuovo prezzo, oppure una nuova quantità in kg tal quale.",
       "Scegli un nutriente e aggiungi un override min/max.",
       "Usa Pulisci per azzerare la bozza.",
       "Premi Salva scenario, assegna un nome e conferma. Lo scenario memorizza le righe base del formulatore e queste modifiche.",
       "Per riaprirlo, vai in Scenari e usa Apri."])
callout("Cosa memorizza lo scenario",
        "Uno scenario memorizza le righe base e la bozza delle modifiche. L'apertura ripristina le righe base e popola le modifiche; il formulatore continua a mostrare i costi correnti della libreria alimenti, così la base resta visibile. Uno scenario senza modifiche è una base salvata, non un what-if.")

feature("7", "Scenari", "Menu → Scenari",
        "Una libreria di variazioni what-if salvate, con costo e scostamento rispetto allo snapshot salvato.",
        "Titolare, amministratore e consulente.",
        ["Leggi l'elenco: nome, ricetta base, data di salvataggio, stato, costo e Variato.",
         "Variato significa che il costo ricalcolato differisce dallo snapshot salvato, per esempio perché è cambiato il prezzo di un alimento.",
         "Le caselle di selezione sono riservate all'esportazione di confronto back-office e al momento non hanno azione in questa schermata. Non c'è un pulsante di esportazione nell'app: chiedi a un amministratore o consulente di generare il workbook.",
         "Usa Apri per caricare uno scenario nel formulatore. Se ci sono modifiche non salvate, conferma prima di scartarle.",
         "Usa Elimina per rimuovere uno scenario. L'eliminazione non può essere annullata; l'ultimo workbook generato dall'amministratore/consulente è il documento di riferimento.",
         "Usa Aggiorna per ricaricare l'elenco."],
        ["La selezione riservata è solo in memoria; ricaricare la pagina la cancella e non invia nulla al back office.",
         "Gli scenari eliminati spariscono dall'elenco e non possono essere riesportati.",
         "Uno scenario creato dal formulatore conserva la base acquisita; una successiva modifica della ricetta non lo riscrive."])

feature("8", "Obiettivi", "Menu → Obiettivi",
        "I range nutrizionali usati dall'ottimizzatore e dall'analisi. Il riferimento del workbook resta la base; l'azienda può derogare con una motivazione.",
        "Titolare e amministratore possono modificare. Il consulente può leggere.",
        ["Scegli il gruppo animale.",
         "Confronta il range di riferimento con quello aziendale.",
         "Inserisci nuovi valori Min/Max e una motivazione di almeno 10 caratteri.",
         "Salva per memorizzare la deroga, oppure Ripristina per tornare al riferimento.",
         "Leggi l'avviso fibre: una deroga sotto il minimo di riferimento è un segnale di rischio per la salute e richiede motivazione."],
        ["Le deroghe sono tracciate con autore, motivazione e ora.",
         "Una modifica degli obiettivi influisce sui calcoli futuri e sui ricalcoli correnti; gli snapshot degli scenari conservano il valore di audit.",
         "Se l'ottimizzatore è impossibile, controlla se un obiettivo è più stretto di quanto gli alimenti possano raggiungere prima di cambiare gli alimenti."])

feature("9", "Gruppi", "Menu → Gruppi",
        "Il ponte tra ricetta e mandria: numero capi, razione attiva e base di costo per scorte e IOFC.",
        "Titolare, amministratore e consulente.",
        ["Usa Crea gruppo e inserisci nome, categoria nutrizionale e numero capi.",
         "Assegna una ricetta attiva. Il numero capi del gruppo guida costo di gruppo e uso giornaliero delle scorte.",
         "Modifica il numero capi quando cambia la mandria; il calcolo successivo usa il nuovo valore.",
         "Usa l'azione di eliminazione solo per un gruppo che non deve più esistere; i record storici non vengono riscritti."],
        ["Un gruppo senza ricetta attiva mostra costo alimentare zero e non può alimentare l'IOFC.",
         "Il numero capi è la fonte per uso giornaliero e costo; correggilo prima di leggere i report.",
         "Una sola ricetta attiva per gruppo alla volta."])

feature("10", "Scorte", "Menu → Scorte",
        "Giacenze in kg tal quale, uso giornaliero e giorni di copertura rispetto alle razioni attive.",
        "Titolare, amministratore e consulente.",
        ["Usa Aggiungi articolo per tracciare un alimento: soglia di riordino, posizione, costo unitario.",
         "Registra una consegna con quantità e nota; il ledger registra l'entrata.",
         "Usa Correggi con delta firmato e motivo per una rettifica da inventario fisico.",
         "Leggi Giacenza, Uso giornaliero e Giorni di copertura (giorni = giacenza / uso giornaliero).",
         "Usa Registra carichi non scaricati per i carichi confermati con scarico scorte in sospeso.",
         "Segui gli avvisi urgenti (sotto 5 giorni) e di attenzione (5–10 giorni); apri Carico per i guasti."],
        ["Un articolo può andare sotto zero se un carico supera la giacenza; l'avviso chiede una consegna o una correzione.",
         "Consegne e correzioni sono voci append-only: non modificano la storia.",
         "Un alimento senza articolo di magazzino è non tracciato: il carico registra le quantità ma non scarica le scorte."])

feature("11", "Carico", "Menu → Carico",
        "Il foglio giornaliero dell'addetto: quantità chiamate e caricate per gruppo, rifiuti, conferma e scarico scorte.",
        "Addetto per inserimento e conferma del proprio carico. Titolare e amministratore usano la stessa schermata per la supervisione della coda guasti.",
        ["Scegli gruppo, addetto e data.",
         "Inserisci Chiamato e Caricato in kg tal quale per ogni alimento; inserisci i rifiuti dove serve.",
         "Controlla scostamento e totale chiamato/caricato.",
         "Salva bozza per riprendere più tardi, oppure Conferma carico per scaricare gli alimenti tracciati.",
         "Se il carico supera la giacenza, spunta la conferma prima di procedere.",
         "Se compare un banner di errore, usa Riprova tutti, oppure apri il singolo guasto per Riprova, Scarica in perdita, Segna gestito o Nessuna scrittura necessaria."],
        ["Un gruppo può avere un solo carico confermato al giorno; una seconda conferma è bloccata per evitare un doppio scarico.",
         "Gli alimenti non scaricati sono marcati come non registrati; non modificano silenziosamente le scorte.",
         "Il banner di scansione obsoleta significa che i tentativi automatici non sono in esecuzione: un carico in sospeso può richiedere un riprova manuale.",
         "Una scrittura in perdita registra una perdita; non inventa scorte. La perdita compare nel ledger scorte e nel record del guasto.",
         "Conservazione: rettifiche manuali e scritture in perdita restano permanenti; gli altri record risolti/morti scadono dopo 90 giorni. Non usare Segna gestito o Nessuna scrittura necessaria come archivio di lungo periodo."])

feature("12", "Precisione", "Menu → Precisione",
        "Prestazione chiamato-caricato per addetto e gruppo, con scostamento, anomalie e alimenti peggiori.",
        "Titolare, amministratore e consulente.",
        ["Scegli il periodo (ultimi 7/30/90 giorni) ed eventualmente un gruppo.",
         "Leggi il riepilogo: carichi, righe, scostamento medio assoluto, scostamento pesato e anomalie.",
         "Controlla Peggiori alimenti e l'andamento settimanale.",
         "Leggi l'efficienza di ingestione: 100 × (1 − rifiuti / caricato).",
         "Usa Esporta CSV per la vista corrente."],
        ["Le bozze sono escluse; i carichi confermati sono inclusi anche se lo scarico scorte è ancora in sospeso.",
         "Un rifiuto superiore al caricato è un errore dati e la riga è esclusa; correggi l'inserimento.",
         "Il CSV è separato da punto e virgola con decimali a virgola per Excel italiano. Se LibreOffice mostra i punti, il file è comunque corretto per Excel it-IT: aprilo in Excel impostato su italiano."])

feature("13", "IOFC", "Menu → IOFC",
        "Income over feed cost: ricavo latte meno costo razione, per gruppo e per vacca al giorno.",
        "Titolare, amministratore e consulente. Non si applica ai gruppi in asciutta.",
        ["Scegli gruppo e data.",
         "Inserisci i kg di latte del gruppo e il prezzo latte €/kg; salva il prezzo predefinito se è stabile.",
         "Premi Salva per registrare lo snapshot.",
         "Leggi ricavo, costo razione, IOFC/giorno, IOFC/vacca/giorno, latte per vacca e costo razione per kg di latte.",
         "Usa Aggiorna snapshot quando un carico confermato cambia la base capi o costo.",
         "Controlla l'andamento degli ultimi 7 giorni."],
        ["Una ricetta attiva mancante significa costo alimentare zero e IOFC non affidabile.",
         "Se lo snapshot è incompleto, usa Aggiorna snapshot o riseleziona la data prima di salvare.",
         "I gruppi in asciutta sono esclusi per scelta.",
         "L'IOFC è un dato gestionale, non sostituisce il margine del commercialista."])

# ── 14 Calcoli ─────────────────────────────────────────────────────────────
doc.add_page_break(); doc.add_heading("14. Come si calcolano i valori", level=1)
doc.add_heading("Sostanza secca e costo", level=2)
bullets(["Sostanza secca (SS) = kg tal quale × (1 − umidità % / 100).",
         "SS razione = somma della SS di ogni alimento.",
         "Costo razione = somma di kg tal quale × prezzo per kg tal quale.",
         "Costo per kg SS = costo razione / SS razione.",
         "Rapporto foraggio = SS foraggio / SS totale."])
doc.add_heading("Analisi nutrizionale", level=2)
para("Ogni alimento contribuisce con la sua percentuale di nutriente × la sua SS; la somma è divisa per la SS totale. I nutrienti derivati come NFC, pectine, emicellulosa, ADF/aNDF e uNDF/aNDF sono calcolati dall'analisi miscelata.")
doc.add_heading("Ottimizzatore", level=2)
bullets(["L'ottimizzatore minimizza il costo della razione rispettando SS totale, rapporto foraggio e obiettivi nutrizionali.",
         "Soluzione ottimale trovata: tutti gli obiettivi attivi sono rispettati.",
         "Nessuna soluzione esatta (rilassata): viene mostrata la razione fattibile più vicina; alcuni obiettivi sono mancati e compaiono negli avvisi.",
         "Nessuna soluzione fattibile (strict): nessuna razione può rispettare gli obiettivi con gli alimenti attuali; la risposta elenca gli obiettivi non raggiungibili.",
         "Al limite: il valore è entro una piccola banda di un limite relativo alla fibra; trattalo come fragile, non come violazione. Non blocca il salvataggio o il carico. Il formulatore lo etichetta al minimo di riferimento o al tuo obiettivo."])
doc.add_heading("Precisione e IOFC", level=2)
bullets(["Scostamento % = (caricato − chiamato) / chiamato × 100.",
         "Scostamento medio assoluto = media di |scostamento %| sulle righe.",
         "Scostamento pesato = deviazione assoluta totale in kg / chiamato totale × 100.",
         "Efficienza di ingestione = 100 × (1 − rifiuti / caricato).",
         "IOFC = ricavo latte − costo razione. Ricavo latte = kg latte × prezzo €/kg.",
         "IOFC per vacca = IOFC / numero capi.",
         "Giorni di copertura = giacenza / uso giornaliero.",
         "Latte per vacca = kg latte / numero capi."])

# ── 15 Problemi ────────────────────────────────────────────────────────────
doc.add_page_break(); doc.add_heading("15. Risoluzione problemi", level=1)
table = doc.add_table(rows=1, cols=2); table.style = "Table Grid"
for i, text in enumerate(("Sintomo", "Cosa fare")):
    table.rows[0].cells[i].text = ""
    r = table.rows[0].cells[i].paragraphs[0].add_run(text)
    r.bold = True; r.font.size = Pt(9); r.font.color.rgb = RGBColor(0xFF,0xFF,0xFF)
    shade(table.rows[0].cells[i], "2E5B3E")
for sym, action in [
    ("L'ottimizzatore dice Nessuna soluzione fattibile", "Un obiettivo non è raggiungibile con gli alimenti scelti. Prova la modalità rilassata, aggiungi/cambia un alimento, riduci un vincolo o rivedi Obiettivi."),
    ("Il risultato è Nessuna soluzione esatta", "Alcuni obiettivi sono mancati per scelta. Leggi gli avvisi, decidi se il mancato rispetto è accettabile e documenta la scelta."),
    ("Il gruppo non ha una ricetta attiva", "Assegnane una in Gruppi. Carico e IOFC la richiedono."),
    ("Il carico non si conferma", "Controlla la conferma di eccedenza, la regola di un carico al giorno e il banner di errore."),
    ("Le scorte non sono diminuite dopo la conferma", "L'alimento può essere non tracciato o lo scarico è fallito. Usa la coda guasti o Registra carichi non scaricati."),
    ("Lo scenario non si carica", "Può essere stato eliminato o la ricetta base non è più disponibile. Non c'è un pulsante di esportazione nell'app: usa l'ultimo workbook generato dall'amministratore/consulente."),
    ("IOFC è zero o incompleto", "Assegna una ricetta attiva, conferma un carico o aggiorna lo snapshot; i gruppi in asciutta sono esclusi."),
    ("Una riga Precisione è esclusa", "Un rifiuto superiore al caricato è un errore dati; correggi il carico."),
    ("È visibile il banner di scansione obsoleta", "I tentativi automatici non sono in esecuzione. Riprova manualmente; non dare per scontato lo scarico scorte."),
    ("Il CSV mostra punti invece di virgole", "Il file è corretto per Excel it-IT; LibreOffice applica il proprio locale. Aprilo in Excel impostato su italiano."),
]:
    cells = table.add_row().cells
    for i, text in enumerate((sym, action)):
        cells[i].text = ""
        r = cells[i].paragraphs[0].add_run(text); r.font.size = Pt(9)
set_col_widths(table, (Cm(5.3), Cm(11.3)))

# ── 16 Glossario ──────────────────────────────────────────────────────────
doc.add_page_break(); doc.add_heading("16. Glossario", level=1)
for term, definition in [
    ("Tal quale (t.q.)", "Il peso dell'alimento così com'è maneggiato, umidità inclusa."),
    ("Sostanza secca (SS)", "L'alimento o la razione senza acqua."),
    ("TMR / unifeed", "Razione totale miscelata."),
    ("aNDF / ADF / uNDF", "Frazioni fibrose usate per valutare sicurezza del rumine e struttura della razione."),
    ("NFC", "Carboidrati non fibrosi, calcolati dagli altri nutrienti."),
    ("Rilassata (Nessuna soluzione esatta)", "Razione fattibile che manca alcuni obiettivi; il compromesso più vicino disponibile."),
    ("Strict", "Soluzione che deve rispettare tutti gli obiettivi; se non può, è impossibile."),
    ("Snapshot", "Copia memorizzata dei valori al momento del salvataggio, conservata per audit anche quando i dati correnti cambiano."),
    ("Variato", "Il ricalcolo corrente differisce dallo snapshot salvato."),
    ("IOFC", "Income over feed cost, margine sul costo alimentare."),
    ("Chiamato vs caricato", "La quantità prevista dalla razione rispetto a quella effettivamente caricata."),
]:
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(2)
    r = p.add_run(term); r.bold = True; r.font.color.rgb = GREEN
    p.add_run(". " + definition)

doc.add_paragraph()
callout("Nota su questa edizione",
        "Questa guida riflette l'ambiente di staging al 27 novembre 2026. L'esportazione di confronto e alcune analisi degli scenari sono strumenti back-office e non sono esposti come pulsanti in ogni schermata. Se un'etichetta differisce dalla lingua o dal ruolo della tua azienda, usa l'azione visibile più vicina e chiedi all'amministratore.")

add_header(sec, "Milk Farm — Guida utente")
add_footer(sec, "Guida utente Milk Farm · Edizione 1.0 · 27 novembre 2026")
doc.core_properties.title = "Milk Farm — Guida utente"
doc.core_properties.subject = "Guida alle funzioni: posizione, scopo e uso"
doc.core_properties.author = "Milk Farm"
doc.core_properties.comments = "Edizione 1.0, 27 novembre 2026"
doc.save(OUT)
print(OUT)
