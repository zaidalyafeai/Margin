"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];

function applyTheme(preference: ThemePreference, systemDark: boolean) {
  document.documentElement.dataset.theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("margin:theme");
    const initial = THEME_ORDER.includes(stored as ThemePreference) ? stored as ThemePreference : "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(initial, media.matches);
    const mountTimer = window.setTimeout(() => {
      setPreference(initial);
      setMounted(true);
    }, 0);

    const handleSystemChange = (event: MediaQueryListEvent) => {
      if ((localStorage.getItem("margin:theme") || "system") === "system") applyTheme("system", event.matches);
    };
    media.addEventListener("change", handleSystemChange);
    return () => {
      window.clearTimeout(mountTimer);
      media.removeEventListener("change", handleSystemChange);
    };
  }, []);

  function cycleTheme() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length];
    localStorage.setItem("margin:theme", next);
    setPreference(next);
    applyTheme(next, window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={mounted ? `Theme: ${preference}. Change theme` : "Change theme"}
      title={mounted ? `Theme: ${preference}` : "Theme"}
      onClick={cycleTheme}
    >
      <Icon size={14} />
      <span>{mounted ? preference : "Theme"}</span>
    </button>
  );
}
