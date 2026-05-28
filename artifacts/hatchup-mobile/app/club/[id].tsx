import { Feather } from "@expo/vector-icons";
import {
  useGetClub,
  useListClubMembers,
  useJoinClub,
  useLeaveClub,
  useGetCurrentPlayer,
  getGetClubQueryKey,
  getListClubMembersQueryKey,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";

function buildShareUrl(clubId: number): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return "";
  return `https://${domain}/club/${clubId}`;
}

export default function ClubDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clubId = Number(id);
  const queryClient = useQueryClient();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: currentPlayer } = useGetCurrentPlayer();
  const { data: club, isLoading } = useGetClub(clubId);
  const { data: members } = useListClubMembers(clubId);

  const isMember =
    currentPlayer !== undefined &&
    members !== undefined &&
    members.some((m) => m.id === currentPlayer.id);

  const [membershipLoading, setMembershipLoading] = useState(false);

  const joinMutation = useJoinClub();
  const leaveMutation = useLeaveClub();

  async function handleJoin() {
    if (!currentPlayer) return;
    setMembershipLoading(true);
    try {
      await joinMutation.mutateAsync({ id: clubId, data: { playerId: currentPlayer.id } });
      await queryClient.invalidateQueries({ queryKey: getGetClubQueryKey(clubId) });
      await queryClient.invalidateQueries({ queryKey: getListClubMembersQueryKey(clubId) });
    } catch {
      Alert.alert("Could not join club", "Please try again.");
    } finally {
      setMembershipLoading(false);
    }
  }

  async function handleLeave() {
    Alert.alert(
      "Leave Club",
      "Are you sure you want to leave this club?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setMembershipLoading(true);
            try {
              await leaveMutation.mutateAsync({ id: clubId });
              await queryClient.invalidateQueries({ queryKey: getGetClubQueryKey(clubId) });
              await queryClient.invalidateQueries({ queryKey: getListClubMembersQueryKey(clubId) });
            } catch {
              Alert.alert("Could not leave club", "Please try again.");
            } finally {
              setMembershipLoading(false);
            }
          },
        },
      ],
    );
  }

  async function handleShare() {
    if (!club) return;
    const url = buildShareUrl(clubId);
    if (!url) return;
    await Share.share({
      message: `Join the ${club.name} club on HatchUp! ${url}`,
      url,
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {club?.name ?? "Club"}
        </Text>
        {club ? (
          <Pressable onPress={handleShare} style={styles.shareBtn} testID="button-share-club">
            <Feather name="share-2" size={20} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 34 }} />
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : !club ? (
        <View style={styles.empty}>
          <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Club not found</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero card */}
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.clubAvatar, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.clubInitial, { color: colors.primary }]}>
                {club.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.clubName, { color: colors.foreground }]}>{club.name}</Text>
            {club.badge && (
              <Text style={[styles.clubBadge, { color: colors.primary }]}>{club.badge}</Text>
            )}
            {club.description ? (
              <Text style={[styles.clubDesc, { color: colors.mutedForeground }]}>{club.description}</Text>
            ) : null}

            {/* Stats row */}
            <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
              {[
                { label: "Members", value: `${club.memberCount ?? 0}${club.maxMembers ? `/${club.maxMembers}` : ""}` },
                { label: "Rank", value: club.rank ?? "—" },
                { label: "Total XP", value: (club.totalXp ?? 0).toLocaleString() },
              ].map((s, i) => (
                <React.Fragment key={s.label}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <View style={styles.statCol}>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>

            {/* Action buttons row */}
            <View style={styles.actionRow}>
              {/* Share button */}
              <Pressable
                onPress={handleShare}
                style={[styles.outlineButton, { borderColor: colors.primary }]}
                testID="button-share-club-inline"
              >
                <Feather name="share-2" size={15} color={colors.primary} />
                <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Share</Text>
              </Pressable>

              {/* Join / Leave button — hidden while current player is loading */}
              {currentPlayer === undefined ? null : membershipLoading ? (
                <View style={[styles.membershipButton, { backgroundColor: colors.primary + "88" }]}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : isMember ? (
                <Pressable
                  onPress={handleLeave}
                  style={[styles.membershipButton, { backgroundColor: colors.destructive }]}
                  testID="button-leave-club"
                >
                  <Feather name="log-out" size={15} color="#fff" />
                  <Text style={styles.membershipButtonText}>Leave Club</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleJoin}
                  style={[styles.membershipButton, { backgroundColor: colors.primary }]}
                  testID="button-join-club"
                >
                  <Feather name="user-plus" size={15} color="#fff" />
                  <Text style={styles.membershipButtonText}>Join Club</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Members section */}
          {members && members.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Members</Text>
              {members.map((m, i) => (
                <View
                  key={m.id}
                  style={[
                    styles.memberRow,
                    i < members.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "22" }]}>
                    <Feather name="user" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>{m.username}</Text>
                    {m.displayName && (
                      <Text style={[styles.memberMeta, { color: colors.mutedForeground }]}>{m.displayName}</Text>
                    )}
                  </View>
                  {m.clubRole && (
                    <Text style={[styles.roleTag, { color: colors.mutedForeground }]}>{m.clubRole}</Text>
                  )}
                  <Text style={[styles.memberLevel, { color: colors.mutedForeground }]}>Lv {m.level}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", marginHorizontal: 8 },
  shareBtn: { padding: 6 },
  heroCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", marginBottom: 16 },
  clubAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  clubInitial: { fontSize: 28, fontWeight: "800" },
  clubName: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  clubBadge: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  clubDesc: { fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 18 },
  statsRow: { flexDirection: "row", width: "100%", marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  statCol: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 10 },
  divider: { width: 1, height: 28 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 16, width: "100%" },
  outlineButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
  outlineButtonText: { fontSize: 13, fontWeight: "700" },
  membershipButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  membershipButtonText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  section: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "700", padding: 14, paddingBottom: 10 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  memberAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  memberName: { fontSize: 13, fontWeight: "600" },
  memberMeta: { fontSize: 11, marginTop: 1 },
  roleTag: { fontSize: 10, fontWeight: "600", textTransform: "capitalize", marginRight: 4 },
  memberLevel: { fontSize: 11 },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 14 },
});
