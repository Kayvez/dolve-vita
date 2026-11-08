# Dolce Vita 🎲
Il gioco da tavolo per le serate con le amiche: **l'iPad sta al centro del tavolo come tabellone**, ognuna gioca dal **proprio telefono** (dadi, acquisti, aste, scambi, carte).

## Cosa serve
- Un computer (Windows, Mac o Linux) con **Node.js** installato: scaricalo da https://nodejs.org (versione "LTS", si installa con "Avanti, avanti").
- iPad, telefoni e computer collegati **allo stesso Wi-Fi** (quello di casa).

Non serve internet, non serve registrarsi, non si installa niente su iPad e telefoni.

## Avviare il gioco (ogni sera)
1. **Windows:** doppio clic su `Avvia - Windows.bat`.
   **Mac:** doppio clic su `Avvia - Mac.command` (la prima volta: tasto destro → Apri).
   **Altrimenti:** apri il Terminale nella cartella e scrivi `node server.js`.
2. Compare una finestra con un indirizzo tipo `http://192.168.1.20:3000/board`. **Lasciala aperta** per tutta la serata.
   - Se Windows chiede dell'accesso alla rete (Firewall), scegli **Consenti** per le reti private.
3. **Sull'iPad** apri Safari e scrivi quell'indirizzo (quello che finisce con `/board`). Appoggia l'iPad al centro del tavolo.
4. Sul tabellone compare un **QR code**: ognuna lo inquadra con la fotocamera del telefono, scrive il nome e sceglie la pedina.
5. Quando ci siete tutte, tocca **Inizia la partita** (sul tabellone oppure dal telefono di chi è entrata per prima ⭐).

### Consigli per l'iPad
- Impostazioni → Schermo e luminosità → **Blocco automatico: Mai** (altrimenti si spegne a metà turno). Tienilo in carica.
- In Safari: tasto Condividi → **Aggiungi alla schermata Home**: aprendo il gioco da lì sparisce la barra del browser e il tabellone è più grande.
- Tocca **Attiva suoni** sul tabellone per sentire dadi, acquisti e affitti.
- Funziona sia in orizzontale sia in verticale.

## Come si gioca
Sul telefono, nella scheda **Turno**:
- Quando è il tuo turno compare **Tira i dadi**. La pedina si muove da sola sul tabellone.
- Se arrivi su una proprietà libera: **Compra**, oppure **Non comprare** e parte un'**asta** per tutte (si rilancia con +10 / +50 / +100, ci si ritira con "Mi ritiro").
- Affitti, tasse e carte si pagano/incassano in automatico. Le carte pescate compaiono sul tabellone.
- **Fine turno** quando hai finito. Se hai fatto un doppio puoi tirare ancora (tre doppi di fila = prigione).

Altre schede:
- **Proprietà**: costruisci case e alberghi (serve tutto il colore, si costruisce in modo uniforme), ipoteca e riscatta.
- **Scambi**: proponi soldi, proprietà e carte "esci di prigione" a un'altra giocatrice; lei accetta o rifiuta dal suo telefono. Si può scambiare in qualsiasi momento, anche fuori dal proprio turno.
- **Giocatori**: classifica, patrimoni e il pulsante "Mi arrendo".

Se non hai abbastanza soldi per pagare, compare **Devi pagare**: ipoteca, vendi case o fai uno scambio. Appena hai abbastanza, il pagamento parte da solo. Se non ce la fai, dichiari bancarotta e tutto passa a chi ti aspettava i soldi (o alla banca). Vince l'ultima rimasta.

### Regole opzionali (si scelgono prima di iniziare, toccando i pulsanti)
- 💰 soldi iniziali (€1000 / 1500 / 2000 / 3000)
- 🍹 **Piatto aperitivo**: tasse e multe finiscono nel centro e le prende chi si ferma su "Pausa Aperitivo" (regola casalinga molto diffusa)
- 👀 **Soldi visibili a tutti**: se spento, ognuna vede solo i propri soldi
- 🔨 **Aste** attive o no

### Menu del tabellone (⚙︎)
- **Termina ora**: chiude la partita e vince chi ha il patrimonio più alto (comodo a fine serata).
- **Chiudi l'asta**: se qualcuna si è addormentata durante un'asta.
- **Nuova partita**: cancella tutto e riparte.

## Se qualcosa non va
- **Il telefono non apre la pagina:** controlla che sia sullo stesso Wi-Fi (non "ospiti"/guest e non dati mobili) e che VPN siano spente. Il QR usa il primo indirizzo trovato; se il computer ne ha più d'uno, prova a scrivere a mano l'altro indirizzo mostrato nella finestra.
- **A una amica si è bloccato/spento il telefono:** basta riaprire la pagina, rientra da sola. Se ha cambiato telefono, nella schermata di ingresso tocca il suo nome sotto "Eri già dentro?".
- **Il computer si è riavviato o ho chiuso la finestra:** riavvia il gioco: **la partita riprende da dove era** (è salvata nella cartella `data`). Per ricominciare da zero usa "Nuova partita" nel menu.
- **Porta occupata:** avvia con un'altra porta, es. `PORT=8080 node server.js` (Windows: `set PORT=8080 && node server.js`).

