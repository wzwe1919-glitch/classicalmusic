# classical chill

full next.js classical music web app with:

- multi-source tracks (wikimedia commons + internet archive)
- custom player interface with filters and language switcher
- auth system:
  - email/password register + login
  - google login (when env keys are set)
- profile + favorites pages
- local file-based backend (`data/store.json`)

## run

```bash
npm install
npm run dev
```

open http://localhost:3000

## env

copy `.env.example` to `.env` and set values.

google auth is optional. if `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are empty, only credentials login is shown.
