
  # Matematická výuková aplikace s 3D objekty

  This is a code bundle for Matematická výuková aplikace s 3D objekty. The original project is available at https://www.figma.com/design/7m1mr114B2VJ8FYYGmYfkh/Matematick%C3%A1-v%C3%BDukov%C3%A1-aplikace-s-3D-objekty.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Auth gate configuration

  The app now enforces a startup login check compatible with Vividbooks cross-subdomain auth:

  - Reads `login-code` cookie (and optional `teacherId` cookie)
  - Calls `GET https://api.vividbooks.com/v1/login` with `User-Code` and optional `Teacher-Id` headers
  - Allows app access only when `User-Type` response header is authenticated
  - Redirects to the configured login URL for missing/invalid sessions

  Optional Vite environment variables:

  - `VITE_ENABLE_AUTH_GATE=true` (set `false` to disable)
  - `VITE_AUTH_CHECK_URL=https://api.vividbooks.com/v1/login`
  - `VITE_AUTH_REDIRECT_URL=https://app.vividbooks.com`

  ## Project URLs

  | Purpose | URL |
  |---------|-----|
  | **Production app** | https://rysovani.vividbooks.com/rysovani-app/ |
  | **Auth API** | https://api.vividbooks.com/v1/login |
  | **Auth redirect** | https://app.vividbooks.com |
  | **Supabase** | https://jjpiguuubvmiobmixwgh.supabase.co |
  | **Supabase storage** | https://jjpiguuubvmiobmixwgh.supabase.co/storage/v1/object/public/Admin%20math/ |
  | **KaTeX CDN** | https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css |
  | **Figma design** | https://www.figma.com/design/7m1mr114B2VJ8FYYGmYfkh/ |

  For CORS / allowed origins, add `https://rysovani.vividbooks.com` to Supabase and API allowlists.
  
