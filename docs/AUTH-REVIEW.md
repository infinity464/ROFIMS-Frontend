# Login & Refresh Token – Review Summary

## Issues Fixed

1. **Refresh endpoint** – Frontend was calling `GetToken` with `{ refreshToken }` instead of `Identity/GetRefreshToken`. Now uses the correct refresh URL.
2. **Status codes** – Backend now returns **401 Unauthorized** for invalid login and failed refresh instead of 200 with empty token.
3. **Error messages** – Login errors are mapped to safe, user-facing messages (invalid credentials, server error, network error). Passwords are never exposed.
4. **Login UI** – Sign In button is disabled and shows a loading spinner while the request is in progress. Duplicate submits are prevented.
5. **Interceptor** – No longer attaches the Bearer token to `GetToken` or `GetRefreshToken` requests.

## Security Recommendations (Optional)

- **Refresh token storage** – Prefer HttpOnly, Secure, SameSite cookies for the refresh token (requires backend to set cookies and frontend to use `withCredentials`). Until then, localStorage is acceptable with HTTPS and short-lived access tokens.
- **Refresh token rotation** – Backend already issues a new refresh token on each refresh; frontend stores it. Consider invalidating the previous refresh token on the server after use to reduce replay risk.
- **Logout** – `logout()` currently clears all localStorage. Consider clearing only `auth`, `token`, and `refreshToken` if other app data is stored there.
- **Backend logging** – Avoid logging request bodies or exception messages that could contain credentials; use generic messages for auth failures.

## Files Touched

- `Components/Features/Authentication/Service/authentication.ts` – Refresh URL, error mapping, merge auth on refresh.
- `Components/Features/Authentication/Login/login.ts` – Loading state, error handling with status-based messages.
- `Components/Features/Authentication/Login/login.html` – Button `[loading]` and `[disabled]`.
- `Core/Interceptor/auth.inspector.ts` – Skip Authorization header for auth endpoints.
- Backend: `IdentityController.cs` – 401 for invalid GetToken and GetRefreshToken.
