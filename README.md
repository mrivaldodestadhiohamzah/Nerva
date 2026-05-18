# HIMO / Hidden Mood

Web-based mental health self-assessment application using DASS-21, Indonesian curhat analysis, dynamic weighted fusion, dashboard visualization, history tracking, and privacy-focused encrypted storage.

## Project Structure

```text
frontend/  Vite frontend, HTML views, presenters, assets, and client config
backend/   Express API, Supabase access, routes, middleware, ML/fusion utilities
```

## Local Development

Install dependencies from the repository root:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Run the backend:

```bash
npm run server
```

The frontend uses `VITE_API_BASE_URL` from `frontend/.env` when present. For local development, copy `frontend/.env.example` to `frontend/.env` and set:

```env
VITE_API_BASE_URL=http://localhost:5001
```

The backend uses environment variables from the repository root `.env` or `backend/.env`. Copy `backend/.env.example` to `backend/.env` and fill in real secrets locally only.

## Deployment

- Frontend: deploy the `frontend/` folder to Netlify or Vercel.
- Backend: deploy the `backend/` folder to Render or Railway.
- Configure backend `ALLOWED_ORIGINS` to include the deployed frontend URL.
- Configure frontend `VITE_API_BASE_URL` to point to the deployed backend URL.
