import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  PalDetail: {
    palId: string;
  };
};

export type OnboardingStackParamList = {
  Welcome: undefined;
  MonsterSetup: undefined;
  ConnectHealth: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Hatchery: undefined;
  Collection: undefined;
  Ranks: undefined;
  Profile: undefined;
};
