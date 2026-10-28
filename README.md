# Bottino Lab

Sito per analizzare le domande Sì/No di **Salva il Bottino**.

1. **Incolli la domanda** come appare nel quiz (competizione, squadre, domanda). Il sito riconosce il tipo di domanda, il periodo, la soglia e cosa significa il Sì, e compila le caselle.
2. **Inserisci a mano le quote** di uno o più bookmaker. Il sito ti dice quale mercato cercare e quale quota va nella colonna del Sì.
3. **Inserisci le statistiche e il contesto** nelle caselle. Accanto a ogni sezione ci sono i siti dove trovare i dati.
4. Il sito **elabora tutto** e produce l'analisi: risposta consigliata, probabilità, sintesi, quote senza margine, modello statistico, scenari del Sì e del No, contesto, verdetto, controlli finali e qualità dei dati (con cosa manca).
5. Un **diario** tiene traccia delle risposte e di quante erano giuste, anche per tipo di domanda.

Il sito è statico (HTML, CSS, JavaScript): nessun server, nessun costo, nessun dato inviato fuori dal browser.

## Tipi di domanda

| Tipo | Esempi riconosciuti | Modello |
| --- | --- | --- |
| Gol totali | "Almeno 2 gol nel 1° tempo?", "Meno di 3 gol?", "Nessun gol nella ripresa?" | Poisson sui gol attesi |
| Segnano entrambe | "Entrambe le squadre segneranno?" | Poisson per squadra |
| Gol di una squadra | "Il Milan segnerà almeno 2 gol?", "L'Inter non subirà gol?" | Poisson |
| Esito 1X2 | "L'Inter vincerà?", "Il Milan non perderà?", "Finirà in pareggio?" | Tutti i risultati possibili |
| Calci d'angolo | "Più di 9,5 corner?" | Poisson sui corner attesi |
| Cartellini | "Almeno 5 cartellini?" | Poisson, media squadre e arbitro |
| Marcatore | "Lautaro Martinez segnerà?" | Gol ogni 90' × minuti × difesa avversaria |
| Totale punti | "Più di 220,5 punti?" (basket) | Distribuzione normale |
| Altro | Tennis, F1, MotoGP, espulsioni... | Quote + dato storico + stima personale |

Le domande "al contrario" (meno di, al massimo, nessuno, non perde, non subirà) vengono riconosciute: il Sì passa sull'Under o sulla doppia chance e le colonne delle quote si adattano.

Stima finale = quote senza margine (peso regolabile, 60% di base) + statistiche (40%) ± contesto (2,5 punti per fattore, massimo 12,5).

## Struttura

```
docs/              il sito pubblicato
  manifest.webmanifest, icons/   per aggiungerlo alla schermata Home
  version.json     versione pubblicata (scritta in automatico)
  index.html       viste: Dati, Analisi, Diario, Guida
  styles.css
  engine.js        calcoli: quote, Poisson, normale, fusione
  templates.js     i tipi di domanda: campi, modelli, testi dell'analisi
  parser.js        riconoscimento della domanda incollata
  app.js           interfaccia
functions/
  _middleware.js   password, solo su Cloudflare Pages
tests/             test dei calcoli e del riconoscimento (npm test)
.github/workflows/ test e pubblicazione automatica a ogni modifica
scripts/           numero di versione e anti-cache (usato in pubblicazione)
```

## Metterlo online (una volta sola)

