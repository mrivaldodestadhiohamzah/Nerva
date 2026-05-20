# NERVA

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

Create local frontend config:

```env
# frontend/.env.local
VITE_API_BASE_URL=http://localhost:5001
VITE_ML_API_URL=http://localhost:8000
```

Create local backend config:

```env
# backend/.env.local
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://nervargd.vercel.app
ML_API_URL=http://localhost:8000
```

Keep backend secrets such as `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, and
`DATA_ENCRYPTION_KEY` in `backend/.env`. Do not put backend secrets in
frontend env files because `VITE_*` values are visible in the browser.

Run the backend API on `http://localhost:5001`:

```bash
npm run server
```

Run the local ML API on `http://localhost:8000`:

```bash
npm run backend:ml
```

The local ML API exposes `POST /predict/analyze` and uses the model files in
`backend/ml/`. If Python or TensorFlow is not available globally, configure
`PYTHON_PATH` and `PYTHON_PACKAGE_PATH` in `backend/.env.local`.

Run the frontend on `http://localhost:5173`:

```bash
npm run dev
```

For production later, only change environment values:

```env
# frontend/.env or hosting env
VITE_API_BASE_URL=https://NEW-BACKEND-HOSTING-URL
VITE_ML_API_URL=https://NEW-ML-HOSTING-URL

# backend/.env or hosting env
ML_API_URL=https://NEW-ML-HOSTING-URL
FRONTEND_URL=https://nervargd.vercel.app
```

## Deployment

- Frontend: deploy the `frontend/` folder to Netlify or Vercel.
- Backend: deploy the `backend/` folder to Render or Railway.
- Configure backend `ALLOWED_ORIGINS` to include the deployed frontend URL.
- Configure frontend `VITE_API_BASE_URL` to point to the deployed backend URL.
