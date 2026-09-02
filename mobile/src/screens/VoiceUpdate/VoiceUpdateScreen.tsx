import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  transcribeAudio,
  extractFromTranscript,
  createProposalsFromSession,
} from '../../api/voiceUpdateApi';
import { fetchLeads } from '../../api/orgApi';
import { useVoiceRecorder } from './useVoiceRecorder';
import { ExtractedCandidate, PipelineStage } from '../../types/api';
import { ApiError } from '../../api/client';
import { BMStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<BMStackParamList, 'VoiceUpdate'>;

const STAGES: PipelineStage[] = [
  'INTERESTED',
  'CONTACTED',
  'APPLICATION',
  'APPROVAL',
  'CONVERSION',
];

interface ResolvedCandidate {
  index: number;
  candidate: ExtractedCandidate;
  leadId: string | null;
  stage: PipelineStage | null;
  accepted: boolean;
}

export function VoiceUpdateScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const recorder = useVoiceRecorder();

  const [transcript, setTranscript] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedCandidate[]>([]);

  const leadsQuery = useQuery({
    queryKey: ['leads', 'my-branch-for-voice'],
    queryFn: () => fetchLeads({ pageSize: 100 }),
  });

  const leadNameById = useMemo(() => {
    const map = new Map<string, string>();

    for (const lead of leadsQuery.data?.items ?? []) {
      map.set(lead.id, lead.customerName);
    }

    return map;
  }, [leadsQuery.data]);

  const transcribeMutation = useMutation({
    mutationFn: async () => {
      const recording = await recorder.stopRecording();

      if (!recording) {
        throw new Error('No recording was captured. Please try again.');
      }

      return transcribeAudio(recording.base64, recording.mimeType);
    },

    onSuccess: (data) => {
      setTranscript(data.transcript);
    },
  });

  const extractMutation = useMutation({
    mutationFn: () => extractFromTranscript(transcript ?? ''),

    onSuccess: (data) => {
      setSessionId(data.sessionId);

      setResolved(
        data.candidates.map((candidate, index) => ({
          index,
          candidate,
          leadId: candidate.matchedLeadId,
          stage: candidate.proposedStage,
          accepted: candidate.ambiguityReason === null,
        })),
      );
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!sessionId) {
        throw new Error('No active voice session');
      }

      const items = resolved
        .filter((r) => r.accepted && r.leadId && r.stage)
        .map((r) => ({
          leadId: r.leadId as string,
          proposedStage: r.stage as PipelineStage,
          remarks: r.candidate.remarks,
        }));

      return createProposalsFromSession(sessionId, items);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['proposals', 'my-branch'],
      });

      navigation.navigate('ProposalReview');
    },
  });

  function updateResolved(
    index: number,
    changes: Partial<ResolvedCandidate>,
  ) {
    setResolved((prev) =>
      prev.map((r) =>
        r.index === index
          ? { ...r, ...changes }
          : r,
      ),
    );
  }

  const acceptableCount = resolved.filter(
    (r) => r.accepted && r.leadId && r.stage,
  ).length;

  /*
   * REVIEW STATE
   */
  if (sessionId) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.reviewHeader}>
          <View style={styles.reviewIcon}>
            <Text style={styles.reviewIconText}>✓</Text>
          </View>

          <View style={styles.reviewHeaderText}>
            <Text style={styles.title}>Review your update</Text>
            <Text style={styles.subtitle}>
              Check what the system understood before anything is saved.
            </Text>
          </View>
        </View>

        <View style={styles.reviewInfoCard}>
          <View style={styles.reviewInfoIcon}>
            <Text style={styles.reviewInfoIconText}>i</Text>
          </View>

          <View style={styles.reviewInfoContent}>
            <Text style={styles.reviewInfoTitle}>
              Nothing has been saved yet
            </Text>

            <Text style={styles.reviewInfoText}>
              Review each lead below. You can change the proposed stage,
              resolve an ambiguous lead, or reject an update.
            </Text>
          </View>
        </View>

        {resolved.map((r) => (
          <CandidateCard
            key={r.index}
            resolved={r}
            leadNameById={leadNameById}
            onChange={(changes) =>
              updateResolved(r.index, changes)
            }
          />
        ))}

        {submitMutation.isError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>!</Text>

            <Text style={styles.errorText}>
              {submitMutation.error instanceof ApiError
                ? submitMutation.error.message
                : 'Could not create proposals from this session.'}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            acceptableCount === 0 && styles.buttonDisabled,
          ]}
          onPress={() => submitMutation.mutate()}
          disabled={
            acceptableCount === 0 ||
            submitMutation.isPending
          }
          activeOpacity={0.85}
          testID="create-proposals-from-voice-button"
        >
          <Text style={styles.primaryButtonText}>
            {submitMutation.isPending
              ? 'Creating proposals...'
              : `Create ${acceptableCount} pending proposal${
                  acceptableCount === 1 ? '' : 's'
                }`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  /*
   * RECORDING STATE
   */
  const isRecording = recorder.isRecording;
  const isProcessing = transcribeMutation.isPending;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* INTRO */}
      <View style={styles.introSection}>
        <View style={styles.titleRow}>
          <View style={styles.titleAccent} />

          <View style={styles.titleBlock}>
            <Text style={styles.title}>Voice Update</Text>

            <Text style={styles.subtitle}>
              Update one or multiple leads using a single voice recording.
            </Text>
          </View>
        </View>
      </View>

      {/* RECORDING CARD */}
      <View
        style={[
          styles.recordCard,
          isRecording && styles.recordCardRecording,
        ]}
      >
        <View style={styles.recordCardTop}>
          <View>
            <Text style={styles.recordCardEyebrow}>
              {isRecording
                ? 'RECORDING IN PROGRESS'
                : isProcessing
                  ? 'PROCESSING RECORDING'
                  : 'VOICE INPUT'}
            </Text>

            <Text style={styles.recordCardTitle}>
              {isRecording
                ? 'Listening...'
                : isProcessing
                  ? 'Processing your update'
                  : 'Speak naturally'}
            </Text>
          </View>

          <View
            style={[
              styles.statusDot,
              isRecording && styles.statusDotRecording,
            ]}
          />
        </View>

        <View style={styles.microphoneArea}>
          <View
            style={[
              styles.microphoneOuter,
              isRecording && styles.microphoneOuterRecording,
            ]}
          >
            <View
              style={[
                styles.microphoneMiddle,
                isRecording && styles.microphoneMiddleRecording,
              ]}
            >
              <Text style={styles.microphoneIcon}>
                {isRecording ? '■' : '●'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.recordCardBottom}>
          <Text style={styles.recordHint}>
            {isRecording
              ? `Recording • ${recorder.durationSeconds.toFixed(0)}s`
              : isProcessing
                ? 'Converting your voice into an update...'
                : 'Mention the lead number and the new stage'}
          </Text>

          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.stopButton,
              isProcessing && styles.processingButton,
            ]}
            onPress={() =>
              isRecording
                ? transcribeMutation.mutate()
                : recorder.startRecording()
            }
            disabled={isProcessing}
            activeOpacity={0.85}
            testID={
              isRecording
                ? 'stop-recording-button'
                : 'start-recording-button'
            }
          >
            <View style={styles.recordButtonIcon}>
              <Text style={styles.recordButtonIconText}>
                {isRecording ? '■' : '●'}
              </Text>
            </View>

            <Text style={styles.recordButtonText}>
              {isProcessing
                ? 'Processing...'
                : isRecording
                  ? 'Stop recording'
                  : 'Start recording'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* PERMISSION ERROR */}
      {recorder.permissionError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>!</Text>

          <Text style={styles.errorText}>
            {recorder.permissionError}
          </Text>
        </View>
      ) : null}

      {/* IMPORTANT INSTRUCTIONS */}
      {!transcript ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Before you record
            </Text>

            <Text style={styles.sectionSubtitle}>
              Follow these simple rules for the most reliable update.
            </Text>
          </View>

          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <View style={styles.warningIcon}>
                <Text style={styles.warningIconText}>!</Text>
              </View>

              <View style={styles.warningHeaderText}>
                <Text style={styles.warningTitle}>
                  For best results
                </Text>

                <Text style={styles.warningSubtitle}>
                  Keep each lead update clear and separate.
                </Text>
              </View>
            </View>

            <View style={styles.warningRules}>
              <InstructionRow
                number="1"
                text="Say the lead number first."
              />

              <InstructionRow
                number="2"
                text="Mention the new stage clearly."
              />

              <InstructionRow
                number="3"
                text="Use one lead update per sentence."
              />
            </View>
          </View>

          {/* IDEAL TEST SCRIPT */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Try this example
            </Text>

            <Text style={styles.sectionSubtitle}>
              This is an ideal format for testing the voice update.
            </Text>
          </View>

          <View style={styles.scriptCard}>
            <View style={styles.scriptHeader}>
              <View style={styles.scriptIcon}>
                <Text style={styles.scriptIconText}>“</Text>
              </View>

              <View>
                <Text style={styles.scriptTitle}>
                  Recommended test script
                </Text>

                <Text style={styles.scriptMeta}>
                  Say it naturally, without rushing
                </Text>
              </View>
            </View>

            <Text style={styles.scriptText}>
              “Lead 1001 interested hai. Lead 1002 ko contact
              kar liya hai. Lead 1003 ki application bhej di hai.
              Lead 1004 approval mein hai. Lead 1005 convert ho
              gaya hai.”
            </Text>

            <View style={styles.scriptFooter}>
              <Text style={styles.scriptFooterIcon}>✓</Text>

              <Text style={styles.scriptFooterText}>
                Multiple leads can be updated in one recording.
              </Text>
            </View>
          </View>
        </>
      ) : null}

      {/* TRANSCRIPT */}
      {transcript ? (
        <View style={styles.transcriptCard}>
          <View style={styles.transcriptHeader}>
            <View>
              <Text style={styles.transcriptEyebrow}>
                TRANSCRIPTION COMPLETE
              </Text>

              <Text style={styles.transcriptTitle}>
                Here's what was heard
              </Text>
            </View>

            <View style={styles.transcriptCheck}>
              <Text style={styles.transcriptCheckText}>✓</Text>
            </View>
          </View>

          <Text style={styles.transcriptText}>
            {transcript}
          </Text>

          <TouchableOpacity
            style={styles.rerecordButton}
            onPress={() => {
              setTranscript(null);
              setSessionId(null);
              setResolved([]);
            }}
            activeOpacity={0.7}
            testID="re-record-button"
          >
            <Text style={styles.rerecordButtonText}>
              Record again
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* TRANSCRIPTION ERROR */}
      {transcribeMutation.isError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>!</Text>

          <Text style={styles.errorText}>
            {transcribeMutation.error instanceof ApiError
              ? transcribeMutation.error.message
              : 'Could not process this recording. Please try again.'}
          </Text>
        </View>
      ) : null}

      {/* EXTRACTION ERROR */}
      {extractMutation.isError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>!</Text>

          <Text style={styles.errorText}>
            {extractMutation.error instanceof ApiError
              ? extractMutation.error.message
              : 'Could not process this update.'}
          </Text>
        </View>
      ) : null}

      {/* EXTRACT */}
      {transcript ? (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => extractMutation.mutate()}
          disabled={extractMutation.isPending}
          activeOpacity={0.85}
          testID="extract-transcript-button"
        >
          <Text style={styles.primaryButtonText}>
            {extractMutation.isPending
              ? 'Understanding update...'
              : 'Review extracted updates'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function InstructionRow({
  number,
  text,
}: {
  number: string;
  text: string;
}) {
  return (
    <View style={styles.instructionRow}>
      <View style={styles.instructionNumber}>
        <Text style={styles.instructionNumberText}>
          {number}
        </Text>
      </View>

      <Text style={styles.instructionText}>{text}</Text>
    </View>
  );
}

function CandidateCard({
  resolved,
  leadNameById,
  onChange,
}: {
  resolved: ResolvedCandidate;
  leadNameById: Map<string, string>;
  onChange: (changes: Partial<ResolvedCandidate>) => void;
}) {
  const { candidate } = resolved;

  return (
    <View
      style={styles.candidateCard}
      testID={`candidate-${resolved.index}`}
    >
      <View style={styles.candidateHeader}>
        <View style={styles.candidateNumber}>
          <Text style={styles.candidateNumberText}>
            {resolved.index + 1}
          </Text>
        </View>

        <Text style={styles.candidateLabel}>
          VOICE STATEMENT
        </Text>
      </View>

      <Text style={styles.candidateClause}>
        “{candidate.rawClause}”
      </Text>

      {candidate.ambiguityReason === 'NO_LEAD_MATCH' ? (
        <View style={styles.ambiguityCard}>
          <Text style={styles.ambiguityIcon}>!</Text>

          <Text style={styles.ambiguityText}>
            {candidate.spokenLeadNumber
              ? `Lead ${candidate.spokenLeadNumber} was not found in this branch.`
              : 'Could not identify a lead in this branch matching this statement.'}
          </Text>
        </View>
      ) : candidate.ambiguityReason === 'MULTIPLE_LEAD_MATCH' ? (
        <View>
          <Text style={styles.ambiguityText}>
            Multiple leads match this statement. Select one:
          </Text>

          <View style={styles.chipRow}>
            {candidate.candidateLeadIds.map((id) => (
              <TouchableOpacity
                key={id}
                style={[
                  styles.chip,
                  resolved.leadId === id &&
                    styles.chipSelected,
                ]}
                onPress={() =>
                  onChange({
                    leadId: id,
                    accepted: true,
                  })
                }
                activeOpacity={0.75}
                testID={`resolve-lead-${resolved.index}-${id}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    resolved.leadId === id &&
                      styles.chipTextSelected,
                  ]}
                >
                  {leadNameById.get(id) ?? id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.matchedLeadCard}>
          <Text style={styles.matchedLeadLabel}>
            MATCHED LEAD
          </Text>

          <Text style={styles.candidateLead}>
            {candidate.spokenLeadNumber
              ? `Lead ${candidate.spokenLeadNumber}`
              : candidate.matchedLeadName}

            {candidate.spokenLeadNumber &&
            candidate.matchedLeadName
              ? ` — ${candidate.matchedLeadName}`
              : ''}
          </Text>
        </View>
      )}

      {resolved.leadId &&
      candidate.ambiguityReason !== 'NO_LEAD_MATCH' ? (
        <>
          <Text style={styles.stageLabel}>
            Proposed stage
          </Text>

          <View style={styles.chipRow}>
            {STAGES.map((stage) => (
              <TouchableOpacity
                key={stage}
                style={[
                  styles.chip,
                  resolved.stage === stage &&
                    styles.chipSelected,
                ]}
                onPress={() =>
                  onChange({
                    stage,
                    accepted: true,
                  })
                }
                activeOpacity={0.75}
                testID={`resolve-stage-${resolved.index}-${stage}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    resolved.stage === stage &&
                      styles.chipTextSelected,
                  ]}
                >
                  {stage}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.remarksBox}>
            <Text style={styles.remarksLabel}>
              REMARKS
            </Text>

            <Text style={styles.remarksPreview}>
              {candidate.remarks}
            </Text>
          </View>

          <View style={styles.acceptRow}>
            <TouchableOpacity
              style={[
                styles.acceptButton,
                resolved.accepted &&
                  styles.acceptButtonActive,
              ]}
              onPress={() =>
                onChange({ accepted: true })
              }
              activeOpacity={0.8}
              testID={`accept-${resolved.index}`}
            >
              <Text
                style={[
                  styles.acceptButtonText,
                  resolved.accepted &&
                    styles.acceptButtonTextActive,
                ]}
              >
                Accept
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.rejectButton,
                !resolved.accepted &&
                  styles.rejectButtonActive,
              ]}
              onPress={() =>
                onChange({ accepted: false })
              }
              activeOpacity={0.8}
              testID={`reject-${resolved.index}`}
            >
              <Text
                style={[
                  styles.rejectButtonText,
                  !resolved.accepted &&
                    styles.rejectButtonTextActive,
                ]}
              >
                Reject
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F9',
  },

  content: {
    padding: 20,
    paddingBottom: 44,
  },

  introSection: {
    marginBottom: 18,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  titleAccent: {
    width: 4,
    height: 48,
    borderRadius: 4,
    backgroundColor: '#174A96',
    marginRight: 12,
    marginTop: 2,
  },

  titleBlock: {
    flex: 1,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#101828',
    letterSpacing: -0.4,
  },

  subtitle: {
    fontSize: 14,
    color: '#667085',
    lineHeight: 20,
    marginTop: 4,
  },

  /* RECORD CARD */

  recordCard: {
    backgroundColor: '#123F8C',
    borderRadius: 22,
    padding: 20,
    overflow: 'hidden',
    marginBottom: 22,

    shadowColor: '#123F8C',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 7,
  },

  recordCardRecording: {
    backgroundColor: '#173A75',
  },

  recordCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  recordCardEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#BFD3F5',
  },

  recordCardTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7BA8EA',
    marginTop: 4,
  },

  statusDotRecording: {
    backgroundColor: '#FF5C5C',
  },

  microphoneArea: {
    height: 145,
    alignItems: 'center',
    justifyContent: 'center',
  },

  microphoneOuter: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#2858A3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5D83C2',
  },

  microphoneOuterRecording: {
    backgroundColor: '#513E58',
    borderColor: '#D36B75',
  },

  microphoneMiddle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  microphoneMiddleRecording: {
    backgroundColor: '#FFF4F4',
  },

  microphoneIcon: {
    fontSize: 28,
    color: '#174A96',
    fontWeight: '700',
  },

  recordCardBottom: {
    alignItems: 'center',
  },

  recordHint: {
    color: '#D7E4F8',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },

  recordButton: {
    width: '100%',
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stopButton: {
    backgroundColor: '#FFF1F2',
  },

  processingButton: {
    opacity: 0.72,
  },

  recordButtonIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8EFFA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  recordButtonIconText: {
    color: '#174A96',
    fontSize: 11,
    fontWeight: '700',
  },

  recordButtonText: {
    color: '#123F8C',
    fontSize: 15,
    fontWeight: '700',
  },

  /* SECTION */

  sectionHeader: {
    marginBottom: 10,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#101828',
  },

  sectionSubtitle: {
    fontSize: 12,
    color: '#667085',
    marginTop: 2,
    lineHeight: 18,
  },

  /* WARNING */

  warningCard: {
    backgroundColor: '#FFF9EB',
    borderWidth: 1,
    borderColor: '#F4C95D',
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
  },

  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  warningIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8C84A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  warningIconText: {
    color: '#5F4300',
    fontSize: 20,
    fontWeight: '800',
  },

  warningHeaderText: {
    flex: 1,
  },

  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#513A00',
  },

  warningSubtitle: {
    fontSize: 12,
    color: '#725B21',
    marginTop: 2,
  },

  warningRules: {
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#F0D98C',
  },

  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },

  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E5C76B',
  },

  instructionNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#725B21',
  },

  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#493B18',
    fontWeight: '600',
  },

  /* SCRIPT */

  scriptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },

  scriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },

  scriptIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF0FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  scriptIconText: {
    fontSize: 22,
    color: '#174A96',
    fontWeight: '700',
  },

  scriptTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#101828',
  },

  scriptMeta: {
    fontSize: 11,
    color: '#98A2B3',
    marginTop: 2,
  },

  scriptText: {
    backgroundColor: '#F6F8FB',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#344054',
    lineHeight: 22,
    fontStyle: 'italic',
  },

  scriptFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },

  scriptFooterIcon: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#E7F6EC',
    color: '#21874A',
    textAlign: 'center',
    lineHeight: 19,
    fontSize: 11,
    fontWeight: '700',
    marginRight: 7,
  },

  scriptFooterText: {
    fontSize: 11,
    color: '#667085',
  },

  /* TRANSCRIPT */

  transcriptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D7E3F5',
    marginBottom: 4,
  },

  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },

  transcriptEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#174A96',
  },

  transcriptTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
    marginTop: 3,
  },

  transcriptCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E7F6EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  transcriptCheckText: {
    color: '#21874A',
    fontSize: 16,
    fontWeight: '800',
  },

  transcriptText: {
    fontSize: 14,
    color: '#344054',
    lineHeight: 21,
    backgroundColor: '#F6F8FB',
    padding: 13,
    borderRadius: 11,
  },

  rerecordButton: {
    marginTop: 13,
    alignSelf: 'flex-start',
  },

  rerecordButtonText: {
    color: '#174A96',
    fontSize: 13,
    fontWeight: '700',
  },

  /* PRIMARY */

  primaryButton: {
    backgroundColor: '#174A96',
    borderRadius: 13,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    shadowColor: '#174A96',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  buttonDisabled: {
    backgroundColor: '#A8B8D1',
    shadowOpacity: 0,
    elevation: 0,
  },

  /* ERRORS */

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#F4B4BB',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  errorIcon: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: '#C6283D',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 23,
    fontWeight: '800',
    marginRight: 9,
  },

  errorText: {
    flex: 1,
    color: '#9F1C30',
    fontSize: 12,
    lineHeight: 17,
  },

  /* REVIEW */

  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  reviewIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E7F6EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  reviewIconText: {
    color: '#21874A',
    fontSize: 20,
    fontWeight: '800',
  },

  reviewHeaderText: {
    flex: 1,
  },

  reviewInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#EEF4FD',
    borderWidth: 1,
    borderColor: '#D4E2F6',
    borderRadius: 14,
    padding: 13,
    marginBottom: 16,
  },

  reviewInfoIcon: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#D8E6FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  reviewInfoIconText: {
    color: '#174A96',
    fontWeight: '800',
  },

  reviewInfoContent: {
    flex: 1,
  },

  reviewInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#174A96',
  },

  reviewInfoText: {
    fontSize: 11,
    color: '#53657F',
    lineHeight: 17,
    marginTop: 2,
  },

  candidateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },

  candidateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },

  candidateNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EAF0FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  candidateNumberText: {
    color: '#174A96',
    fontSize: 11,
    fontWeight: '800',
  },

  candidateLabel: {
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
    color: '#98A2B3',
  },

  candidateClause: {
    fontSize: 13,
    color: '#475467',
    lineHeight: 19,
    fontStyle: 'italic',
    marginBottom: 11,
  },

  matchedLeadCard: {
    backgroundColor: '#F6F8FB',
    borderRadius: 10,
    padding: 11,
  },

  matchedLeadLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: '700',
    color: '#98A2B3',
    marginBottom: 3,
  },

  candidateLead: {
    fontSize: 14,
    fontWeight: '700',
    color: '#101828',
  },

  ambiguityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderRadius: 10,
    padding: 10,
  },

  ambiguityIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C6283D',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '800',
    marginRight: 8,
  },

  ambiguityText: {
    flex: 1,
    fontSize: 12,
    color: '#9F1C30',
    lineHeight: 17,
  },

  stageLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475467',
    marginTop: 13,
    marginBottom: 3,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },

  chip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
  },

  chipSelected: {
    borderColor: '#174A96',
    backgroundColor: '#EAF0FB',
  },

  chipText: {
    fontSize: 11,
    color: '#475467',
    fontWeight: '600',
  },

  chipTextSelected: {
    color: '#174A96',
    fontWeight: '700',
  },

  remarksBox: {
    backgroundColor: '#F8F9FB',
    borderRadius: 9,
    padding: 10,
    marginTop: 8,
  },

  remarksLabel: {
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: '700',
    color: '#98A2B3',
    marginBottom: 3,
  },

  remarksPreview: {
    fontSize: 12,
    color: '#667085',
    lineHeight: 17,
  },

  acceptRow: {
    flexDirection: 'row',
    marginTop: 12,
  },

  acceptButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2E8B57',
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
    marginRight: 6,
  },

  acceptButtonActive: {
    backgroundColor: '#21874A',
  },

  acceptButtonText: {
    color: '#21874A',
    fontSize: 12,
    fontWeight: '700',
  },

  acceptButtonTextActive: {
    color: '#FFFFFF',
  },

  rejectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#C6283D',
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
    marginLeft: 6,
  },

  rejectButtonActive: {
    backgroundColor: '#C6283D',
  },

  rejectButtonText: {
    color: '#C6283D',
    fontSize: 12,
    fontWeight: '700',
  },

  rejectButtonTextActive: {
    color: '#FFFFFF',
  },
});