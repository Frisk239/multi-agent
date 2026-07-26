"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Density = "compact" | "default" | "comfortable";

interface DensityContextType {
  density: Density;
  setDensity: (density: Density) => void;
}

const DensityContext = createContext<DensityContextType | undefined>(undefined);

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("ma-ui-density") as Density | null;
    if (stored && ["compact", "default", "comfortable"].includes(stored)) {
      setDensityState(stored);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const root = document.documentElement;
    root.classList.remove("density-compact", "density-default", "density-comfortable");
    root.classList.add(`density-${density}`);
    localStorage.setItem("ma-ui-density", density);
  }, [density, mounted]);

  const setDensity = (newDensity: Density) => {
    setDensityState(newDensity);
  };

  if (!mounted) {
    // Avoid hydration mismatch by rendering without context if needed or just rendering children
    // In many cases, it's safe to just render. We apply default class initially.
    return (
      <DensityContext.Provider value={{ density: "default", setDensity }}>
        {children}
      </DensityContext.Provider>
    );
  }

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity() {
  const context = useContext(DensityContext);
  if (context === undefined) {
    throw new Error("useDensity must be used within a DensityProvider");
  }
  return context;
}
