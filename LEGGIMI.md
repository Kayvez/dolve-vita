# Misteri al Collegio 🕵️ (Cluedo versione collegio)

Un tabellone sull'iPad, un telefono per ogni giocatrice (da 2 a 9).

## Come si gioca
- Sull'iPad apri `/board`: compare il QR code. Ogni amica lo scansiona, scrive il nome e sceglie il personaggio. Chi entra per prima (⭐) fa partire la partita.
- L'Ispettore del Ministero è stato ucciso. Una carta Sospettata, una Arma e un Luogo sono nella busta: nessuno le ha. Le altre carte sono distribuite.
- Nel tuo turno: **tira i dadi** (2 dadi = passi sui quadratini) e muoviti. Nelle stanze si entra dalle porte.
- Dentro una stanza fai un'**ipotesi** (sospettata + arma): vengono portate lì. Le altre, a turno, smentiscono mostrandoti di nascosto UNA carta.
- **Passaggi segreti** (al posto dei dadi): A Cucina Infernale ↔ Cripta Gelata, B Sancta Sanctorum ↔ Gran Salone.
- **Scale**: i quadratini con la freccia portano allo Scriptorium (aula studio), al piano di sopra.
- **Pettegolezzi** (Portineria, Salotto delle Sorelle, Cappella del Silenzio): un'indiscrezione privata che può essere vera… o una bugia!
- **Suora di ronda**: gira per il collegio; nella stanza dove si trova non si possono fare ipotesi.
- **Accusa finale**: se indovini tutto vinci; se sbagli sei fuori (ma continui a smentire).
- **Coprifuoco alle 23:00** (ora di Roma, si può cambiare o spegnere): tutte scrivono in segreto l'accusa finale; chi indovina vince.
- Sul telefono c'è il **Taccuino** per segnare le carte escluse.

## Su Render (online)
1. GitHub: crea un NUOVO repository, "Add file → Upload files", trascina TUTTI i file (non lo zip), Commit.
2. Render: New → Web Service → collega il repository. Build command vuoto, Start command `node server.js`.
3. (Facoltativo, per non perdere la partita se Render si riavvia) Environment: `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (gli stessi di Dolce Vita: i dati usano una chiave diversa).

## In locale
`node server.js` poi apri l'indirizzo `/board` sull'iPad. Prove: `node test.js`.
