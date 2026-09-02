import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { fetchMyScope } from '../../api/orgApi';
import { LoadingState, EmptyState, ErrorState } from '../../components/StatusStates';
import { RmScope } from '../../types/api';

// This is the Phase 1 foundation screen for the RM role (spec section 37).
// It is deliberately minimal: its only job is to prove that
// mobile -> API -> DB -> mobile works end-to-end for an authenticated,
// role- and scope-aware RM. The real RM dashboard is Phase 2 work.
export function RMHomeScreen() {
  const { user, logout } = useAuth();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['org', 'scope'],
    queryFn: fetchMyScope,
  });

  if (isLoading) {
    return <LoadingState label="Loading your region..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load your region.'}
        onRetry={() => refetch()}
      />
    );
  }

  const scope = data as RmScope;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome, {user?.name}</Text>
          <Text style={styles.roleBadge}>Regional Manager</Text>
        </View>
        <TouchableOpacity onPress={() => logout()} testID="logout-button">
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.regionCard}>
        <Text style={styles.regionLabel}>Authorized Region</Text>
        <Text style={styles.regionName}>{scope.region.name}</Text>
        <Text style={styles.regionZone}>{scope.region.zone}</Text>
      </View>

      <Text style={styles.sectionTitle}>Branches in your region</Text>

      {scope.branches.length === 0 ? (
        <EmptyState message="No branches available." />
      ) : (
        <FlatList
          data={scope.branches}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
          renderItem={({ item }) => (
            <View style={styles.branchRow}>
              <Text style={styles.branchName}>{item.name}</Text>
              <Text style={styles.branchBm}>
                {item.bm ? `BM: ${item.bm.name}` : 'No BM assigned'}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9', padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#111111' },
  roleBadge: { fontSize: 13, color: '#0B3D91', marginTop: 2, fontWeight: '600' },
  logoutText: { color: '#B00020', fontSize: 14 },
  regionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  regionLabel: { fontSize: 12, color: '#888888', textTransform: 'uppercase' },
  regionName: { fontSize: 20, fontWeight: '700', color: '#0B3D91', marginTop: 4 },
  regionZone: { fontSize: 13, color: '#666666', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#333333' },
  branchRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  branchName: { fontSize: 15, fontWeight: '600', color: '#111111' },
  branchBm: { fontSize: 13, color: '#666666', marginTop: 2 },
});