## Personalizzare
- Nomi delle caselle, titolo e testi delle carte: file `public/shared/data.js` (prezzi e affitti sono quelli classici; puoi cambiarli, basta tenere le 40 caselle). Per mettere i nomi delle amiche o le vostre città, cambia solo i `name`.
- Per giocare **anche a distanza** o senza tenere acceso il computer, il gioco può essere messo online su un servizio come Render o Railway (comando di avvio: `node server.js`, nessuna installazione di pacchetti). Poi basta aprire l'indirizzo pubblico sull'iPad e sui telefoni.

## Per i curiosi
- Nessuna dipendenza: solo Node.js. `server.js` (rete e salvataggio), `game.js` (tutte le regole), `public/` (schermate).
- Il server decide tutto (dadi compresi), quindi nessuna può barare dal telefono.
- Test: `node test/rules.js` (regole) e `node test/simulate.js 200` (200 partite complete giocate a caso).

*Non è un prodotto Hasbro: "Monopoly" è un marchio di Hasbro. Questo è un gioco originale ispirato al genere, con nomi e carte propri.*

## Novità della versione 2.0 (tutto attivabile prima di iniziare)
Sul tabellone o dal telefono di chi ha creato la partita: **🎉 Ultra** (tutte le novità) oppure **📜 Classico**.
- **🎲 Dado matto**: terzo dado arancione. I numeri si sommano; **🃏 Jolly** = dopo il movimento corri alla prossima proprietà libera; **🚌 Navetta** = scegli quale dado usare (o la somma); **Tris** (doppio uguale al terzo dado) = vai dove vuoi.
- **🃏 Assi nella manica** (max 3): scudo, furto, doppio affitto, salta turno, cambio posto, festa a sorpresa, teletrasporto. Se ne pesca passando dalla Partenza.
- **🎪 Eventi di città**: a ogni giro cambia una regola (Partenza d'oro, saldi, sciopero treni, tregua, festa di un colore, bonus).
- **🕵️ Furbetti** (spento di default): nel tuo turno puoi barare di nascosto (+€100). Accusa giusta: paghi €200; accusa sbagliata: paga €50 chi accusa. I soldi restano segreti.
- **🗺️ Temi**: Italia, Giro del mondo, Gola (cambiano solo i nomi delle caselle).
- Carte Fortuna/Sorpresa nuove (Robin Hood, colpo grosso, cambio posto…).
- Grafica nuova: pedine che saltano casella per casella, dadi grandi, soldi che volano, coriandoli, annunci a tutto schermo.

## Voto delle regole e guida (2.1)
- Appena entra, ogni giocatrice vede le regole spiegate (tasto ℹ︎) e vota 👍/👎. **Vince la maggioranza**; in caso di pareggio decide chi ha creato la partita ⭐.
- Chi ha creato la partita sceglie anche: soldi iniziali, tema e **durata** (senza limite, 20, 30 o 50 giri: alla fine vince il patrimonio più alto).
- All'inizio compare un **ripasso delle regole di stasera** su tabellone e telefoni. Il tasto **?** in alto sul telefono apre sempre la guida.
- I bottoni grigi (costruisci, ipoteca…) se toccati dicono perché non si può.

## Banchiere furbo (2.2, regola votabile)
A sorte uno diventa banchiere (gioca anche lui). I soldi che la banca deve dare (Partenza, carte) li paga lui dal telefono: **Tutto, ¾, metà o niente**. Quello che trattiene lo tiene per sé, di nascosto. Chi sospetta può **accusarlo** (una volta a giro): se aveva trattenuto, restituisce il doppio; se era onesto, l'accusatrice paga €50. I pagamenti non gestiti a fine turno arrivano interi. Con questa regola i soldi di tutte sono segreti sul tabellone.

## Novità 3.0

### 💾 Salvataggio sicuro (per non perdere MAI la partita)
Sul sito gratuito (Render) il server ogni tanto si "addormenta" o si riavvia, e quello che è nella sua memoria interna si cancella. Con il salvataggio sicuro la partita viene copiata ogni istante su un archivio esterno gratuito (Upstash) e ritorna da sola. Si fa una volta sola:
1. Vai su **upstash.com**, crea un account gratuito (anche con Google).
2. Crea un database **Redis** (nome a piacere, regione Europa, piano Free).
3. Nella pagina del database, sezione **REST API**, copia i due valori: **UPSTASH_REDIS_REST_URL** e **UPSTASH_REDIS_REST_TOKEN**.
4. Su **render.com** apri il tuo servizio → **Environment** → **Add Environment Variable**: aggiungi `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` con i valori copiati → **Save** (Render riparte da solo).
Sul tabellone compare la scritta verde "💾 Salvataggio sicuro attivo". Se invece vedi la scritta rossa "Salvataggio temporaneo", non è ancora collegato.

### 🗺️ Tabellone lungo (60 caselle)
Di default il tabellone ora è più lungo (60 caselle), largo come lo schermo dell'iPad, con l'elenco delle giocatrici dentro al riquadro centrale. Si può tornare a quello classico da 40 con il pulsante "🗺️ Tabellone" prima di iniziare. Nuovi colori (verde acqua e viola) e nuove caselle: 🎰 Casinò, 🎡 Ruota della fortuna, 🃏 Mercato degli Assi, 🌀 Teletrasporto, 🧖 Relax, 🏆 Premio di città e ⚡ Imprevisti (un mazzo nuovo, quasi tutto guai).

### 🗽 Cosa fare quando hai tutto un colore
Affitto raddoppiato subito, poi si costruiscono 🏠 case (fino a 4), 🏨 albergo e infine il 🗽 **Monumento**: costa il doppio di una casa e l'affitto sale ancora più su.

### Altre novità
- **Fine turno automatico**: dopo qualche secondo il turno passa da solo (si può fermare dal telefono, e spegnere dalle regole).
- **Offerta diretta**: quando arrivi su una proprietà libera, oltre a comprare o all'asta, puoi offrirla a UNA giocatrice a un prezzo deciso da te.
- **Furbetti**: solo a inizio turno, prima di tirare, e il tabellone non mostra nulla.
- **Avvisi grandi e lenti** per affitti, multe, premi, Partenza d'oro, sciopero dei treni ecc.
- **Pedine più grandi**, con il nome sopra a chi sta giocando.
- **Tocca una casella** sul tabellone per leggerne la scheda e le regole.
- **Suoni**: sull'iPad tocca la scritta gialla "Attiva i suoni" e controlla che il tasto muto laterale non sia attivo.

## Novità 3.3
- **Traguardo**: la partita finisce quando qualcuna arriva a €5000 tra soldi + proprietà + edifici (si cambia dal pulsante 🏁: 3000 / 5000 / 8000 / nessuno). Vince chi arriva prima a quella cifra.
- **Fase finale 🔥**: quando tutte le proprietà sono state prese, il Dado matto non si usa più, tasse e multe valgono il DOPPIO, e casinò e ruota possono toglierti tutto il contante.
- **Più lento e più calmo**: pedine, dadi e avvisi vanno più piano.
- **Case più grandi** sul tabellone.
- **Tema ⚡ Maghi** (Harry Potter) tra i temi: si cambia col pulsante del tema prima di iniziare.

## Novità 4.0

Sei regole nuove, tutte votabili dalla lobby (come le altre):

- 🎯 **Missioni segrete**: ognuna ha un obiettivo che vede solo lei (es. "possiedi 3 stazioni"). Compiuta = €300 e ne arriva un'altra.
- 💰 **Taglia sulla più ricca**: chi le fa pagare un affitto prende €100 extra; chi la manda in prigione con una carta prende €150.
- 👯 **Squadre**: con 4 o 6 giocatrici si gioca in coppie. Le compagne non si pagano affitti. Vince la coppia che arriva a 1,6 volte il traguardo (somma dei patrimoni).
- 🎭 **Sfide**: carte "obbligo" da fare dal vivo. Fatta +€100, rifiutata −€50.
- ⏰ **Timer**: dalla lobby (chip "⏰") si sceglie 30/45/60/90 minuti: a tempo scaduto vince chi ha più patrimonio. Il conto alla rovescia è sul tabellone e sul telefono.
- 🌋 **Eventi cattivi**: controllo fiscale, sciopero della banca, mercato nero. Escono soprattutto nella fase finale.

Nessuna nuova impostazione tecnica: Upstash resta com'è.

## Novità 4.3

- 🍹 La Pausa Aperitivo si raggiunge solo con i dadi (non con assi, Tris, Teletrasporto…).
- 🚔 In prigione, al terzo turno si esce gratis.
- ⚡ Più carte Imprevisto che fanno guadagnare.
- 🙋 **Acquisto libero** (opzione votabile): puoi non comprare e lasciare la proprietà libera; le altre possono richiederla a prezzo di listino e a te va il 10%. L'asta si sblocca dal giro scelto nella lobby (chip 🔨).
- 🔨 **Asta d'emergenza**: se devi pagare e non hai soldi, puoi mettere all'asta una tua proprietà (senza edifici): ti rientra il 70%.
- 🚆 **Viaggio tra stazioni**: su una tua stazione puoi spostarti gratis in un'altra tua stazione (se passi dal Via incassi).
- 💰 Il Via dà €400, oppure €200 se i Furbetti sono attivi.
- Tolte le opzioni Squadre e Banchiere.

## 4.4 - Sblocco d'emergenza
Dal menu del tabellone: "Salta il turno di chi sta giocando" e "Fai uscire ...". Se chi deve giocare resta scollegata per 2 minuti il turno passa da solo.

## 4.6
Se in due o piu la vogliono, asta tra loro (si parte dal listino, 10% a chi l'ha lasciata). Tabellone piu reattivo: attende le animazioni solo dopo un lancio di dadi.
