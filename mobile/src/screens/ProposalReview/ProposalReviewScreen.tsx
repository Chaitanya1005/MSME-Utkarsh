import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyBranchProposals, confirmProposalsBatch, rejectProposal } from '../../api/leadUpdateApi';
import { LoadingState, EmptyState, ErrorState } from '../../components/StatusStates';
import { LeadUpdateProposal } from '../../types/api';

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
    queryFn: () => fetchMyBranchProposals('PENDING'),
  });

  const confirmMutation = useMutation({
    mutationFn: (ids: string[]) => confirmProposalsBatch(ids),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
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

  return (
    <View style={styles.container}>
      {proposals.length === 0 ? (
        <EmptyState message="No pending updates to review." />
      ) : (
        <FlatList
          data={proposals}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={proposalsQuery.isRefetching} onRefresh={() => proposalsQuery.refetch()} />}
          contentContainerStyle={styles.listContent}
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

      {selectedIds.size > 0 ? (
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => confirmMutation.mutate(Array.from(selectedIds))}
          disabled={confirmMutation.isPending}
          testID="confirm-selected-button"
        >
          <Text style={styles.confirmButtonText}>
            {confirmMutation.isPending ? 'Confirming...' : `Confirm Selected Updates (${selectedIds.size})`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
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
  return (
    <View style={[styles.card, selected && styles.cardSelected]} testID={`proposal-${proposal.id}`}>
      <TouchableOpacity onPress={onToggle} style={styles.cardHeader}>
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.leadName}>{proposal.lead?.customerName ?? 'Lead'}</Text>
          <Text style={styles.sourceLabel}>{proposal.source === 'VOICE_AI' ? 'Voice update' : 'Manual update'}</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.stageChange}>
        {proposal.previousStage} → {proposal.proposedStage}
      </Text>
      {proposal.remarks ? <Text style={styles.remarks}>{proposal.remarks}</Text> : null}
      <TouchableOpacity style={styles.rejectLink} onPress={onReject} testID={`reject-proposal-${proposal.id}`}>
        <Text style={styles.rejectLinkText}>Reject this proposal</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9', padding: 16 },
  listContent: { paddingBottom: 90 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: '#1E7A34' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#1E7A34',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#1E7A34' },
  checkboxMark: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  cardHeaderText: { flex: 1 },
  leadName: { fontSize: 14, fontWeight: '600', color: '#111111' },
  sourceLabel: { fontSize: 11, color: '#888888', marginTop: 1 },
  stageChange: { fontSize: 13, fontWeight: '600', color: '#0B3D91', marginTop: 8 },
  remarks: { fontSize: 12, color: '#666666', marginTop: 4 },
  rejectLink: { marginTop: 8 },
  rejectLinkText: { fontSize: 12, color: '#B00020' },
  errorText: { color: '#B00020', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  confirmButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#1E7A34',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
