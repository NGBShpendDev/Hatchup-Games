import { createContext, useContext, type PropsWithChildren } from "react";
import type { HatchUpData } from "../domain/models";

const BottomNavStatusContext = createContext<HatchUpData | null>(null);

export function BottomNavStatusProvider({
  children,
  data,
}: PropsWithChildren<{ data: HatchUpData }>) {
  return (
    <BottomNavStatusContext.Provider value={data}>
      {children}
    </BottomNavStatusContext.Provider>
  );
}

export function useBottomNavStatusData() {
  return useContext(BottomNavStatusContext);
}
