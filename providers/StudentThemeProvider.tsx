import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import type { AnimatedTabTheme } from "@/components/AnimatedTabBar";
import { useAuth } from "@/providers/AuthProvider";

export type StudentThemeMode = "light" | "dark";

export type StudentThemePalette = {
  mode: StudentThemeMode;
  isDark: boolean;
  name: string;
  background: string;
  backgroundAlt: string;
  shell: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  surfaceStrong: string;
  border: string;
  borderSoft: string;
  text: string;
  textMuted: string;
  textSoft: string;
  heading: string;
  accent: string;
  accentSoft: string;
  accentContrast: string;
  success: string;
  danger: string;
  warning: string;
  glowTop: string;
  glowMiddle: string;
  glowBottom: string;
  tabTheme: AnimatedTabTheme;
};

const studentThemes: Record<StudentThemeMode, StudentThemePalette> = {
  light: {
    mode: "light",
    isDark: false,
    name: "Pearl Light",
    background: "#f4f2fb",
    backgroundAlt: "#f3f4f7",
    shell: "#f7f5fd",
    surface: "#ffffff",
    surfaceAlt: "#f7f8fe",
    surfaceMuted: "#eef1fb",
    surfaceStrong: "#dceeff",
    border: "#e8edf7",
    borderSoft: "#eef1fb",
    text: "#0e2756",
    textMuted: "#6e7892",
    textSoft: "#8a94af",
    heading: "#13285f",
    accent: "#5e73dd",
    accentSoft: "#eef1ff",
    accentContrast: "#ffffff",
    success: "#8cc7a1",
    danger: "#b0003a",
    warning: "#f4bf56",
    glowTop: "rgba(169, 190, 255, 0.18)",
    glowMiddle: "rgba(206, 196, 255, 0.14)",
    glowBottom: "rgba(255, 214, 196, 0.14)",
    tabTheme: {
      activeColor: "#0e2756",
      inactiveColor: "#6e7892",
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#e8edf7",
      indicatorColor: "rgba(14,39,86,0.14)",
      glowColor: "#0e2756",
      sceneBackgroundColor: "#f3f4f7",
      blurTint: "light",
    },
  },
  dark: {
    mode: "dark",
    isDark: true,
    name: "Midnight Glow",
    background: "#070c16",
    backgroundAlt: "#0b1220",
    shell: "#101827",
    surface: "#121d2f",
    surfaceAlt: "#17243a",
    surfaceMuted: "#1e2f4b",
    surfaceStrong: "#263f68",
    border: "#2a3d5c",
    borderSoft: "#1d2c45",
    text: "#f5f8ff",
    textMuted: "#c5cee2",
    textSoft: "#92a4c2",
    heading: "#ffffff",
    accent: "#7c93ff",
    accentSoft: "#24375f",
    accentContrast: "#ffffff",
    success: "#74d69b",
    danger: "#ff8fad",
    warning: "#ffd078",
    glowTop: "rgba(124, 147, 255, 0.24)",
    glowMiddle: "rgba(55, 210, 199, 0.14)",
    glowBottom: "rgba(255, 105, 150, 0.12)",
    tabTheme: {
      activeColor: "#ffffff",
      inactiveColor: "#96a6c3",
      backgroundColor: "rgba(9,15,27,0.96)",
      borderColor: "#2a3d5c",
      indicatorColor: "rgba(124,147,255,0.24)",
      glowColor: "#7c93ff",
      sceneBackgroundColor: "#070c16",
      blurTint: "dark",
    },
  },
};

type StudentThemeContextValue = {
  mode: StudentThemeMode;
  theme: StudentThemePalette;
  ready: boolean;
  setMode: (mode: StudentThemeMode) => Promise<void>;
  toggleMode: () => Promise<void>;
};

const StudentThemeContext = React.createContext<StudentThemeContextValue | null>(null);

function storageKey(userId?: string | null) {
  return `student_theme_mode:${userId || "guest"}`;
}

export function StudentThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = React.useState<StudentThemeMode>("light");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setReady(false);

    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey(user?.id));
        const nextMode: StudentThemeMode = raw === "dark" ? "dark" : "light";
        if (active) setModeState(nextMode);
      } finally {
        if (active) setReady(true);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const setMode = React.useCallback(
    async (nextMode: StudentThemeMode) => {
      setModeState(nextMode);
      await AsyncStorage.setItem(storageKey(user?.id), nextMode);
    },
    [user?.id],
  );

  const toggleMode = React.useCallback(async () => {
    const nextMode: StudentThemeMode = mode === "dark" ? "light" : "dark";
    await setMode(nextMode);
  }, [mode, setMode]);

  const value = React.useMemo<StudentThemeContextValue>(
    () => ({
      mode,
      ready,
      theme: studentThemes[mode],
      setMode,
      toggleMode,
    }),
    [mode, ready, setMode, toggleMode],
  );

  return <StudentThemeContext.Provider value={value}>{children}</StudentThemeContext.Provider>;
}

export function useStudentTheme() {
  const value = React.useContext(StudentThemeContext);
  if (!value) throw new Error("useStudentTheme must be used within StudentThemeProvider");
  return value;
}
