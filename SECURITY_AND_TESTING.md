# Security And Testing Notes

This document summarizes the safeguards used in NERVA so they are easier to
explain during review or thesis defense. Use placeholder values only in
documentation. Never commit real `.env` files or secret values.

## Local Run

Install dependencies from the repository root:

```bash
npm install
```

Run the backend:

```bash
npm run server
```

Run the frontend:

```bash
npm run dev
```

Run the optional local ML wrapper:

```bash
npm run backend:ml
```

## Required Environment Variables

Backend-only variables:

```env
NODE_ENV=development
PORT=5001
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://nervargd.vercel.app
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
JWT_SECRET=replace-with-a-long-random-secret
DATA_ENCRYPTION_KEY=base64-encoded-32-byte-key
ML_API_URL=http://localhost:8000
```

Optional backend variables for email-based forgot password:

```env
SMTP_EMAIL=your-email@example.com
SMTP_PASSWORD=your-email-app-password
```

Frontend-only variables:

```env
VITE_API_BASE_URL=http://localhost:5001
VITE_ML_API_URL=http://localhost:8000
```

`VITE_*` values are bundled into browser JavaScript and must never contain
service role keys, JWT secrets, database credentials, or encryption keys.

## Tests

Run the current backend route and middleware smoke tests:

```bash
npm test
```

The tests use Node's built-in test runner. They intentionally skip loading real
`.env` files so test output does not depend on private Supabase or SMTP
credentials.

## Forgot Password Flow

The reset flow now uses two steps after the email request:

1. The user requests a verification code.
2. The backend stores a hashed version of the code with an expiration time.
3. The user verifies the code.
4. After successful verification, the backend returns a short-lived reset token.
5. The final password reset endpoint requires email, new password, and the reset
   token.
6. The reset token is single-use and expires quickly.

This prevents password reset by only sending an email address and new password.
The backend still remains the source of truth for validation and reset checks.

## Token And Session Handling

The current frontend stores the login token in `sessionStorage` and centralizes
access through `frontend/config.js`. This keeps usage consistent and ensures
logout clears the token, login flag, and cached user object together.

For a future production hardening step, migrate access tokens to backend-issued
`httpOnly`, `Secure`, `SameSite` cookies. That migration touches authentication
behavior more deeply, so it is documented as a future improvement instead of
being forced into the current release.

## Validation Rules

Backend validation is the final source of truth.

- Email must use a valid general email format.
- Password must be 8 to 128 characters and include uppercase, lowercase, number,
  and symbol characters.
- Curhat text must be present, sanitized, and at least 50 characters.
- DASS-21 answers must include exactly 21 numeric answers from 0 to 3.
- Reset code must be a 6-digit number.
- Reset password requires a valid short-lived reset token.

Frontend validation mirrors these rules to give faster feedback, but backend
validation always decides whether data is accepted.

## Supabase Service Key Safety

`SUPABASE_SERVICE_KEY` is backend-only. It must be configured only in backend
hosting environments such as Railway or Render. The frontend must call backend
API routes and must never import or reference the service role key directly.

Sensitive mental-health fields are encrypted before storage. Decryption should
only happen in backend-controlled APIs for the authenticated data owner.

## Files That Must Not Be Committed

The repository `.gitignore` excludes local and generated files, including:

- `.env`, `.env.local`, and other `.env.*` files
- `node_modules/`
- `dist/`, `build/`, and generated frontend output
- `.venv/`, `.python/`, cache folders, and temporary files
- `.vercel/`
- log files and local diagnostics

Keep `.env.example` files committed because they contain placeholders only.
