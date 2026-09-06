import React from 'react';
import { FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchRegionDetail } from '../../api/dashboardApi';
import { LoadingState, ErrorState, EmptyState } from '../../components/StatusStates';
import { PipelineTrack } from '../../components/PipelineTrack';
import { RegionDetailBranch } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'RegionDetail'>;

// Mirrors BranchDetailScreen structurally (same PipelineTrack rendering
// component), but lists branches (tap -> BranchDetail) instead of leads
// directly, driven by a real backend aggregation endpoint rather than a
// client-side reduce — region volumes don't scale to a full-lead fetch
// (Full-Hierarchy Expansion plan, Phase 3/4).
export function RegionDetailScreen({ route, navigation }: Props) {
  const { regionId } = route.params;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['region-detail', regionId],
    queryFn: () => fetchRegionDetail(regionId),
  });

  if (isLoading) {
    return <LoadingState label="Loading region details..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load region.'}
        onRetry={() => refetch()}
      />
    );
  }

  const region = data!;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.container}>
        <FlatList
          data={region.branches}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <View style={styles.heroCard}>
                <Text style={styles.heroEyebrow}>REGION</Text>
                <Text style={styles.heroTitle}>{region.region.name}</Text>

                <View style={styles.heroStatsRow}>
                  <Text style={styles.heroStatValue}>{region.totalLeads}</Text>
                  <Text style={styles.heroStatLabel}>total leads</Text>
                </View>
              </View>

              <View style={styles.pipelineCard}>
                <Text style={styles.sectionTitle}>Lead pipeline</Text>
                <PipelineTrack leadsByStage={region.leadsByStage} />
              </View>

              <Text style={styles.branchesHeader}>Branches</Text>
            </View>
          }
          renderItem={({ item }) => (
            <BranchRow branch={item} onPress={() => navigation.navigate('BranchDetail', { branchId: item.id })} />
          )}
          ListEmptyComponent={<EmptyState message="No branches in this region." />}
        />
      </View>
    </SafeAreaView>
  );
}

function BranchRow({ branch, onPress }: { branch: RegionDetailBranch; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.branchCard} onPress={onPress} testID={`branch-row-${branch.id}`}>
      <View style={styles.branchHeader}>
        <View style={styles.branchIdentity}>
          <Text style={styles.branchName} numberOfLines={1}>
            {branch.name}
          </Text>
          <Text style={styles.branchBm}>{branch.bm ? 'Branch Head assigned' : 'No BM assigned'}</Text>
        </View>

        <Text style={styles.branchOpenArrow}>›</Text>
      </View>

      <View style={styles.branchStats}>
        <Text style={styles.branchStatValue}>{branch.totalLeads}</Text>
        <Text style={styles.branchStatLabel}>{branch.totalLeads === 1 ? 'lead' : 'leads'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8FC' },
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  listContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28 },
  heroCard: { backgroundColor: '#0B5CAB', borderRadius: 20, padding: 18, marginBottom: 16 },
  heroEyebrow: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 4 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12 },
  heroStatValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginRight: 6 },
  heroStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  pipelineCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8E3ED',
    borderRadius: 16,
    padding: 14,
    marginBottom: 22,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#182533', marginBottom: 12 },
  branchesHeader: { fontSize: 17, fontWeight: '800', color: '#182533', marginBottom: 10 },
  branchCard: { backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E0E7EE', padding: 13, marginBottom: 10 },
  branchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  branchIdentity: { flex: 1, marginRight: 8 },
  branchName: { color: '#1D2A37', fontSize: 14, fontWeight: '800' },
  branchBm: { color: '#7B8793', fontSize: 10, marginTop: 3 },
  branchOpenArrow: { color: '#0B5CAB', fontSize: 20, fontWeight: '300' },
  branchStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  branchStatValue: { color: '#182533', fontSize: 15, fontWeight: '800', marginRight: 5 },
  branchStatLabel: { color: '#8A96A2', fontSize: 10, fontWeight: '600' },
});
