import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createManualProposal, confirmProposal } from '../../api/leadUpdateApi';
import { PipelineStage } from '../../types/api';
import { ApiError } from '../../api/client';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { STAGE_ORDER as STAGES, STAGE_LABELS } from '../../constants/pipelineStages';

type Props = NativeStackScreenProps<RootStackParamList, 'ProposeUpdate'>;

// Spec Phase 3 section 4.4 (review before persistence) + Phase 5 section 3
// (no separate "Review Updates" detour): the proposer still sees an
// explicit review step showing current -> proposed before anything is
// written, but confirming here creates AND immediately confirms the
// proposal in one action — no second screen, no re-finding the update
// later. Two backend calls happen in sequence (create, then confirm) so
// the underlying proposal/confirmation architecture the voice flow
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
      queryClient.invalidateQueries({ queryKey: ['my-leads'] });
      navigation.goBack();
    },
  });

  if (reviewing) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity activeOpacity={0.75} style={styles.backButton} onPress={() => setReviewing(false)}>
              <Text style={styles.backArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Review update</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.reviewCard}>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>CURRENT STAGE</Text>
                <View style={styles.stagePillMuted}>
                  <Text style={styles.stagePillMutedText}>{STAGE_LABELS[currentStage] ?? currentStage}</Text>
                </View>
              </View>

              <View style={styles.reviewArrowRow}>
                <View style={styles.reviewArrowLine} />
                <Text style={styles.reviewArrowIcon}>↓</Text>
                <View style={styles.reviewArrowLine} />
              </View>

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>PROPOSED STAGE</Text>
                <View style={styles.stagePillActive}>
                  <Text style={styles.stagePillActiveText}>{STAGE_LABELS[proposedStage] ?? proposedStage}</Text>
                </View>
              </View>

              {remarks ? (
                <View style={styles.remarksReview}>
                  <Text style={styles.reviewLabel}>REMARKS</Text>
                  <Text style={styles.remarksReviewText}>{remarks}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.noteBanner}>
              <Text style={styles.noteBannerText}>Confirming will update the lead immediately.</Text>
            </View>

            {mutation.isError ? (
              <Text style={styles.errorText}>
                {mutation.error instanceof ApiError ? mutation.error.message : 'Could not save this update.'}
              </Text>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.primaryButton, mutation.isPending && styles.buttonDisabled]}
              onPress={() => mutation.mutate()}
              disabled={mutation.isPending}
              testID="create-proposal-button"
            >
              <Text style={styles.primaryButtonText}>{mutation.isPending ? 'Confirming...' : 'Confirm update'}</Text>
              {!mutation.isPending ? <Text style={styles.primaryButtonArrow}>→</Text> : null}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.75} style={styles.secondaryButton} onPress={() => setReviewing(false)}>
              <Text style={styles.secondaryButtonText}>Back to edit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.75} style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Propose an update</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.currentStageCard}>
            <Text style={styles.reviewLabel}>CURRENT STAGE</Text>
            <View style={styles.stagePillMuted}>
              <Text style={styles.stagePillMutedText}>{STAGE_LABELS[currentStage] ?? currentStage}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>New stage</Text>
          <View style={styles.stageGrid}>
            {STAGES.map((stage) => (
              <TouchableOpacity
                key={stage}
                activeOpacity={0.8}
                style={[styles.stageOption, proposedStage === stage && styles.stageOptionSelected]}
                onPress={() => setProposedStage(stage)}
                testID={`stage-option-${stage}`}
              >
                <Text style={[styles.stageOptionText, proposedStage === stage && styles.stageOptionTextSelected]}>
                  {STAGE_LABELS[stage]}
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
            placeholderTextColor="#9AA6B2"
            multiline
            maxLength={500}
            testID="remarks-input"
          />

          <TouchableOpacity activeOpacity={0.88} style={styles.primaryButton} onPress={() => setReviewing(true)} testID="review-proposal-button">
            <Text style={styles.primaryButtonText}>Review proposed update</Text>
            <Text style={styles.primaryButtonArrow}>→</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8FC' },
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE7F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#0B355E',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backArrow: { fontSize: 22, color: '#0B5CAB', fontWeight: '700', marginTop: -2 },
  headerTitle: { fontSize: 19, fontWeight: '800', color: '#182533' },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  currentStageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    padding: 15,
    marginBottom: 20,
  },
  reviewLabel: { fontSize: 9, fontWeight: '800', color: '#8A96A2', letterSpacing: 0.8, marginBottom: 8 },
  stagePillMuted: { alignSelf: 'flex-start', backgroundColor: '#F0F3F7', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 },
  stagePillMutedText: { color: '#53617A', fontSize: 12, fontWeight: '700' },
  stagePillActive: { alignSelf: 'flex-start', backgroundColor: '#EAF2FB', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 },
  stagePillActiveText: { color: '#0B5CAB', fontSize: 12, fontWeight: '800' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#182533', marginTop: 4, marginBottom: 10 },
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  stageOption: {
    borderWidth: 1.5,
    borderColor: '#DCE7F1',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 9,
    backgroundColor: '#FFFFFF',
  },
  stageOptionSelected: { borderColor: '#0B5CAB', backgroundColor: '#0B5CAB' },
  stageOptionText: { fontSize: 12, color: '#53617A', fontWeight: '700' },
  stageOptionTextSelected: { color: '#FFFFFF' },
  remarksInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE7F1',
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    color: '#182533',
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#0B5CAB',
    borderRadius: 17,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#0B3D72',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  primaryButtonArrow: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginLeft: 8 },
  buttonDisabled: { backgroundColor: '#9FB8DA', shadowOpacity: 0 },
  secondaryButton: { paddingVertical: 14, marginTop: 6, alignItems: 'center' },
  secondaryButtonText: { color: '#0B5CAB', fontSize: 13, fontWeight: '700' },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    padding: 18,
    marginTop: 8,
  },
  reviewRow: {},
  reviewArrowRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  reviewArrowLine: { flex: 1, height: 1, backgroundColor: '#E4EAF0' },
  reviewArrowIcon: { color: '#0B5CAB', fontSize: 16, fontWeight: '800', marginHorizontal: 10 },
  remarksReview: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#EEF1F4' },
  remarksReviewText: { fontSize: 13, color: '#3D4C5E', lineHeight: 19 },
  noteBanner: { backgroundColor: '#FFF8EA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginTop: 16 },
  noteBannerText: { color: '#946800', fontSize: 12, fontWeight: '600' },
  errorText: { color: '#C2183A', fontSize: 13, marginTop: 16, textAlign: 'center', fontWeight: '600' },
});
