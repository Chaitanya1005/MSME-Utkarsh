import React from 'react';
import { FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchZoneDetail } from '../../api/dashboardApi';
import { LoadingState, ErrorState, EmptyState } from '../../components/StatusStates';
import { PipelineTrack } from '../../components/PipelineTrack';
import { ZoneDetailRegion } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ZoneDetail'>;

// Same pattern as RegionDetailScreen, one level up: lists regions
// (tap -> RegionDetail), driven by GET /api/zones/:zoneId/detail (Full-
// Hierarchy Expansion plan, Phase 3/4).
export function ZoneDetailScreen({ route, navigation }: Props) {
  const { zoneId } = route.params;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['zone-detail', zoneId],
    queryFn: () => fetchZoneDetail(zoneId),
  });

  if (isLoading) {
    return <LoadingState label="Loading zone details..." />;
  }

  if (isError) {
    return (
      <ErrorState message={error instanceof Error ? error.message : 'Failed to load zone.'} onRetry={() => refetch()} />
    );
  }

  const zone = data!;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.container}>
        <FlatList
          data={zone.regions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <View style={styles.heroCard}>
                <Text style={styles.heroEyebrow}>ZONE</Text>
                <Text style={styles.heroTitle}>{zone.zone.name}</Text>

                <View style={styles.heroStatsRow}>
                  <Text style={styles.heroStatValue}>{zone.totalLeads}</Text>
                  <Text style={styles.heroStatLabel}>total leads</Text>
                </View>
              </View>

              <View style={styles.pipelineCard}>
                <Text style={styles.sectionTitle}>Lead pipeline</Text>
                <PipelineTrack leadsByStage={zone.leadsByStage} />
              </View>

              <Text style={styles.regionsHeader}>Regions</Text>
            </View>
          }
          renderItem={({ item }) => (
            <RegionRow region={item} onPress={() => navigation.navigate('RegionDetail', { regionId: item.id })} />
          )}
          ListEmptyComponent={<EmptyState message="No regions in this zone." />}
        />
      </View>
    </SafeAreaView>
  );
}

function RegionRow({ region, onPress }: { region: ZoneDetailRegion; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.regionCard} onPress={onPress} testID={`region-row-${region.id}`}>
      <View style={styles.regionHeader}>
        <View style={styles.regionIdentity}>
          <Text style={styles.regionName} numberOfLines={1}>
            {region.name}
          </Text>
          <Text style={styles.regionMeta}>
            {region.branchCount} branch{region.branchCount === 1 ? '' : 'es'}
          </Text>
        </View>

        <Text style={styles.regionOpenArrow}>›</Text>
      </View>

      <View style={styles.regionStats}>
        <Text style={styles.regionStatValue}>{region.totalLeads}</Text>
        <Text style={styles.regionStatLabel}>{region.totalLeads === 1 ? 'lead' : 'leads'}</Text>
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
  regionsHeader: { fontSize: 17, fontWeight: '800', color: '#182533', marginBottom: 10 },
  regionCard: { backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E0E7EE', padding: 13, marginBottom: 10 },
  regionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  regionIdentity: { flex: 1, marginRight: 8 },
  regionName: { color: '#1D2A37', fontSize: 14, fontWeight: '800' },
  regionMeta: { color: '#7B8793', fontSize: 10, marginTop: 3 },
  regionOpenArrow: { color: '#0B5CAB', fontSize: 20, fontWeight: '300' },
  regionStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  regionStatValue: { color: '#182533', fontSize: 15, fontWeight: '800', marginRight: 5 },
  regionStatLabel: { color: '#8A96A2', fontSize: 10, fontWeight: '600' },
});