### 1. Crea il repository
1. Vai su [github.com/new](https://github.com/new), nome `bottino-lab`, visibilità **Public** (con l'account gratuito GitHub Pages funziona solo sui repository pubblici), poi **Create repository**.
2. Carica i file in uno di questi modi:
   - **Lo faccio io (consigliato):** dimmi il nome del repository e carico tutto da qui.
   - **GitHub Desktop:** installa [GitHub Desktop](https://desktop.github.com/), *File → Clone repository*, copia dentro la cartella il contenuto dello zip, poi **Commit to main** e **Push origin**.
   - **Dal sito:** *uploading an existing file*, trascina il contenuto della cartella `bottino-lab` (comprese le cartelle nascoste `.github`), **Commit changes**.

### 2. Accendi GitHub Pages
1. Nel repository: **Settings → Pages**.
2. In **Build and deployment → Source** scegli **GitHub Actions**.
3. Vai in **Actions**, apri "Test e pubblicazione" e premi **Run workflow** (solo la prima volta).
4. Dopo 1-2 minuti il sito è su `https://<tuo-utente>.github.io/bottino-lab/`.

### In alternativa: Cloudflare Pages con password
Per un repository privato e un sito protetto da password:
1. [dash.cloudflare.com](https://dash.cloudflare.com/) → **Workers & Pages → Create application → Pages → Connect to Git**, scegli il repository.
2. **Build command:** `node scripts/stamp-version.mjs` · **Build output directory:** `docs`.
3. **Environment variables:** `SITE_PASSWORD` = la password che vuoi.
4. **Save and Deploy**: il sito è su `bottino-lab.pages.dev`.

## Aggiornamenti automatici

Dopo la prima configurazione non si carica più niente a mano:

1. **Ogni modifica salvata su GitHub** (ramo `main`) avvia da sola "Test e pubblicazione": controlla calcoli e riconoscimento e, se è tutto a posto, pubblica il sito in 1-2 minuti. Se un test fallisce, il sito resta alla versione precedente e nella scheda **Actions** compare una X rossa.
2. **Chi ha il sito aperto** vede comparire in alto la barra "È disponibile una nuova versione" con il pulsante **Aggiorna ora**. Il controllo avviene ogni 5 minuti e ogni volta che si torna sulla scheda. Domanda in corso e diario restano salvati.
3. **Ogni pubblicazione ha un numero di versione** (le prime 7 cifre della modifica su GitHub), visibile in **Guida → Usarlo come un'app**. Lo stesso numero viene aggiunto ai file, così il browser non usa copie vecchie.

Per modificare il sito hai tre strade:
- **Chiedilo a Claude**, che modifica e salva su GitHub: si aggiorna tutto da solo.
- **GitHub Desktop**: modifichi i file nella cartella, poi *Commit to main* e *Push origin*.
- **Dal sito di GitHub**: apri un file, icona della matita, modifica, *Commit changes*.

## Usarlo come un'app

Non serve scaricare niente. Dal sito pubblicato:
- **iPhone (Safari):** Condividi → *Aggiungi alla schermata Home*.
- **Android (Chrome):** menu ⋮ → *Aggiungi a schermata Home* o *Installa app*.
- **Computer (Chrome o Edge):** icona di installazione nella barra degli indirizzi.

Si apre a schermo intero con la sua icona e riceve gli stessi aggiornamenti automatici del sito.

## Provarlo sul computer

Apri `docs/index.html` con doppio clic. Funziona tutto tranne la password.

Con Node.js installato:

```
npm test                         # verifica calcoli e riconoscimento
cp .dev.vars.example .dev.vars   # per provare la password in locale
npm run dev                      # http://localhost:8788
```

## Dove restano i dati

Domanda in corso e diario sono salvati **nel browser** (localStorage). Su un altro computer o telefono il diario non c'è: usa **Diario → Esporta** e **Importa**, ed esporta ogni tanto come copia di sicurezza.

## Aggiungere o migliorare

- **Un nuovo tipo di domanda:** in `docs/templates.js` copia un blocco della lista `TEMPLATES` e cambia `id`, `name`, `params`, `fields`, `describe`, `model`, `scenarios`, `promptNeeds`, `sources`. Aggiungi un test.
- **Una nuova frase da riconoscere:** in `docs/parser.js` aggiungi la regola e un caso in `tests/parser.test.js`.

## Verso un servizio in abbonamento

La versione attuale ha al massimo una password condivisa. Per utenti paganti servono account per persona, pagamenti (Stripe), diario salvato sul server e, se si vogliono dati automatici, fonti con licenza d'uso (lo scraping dei siti di quote di solito è vietato dai loro termini).

Prima di monetizzare, verifica con un legale:
- il Decreto Dignità (art. 9, DL 87/2018) vieta in Italia la pubblicità, anche indiretta, di giochi e scommesse con vincite in denaro: un servizio a pagamento che mostra quote e pronostici potrebbe rientrarci;
- "Sisal" e "Salva il Bottino" sono marchi di terzi: per un prodotto pubblico serve un nome proprio, senza loghi o grafica Sisal.

## Avvertenza

Bottino Lab produce stime statistiche a scopo informativo. Nessun risultato è garantito.
