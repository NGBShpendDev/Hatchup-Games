import React, { createContext, useContext } from "react";
import { ActivityIndicator, View } from "react-native";
import { useGetCurrentPlayer } from "@workspace/api-client-react";

const CurrentPlayerContext = createContext<number>(1);

export function CurrentPlayerProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useGetCurrentPlayer({
    query: { retry: 2, retryDelay: 1000, staleTime: 30 * 1000 },
  });

  if (isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: "#080912", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#ee2b8c" size="large" />
      </View>
    );
  }

  return (
    <CurrentPlayerContext.Provider value={data?.id ?? 1}>
      {children}
    </CurrentPlayerContext.Provider>
  );
}

export function useCurrentPlayerId(): number {
  return useContext(CurrentPlayerContext);
}
