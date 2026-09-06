import React, { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { fetchZmDashboard } from '../../api/dashboardApi';
import { fetchFollowUpCandidates } from '../../api/followUpApi';
import { SimpleDrawer } from '../../components/SimpleDrawer';
import { LoadingState, ErrorState, EmptyState } from '../../components/StatusStates';
import { ZmDashboardRegion } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ZMDashboard'>;

// Mirrors RMDashboardScreen one level up: regions in the ZM's zone, each
// with a headline lead count, region multi-select feeding FollowUp (Full-
// Hierarchy Expansion plan, Phase 4).
export function ZMDashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard', 'zm', user?.id],
    queryFn: fetchZmDashboard,
    enabled: !!user,
  });

  // Resolves a selected region to the RM assigned to it, so "Follow up"
  // can navigate straight to FollowUpScreen with recipientUserIds already
  // known — same shortcut RMDashboardScreen already gives RM for branches.
  const candidatesQuery = useQuery({
    queryKey: ['follow-up-candidates', user?.id],
    queryFn: fetchFollowUpCandidates,
    enabled: !!user,
  });

  function toggleRegion(regionId: string) {
    setSelectedRegionIds((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedRegionIds(new Set());
  }

  function goToFollowUp() {
    const candidateRegions = candidatesQuery.data?.regions ?? [];
    const recipients = candidateRegions
      .filter((c) => selectedRegionIds.has(c.id) && c.recipientUserId)
      .map((c) => ({ id: c.recipientUserId as string, name: c.recipientName ?? c.name }));
    if (recipients.length === 0) return;
    navigation.navigate('FollowUp', { recipients });
  }

  function openRegionDetail(regionId: string) {
    navigation.navigate('RegionDetail', { regionId });
  }

  if (isLoading) {
    return <LoadingState label="Loading your zone..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load your dashboard.'}
        onRetry={() => refetch()}
      />
    );
  }

  const selectedCount = selectedRegionIds.size;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.container}>
        <FlatList
          data={data!.regions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor="#0B5CAB" />}
          contentContainerStyle={[styles.listContent, selectedCount > 0 && styles.listContentWithBottomAction]}
          ListHeaderComponent={
            <View>
              <View style={styles.topHeader}>
                <View style={styles.brandContainer}>
                  <Text style={styles.brandName}>MSME - Utkarsh</Text>
                  <Text style={styles.brandSubtitle}>Zonal Overview</Text>
                </View>

                <TouchableOpacity activeOpacity={0.8} style={styles.menuButton} onPress={() => setDrawerVisible(true)}>
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                </TouchableOpacity>
              </View>

              <View style={styles.heroCard}>
                <Text style={styles.greeting}>Good to see you,</Text>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.name || 'Zonal Manager'}
                </Text>

                <View style={styles.heroDivider} />

                <Text style={styles.regionLabel}>YOUR ZONE</Text>
                <Text style={styles.regionName}>{data!.zone.name}</Text>
              </View>

              <View style={styles.metricsGrid}>
                <MetricCard value={data!.summary.totalRegions} label="Regions" />
                <MetricCard value={data!.summary.totalBranches} label="Branches" />
                <MetricCard value={data!.summary.totalLeads} label="Total leads" />
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Regions in your zone</Text>
                {selectedCount > 0 ? (
                  <TouchableOpacity onPress={clearSelection}>
                    <Text style={styles.clearButtonText}>Clear ({selectedCount})</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <RegionRow
              region={item}
              selected={selectedRegionIds.has(item.id)}
              onToggleSelect={() => toggleRegion(item.id)}
              onOpenDetail={() => openRegionDetail(item.id)}
            />
          )}
          ListEmptyComponent={<EmptyState message="No regions in your zone yet." />}
        />

        {selectedCount > 0 ? (
          <View style={styles.bottomActionContainer}>
            <TouchableOpacity activeOpacity={0.86} style={styles.followUpButton} onPress={goToFollowUp} testID="follow-up-cta">
              <Text style={styles.followUpButtonText}>
                Follow up with {selectedCount} region{selectedCount === 1 ? '' : 's'}
              </Text>
              <Text style={styles.followUpArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <SimpleDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        title="MSME - Utkarsh"
        subtitle="Zonal Manager"
        items={[
          { key: 'dashboard', icon: '⌂', label: 'Dashboard', onPress: () => navigation.navigate('ZMDashboard') },
          { key: 'follow-ups', icon: '↗', label: 'Follow-Ups', onPress: () => navigation.navigate('FollowUp', undefined) },
        ]}
        onLogout={logout}
      />
    </SafeAreaView>
  );
}

function MetricCard({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RegionRow({
  region,
  selected,
  onToggleSelect,
  onOpenDetail,
}: {
  region: ZmDashboardRegion;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.regionCard, selected && styles.regionCardSelected]}
      onPress={onOpenDetail}
      testID={`region-row-${region.id}`}
    >
      <View style={styles.regionHeader}>
        <View style={styles.regionIdentity}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.checkbox, selected && styles.checkboxSelected]}
            onPress={onToggleSelect}
            testID={`region-select-${region.id}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </TouchableOpacity>

          <View style={styles.regionNameContainer}>
            <Text style={styles.regionCardName} numberOfLines={1}>
              {region.name}
            </Text>
            <Text style={styles.regionMeta}>
              {region.branchCount} branch{region.branchCount === 1 ? '' : 'es'}
            </Text>
          </View>
        </View>

        <Text style={styles.regionOpenArrow}>›</Text>
      </View>

      <View style={styles.regionStats}>
        <View style={styles.regionStat}>
          <Text style={styles.regionStatValue}>{region.totalLeads}</Text>
          <Text style={styles.regionStatLabel}>{region.totalLeads === 1 ? 'Lead' : 'Leads'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8FC' },
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  listContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28 },
  listContentWithBottomAction: { paddingBottom: 110 },
  topHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  brandContainer: { flex: 1 },
  brandName: { color: '#0B4A8B', fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  brandSubtitle: { color: '#7B8793', fontSize: 9, fontWeight: '600', marginTop: 2 },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE7F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: '#0B5CAB', marginVertical: 2 },
  heroCard: { backgroundColor: '#0B5CAB', borderRadius: 20, paddingHorizontal: 19, paddingVertical: 16, marginBottom: 16 },
  greeting: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
  userName: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 1 },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 13 },
  regionLabel: { color: 'rgba(255,255,255,0.57)', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  regionName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 2 },
  metricsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  metricCard: {
    width: '31.5%',
    height: 78,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFD5EA',
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  metricValue: { color: '#182533', fontSize: 22, fontWeight: '800' },
  metricLabel: { color: '#7A8793', fontSize: 10, fontWeight: '600', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#182533' },
  clearButtonText: { color: '#0B5CAB', fontSize: 11, fontWeight: '700' },
  regionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    padding: 13,
  },
  regionCardSelected: { borderColor: '#0B5CAB' },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  regionIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#AEBCC9',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: { backgroundColor: '#0B5CAB', borderColor: '#0B5CAB' },
  checkboxMark: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  regionNameContainer: { flex: 1 },
  regionCardName: { color: '#1D2A37', fontSize: 15, fontWeight: '800' },
  regionMeta: { color: '#7B8793', fontSize: 10, marginTop: 3 },
  regionOpenArrow: { color: '#0B5CAB', fontSize: 22, fontWeight: '300' },
  regionStats: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 12,
  },
  regionStat: { minWidth: 54 },
  regionStatValue: { color: '#182533', fontSize: 17, fontWeight: '800' },
  regionStatLabel: { color: '#8A96A2', fontSize: 9, fontWeight: '700', marginTop: 1 },
  bottomActionContainer: { position: 'absolute', left: 18, right: 18, bottom: 14 },
  followUpButton: {
    minHeight: 60,
    borderRadius: 17,
    backgroundColor: '#0B5CAB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  followUpButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  followUpArrow: { color: '#FFFFFF', fontSize: 24, fontWeight: '300' },
});
