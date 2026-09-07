import React, { useState } from 'react';
import { FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { fetchZoneDetail } from '../../api/dashboardApi';
import { fetchFollowUpCandidates } from '../../api/followUpApi';
import { LoadingState, ErrorState, EmptyState } from '../../components/StatusStates';
import { PipelineTrack } from '../../components/PipelineTrack';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { ZoneDetailRegion, ZoneDetailBranch, RegionDetailLead } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ZoneDetail'>;

const SENDER_ROLES = ['RM', 'ZM', 'CO'];

type Tab = 'leads' | 'regions' | 'branches';

// Same pattern as RegionDetailScreen, one level up, split into three
// tabs — Leads / Regions / Branches — instead of stacking them, so a
// zone with a large org under it doesn't push its branch list far down
// (Full-Hierarchy Expansion plan, region/zone detail UX pass). The
// Regions and Branches tabs double as follow-up target pickers for
// ZM/CO (skip-level straight to branches, same as GMDashboardScreen's
// zone-level picker but one level more specific).
export function ZoneDetailScreen({ route, navigation }: Props) {
  const { zoneId } = route.params;
  const { user } = useAuth();
  const canSendFollowUp = !!user && SENDER_ROLES.includes(user.role);

  const [tab, setTab] = useState<Tab>('leads');
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<string>>(new Set());
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['zone-detail', zoneId],
    queryFn: () => fetchZoneDetail(zoneId),
  });

  const candidatesQuery = useQuery({
    queryKey: ['follow-up-candidates', user?.id],
    queryFn: fetchFollowUpCandidates,
    enabled: canSendFollowUp,
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

  function toggleRegion(regionId: string) {
    setSelectedRegionIds((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }

  function toggleBranch(branchId: string) {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }

  function selectAllRegions() {
    setSelectedRegionIds(new Set(zone.regions.map((r) => r.id)));
  }

  function selectAllBranches() {
    setSelectedBranchIds(new Set(zone.zoneBranches.map((b) => b.id)));
  }

  function clearRegionSelection() {
    setSelectedRegionIds(new Set());
  }

  function clearBranchSelection() {
    setSelectedBranchIds(new Set());
  }

  function goToRegionFollowUp() {
    const regionCandidates = candidatesQuery.data?.regions ?? [];
    const recipients = regionCandidates
      .filter((c) => selectedRegionIds.has(c.id) && c.recipientUserId)
      .map((c) => ({ id: c.recipientUserId as string, name: c.recipientName ?? c.name }));
    if (recipients.length === 0) return;
    navigation.navigate('FollowUp', { recipients });
  }

  function goToBranchFollowUp() {
    const branchCandidates = candidatesQuery.data?.branches ?? [];
    const recipients = branchCandidates
      .filter((c) => selectedBranchIds.has(c.id) && c.recipientUserId)
      .map((c) => ({ id: c.recipientUserId as string, name: c.recipientName ?? c.name }));
    if (recipients.length === 0) return;
    navigation.navigate('FollowUp', { recipients });
  }

  const header = (
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

      <SegmentedTabs
        tabs={[
          { key: 'leads', label: 'Leads', count: zone.zoneLeads.length },
          { key: 'regions', label: 'Regions', count: zone.regions.length },
          { key: 'branches', label: 'Branches', count: zone.zoneBranches.length },
        ]}
        activeKey={tab}
        onChange={(key) => setTab(key as Tab)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.container}>
        {tab === 'leads' ? (
          <FlatList
            data={zone.zoneLeads}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={header}
            renderItem={({ item }) => (
              <ZoneLeadRow lead={item} onPress={() => navigation.navigate('LeadDetail', { leadId: item.id })} />
            )}
            ListEmptyComponent={<EmptyState message="No leads assigned directly to this zone." />}
          />
        ) : tab === 'regions' ? (
          <FlatList
            data={zone.regions}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, selectedRegionIds.size > 0 && styles.listContentWithBottomAction]}
            ListHeaderComponent={
              <View>
                {header}
                {canSendFollowUp ? (
                  <SelectionRow
                    selectedCount={selectedRegionIds.size}
                    onSelectAll={selectAllRegions}
                    onClear={clearRegionSelection}
                  />
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <RegionRow
                region={item}
                selectable={canSendFollowUp}
                selected={selectedRegionIds.has(item.id)}
                onToggleSelect={() => toggleRegion(item.id)}
                onPress={() => navigation.navigate('RegionDetail', { regionId: item.id })}
              />
            )}
            ListEmptyComponent={<EmptyState message="No regions in this zone." />}
          />
        ) : (
          <FlatList
            data={zone.zoneBranches}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, selectedBranchIds.size > 0 && styles.listContentWithBottomAction]}
            ListHeaderComponent={
              <View>
                {header}
                {canSendFollowUp ? (
                  <SelectionRow
                    selectedCount={selectedBranchIds.size}
                    onSelectAll={selectAllBranches}
                    onClear={clearBranchSelection}
                  />
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <ZoneBranchRow
                branch={item}
                selectable={canSendFollowUp}
                selected={selectedBranchIds.has(item.id)}
                onToggleSelect={() => toggleBranch(item.id)}
                onPress={() => navigation.navigate('BranchDetail', { branchId: item.id })}
              />
            )}
            ListEmptyComponent={<EmptyState message="No branches in this zone." />}
          />
        )}

        {tab === 'regions' && selectedRegionIds.size > 0 ? (
          <View style={styles.bottomActionContainer}>
            <TouchableOpacity activeOpacity={0.86} style={styles.followUpButton} onPress={goToRegionFollowUp} testID="follow-up-cta">
              <Text style={styles.followUpButtonText}>
                Follow up with {selectedRegionIds.size} region{selectedRegionIds.size === 1 ? '' : 's'}
              </Text>
              <Text style={styles.followUpArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {tab === 'branches' && selectedBranchIds.size > 0 ? (
          <View style={styles.bottomActionContainer}>
            <TouchableOpacity activeOpacity={0.86} style={styles.followUpButton} onPress={goToBranchFollowUp} testID="follow-up-cta">
              <Text style={styles.followUpButtonText}>
                Follow up with {selectedBranchIds.size} branch{selectedBranchIds.size === 1 ? '' : 'es'}
              </Text>
              <Text style={styles.followUpArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function SelectionRow({
  selectedCount,
  onSelectAll,
  onClear,
}: {
  selectedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.selectionRow}>
      <TouchableOpacity activeOpacity={0.75} style={styles.primarySelectionButton} onPress={onSelectAll} testID="select-all-button">
        <Text style={styles.primarySelectionButtonText}>Select all</Text>
      </TouchableOpacity>
      {selectedCount > 0 ? (
        <TouchableOpacity activeOpacity={0.75} style={styles.clearButton} onPress={onClear}>
          <Text style={styles.clearButtonText}>Clear ({selectedCount})</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ZoneLeadRow({ lead, onPress }: { lead: RegionDetailLead; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.leadCard} onPress={onPress} testID={`zone-lead-row-${lead.id}`}>
      <View style={styles.leadIdentity}>
        <Text style={styles.leadName} numberOfLines={1}>
          {lead.customerName}
        </Text>
        {lead.sourceSrNo ? <Text style={styles.leadMeta}>Lead #{lead.sourceSrNo}</Text> : null}
      </View>
      <View style={styles.leadStageBadge}>
        <Text style={styles.leadStageText}>{lead.cbiPesStage.replace(/_/g, ' ')}</Text>
      </View>
      <Text style={styles.regionOpenArrow}>›</Text>
    </TouchableOpacity>
  );
}

function RegionRow({
  region,
  selectable,
  selected,
  onToggleSelect,
  onPress,
}: {
  region: ZoneDetailRegion;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.regionCard, selected && styles.regionCardSelected]} onPress={onPress} testID={`region-row-${region.id}`}>
      <View style={styles.regionHeader}>
        <View style={styles.regionIdentity}>
          {selectable ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.checkbox, selected && styles.checkboxSelected]}
              onPress={onToggleSelect}
              testID={`region-select-${region.id}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </TouchableOpacity>
          ) : null}
          <View style={styles.regionNameContainer}>
            <Text style={styles.regionName} numberOfLines={1}>
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
        <Text style={styles.regionStatValue}>{region.totalLeads}</Text>
        <Text style={styles.regionStatLabel}>{region.totalLeads === 1 ? 'lead' : 'leads'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ZoneBranchRow({
  branch,
  selectable,
  selected,
  onToggleSelect,
  onPress,
}: {
  branch: ZoneDetailBranch;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.regionCard, selected && styles.regionCardSelected]} onPress={onPress} testID={`zone-branch-row-${branch.id}`}>
      <View style={styles.regionHeader}>
        <View style={styles.regionIdentity}>
          {selectable ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.checkbox, selected && styles.checkboxSelected]}
              onPress={onToggleSelect}
              testID={`zone-branch-select-${branch.id}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </TouchableOpacity>
          ) : null}
          <View style={styles.regionNameContainer}>
            <Text style={styles.regionName} numberOfLines={1}>
              {branch.name}
            </Text>
            <Text style={styles.regionMeta}>{branch.region.name}</Text>
          </View>
        </View>

        <Text style={styles.regionOpenArrow}>›</Text>
      </View>

      <View style={styles.regionStats}>
        <Text style={styles.regionStatValue}>{branch.totalLeads}</Text>
        <Text style={styles.regionStatLabel}>{branch.totalLeads === 1 ? 'lead' : 'leads'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8FC' },
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  listContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28 },
  listContentWithBottomAction: { paddingBottom: 110 },
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
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#182533', marginBottom: 12 },
  selectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  primarySelectionButton: {
    backgroundColor: '#0B5CAB',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 7,
  },
  primarySelectionButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  clearButton: { paddingHorizontal: 7, paddingVertical: 8 },
  clearButtonText: { color: '#7A8794', fontSize: 11, fontWeight: '700' },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    padding: 13,
    marginBottom: 10,
  },
  leadIdentity: { flex: 1, marginRight: 8 },
  leadName: { color: '#1D2A37', fontSize: 14, fontWeight: '800' },
  leadMeta: { color: '#7B8793', fontSize: 10, marginTop: 3 },
  leadStageBadge: { backgroundColor: '#E8F0FF', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, marginRight: 8 },
  leadStageText: { color: '#174EA6', fontSize: 9, fontWeight: '800' },
  regionCard: { backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E0E7EE', padding: 13, marginBottom: 10 },
  regionCardSelected: { borderColor: '#0B5CAB' },
  regionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  regionIdentity: { flex: 1, marginRight: 8, flexDirection: 'row', alignItems: 'center' },
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
  bottomActionContainer: { position: 'absolute', left: 18, right: 18, bottom: 14 },
  followUpButton: {
    minHeight: 56,
    borderRadius: 17,
    backgroundColor: '#0B5CAB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    shadowColor: '#0B3D72',
    shadowOpacity: 0.25,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  followUpButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  followUpArrow: { color: '#FFFFFF', fontSize: 24, fontWeight: '300' },
});
