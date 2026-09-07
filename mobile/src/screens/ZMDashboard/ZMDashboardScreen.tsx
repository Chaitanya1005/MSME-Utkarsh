import React, { useMemo, useState } from 'react';
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
import { ZmDashboardRegion, BranchUpdateStatus, FollowUpChannel } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ZMDashboard'>;

const STATUS_LABEL: Record<BranchUpdateStatus, string> = {
  UPDATE_REQUIRED: 'Update required',
  FOLLOW_UP_INITIATED: 'Follow-up sent',
  RECENTLY_UPDATED: 'Up to date',
};

const CHANNEL_LABEL: Record<FollowUpChannel, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
};

const STATUS_META: Record<BranchUpdateStatus, { background: string; foreground: string; accent: string; dot: string }> = {
  UPDATE_REQUIRED: { background: '#FFF4F6', foreground: '#C2183A', accent: '#D7194B', dot: '#D7194B' },
  FOLLOW_UP_INITIATED: { background: '#FFF8EA', foreground: '#946800', accent: '#D99A12', dot: '#D99A12' },
  RECENTLY_UPDATED: { background: '#EFF9F3', foreground: '#167347', accent: '#16845A', dot: '#16845A' },
};

function followUpSummary(followUp: NonNullable<ZmDashboardRegion['latestFollowUp']>): string {
  const channel = CHANNEL_LABEL[followUp.channel];
  switch (followUp.status) {
    case 'ACCESSED':
      return `${channel} follow-up · opened by the RM`;
    case 'SENT':
      return followUp.sentAt ? `${channel} follow-up · sent ${new Date(followUp.sentAt).toLocaleDateString()}` : `${channel} follow-up · sent`;
    case 'FAILED':
      return `${channel} follow-up · could not be delivered`;
    default:
      return `${channel} follow-up · not sent yet`;
  }
}

