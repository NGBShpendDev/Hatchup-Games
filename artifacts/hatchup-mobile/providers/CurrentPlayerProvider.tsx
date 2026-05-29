import React, { createContext, useContext } from "react";
import { ActivityIndicator, View } from "react-native";
import { useGetCurrentPlayer } from "@workspace/api-client-react";

const CurrentPlayerContext = createContext<number>(0);

export function CurrentPlayerProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useGetCurrentPlayer();

  if (isLoading || !data?.id) {
    return (
      <View
        style={{ flex: 1, backgroundColor: "#080912", justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator color="#ee2b8c" size="large" />
      </View>
    );
  }

  return (
    <CurrentPlayerContext.Provider value={data.id}>
      {children}
    </CurrentPlayerContext.Provider>
  );
}

export function useCurrentPlayerId(): number {
  return useContext(CurrentPlayerContext);
}
