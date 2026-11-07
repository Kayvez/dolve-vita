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
