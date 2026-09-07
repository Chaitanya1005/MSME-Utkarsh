import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyPendingProposals, confirmProposalsBatch, rejectProposal } from '../../api/leadUpdateApi';
import { LoadingState, EmptyState, ErrorState } from '../../components/StatusStates';
import { LeadUpdateProposal } from '../../types/api';
import { STAGE_LABELS } from '../../constants/pipelineStages';

// The single confirmation screen for BOTH manual and voice-sourced
// proposals (spec section 5's unified pipeline, section 14's AI review
// UI, section 4.4's "only confirmed updates may modify the lead"). This
// is deliberately the only place a proposal ever gets confirmed —
// ProposeUpdateScreen and VoiceUpdateScreen both only ever create
// PENDING rows and then navigate here.
export function ProposalReviewScreen() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const proposalsQuery = useQuery({
    queryKey: ['proposals', 'my-branch', 'PENDING'],
    queryFn: () => fetchMyPendingProposals('PENDING'),
  });

  const confirmMutation = useMutation({
    mutationFn: (ids: string[]) => confirmProposalsBatch(ids),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['my-leads'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (proposalId: string) => rejectProposal(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
  });

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(proposals.map((p) => p.id)));
  }

  if (proposalsQuery.isLoading) {
    return <LoadingState label="Loading pending updates..." />;
  }
  if (proposalsQuery.isError) {
    return (
      <ErrorState
        message={proposalsQuery.error instanceof Error ? proposalsQuery.error.message : 'Failed to load updates.'}
        onRetry={() => proposalsQuery.refetch()}
      />
    );
  }

  const proposals = proposalsQuery.data ?? [];
  const selectedCount = selectedIds.size;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>PENDING REVIEW</Text>
            <Text style={styles.headerTitle}>Proposal Review</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{proposals.length}</Text>
          </View>
        </View>

        {proposals.length === 0 ? (
          <EmptyState message="No pending updates to review." />
        ) : (
          <FlatList
            data={proposals}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={proposalsQuery.isRefetching} onRefresh={() => proposalsQuery.refetch()} tintColor="#0B5CAB" />}
            contentContainerStyle={[styles.listContent, selectedCount > 0 && styles.listContentWithBottomAction]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <TouchableOpacity activeOpacity={0.75} style={styles.selectAllButton} onPress={selectAll} testID="select-all-button">
                <Text style={styles.selectAllButtonText}>Select all</Text>
              </TouchableOpacity>
            }
            renderItem={({ item }) => (
              <ProposalCard
                proposal={item}
                selected={selectedIds.has(item.id)}
                onToggle={() => toggle(item.id)}
                onReject={() => rejectMutation.mutate(item.id)}
              />
            )}
          />
        )}

        {confirmMutation.isError ? (
          <Text style={styles.errorText}>Some updates could not be confirmed. Check the list above and retry.</Text>
        ) : null}

        {selectedCount > 0 ? (
          <View style={styles.bottomActionContainer}>
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.confirmButton}
              onPress={() => confirmMutation.mutate(Array.from(selectedIds))}
              disabled={confirmMutation.isPending}
              testID="confirm-selected-button"
            >
              <View style={styles.confirmIcon}>
                <Text style={styles.confirmIconText}>✓</Text>
              </View>
              <Text style={styles.confirmButtonText}>
                {confirmMutation.isPending ? 'Confirming...' : `Confirm ${selectedCount} update${selectedCount === 1 ? '' : 's'}`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ProposalCard({
  proposal,
  selected,
  onToggle,
  onReject,
}: {
  proposal: LeadUpdateProposal;
  selected: boolean;
  onToggle: () => void;
  onReject: () => void;
}) {
  const isVoice = proposal.source === 'VOICE_AI';

  return (
    <View style={[styles.card, selected && styles.cardSelected]} testID={`proposal-${proposal.id}`}>
      <TouchableOpacity activeOpacity={0.85} onPress={onToggle} style={styles.cardHeader}>
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.leadName} numberOfLines={1}>
            {proposal.lead?.customerName ?? 'Lead'}
          </Text>
          <View style={[styles.sourceBadge, isVoice ? styles.sourceBadgeVoice : styles.sourceBadgeManual]}>
            <Text style={[styles.sourceBadgeText, isVoice ? styles.sourceBadgeTextVoice : styles.sourceBadgeTextManual]}>
              {isVoice ? '🎙 Voice update' : 'Manual update'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.stageChangeRow}>
        <View style={styles.stagePillMuted}>
          <Text style={styles.stagePillMutedText}>{STAGE_LABELS[proposal.previousStage] ?? proposal.previousStage}</Text>
        </View>
        <Text style={styles.stageArrow}>→</Text>
        <View style={styles.stagePillActive}>
          <Text style={styles.stagePillActiveText}>{STAGE_LABELS[proposal.proposedStage] ?? proposal.proposedStage}</Text>
        </View>
      </View>

      {proposal.remarks ? <Text style={styles.remarks}>{proposal.remarks}</Text> : null}

      <TouchableOpacity activeOpacity={0.75} style={styles.rejectLink} onPress={onReject} testID={`reject-proposal-${proposal.id}`}>
        <Text style={styles.rejectLinkText}>Reject this proposal</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8FC' },
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerEyebrow: { fontSize: 9, color: '#7B8595', fontWeight: '800', letterSpacing: 1 },
  headerTitle: { fontSize: 22, color: '#182533', fontWeight: '800', marginTop: 2 },
  countBadge: { minWidth: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF2FB', justifyContent: 'center', alignItems: 'center' },
  countBadgeText: { color: '#0B5CAB', fontSize: 15, fontWeight: '800' },
  listContent: { paddingHorizontal: 18, paddingBottom: 30 },
  listContentWithBottomAction: { paddingBottom: 110 },
  selectAllButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0B5CAB',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginBottom: 14,
  },
  selectAllButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 15,
    marginBottom: 11,
    borderWidth: 1.5,
    borderColor: '#E0E7EE',
    shadowColor: '#17324A',
    shadowOpacity: 0.045,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardSelected: { borderColor: '#0B5CAB', shadowColor: '#0B5CAB', shadowOpacity: 0.12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#AEBCC9',
    marginRight: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: { backgroundColor: '#0B5CAB', borderColor: '#0B5CAB' },
  checkboxMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  cardHeaderText: { flex: 1 },
  leadName: { fontSize: 15, fontWeight: '800', color: '#182533' },
  sourceBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  sourceBadgeVoice: { backgroundColor: '#F1E9FF' },
  sourceBadgeManual: { backgroundColor: '#F0F3F7' },
  sourceBadgeText: { fontSize: 9, fontWeight: '800' },
  sourceBadgeTextVoice: { color: '#6B3FC9' },
  sourceBadgeTextManual: { color: '#53617A' },
  stageChangeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 13 },
  stagePillMuted: { backgroundColor: '#F0F3F7', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  stagePillMutedText: { color: '#53617A', fontSize: 11, fontWeight: '700' },
  stageArrow: { color: '#8A96A2', fontSize: 14, fontWeight: '700', marginHorizontal: 8 },
  stagePillActive: { backgroundColor: '#EAF2FB', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  stagePillActiveText: { color: '#0B5CAB', fontSize: 11, fontWeight: '800' },
  remarks: { fontSize: 12, color: '#6C7A8C', marginTop: 10, lineHeight: 17 },
  rejectLink: { marginTop: 11, alignSelf: 'flex-start' },
  rejectLinkText: { fontSize: 12, color: '#C2183A', fontWeight: '700' },
  errorText: { color: '#C2183A', fontSize: 12, textAlign: 'center', marginHorizontal: 18, marginBottom: 8, fontWeight: '600' },
  bottomActionContainer: { position: 'absolute', left: 18, right: 18, bottom: 14 },
  confirmButton: {
    minHeight: 58,
    borderRadius: 17,
    backgroundColor: '#16845A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#0F5C3C',
    shadowOpacity: 0.28,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  confirmIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  confirmIconText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  confirmButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