// Full visual parity with RMDashboardScreen, one level up: hero greeting
// + LIVE badge, "My Leads" card, 2x2 performance grid (with a real
// Need-attention/Follow-ups-active status per region, not just raw
// counts), select-all/needs-update selection row, and colored region
// cards with the same status-pill + last-activity + follow-up-status
// treatment RM's branch cards have (Full-Hierarchy Expansion plan, UX
// parity pass).
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

  const sortedRegions = useMemo(() => {
    if (!data) return [];
    const priority: Record<BranchUpdateStatus, number> = { UPDATE_REQUIRED: 0, FOLLOW_UP_INITIATED: 1, RECENTLY_UPDATED: 2 };
    return [...data.regions].sort((a, b) => priority[a.updateStatus] - priority[b.updateStatus]);
  }, [data]);

  function toggleRegion(regionId: string) {
    setSelectedRegionIds((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }

  function selectAll() {
    setSelectedRegionIds(new Set(sortedRegions.map((r) => r.id)));
  }

  function selectRequiringUpdate() {
    setSelectedRegionIds(new Set(sortedRegions.filter((r) => r.updateStatus === 'UPDATE_REQUIRED').map((r) => r.id)));
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

  function openMyLeads() {
    navigation.navigate('MyLeads');
  }

  function openDrawer() {
    setDrawerVisible(true);
  }

  function closeDrawer() {
    setDrawerVisible(false);
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

  const requiringUpdateCount = sortedRegions.filter((r) => r.updateStatus === 'UPDATE_REQUIRED').length;
  const selectedCount = selectedRegionIds.size;
  const totalRegions = sortedRegions.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.container}>
        <FlatList
          data={sortedRegions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor="#0B5CAB" />}
          contentContainerStyle={[styles.listContent, selectedCount > 0 && styles.listContentWithBottomAction]}
          ListHeaderComponent={
            <View>
              <View style={styles.topHeader}>
                <View style={styles.brandContainer}>
                  <Text style={styles.brandName}>MSME - Utkarsh</Text>
                  <Text style={styles.brandSubtitle}>Performance Evaluation System</Text>
                </View>

                <TouchableOpacity activeOpacity={0.8} style={styles.menuButton} onPress={openDrawer} testID="menu-button">
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                </TouchableOpacity>
              </View>

              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroTextContainer}>
                    <Text style={styles.greeting}>Good to see you,</Text>
                    <Text style={styles.userName} numberOfLines={1}>
                      {user?.name || 'Zonal Head'}
                    </Text>
                  </View>

                  <View style={styles.heroBadge}>
                    <View style={styles.heroBadgeDot} />
                    <Text style={styles.heroBadgeText}>LIVE</Text>
                  </View>
                </View>

                <View style={styles.heroDivider} />

                <View style={styles.regionRow}>
                  <View style={styles.locationIcon}>
                    <Text style={styles.locationIconText}>Z</Text>
                  </View>
                  <View style={styles.regionInfo}>
                    <Text style={styles.regionLabel}>YOUR ZONE</Text>
                    <Text style={styles.regionName}>{data!.zone.name}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity activeOpacity={0.88} style={styles.myLeadsCard} onPress={openMyLeads} testID="my-leads-cta">
                <View style={styles.myLeadsIcon}>
                  <Text style={styles.myLeadsIconText}>◎</Text>
                </View>
                <View style={styles.myLeadsTextContainer}>
                  <Text style={styles.myLeadsTitle}>My Leads</Text>
                  <Text style={styles.myLeadsSubtitle}>Leads assigned directly to regions in your zone</Text>
                </View>
                <Text style={styles.myLeadsArrow}>›</Text>
              </TouchableOpacity>

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Performance overview</Text>
                  <Text style={styles.sectionSubtitle}>Your zone at a glance</Text>
                </View>
              </View>

              <View style={styles.metricsGrid}>
                <MetricCard value={data!.summary.totalRegions} label="Regions" type="normal" />
                <MetricCard value={data!.summary.totalLeads} label="Total leads" type="normal" />
                <MetricCard
                  value={data!.summary.regionsRequiringUpdate}
                  label="Need attention"
                  type="attention"
                  highlight={data!.summary.regionsRequiringUpdate > 0}
                />
                <MetricCard value={data!.summary.regionsWithFollowUpInFlight} label="Follow-ups active" type="normal" />
              </View>

              <View style={styles.branchSectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Regions in your zone</Text>
                  <Text style={styles.sectionSubtitle}>
                    {totalRegions} authorized region{totalRegions === 1 ? '' : 's'}
                  </Text>
                </View>

                {selectedCount > 0 ? (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>{selectedCount} selected</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.selectionRow}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.primarySelectionButton}
                  onPress={selectAll}
                  testID="select-all-button"
                >
                  <Text style={styles.primarySelectionButtonText}>Select all</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.secondarySelectionButton}
                  onPress={selectRequiringUpdate}
                  disabled={requiringUpdateCount === 0}
                  testID="select-requiring-update-button"
                >
                  <Text style={[styles.secondarySelectionButtonText, requiringUpdateCount === 0 && styles.disabledSelectionText]}>
                    Needs update
                  </Text>
                </TouchableOpacity>

                {selectedCount > 0 ? (
                  <TouchableOpacity activeOpacity={0.75} style={styles.clearButton} onPress={clearSelection}>
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.selectionSummaryContainer}>
                <View style={styles.selectionSummaryLine} />
                <Text style={styles.selectionSummary} testID="selection-summary">
                  {selectedCount} of {totalRegions} selected
                </Text>
                <View style={styles.selectionSummaryLine} />
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
              <View style={styles.followUpIcon}>
                <Text style={styles.followUpIconText}>↗</Text>
              </View>
              <View style={styles.followUpTextContainer}>
                <Text style={styles.followUpEyebrow}>READY TO SEND</Text>
                <Text style={styles.followUpButtonText}>
                  Follow up with {selectedCount} {selectedCount === 1 ? 'region' : 'regions'}
                </Text>
              </View>
              <Text style={styles.followUpArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <SimpleDrawer
        visible={drawerVisible}
        onClose={closeDrawer}
        title="MSME - Utkarsh"
        subtitle="Zonal Manager"
        items={[
          { key: 'dashboard', icon: '⌂', label: 'Dashboard', onPress: () => navigation.navigate('ZMDashboard') },
          { key: 'my-leads', icon: '◎', label: 'My Leads', onPress: openMyLeads },
          { key: 'follow-ups', icon: '↗', label: 'Follow-Ups', onPress: () => navigation.navigate('FollowUp', undefined) },
        ]}
        onLogout={logout}
      />
    </SafeAreaView>
  );
}

function MetricCard({
  value,
  label,
  type,
  highlight,
}: {
  value: number;
  label: string;
  type: 'normal' | 'attention';
  highlight?: boolean;
}) {
  const isAttention = type === 'attention';
  return (
    <View style={[styles.metricCard, isAttention ? styles.metricCardAttention : styles.metricCardNormal, highlight && styles.metricCardAttentionActive]}>
      <Text style={[styles.metricValue, isAttention && highlight && styles.metricValueAttention]}>{value}</Text>
      <Text style={[styles.metricLabel, isAttention && highlight && styles.metricLabelAttention]}>{label}</Text>
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
  const status = STATUS_META[region.updateStatus];

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.regionCard, selected && styles.regionCardSelected]}
      onPress={onOpenDetail}
      testID={`region-row-${region.id}`}
    >
      <View style={[styles.regionTopAccent, { backgroundColor: status.accent }]} />

      <View style={styles.regionCardInner}>
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
              <Text style={styles.regionRm}>{region.rm ? 'Regional Head' : 'No RM assigned'}</Text>
            </View>
          </View>

          <View style={[styles.statusPill, { backgroundColor: status.background }]}>
            <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
            <Text style={[styles.statusPillText, { color: status.foreground }]}>{STATUS_LABEL[region.updateStatus]}</Text>
          </View>
        </View>

        <View style={styles.regionStats}>
          <View style={styles.regionStat}>
            <Text style={styles.regionStatValue}>{region.totalLeads}</Text>
            <Text style={styles.regionStatLabel}>{region.totalLeads === 1 ? 'Lead' : 'Leads'}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.regionStatWide}>
            <Text style={styles.regionStatLabel}>LAST ACTIVITY</Text>
            <Text style={styles.regionActivity}>
              {region.lastLeadUpdateAt ? new Date(region.lastLeadUpdateAt).toLocaleDateString() : 'No activity yet'}
            </Text>
          </View>

          <View style={styles.regionOpen}>
            <Text style={styles.regionOpenArrow}>›</Text>
          </View>
        </View>

        {region.latestFollowUp ? (
          <View
            style={[
              styles.followUpInfo,
              region.latestFollowUp.status === 'ACCESSED' && styles.followUpInfoAccessed,
              region.latestFollowUp.status === 'FAILED' && styles.followUpInfoFailed,
            ]}
          >
            <View style={styles.followUpInfoDot} />
            <Text
              style={[
                styles.regionFollowUp,
                region.latestFollowUp.status === 'ACCESSED' && styles.regionFollowUpAccessed,
                region.latestFollowUp.status === 'FAILED' && styles.regionFollowUpFailed,
              ]}
              numberOfLines={1}
            >
              {followUpSummary(region.latestFollowUp)}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8FC' },
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  listContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28 },
  listContentWithBottomAction: { paddingBottom: 125 },
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
    shadowColor: '#0B355E',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: '#0B5CAB', marginVertical: 2 },
  heroCard: {
    backgroundColor: '#0B5CAB',
    borderRadius: 20,
    paddingHorizontal: 19,
    paddingVertical: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#0B3D72',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroTextContainer: { flex: 1 },
  greeting: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
  userName: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 1 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7FE0AC', marginRight: 5 },
  heroBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 13 },
  regionRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  locationIconText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  regionInfo: { flex: 1 },
  regionLabel: { color: 'rgba(255,255,255,0.57)', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  regionName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 2 },
  myLeadsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFD5EA',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 16,
  },
  myLeadsIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF2FB', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  myLeadsIconText: { color: '#0B5CAB', fontSize: 18, fontWeight: '800' },
  myLeadsTextContainer: { flex: 1 },
  myLeadsTitle: { color: '#182533', fontSize: 15, fontWeight: '800' },
  myLeadsSubtitle: { color: '#7A8794', fontSize: 11, marginTop: 2 },
  myLeadsArrow: { color: '#0B5CAB', fontSize: 24, fontWeight: '300' },
  sectionHeader: { marginBottom: 10 },
  branchSectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 23, marginBottom: 12 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: '#182533', letterSpacing: -0.25 },
  sectionSubtitle: { fontSize: 12, color: '#7A8794', marginTop: 2 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricCard: {
    width: '48.5%',
    height: 86,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 9,
    justifyContent: 'center',
  },
  metricCardNormal: { borderWidth: 1, borderColor: '#BFD5EA' },
  metricCardAttention: { borderWidth: 1, borderColor: '#F0CDD5' },
  metricCardAttentionActive: { borderColor: '#D7194B', backgroundColor: '#FFFDFD' },
  metricValue: { color: '#182533', fontSize: 26, fontWeight: '800' },
  metricValueAttention: { color: '#C2183A' },
  metricLabel: { color: '#7A8793', fontSize: 11, fontWeight: '600', marginTop: 2 },
  metricLabelAttention: { color: '#A04B60' },
  selectedBadge: { backgroundColor: '#EAF2FB', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  selectedBadgeText: { color: '#0B5CAB', fontSize: 10, fontWeight: '800' },
  selectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  primarySelectionButton: { backgroundColor: '#0B5CAB', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 8, marginRight: 7 },
  primarySelectionButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  secondarySelectionButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D2DFEB', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, marginRight: 7 },
  secondarySelectionButtonText: { color: '#0B5CAB', fontSize: 11, fontWeight: '700' },
  disabledSelectionText: { color: '#B5C1CD' },
  clearButton: { paddingHorizontal: 7, paddingVertical: 8 },
  clearButtonText: { color: '#7A8794', fontSize: 11, fontWeight: '700' },
  selectionSummaryContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
  selectionSummaryLine: { flex: 1, height: 1, backgroundColor: '#E4EAF0' },
  selectionSummary: { color: '#8A96A2', fontSize: 10, fontWeight: '600', marginHorizontal: 9 },
  regionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    overflow: 'hidden',
    shadowColor: '#17324A',
    shadowOpacity: 0.045,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  regionCardSelected: { borderColor: '#0B5CAB', shadowColor: '#0B5CAB', shadowOpacity: 0.1 },
  regionTopAccent: { height: 3, width: '100%' },
  regionCardInner: { padding: 13 },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
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
  regionRm: { color: '#7B8793', fontSize: 10, marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 125 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 5 },
  statusPillText: { fontSize: 9, fontWeight: '800' },
  regionStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 11, paddingVertical: 8, paddingHorizontal: 10, marginTop: 12 },
  regionStat: { minWidth: 54 },
  regionStatValue: { color: '#182533', fontSize: 17, fontWeight: '800' },
  regionStatLabel: { color: '#8A96A2', fontSize: 9, fontWeight: '700', marginTop: 1 },
  statDivider: { width: 1, height: 25, backgroundColor: '#E1E7ED', marginHorizontal: 11 },
  regionStatWide: { flex: 1 },
  regionActivity: { color: '#344250', fontSize: 11, fontWeight: '700', marginTop: 2 },
  regionOpen: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E1E7ED' },
  regionOpenArrow: { color: '#0B5CAB', fontSize: 22, fontWeight: '300', lineHeight: 24 },
  followUpInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EEF1F4' },
  followUpInfoAccessed: { borderTopColor: '#DCEFE4' },
  followUpInfoFailed: { borderTopColor: '#F3DDE2' },
  followUpInfoDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#0B5CAB', marginRight: 7 },
  regionFollowUp: { flex: 1, color: '#53708A', fontSize: 10, fontWeight: '600' },
  regionFollowUpAccessed: { color: '#16845A' },
  regionFollowUpFailed: { color: '#C2183A' },
  bottomActionContainer: { position: 'absolute', left: 18, right: 18, bottom: 14 },
  followUpButton: {
    minHeight: 64,
    borderRadius: 17,
    backgroundColor: '#0B5CAB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    shadowColor: '#0B3D72',
    shadowOpacity: 0.25,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  followUpIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  followUpIconText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  followUpTextContainer: { flex: 1 },
  followUpEyebrow: { color: 'rgba(255,255,255,0.62)', fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  followUpButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginTop: 2 },
  followUpArrow: { color: '#FFFFFF', fontSize: 29, fontWeight: '300', marginRight: 5 },
});
