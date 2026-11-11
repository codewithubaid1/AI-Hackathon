"use client";

import { createContext, useCallback, useEffect, useState } from "react";

export const authContext = createContext(null);

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

async function getResponseData(response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return { detail: body };
  }
}

function getErrorMessage(data, fallback) {
  return data?.detail || data?.message || fallback;
}

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [status, setStatus]       = useState("loading");
  const [error, setError]         = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const userUrl = `${API_URL}/api/v1/accounts/user/`;
      let response = await fetch(userUrl, {
        credentials: "include",
        cache: "no-store",
      });

      // Access token expired — try the refresh endpoint
      if (response.status === 401 || response.status === 403) {
        try {
          const refreshResponse = await fetch(
            `${API_URL}/api/v1/accounts/refresh/`,
            {
              method: "POST",
              credentials: "include",
              headers: { "X-Auth-Transport": "cookie" },
            },
          );

          if (refreshResponse.ok) {
            // Got a new access token — retry the user fetch
            response = await fetch(userUrl, {
              credentials: "include",
              cache: "no-store",
            });
          }
          // If refresh failed (401, expired refresh token, etc.)
          // we fall through — response still holds the original 401
          // and the check below will set status to "unauthenticated"
        } catch {
          // Network error on the refresh call itself — treat as unauthenticated
          // rather than "error" so the user sees the login page, not a spinner
          setUser(null);
          setStatus("unauthenticated");
          setError("");
          return null;
        }
      }

      setError("");

      // Still 401/403 after attempted refresh — session is fully expired
      if (response.status === 401 || response.status === 403) {
        setUser(null);
        setStatus("unauthenticated");
        return null;
      }

      const data = await getResponseData(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not load your account."));
      }
      if (!data.user) {
        throw new Error("The backend did not return an account.");
      }

      setUser(data.user);
      setStatus("authenticated");
      return data.user;
    } catch (requestError) {
      // Network-level failure (backend not running, CORS, etc.)
      // Set to unauthenticated so the user gets redirected to /login
      // rather than spinning forever. The login page will show a
      // "can't reach backend" message if they try to sign in.
      setUser(null);
      setStatus("unauthenticated");
      setError(
        requestError.message ||
          "Could not reach the backend. Check that it is running and try again.",
      );
      return null;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshUser();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshUser]);

  const logout = useCallback(async () => {
    setError("");
    setIsLoggingOut(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/accounts/logout/`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Auth-Transport": "cookie" },
      });
      const data = await getResponseData(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not sign out."));
      }
      setUser(null);
      setStatus("unauthenticated");
    } catch (logoutError) {
      setError(logoutError.message || "Could not sign out. Please try again.");
      throw logoutError;
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  return (
    <authContext.Provider
      value={{
        user,
        status,
        loading: status === "loading",
        isAuthenticated: status === "authenticated" && Boolean(user),
        error,
        isLoggingOut,
        refreshUser,
        logout,
      }}
    >
      {children}
    </authContext.Provider>
  );
}
