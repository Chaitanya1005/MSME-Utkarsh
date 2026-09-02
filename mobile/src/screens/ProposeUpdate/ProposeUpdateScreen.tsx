import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createManualProposal, confirmProposal } from '../../api/leadUpdateApi';
import { PipelineStage } from '../../types/api';
import { ApiError } from '../../api/client';
import { BMStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<BMStackParamList, 'ProposeUpdate'>;

const STAGES: PipelineStage[] = ['INTERESTED', 'CONTACTED', 'APPLICATION', 'APPROVAL', 'CONVERSION'];

// Spec Phase 3 section 4.4 (review before persistence) + Phase 5 section 3
// (no separate "Review Updates" detour): the BM still sees an explicit
// review step showing current -> proposed before anything is written,
// but confirming here creates AND immediately confirms the proposal in
// one action — no second screen, no re-finding the update later. Two
// backend calls happen in sequence (create, then confirm) so the
// underlying proposal/confirmation architecture Phase 4's voice flow
// depends on is untouched; only this screen's own navigation changed.
export function ProposeUpdateScreen({ route, navigation }: Props) {
  const { leadId, currentStage } = route.params;
  const queryClient = useQueryClient();

  const [proposedStage, setProposedStage] = useState<PipelineStage>(currentStage);
  const [remarks, setRemarks] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const proposal = await createManualProposal(leadId, proposedStage, remarks || undefined);
      await confirmProposal(proposal.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'detail', leadId] });
      queryClient.invalidateQueries({ queryKey: ['activity', 'lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads', 'my-branch'] });
      navigation.goBack();
    },
  });

  if (reviewing) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Review your proposed update</Text>
        <View style={styles.reviewCard}>
          <Text style={styles.reviewLine}>
            Current stage: <Text style={styles.reviewValue}>{currentStage}</Text>
          </Text>
          <Text style={styles.reviewLine}>
            Proposed stage: <Text style={styles.reviewValue}>{proposedStage}</Text>
          </Text>
          {remarks ? (
            <Text style={styles.reviewLine}>
              Remarks: <Text style={styles.reviewValue}>{remarks}</Text>
            </Text>
          ) : null}
        </View>
        <Text style={styles.reviewNote}>Confirming will update the lead immediately.</Text>

        {mutation.isError ? (
          <Text style={styles.errorText}>
            {mutation.error instanceof ApiError ? mutation.error.message : 'Could not save this update.'}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, mutation.isPending && styles.buttonDisabled]}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending}
          testID="create-proposal-button"
        >
          <Text style={styles.primaryButtonText}>{mutation.isPending ? 'Confirming...' : 'Confirm update'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setReviewing(false)}>
          <Text style={styles.secondaryButtonText}>Back to edit</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Propose an update</Text>
      <Text style={styles.sectionLabel}>Current stage: {currentStage}</Text>

      <Text style={styles.sectionLabel}>New stage</Text>
      <View style={styles.stageGrid}>
        {STAGES.map((stage) => (
          <TouchableOpacity
            key={stage}
            style={[styles.stageOption, proposedStage === stage && styles.stageOptionSelected]}
            onPress={() => setProposedStage(stage)}
            testID={`stage-option-${stage}`}
          >
            <Text style={[styles.stageOptionText, proposedStage === stage && styles.stageOptionTextSelected]}>
              {stage}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Remarks</Text>
      <TextInput
        style={styles.remarksInput}
        value={remarks}
        onChangeText={setRemarks}
        placeholder="e.g. Documents received, awaiting sanction"
        multiline
        maxLength={500}
        testID="remarks-input"
      />

      <TouchableOpacity style={styles.primaryButton} onPress={() => setReviewing(true)} testID="review-proposal-button">
        <Text style={styles.primaryButtonText}>Review proposed update</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9', padding: 16 },
  content: { paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '700', color: '#111111', marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#333333', marginTop: 16, marginBottom: 8 },
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  stageOption: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  stageOptionSelected: { borderColor: '#0B3D91', backgroundColor: '#E8EEFB' },
  stageOptionText: { fontSize: 12, color: '#333333' },
  stageOptionTextSelected: { color: '#0B3D91', fontWeight: '600' },
  remarksInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  primaryButton: { backgroundColor: '#0B3D91', borderRadius: 8, paddingVertical: 14, marginTop: 24, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  buttonDisabled: { backgroundColor: '#9AAFD9' },
  secondaryButton: { paddingVertical: 12, marginTop: 8, alignItems: 'center' },
  secondaryButtonText: { color: '#0B3D91', fontSize: 13 },
  reviewCard: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 16, marginTop: 12 },
  reviewLine: { fontSize: 13, color: '#444444', marginTop: 4 },
  reviewValue: { fontWeight: '600', color: '#111111' },
  reviewNote: { fontSize: 12, color: '#888888', marginTop: 12, fontStyle: 'italic' },
  errorText: { color: '#B00020', fontSize: 13, marginTop: 16, textAlign: 'center' },
});
