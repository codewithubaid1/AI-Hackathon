This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Google sign-in and shared auth state

Apply backend migrations with `python manage.py migrate` (from `backend`) so
refresh-token revocation is available. Start the Django backend on port `8000`,
then run `npm run dev` and open
[http://localhost:3000](http://localhost:3000). The frontend defaults to
`http://localhost:8000` for the backend; set `NEXT_PUBLIC_API_URL` to override
that URL.

The dashboard is at `/`; the Google sign-in page is at `/accounts/signup`.
`AuthProvider` in `app/layout.js` exposes the shared `authContext`. In a client
component, read the current user with:

```js
const { user, logout } = useContext(authContext);
```

Sign-in starts at `/api/v1/accounts/oauth/google/`. The backend handles the
provider callback, sets HttpOnly auth cookies, and redirects to the dashboard.
The auth provider loads the user on startup and refreshes an expired access
cookie when a valid refresh cookie is available. Sign-out clears both cookies
and blacklists the refresh token. The Google OAuth client must allow
`http://localhost:8000/api/v1/accounts/oauth/google/callback/` as its redirect
URI, and the backend `CLIENT_URL` and CORS origin must match the frontend URL.
