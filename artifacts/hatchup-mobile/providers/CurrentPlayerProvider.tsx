import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useGetCurrentPlayer } from "@workspace/api-client-react";

const CurrentPlayerContext = createContext<number>(1);

export function CurrentPlayerProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useGetCurrentPlayer({
    query: { retry: 1, retryDelay: 500, staleTime: 30 * 1000 },
  });

  // Safety net: never block the app for more than 3 seconds regardless of
  // what the query does (disabled, network failure, slow connection, etc.)
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // isLoading = isPending && isFetching — only true while a request is
  // actively in-flight. Falls to false immediately on success OR failure.
  const waiting = isLoading && !timedOut;

  if (waiting) {
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
