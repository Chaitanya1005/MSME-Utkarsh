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
import { fetchGmDashboard } from '../../api/dashboardApi';
import { fetchFollowUpCandidates } from '../../api/followUpApi';
import { SimpleDrawer } from '../../components/SimpleDrawer';
import { LoadingState, ErrorState, EmptyState } from '../../components/StatusStates';
import { GmDashboardZone } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'GMDashboard'>;

// Mirrors ZMDashboardScreen one level up: zones org-wide, each with a
// headline lead count, zone multi-select feeding FollowUp. Read-only —
// no update actions reachable anywhere in this stack (Full-Hierarchy
// Expansion plan, Phase 4).
export function GMDashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard', 'gm', user?.id],
    queryFn: fetchGmDashboard,
    enabled: !!user,
  });

  const candidatesQuery = useQuery({
    queryKey: ['follow-up-candidates', user?.id],
    queryFn: fetchFollowUpCandidates,
    enabled: !!user,
  });

  function toggleZone(zoneId: string) {
    setSelectedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedZoneIds(new Set());
  }

  function goToFollowUp() {
    const candidateZones = candidatesQuery.data?.zones ?? [];
    const recipients = candidateZones
      .filter((c) => selectedZoneIds.has(c.id) && c.recipientUserId)
      .map((c) => ({ id: c.recipientUserId as string, name: c.recipientName ?? c.name }));
    if (recipients.length === 0) return;
    navigation.navigate('FollowUp', { recipients });
  }

  function openZoneDetail(zoneId: string) {
    navigation.navigate('ZoneDetail', { zoneId });
  }

  if (isLoading) {
    return <LoadingState label="Loading the organization..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load the dashboard.'}
        onRetry={() => refetch()}
      />
    );
  }

  const selectedCount = selectedZoneIds.size;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.container}>
        <FlatList
          data={data!.zones}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor="#0B5CAB" />}
          contentContainerStyle={[styles.listContent, selectedCount > 0 && styles.listContentWithBottomAction]}
          ListHeaderComponent={
            <View>
              <View style={styles.topHeader}>
                <View style={styles.brandContainer}>
                  <Text style={styles.brandName}>MSME - Utkarsh</Text>
                  <Text style={styles.brandSubtitle}>Organization Overview</Text>
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
                  {user?.name || 'General Manager'}
                </Text>
              </View>

              <View style={styles.metricsGrid}>
                <MetricCard value={data!.summary.totalZones} label="Zones" />
                <MetricCard value={data!.summary.totalBranches} label="Branches" />
                <MetricCard value={data!.summary.totalLeads} label="Total leads" />
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Zones</Text>
                {selectedCount > 0 ? (
                  <TouchableOpacity onPress={clearSelection}>
                    <Text style={styles.clearButtonText}>Clear ({selectedCount})</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <ZoneRow
              zone={item}
              selected={selectedZoneIds.has(item.id)}
              onToggleSelect={() => toggleZone(item.id)}
              onOpenDetail={() => openZoneDetail(item.id)}
            />
          )}
          ListEmptyComponent={<EmptyState message="No zones configured yet." />}
        />

        {selectedCount > 0 ? (
          <View style={styles.bottomActionContainer}>
            <TouchableOpacity activeOpacity={0.86} style={styles.followUpButton} onPress={goToFollowUp} testID="follow-up-cta">
              <Text style={styles.followUpButtonText}>
                Follow up with {selectedCount} zone{selectedCount === 1 ? '' : 's'}
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
        subtitle="General Manager"
        items={[
          { key: 'dashboard', icon: '⌂', label: 'Dashboard', onPress: () => navigation.navigate('GMDashboard') },
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

function ZoneRow({
  zone,
  selected,
  onToggleSelect,
  onOpenDetail,
}: {
  zone: GmDashboardZone;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.zoneCard, selected && styles.zoneCardSelected]}
      onPress={onOpenDetail}
      testID={`zone-row-${zone.id}`}
    >
      <View style={styles.zoneHeader}>
        <View style={styles.zoneIdentity}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.checkbox, selected && styles.checkboxSelected]}
            onPress={onToggleSelect}
            testID={`zone-select-${zone.id}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </TouchableOpacity>

          <View style={styles.zoneNameContainer}>
            <Text style={styles.zoneCardName} numberOfLines={1}>
              {zone.name}
            </Text>
            <Text style={styles.zoneMeta}>
              {zone.branchCount} branch{zone.branchCount === 1 ? '' : 'es'}
            </Text>
          </View>
        </View>

        <Text style={styles.zoneOpenArrow}>›</Text>
      </View>

      <View style={styles.zoneStats}>
        <View style={styles.zoneStat}>
          <Text style={styles.zoneStatValue}>{zone.totalLeads}</Text>
          <Text style={styles.zoneStatLabel}>{zone.totalLeads === 1 ? 'Lead' : 'Leads'}</Text>
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
  zoneCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    padding: 13,
  },
  zoneCardSelected: { borderColor: '#0B5CAB' },
  zoneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zoneIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
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
  zoneNameContainer: { flex: 1 },
  zoneCardName: { color: '#1D2A37', fontSize: 15, fontWeight: '800' },
  zoneMeta: { color: '#7B8793', fontSize: 10, marginTop: 3 },
  zoneOpenArrow: { color: '#0B5CAB', fontSize: 22, fontWeight: '300' },
  zoneStats: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 12,
  },
  zoneStat: { minWidth: 54 },
  zoneStatValue: { color: '#182533', fontSize: 17, fontWeight: '800' },
  zoneStatLabel: { color: '#8A96A2', fontSize: 9, fontWeight: '700', marginTop: 1 },
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
