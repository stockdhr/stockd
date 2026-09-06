# Stockd

Mobilni business command center za resellere. Frontend je vanilla HTML/CSS/JavaScript, API je Cloudflare Worker, a podaci se čuvaju u jednoj D1 bazi uz obaveznu izolaciju po `user_id`.

## Lokalni razvoj

1. `npm install`
2. `npm run db:migrate:local`
3. Kopiraj `backend/.dev.vars.example` u `backend/.dev.vars` i postavi lokalni setup secret.
4. `npm run dev`
5. Posluži mapu `frontend/` statičkim HTTP serverom.

Worker je na `http://localhost:8787`, a frontend API URL postavlja se u necommitanoj datoteci `frontend/js/config.js` prema primjeru `config.example.js`.

## Produkcija

Produkcijski secret postavlja se isključivo naredbom `wrangler secret put SETUP_SECRET --config backend/wrangler.jsonc`. Prvi administrator kreira se jednokratnim `POST /api/setup` pozivom. Endpoint se automatski zaključava čim postoji admin račun.

