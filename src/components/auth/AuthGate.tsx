import { Loader } from "@mantine/core";
import { PropsWithChildren, useEffect, useState } from "react";

type AuthStatus = "checking" | "allowed" | "blocked";

const AUTH_CHECK_URL =
  import.meta.env.VITE_AUTH_CHECK_URL?.trim() ||
  "https://api.vividbooks.com/v1/login";
const AUTH_REDIRECT_URL =
  import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() ||
  "https://app.vividbooks.com";
const ENABLE_AUTH_GATE =
  !import.meta.env.DEV &&
  import.meta.env.VITE_ENABLE_AUTH_GATE !== "false";

function readCookie(name: string): string | null {
  const entries = document.cookie.split(";").map((part) => part.trim());
  const prefix = `${name}=`;
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    const rawValue = entry.slice(prefix.length);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

function getParentDomain(hostname: string): string | null {
  const isLocalhost = hostname === "localhost" || hostname.endsWith(".localhost");
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  if (isLocalhost || isIpAddress) {
    return null;
  }
  const parts = hostname.split(".");
  if (parts.length < 2) {
    return null;
  }
  return `.${parts.slice(-2).join(".")}`;
}

function expireCookie(name: string, domain?: string): void {
  const domainAttr = domain ? `; Domain=${domain}` : "";
  document.cookie = `${name}=; Path=/${domainAttr}; Max-Age=0`;
}

function clearAuthCookies(): void {
  expireCookie("login-code");
  expireCookie("teacherId");
  const parentDomain = getParentDomain(window.location.hostname);
  if (parentDomain) {
    expireCookie("login-code", parentDomain);
    expireCookie("teacherId", parentDomain);
  }
}

function isAuthenticatedUserType(userType: string | null): boolean {
  if (!userType) {
    return false;
  }
  return !userType.toLowerCase().includes("unauth");
}

export function AuthGate({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("checking");

  useEffect(() => {
    if (!ENABLE_AUTH_GATE) {
      setStatus("allowed");
      return;
    }

    let active = true;

    const runCheck = async () => {
      const loginCode = readCookie("login-code");
      if (!loginCode) {
        if (active) {
          setStatus("blocked");
        }
        return;
      }

      const headers: Record<string, string> = {
        "User-Code": encodeURIComponent(loginCode),
      };
      const teacherId = readCookie("teacherId");
      if (teacherId) {
        headers["Teacher-Id"] = teacherId;
      }

      try {
        const response = await fetch(AUTH_CHECK_URL, {
          method: "GET",
          headers,
          cache: "no-store",
        });

        if (response.status === 401 || response.status === 403) {
          clearAuthCookies();
          if (active) {
            setStatus("blocked");
          }
          return;
        }

        if (!response.ok) {
          if (active) {
            setStatus("blocked");
          }
          return;
        }

        const userType = response.headers.get("User-Type");
        if (!isAuthenticatedUserType(userType)) {
          clearAuthCookies();
          if (active) {
            setStatus("blocked");
          }
          return;
        }

        if (active) {
          setStatus("allowed");
        }
      } catch {
        if (active) {
          setStatus("blocked");
        }
        return;
      }
    };

    runCheck();

    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Loader size="lg" />
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#ffffff",
          fontFamily: "'Fenomen Sans', sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "540px",
            borderRadius: "32px",
            overflow: "hidden",
            border: "2px solid #e5e7eb",
            background: "white",
            boxShadow: "0 1px 4px 0 rgba(0,0,0,0.06)",
            WebkitMaskImage: "-webkit-radial-gradient(white, black)",
          }}
        >
          <div
            style={{
              height: "160px",
              backgroundColor: "#dcf3ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4d49f3",
              fontSize: "44px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            !
          </div>

          <div style={{ padding: "28px 32px 32px" }}>
            <h2
              style={{
                color: "#09056f",
                fontSize: "30px",
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              Pro zobrazeni teto stranky se nejprve prihlaste
            </h2>
            <p
              style={{
                color: "#4e5871",
                opacity: 0.8,
                fontSize: "16px",
                lineHeight: "24px",
                fontWeight: 400,
                marginBottom: "22px",
                textAlign: "center",
              }}
            >
              Nemate platne prihlaseni pro tuto aplikaci.
            </p>
            <a
              href={AUTH_REDIRECT_URL}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                height: "48px",
                borderRadius: "14px",
                background: "#4d49f3",
                color: "white",
                fontSize: "16px",
                fontWeight: 500,
                textDecoration: "none",
                boxShadow: "0px 10px 15px 0px #e0e7ff, 0px 4px 6px 0px #e0e7ff",
              }}
            >
              Prihlasit se v app.vividbooks.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
