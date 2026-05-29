import React, { createContext, useContext } from "react";
import { useGetCurrentPlayer } from "@workspace/api-client-react";

const CurrentPlayerContext = createContext<number>(1);

export function CurrentPlayerProvider({ children }: { children: React.ReactNode }) {
  const { data } = useGetCurrentPlayer({
    query: { retry: 1, retryDelay: 500, staleTime: 0 },
  });

  return (
    <CurrentPlayerContext.Provider value={data?.id ?? 1}>
      {children}
    </CurrentPlayerContext.Provider>
  );
}

export function useCurrentPlayerId(): number {
  return useContext(CurrentPlayerContext);
}
