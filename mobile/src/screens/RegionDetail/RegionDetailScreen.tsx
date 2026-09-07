import React, { useMemo, useState } from 'react';
import { FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { fetchRegionDetail } from '../../api/dashboardApi';
import { fetchFollowUpCandidates } from '../../api/followUpApi';
import { LoadingState, ErrorState, EmptyState } from '../../components/StatusStates';
import { PipelineTrack } from '../../components/PipelineTrack';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { RegionDetail, RegionDetailBranch, RegionDetailLead } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'RegionDetail'>;

// Roles that can ever initiate a follow-up (mirrors canInitiateFollowUpTo
// on the backend — BM is a leaf role and never sends).
const SENDER_ROLES = ['RM', 'ZM', 'CO'];

type Tab = 'leads' | 'branches';

// Mirrors BranchDetailScreen structurally (same PipelineTrack rendering
// component). Split into "Leads" / "Branches" tabs (Full-Hierarchy
// Expansion plan, region/zone detail UX pass) so a region with many
// leads doesn't push its branch list dozens of scrolls down. The
// Branches tab doubles as a follow-up target picker for RM/ZM/CO,
// reusing the exact selection UX RMDashboardScreen already has.
export function RegionDetailScreen({ route, navigation }: Props) {
  const { regionId } = route.params;
  const { user } = useAuth();
  const canSendFollowUp = !!user && SENDER_ROLES.includes(user.role);

  const [tab, setTab] = useState<Tab>('leads');
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['region-detail', regionId],
    queryFn: () => fetchRegionDetail(regionId),
  });

  const candidatesQuery = useQuery({
    queryKey: ['follow-up-candidates', user?.id],
    queryFn: fetchFollowUpCandidates,
    enabled: canSendFollowUp,
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

  function toggleBranch(branchId: string) {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }

  function selectAllBranches() {
    setSelectedBranchIds(new Set(region.branches.map((b) => b.id)));
  }

  function clearSelection() {
    setSelectedBranchIds(new Set());
  }

  function goToFollowUp() {
    const branchCandidates = candidatesQuery.data?.branches ?? [];
    const recipients = branchCandidates
      .filter((c) => selectedBranchIds.has(c.id) && c.recipientUserId)
      .map((c) => ({ id: c.recipientUserId as string, name: c.recipientName ?? c.name }));
    if (recipients.length === 0) return;
    navigation.navigate('FollowUp', { recipients });
  }

  const selectedCount = selectedBranchIds.size;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.container}>
        {tab === 'leads' ? (
          <FlatList
            data={region.regionLeads}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <RegionHeader
                region={region}
                tab={tab}
                onChangeTab={setTab}
                branchCount={region.branches.length}
              />
            }
            renderItem={({ item }) => (
              <RegionLeadRow lead={item} onPress={() => navigation.navigate('LeadDetail', { leadId: item.id })} />
            )}
            ListEmptyComponent={<EmptyState message="No leads assigned directly to this region." />}
          />
        ) : (
          <FlatList
            data={region.branches}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, selectedCount > 0 && styles.listContentWithBottomAction]}
            ListHeaderComponent={
              <View>
                <RegionHeader
                  region={region}
                  tab={tab}
                  onChangeTab={setTab}
                  branchCount={region.branches.length}
                />
                {canSendFollowUp ? (
                  <View style={styles.selectionRow}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      style={styles.primarySelectionButton}
                      onPress={selectAllBranches}
                      testID="select-all-button"
                    >
                      <Text style={styles.primarySelectionButtonText}>Select all</Text>
                    </TouchableOpacity>
                    {selectedCount > 0 ? (
                      <TouchableOpacity activeOpacity={0.75} style={styles.clearButton} onPress={clearSelection}>
                        <Text style={styles.clearButtonText}>Clear ({selectedCount})</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <BranchRow
                branch={item}
                selectable={canSendFollowUp}
                selected={selectedBranchIds.has(item.id)}
                onToggleSelect={() => toggleBranch(item.id)}
                onPress={() => navigation.navigate('BranchDetail', { branchId: item.id })}
              />
            )}
            ListEmptyComponent={<EmptyState message="No branches in this region." />}
          />
        )}

        {tab === 'branches' && selectedCount > 0 ? (
          <View style={styles.bottomActionContainer}>
            <TouchableOpacity activeOpacity={0.86} style={styles.followUpButton} onPress={goToFollowUp} testID="follow-up-cta">
              <Text style={styles.followUpButtonText}>
                Follow up with {selectedCount} branch{selectedCount === 1 ? '' : 'es'}
              </Text>
              <Text style={styles.followUpArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function RegionHeader({
  region,
  tab,
  onChangeTab,
  branchCount,
}: {
  region: RegionDetail;
  tab: Tab;
  onChangeTab: (tab: Tab) => void;
  branchCount: number;
}) {
  return (
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

      <SegmentedTabs
        tabs={[
          { key: 'leads', label: 'Leads of this region', count: region.regionLeads.length },
          { key: 'branches', label: 'Branches', count: branchCount },
        ]}
        activeKey={tab}
        onChange={(key) => onChangeTab(key as Tab)}
      />
    </View>
  );
}

function RegionLeadRow({ lead, onPress }: { lead: RegionDetailLead; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.leadCard} onPress={onPress} testID={`region-lead-row-${lead.id}`}>
      <View style={styles.leadIdentity}>
        <Text style={styles.leadName} numberOfLines={1}>
          {lead.customerName}
        </Text>
        {lead.sourceSrNo ? <Text style={styles.leadMeta}>Lead #{lead.sourceSrNo}</Text> : null}
      </View>
      <View style={styles.leadStageBadge}>
        <Text style={styles.leadStageText}>{lead.cbiPesStage.replace(/_/g, ' ')}</Text>
      </View>
      <Text style={styles.branchOpenArrow}>›</Text>
    </TouchableOpacity>
  );
}

function BranchRow({
  branch,
  selectable,
  selected,
  onToggleSelect,
  onPress,
}: {
  branch: RegionDetailBranch;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.branchCard, selected && styles.branchCardSelected]} onPress={onPress} testID={`branch-row-${branch.id}`}>
      <View style={styles.branchHeader}>
        <View style={styles.branchIdentity}>
          {selectable ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.checkbox, selected && styles.checkboxSelected]}
              onPress={onToggleSelect}
              testID={`branch-select-${branch.id}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </TouchableOpacity>
          ) : null}

          <View style={styles.branchNameContainer}>
            <Text style={styles.branchName} numberOfLines={1}>
              {branch.name}
            </Text>
            <Text style={styles.branchBm}>{branch.bm ? 'Branch Head assigned' : 'No BM assigned'}</Text>
          </View>
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
  branchCard: { backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E0E7EE', padding: 13, marginBottom: 10 },
  branchCardSelected: { borderColor: '#0B5CAB' },
  branchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  branchIdentity: { flex: 1, marginRight: 8, flexDirection: 'row', alignItems: 'center' },
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
  branchNameContainer: { flex: 1 },
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
