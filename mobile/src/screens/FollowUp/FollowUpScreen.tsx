import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  confirmWhatsAppSent,
  createFollowUp,
  fetchFollowUpCandidates,
} from '../../api/followUpApi';

import { initiateCall } from '../../api/callingApi';
import { fetchBranch } from '../../api/orgApi';

import {
  CreateFollowUpResult,
  FollowUpCandidate,
  FollowUpChannel,
  FollowUpTargetResult,
} from '../../types/api';

import { ApiError } from '../../api/client';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'FollowUp'>;

type ChannelMode = FollowUpChannel | 'CALL';
type CandidateLevel = 'zones' | 'regions' | 'branches';

const LEVEL_ORDER: CandidateLevel[] = ['zones', 'regions', 'branches'];
const LEVEL_LABEL: Record<CandidateLevel, string> = {
  zones: 'Zones',
  regions: 'Regions',
  branches: 'Branches',
};

const CHANNELS: Array<{
  value: ChannelMode;
  label: string;
  icon: string;
}> = [
  {
    value: 'WHATSAPP',
    label: 'WhatsApp',
    icon: 'W',
  },
  {
    value: 'EMAIL',
    label: 'Email',
    icon: '@',
  },
  {
    value: 'CALL',
    label: 'Call',
    icon: '↗',
  },
];

interface Recipient {
  id: string;
  name: string;
}

export function FollowUpScreen({
  route,
  navigation,
}: Props) {
  const params = route.params;
  const branchMode = !!params && 'branchIds' in params;
  const branchIds = branchMode ? params.branchIds : [];

  const queryClient = useQueryClient();

  // Non-branch flow: either the caller already resolved recipients (ZM/GM
  // dashboards) or nothing was preselected and this screen resolves them
  // itself via the role-driven level toggle (Full-Hierarchy Expansion
  // plan, Phase 4). Branch mode never uses this — it resolves recipients
  // from branch records at submit time instead, so the Call feature keeps
  // working against real branch ids exactly as before.
  const [pickedRecipients, setPickedRecipients] = useState<Recipient[]>(
    !branchMode && params && 'recipients' in params ? params.recipients : [],
  );

  const needsSelector = !branchMode && pickedRecipients.length === 0;

  const [selectedLevel, setSelectedLevel] = useState<CandidateLevel | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

  const candidatesQuery = useQuery({
    queryKey: ['follow-up-candidates'],
    queryFn: fetchFollowUpCandidates,
    enabled: needsSelector,
  });

  const availableLevels: CandidateLevel[] = candidatesQuery.data
    ? LEVEL_ORDER.filter((level) => candidatesQuery.data![level] !== undefined)
    : [];

  useEffect(() => {
    if (needsSelector && selectedLevel === null && availableLevels.length > 0) {
      setSelectedLevel(availableLevels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSelector, availableLevels.join(',')]);

  const currentCandidates: FollowUpCandidate[] =
    selectedLevel && candidatesQuery.data ? candidatesQuery.data[selectedLevel] ?? [] : [];

  function toggleCandidate(id: string) {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllCandidates() {
    setSelectedCandidateIds(new Set(currentCandidates.filter((c) => c.recipientUserId).map((c) => c.id)));
  }

  function changeLevel(level: CandidateLevel) {
    setSelectedLevel(level);
    setSelectedCandidateIds(new Set());
  }

  function confirmSelection() {
    const resolved = currentCandidates
      .filter((c) => selectedCandidateIds.has(c.id) && c.recipientUserId)
      .map((c) => ({ id: c.recipientUserId as string, name: c.recipientName ?? c.name }));
    if (resolved.length === 0) return;
    setPickedRecipients(resolved);
  }

  const recipients: Recipient[] = pickedRecipients;
  const recipientCount = branchMode ? branchIds.length : recipients.length;

  const [channel, setChannel] =
    useState<ChannelMode>('WHATSAPP');

  const [customNote, setCustomNote] = useState('');

  const [result, setResult] =
    useState<CreateFollowUpResult | null>(null);

  const [callStatuses, setCallStatuses] = useState<
    Record<string, 'IDLE' | 'CALLING' | 'STARTED' | 'FAILED'>
  >({});

  /*
   * Fetch selected branch details only for CALL mode (branch flow only —
   * Call operates on real branch records, not a generic recipient).
   */
  const selectedBranchesQuery = useQuery({
    queryKey: ['follow-up', 'selected-branches', branchIds],
    queryFn: async () => {
      const branches = await Promise.all(
        branchIds.map((branchId) =>
          fetchBranch(branchId),
        ),
      );

      return branches;
    },
    enabled: branchMode && channel === 'CALL',
  });

  /*
   * Existing WhatsApp / Email send mutation, generalized to resolve
   * recipientUserIds from whichever mode is active.
   */
  const sendMutation = useMutation({
    mutationFn: async () => {
      let recipientUserIds: string[];
      if (branchMode) {
        const branches = await Promise.all(branchIds.map((id) => fetchBranch(id)));
        recipientUserIds = branches.filter((b) => b.bm).map((b) => b.bm!.id);
      } else {
        recipientUserIds = recipients.map((r) => r.id);
      }

      return createFollowUp({
        recipientUserIds,
        channel: channel as FollowUpChannel,
        customNote:
          customNote || undefined,
      });
    },

    onSuccess: (data) => {
      setResult(data);

      queryClient.invalidateQueries({
        queryKey: ['dashboard'],
      });
    },
  });

  /*
   * Existing call provider flow (branch mode only).
   *
   * Calls are started branch-by-branch so the RM can see
   * exactly what happened to every selected branch.
   */
  const callMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBranchesQuery.data) {
        throw new Error(
          'Selected branch information is not available.',
        );
      }

      const outcomes: Array<{
        branchId: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const branch of selectedBranchesQuery.data) {
        setCallStatuses((current) => ({
          ...current,
          [branch.id]: 'CALLING',
        }));

        try {
          await initiateCall(branch.id);

          setCallStatuses((current) => ({
            ...current,
            [branch.id]: 'STARTED',
          }));

          outcomes.push({
            branchId: branch.id,
            success: true,
          });
        } catch (error) {
          setCallStatuses((current) => ({
            ...current,
            [branch.id]: 'FAILED',
          }));

          outcomes.push({
            branchId: branch.id,
            success: false,
            error:
              error instanceof ApiError
                ? error.message
                : 'Could not start the call.',
          });
        }
      }

      return outcomes;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calls', 'rm'],
      });
    },
  });

  async function openWhatsApp(
    target: FollowUpTargetResult,
  ) {
    if (!target.whatsAppDeepLinkUrl) {
      return;
    }

    try {
      await Linking.openURL(
        target.whatsAppDeepLinkUrl,
      );
    } catch {
      return;
    }

    try {
      await confirmWhatsAppSent(target.id);

      setResult((current) =>
        current
          ? {
              ...current,
              targets: current.targets.map(
                (t) =>
                  t.id === target.id
                    ? {
                        ...t,
                        status: 'SENT',
                      }
                    : t,
              ),
            }
          : current,
      );

      queryClient.invalidateQueries({
        queryKey: ['dashboard'],
      });
    } catch {
      // Follow-up remains pending.
    }
  }

  /*
   * ============================================================
   * RESULT SCREEN — WHATSAPP / EMAIL
   * ============================================================
   */

  if (result) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.resultContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successHero}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>
              ✓
            </Text>
          </View>

          <Text style={styles.successTitle}>
            Follow-up initiated
          </Text>

          <Text style={styles.successSubtitle}>
            {
              result.targets.filter(
                (t) => t.status !== 'FAILED',
              ).length
            }{' '}
            of {result.targets.length} recipient
            {result.targets.length > 1 ? 's' : ''}{' '}
            reached
          </Text>
        </View>

        <Text style={styles.resultSectionTitle}>
          Delivery status
        </Text>

        {result.targets.map((target) => (
          <View
            key={target.id}
            style={styles.resultRow}
          >
            <View style={styles.resultRowHeader}>
              <View style={styles.resultBranchIdentity}>
                <View style={styles.resultBranchIcon}>
                  <Text style={styles.resultBranchIconText}>
                    B
                  </Text>
                </View>

                <Text
                  style={styles.resultBranchName}
                  numberOfLines={1}
                >
                  {target.recipientLabel}
                </Text>
              </View>

              <StatusBadge
                status={target.status}
              />
            </View>

            {target.failureReason ? (
              <Text style={styles.failureReason}>
                {target.failureReason}
              </Text>
            ) : null}

            {target.status === 'PENDING' &&
            target.whatsAppDeepLinkUrl ? (
              <TouchableOpacity
                style={styles.openWhatsAppButton}
                onPress={() =>
                  openWhatsApp(target)
                }
                testID={`open-whatsapp-${target.id}`}
                activeOpacity={0.84}
              >
                <Text
                  style={
                    styles.openWhatsAppButtonText
                  }
                >
                  Open WhatsApp to send
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.popToTop()}
          activeOpacity={0.84}
        >
          <Text style={styles.doneButtonText}>
            Back to dashboard
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  /*
   * ============================================================
   * SELECTOR SCREEN — role-driven level toggle + multi-select
   * (only reached when nothing was preselected on the dashboard)
   * ============================================================
   */

  if (needsSelector) {
    if (candidatesQuery.isLoading) {
      return (
        <View style={styles.selectorLoading}>
          <ActivityIndicator size="large" color="#0B5CAB" />
        </View>
      );
    }

    if (candidatesQuery.isError || !selectedLevel) {
      return (
        <View style={styles.selectorLoading}>
          <Text style={styles.errorText}>
            {candidatesQuery.error instanceof ApiError
              ? candidatesQuery.error.message
              : 'Could not load who you can follow up with.'}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroEyebrowRow}>
            <View style={styles.heroAccent} />
            <Text style={styles.heroEyebrow}>MSME - UTKARSH</Text>
          </View>

          <Text style={styles.title}>Who do you want to follow up with?</Text>
          <Text style={styles.subtitle}>Choose a level, then select who should receive it.</Text>
        </View>

        {availableLevels.length > 1 ? (
          <View style={styles.levelToggle}>
            {availableLevels.map((level) => {
              const selected = selectedLevel === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[styles.levelOption, selected && styles.levelOptionSelected]}
                  onPress={() => changeLevel(level)}
                  activeOpacity={0.82}
                  testID={`follow-up-level-${level}`}
                >
                  <Text style={[styles.levelOptionText, selected && styles.levelOptionTextSelected]}>
                    {LEVEL_LABEL[level]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <View style={styles.selectionRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.primarySelectionButton}
            onPress={selectAllCandidates}
            testID="select-all-candidates-button"
          >
            <Text style={styles.primarySelectionButtonText}>Select all</Text>
          </TouchableOpacity>

          {selectedCandidateIds.size > 0 ? (
            <TouchableOpacity activeOpacity={0.75} style={styles.clearButton} onPress={() => setSelectedCandidateIds(new Set())}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.candidateListCard}>
          {currentCandidates.length === 0 ? (
            <Text style={styles.emptyCandidatesText}>Nothing available at this level.</Text>
          ) : (
            currentCandidates.map((candidate, index) => {
              const disabled = !candidate.recipientUserId;
              const selected = selectedCandidateIds.has(candidate.id);

              return (
                <TouchableOpacity
                  key={candidate.id}
                  activeOpacity={disabled ? 1 : 0.8}
                  disabled={disabled}
                  style={[
                    styles.candidateRow,
                    index === currentCandidates.length - 1 && styles.candidateRowLast,
                    disabled && styles.candidateRowDisabled,
                  ]}
                  onPress={() => toggleCandidate(candidate.id)}
                  testID={`candidate-select-${candidate.id}`}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>

                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {candidate.name}
                    </Text>
                    <Text style={styles.candidateSubtext} numberOfLines={1}>
                      {candidate.recipientName ? `Head: ${candidate.recipientName}` : 'No head assigned yet'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={[styles.sendButton, selectedCandidateIds.size === 0 && styles.actionButtonDisabled]}
          onPress={confirmSelection}
          disabled={selectedCandidateIds.size === 0}
          testID="confirm-selection-button"
          activeOpacity={0.84}
        >
          <Text style={styles.sendButtonText}>
            Continue with {selectedCandidateIds.size} selected
          </Text>
          <Text style={styles.sendButtonArrow}>→</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpace} />
      </ScrollView>
    );
  }

  /*
   * ============================================================
   * MAIN SCREEN
   * ============================================================
   */

  const selectedBranches =
    selectedBranchesQuery.data ?? [];

  const channelOptions = branchMode ? CHANNELS : CHANNELS.filter((c) => c.value !== 'CALL');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ========================================================
          HERO
      ======================================================== */}

      <View style={styles.hero}>
        <View style={styles.heroEyebrowRow}>
          <View style={styles.heroAccent} />

          <Text style={styles.heroEyebrow}>
            MSME - UTKARSH
          </Text>
        </View>

        <Text style={styles.title}>
          Follow up with {recipientCount} {branchMode ? 'branch' : 'recipient'}
          {recipientCount > 1 ? (branchMode ? 'es' : 's') : ''}
        </Text>

        <Text style={styles.subtitle}>
          Choose how you want to reach {branchMode ? 'the selected branches' : 'the selected recipients'}.
        </Text>
      </View>

      {/* ========================================================
          RECIPIENTS (non-branch modes only)
      ======================================================== */}

      {!branchMode ? (
        <View style={styles.recipientsCard}>
          {recipients.map((r, index) => (
            <View key={r.id} style={[styles.recipientRow, index === recipients.length - 1 && styles.recipientRowLast]}>
              <View style={styles.recipientAvatar}>
                <Text style={styles.recipientAvatarText}>{r.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.recipientName} numberOfLines={1}>
                {r.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* ========================================================
          CHANNEL
      ======================================================== */}

      <Text style={styles.sectionLabel}>
        Choose channel
      </Text>

      <View style={styles.channelCard}>
        {channelOptions.map((item) => {
          const selected =
            channel === item.value;

          return (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.channelOption,
                selected &&
                  styles.channelOptionSelected,
                item.value === 'CALL' &&
                  selected &&
                  styles.channelOptionCallSelected,
              ]}
              onPress={() =>
                setChannel(item.value)
              }
              activeOpacity={0.82}
              testID={`channel-${item.value}`}
            >
              <View
                style={[
                  styles.channelIcon,
                  selected &&
                    styles.channelIconSelected,
                  item.value === 'CALL' &&
                    selected &&
                    styles.channelIconCallSelected,
                ]}
              >
                <Text
                  style={[
                    styles.channelIconText,
                    selected &&
                      styles.channelIconTextSelected,
                  ]}
                >
                  {item.icon}
                </Text>
              </View>

              <Text
                style={[
                  styles.channelOptionText,
                  selected &&
                    styles.channelOptionTextSelected,
                ]}
              >
                {item.label}
              </Text>

              {selected ? (
                <View
                  style={styles.channelCheck}
                >
                  <Text
                    style={styles.channelCheckText}
                  >
                    ✓
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ========================================================
          CALL MODE
      ======================================================== */}

      {channel === 'CALL' ? (
        <>
          <View style={styles.callSectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Selected branches
              </Text>

              <Text style={styles.sectionSubtitle}>
                These branches will be contacted.
              </Text>
            </View>

            <View style={styles.branchCountBadge}>
              <Text style={styles.branchCountValue}>
                {branchIds.length}
              </Text>

              <Text style={styles.branchCountLabel}>
                {branchIds.length === 1
                  ? 'BRANCH'
                  : 'BRANCHES'}
              </Text>
            </View>
          </View>

          {selectedBranchesQuery.isLoading ? (
            <View
              style={styles.loadingCard}
            >
              <ActivityIndicator
                size="small"
                color="#0B5CAB"
              />

              <Text
                style={styles.loadingText}
              >
                Loading selected branches...
              </Text>
            </View>
          ) : selectedBranchesQuery.isError ? (
            <View
              style={styles.callErrorCard}
            >
              <Text
                style={styles.callErrorTitle}
              >
                Couldn't load branches
              </Text>

              <Text
                style={styles.callErrorText}
              >
                Please go back and select the
                branches again.
              </Text>
            </View>
          ) : (
            <View style={styles.selectedBranchesCard}>
              {selectedBranches.map(
                (branch, index) => {
                  const status =
                    callStatuses[branch.id] ??
                    'IDLE';

                  return (
                    <View
                      key={branch.id}
                      style={[
                        styles.selectedBranchRow,
                        index ===
                          selectedBranches.length -
                            1 &&
                          styles.selectedBranchRowLast,
                      ]}
                    >
                      <View
                        style={
                          styles.selectedBranchAvatar
                        }
                      >
                        <Text
                          style={
                            styles.selectedBranchAvatarText
                          }
                        >
                          {branch.name
                            .replace(
                              /^Branch\s+/i,
                              '',
                            )
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.selectedBranchInfo
                        }
                      >
                        <Text
                          style={
                            styles.selectedBranchName
                          }
                          numberOfLines={1}
                        >
                          {branch.name}
                        </Text>

                        {branch.bm ? (
                          <Text
                            style={
                              styles.selectedBranchManager
                            }
                            numberOfLines={1}
                          >
                            BM: {branch.bm.name}
                          </Text>
                        ) : (
                          <Text
                            style={
                              styles.selectedBranchManager
                            }
                          >
                            Branch Manager unavailable
                          </Text>
                        )}
                      </View>

                      <CallStatus
                        status={status}
                      />
                    </View>
                  );
                },
              )}
            </View>
          )}

          {callMutation.isError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {callMutation.error instanceof
                ApiError
                  ? callMutation.error.message
                  : 'One or more calls could not be started. Please try again.'}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.callButton,
              (callMutation.isPending ||
                selectedBranches.length === 0 ||
                selectedBranchesQuery.isLoading) &&
                styles.actionButtonDisabled,
            ]}
            onPress={() =>
              callMutation.mutate()
            }
            disabled={
              callMutation.isPending ||
              selectedBranches.length === 0 ||
              selectedBranchesQuery.isLoading
            }
            activeOpacity={0.84}
            testID="call-selected-branches-button"
          >
            {callMutation.isPending ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <View
                  style={styles.callButtonIcon}
                >
                  <Text
                    style={
                      styles.callButtonIconText
                    }
                  >
                    ↗
                  </Text>
                </View>

                <Text
                  style={styles.callButtonText}
                >
                  Call selected branches
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* ====================================================
              MESSAGE MODE
          ===================================================== */}

          <Text style={styles.sectionLabel}>
            Message preview
          </Text>

          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View
                style={styles.previewChannelIcon}
              >
                <Text
                  style={
                    styles.previewChannelIconText
                  }
                >
                  {channel === 'WHATSAPP'
                    ? 'W'
                    : '@'}
                </Text>
              </View>

              <View>
                <Text
                  style={styles.previewHeaderTitle}
                >
                  {channel === 'WHATSAPP'
                    ? 'WhatsApp message'
                    : 'Email message'}
                </Text>

                <Text
                  style={
                    styles.previewHeaderSubtitle
                  }
                >
                  Sent to selected recipients
                </Text>
              </View>
            </View>

            <View
              style={styles.previewDivider}
            />

            <Text style={styles.previewText}>
              MSME Utkarsh Follow-Up Request —
              Central Bank of India
              {'\n\n'}
              Please review and update your
              lead pipeline at your
              earliest convenience.
              {'\n\n'}
              A secure access link will be included
              automatically.
            </Text>
          </View>

          {/* ====================================================
              NOTE
          ===================================================== */}

          <View style={styles.noteHeader}>
            <Text style={styles.sectionLabel}>
              Add a note
            </Text>

            <Text style={styles.optionalText}>
              OPTIONAL
            </Text>
          </View>

          <TextInput
            style={styles.noteInput}
            value={customNote}
            onChangeText={setCustomNote}
            placeholder="e.g. Please prioritize leads pending sanction"
            placeholderTextColor="#9AA5AF"
            multiline
            maxLength={300}
            textAlignVertical="top"
            testID="custom-note-input"
          />

          <Text style={styles.charCount}>
            {customNote.length}/300
          </Text>

          {sendMutation.isError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {sendMutation.error instanceof
                ApiError
                  ? sendMutation.error.message
                  : 'Could not initiate the follow-up. Please try again.'}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.sendButton,
              sendMutation.isPending &&
                styles.actionButtonDisabled,
            ]}
            onPress={() =>
              sendMutation.mutate()
            }
            disabled={sendMutation.isPending}
            testID="send-follow-up-button"
            activeOpacity={0.84}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <Text
                  style={styles.sendButtonText}
                >
                  {channel === 'WHATSAPP'
                    ? 'Send WhatsApp follow-up'
                    : 'Send email follow-up'}
                </Text>

                <Text
                  style={styles.sendButtonArrow}
                >
                  →
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

/* ================================================================
   STATUS BADGE
================================================================ */

function StatusBadge({
  status,
}: {
  status: 'PENDING' | 'SENT' | 'FAILED';
}) {
  const config = {
    PENDING: {
      bg: '#FFF6DF',
      fg: '#9A7118',
      label: 'Awaiting send',
    },
    SENT: {
      bg: '#EAF8F1',
      fg: '#16845A',
      label: 'Sent',
    },
    FAILED: {
      bg: '#FDECEE',
      fg: '#B4233D',
      label: 'Failed',
    },
  }[status];

  return (
    <View
      style={[
        styles.statusPill,
        {
          backgroundColor: config.bg,
        },
      ]}
    >
      <Text
        style={[
          styles.statusPillText,
          {
            color: config.fg,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

/* ================================================================
   CALL STATUS
================================================================ */

function CallStatus({
  status,
}: {
  status:
    | 'IDLE'
    | 'CALLING'
    | 'STARTED'
    | 'FAILED';
}) {
  if (status === 'CALLING') {
    return (
      <View style={styles.callingStatus}>
        <ActivityIndicator
          size="small"
          color="#0B5CAB"
        />
      </View>
    );
  }

  if (status === 'STARTED') {
    return (
      <View style={styles.startedStatus}>
        <Text style={styles.startedStatusText}>
          ✓
        </Text>
      </View>
    );
  }

  if (status === 'FAILED') {
    return (
      <View style={styles.failedStatus}>
        <Text style={styles.failedStatusText}>
          !
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.readyStatus}>
      <Text style={styles.readyStatusText}>
        Ready
      </Text>
    </View>
  );
}

/* ================================================================
   STYLES
================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F8FC',
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 36,
  },

  resultContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 36,
  },

  selectorLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F8FC',
  },

  /* =============================================================
     HERO
  ============================================================= */

  hero: {
    marginBottom: 22,
  },

  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',

    marginBottom: 8,
  },

  heroAccent: {
    width: 22,
    height: 3,

    borderRadius: 2,

    backgroundColor: '#D71955',

    marginRight: 7,
  },

  heroEyebrow: {
    color: '#0B5CAB',

    fontSize: 8,
    fontWeight: '800',

    letterSpacing: 1,
  },

  title: {
    color: '#182533',

    fontSize: 24,
    fontWeight: '800',

    letterSpacing: -0.5,

    marginBottom: 5,
  },

  subtitle: {
    color: '#7A8794',

    fontSize: 11,

    lineHeight: 16,

    maxWidth: 330,
  },

  /* =============================================================
     LEVEL TOGGLE
  ============================================================= */

  levelToggle: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE6EE',
    borderRadius: 13,
    padding: 4,
    marginBottom: 16,
  },

  levelOption: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  levelOptionSelected: {
    backgroundColor: '#0B5CAB',
  },

  levelOptionText: {
    color: '#5E6A76',
    fontSize: 12,
    fontWeight: '700',
  },

  levelOptionTextSelected: {
    color: '#FFFFFF',
  },

  /* =============================================================
     RECIPIENTS (non-branch)
  ============================================================= */

  recipientsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE6EE',
    borderRadius: 16,
    paddingHorizontal: 13,
    marginBottom: 22,
  },

  recipientRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F5',
  },

  recipientRowLast: {
    borderBottomWidth: 0,
  },

  recipientAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EAF2FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  recipientAvatarText: {
    color: '#0B5CAB',
    fontSize: 12,
    fontWeight: '800',
  },

  recipientName: {
    color: '#24313E',
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
  },

  /* =============================================================
     CANDIDATE SELECTION
  ============================================================= */

  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  primarySelectionButton: {
    backgroundColor: '#0B5CAB',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 7,
  },

  primarySelectionButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  clearButton: {
    paddingHorizontal: 7,
    paddingVertical: 8,
  },

  clearButtonText: {
    color: '#7A8794',
    fontSize: 11,
    fontWeight: '700',
  },

  candidateListCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE6EE',
    borderRadius: 16,
    paddingHorizontal: 13,
    marginBottom: 20,
  },

  emptyCandidatesText: {
    color: '#8A96A2',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 20,
  },

  candidateRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F5',
  },

  candidateRowLast: {
    borderBottomWidth: 0,
  },

  candidateRowDisabled: {
    opacity: 0.45,
  },

  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#AEBCC9',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  checkboxSelected: {
    backgroundColor: '#0B5CAB',
    borderColor: '#0B5CAB',
  },

  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  candidateInfo: {
    flex: 1,
  },

  candidateName: {
    color: '#1D2A37',
    fontSize: 13,
    fontWeight: '800',
  },

  candidateSubtext: {
    color: '#7B8793',
    fontSize: 10,
    marginTop: 2,
  },

  /* =============================================================
     SECTIONS
  ============================================================= */

  sectionLabel: {
    color: '#24313E',

    fontSize: 13,
    fontWeight: '800',

    marginBottom: 9,
  },

  sectionTitle: {
    color: '#182533',

    fontSize: 18,
    fontWeight: '800',

    letterSpacing: -0.2,
  },

  sectionSubtitle: {
    color: '#7A8794',

    fontSize: 10,

    marginTop: 3,
  },

  /* =============================================================
     CHANNELS
  ============================================================= */

  channelCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 15,

    padding: 5,

    marginBottom: 22,

    flexDirection: 'row',
  },

  channelOption: {
    flex: 1,

    minHeight: 64,

    borderRadius: 11,

    alignItems: 'center',
    justifyContent: 'center',

    position: 'relative',

    paddingVertical: 7,
  },

  channelOptionSelected: {
    backgroundColor: '#EAF2FB',
  },

  channelOptionCallSelected: {
    backgroundColor: '#EAF8F1',
  },

  channelIcon: {
    width: 25,
    height: 25,

    borderRadius: 8,

    backgroundColor: '#F0F3F7',

    alignItems: 'center',
    justifyContent: 'center',

    marginBottom: 4,
  },

  channelIconSelected: {
    backgroundColor: '#0B5CAB',
  },

  channelIconCallSelected: {
    backgroundColor: '#16845A',
  },

  channelIconText: {
    color: '#7C8995',

    fontSize: 11,
    fontWeight: '800',
  },

  channelIconTextSelected: {
    color: '#FFFFFF',
  },

  channelOptionText: {
    color: '#5E6A76',

    fontSize: 10,
    fontWeight: '700',
  },

  channelOptionTextSelected: {
    color: '#0B5CAB',
  },

  channelCheck: {
    position: 'absolute',

    right: 7,
    top: 7,

    width: 15,
    height: 15,

    borderRadius: 7.5,

    backgroundColor: '#0B5CAB',

    alignItems: 'center',
    justifyContent: 'center',
  },

  channelCheckText: {
    color: '#FFFFFF',

    fontSize: 9,
    fontWeight: '800',
  },

  /* =============================================================
     CALL MODE
  ============================================================= */

  callSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginBottom: 10,
  },

  branchCountBadge: {
    minWidth: 50,

    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#BFD5EA',

    borderRadius: 11,

    alignItems: 'center',

    paddingVertical: 6,
    paddingHorizontal: 8,
  },

  branchCountValue: {
    color: '#0B5CAB',

    fontSize: 16,
    fontWeight: '800',
  },

  branchCountLabel: {
    color: '#8A96A2',

    fontSize: 6.5,
    fontWeight: '800',

    letterSpacing: 0.5,
  },

  selectedBranchesCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 16,

    paddingHorizontal: 13,

    marginBottom: 16,
  },

  selectedBranchRow: {
    minHeight: 69,

    flexDirection: 'row',
    alignItems: 'center',

    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F5',
  },

  selectedBranchRowLast: {
    borderBottomWidth: 0,
  },

  selectedBranchAvatar: {
    width: 39,
    height: 39,

    borderRadius: 12,

    backgroundColor: '#EAF2FB',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 10,
  },

  selectedBranchAvatarText: {
    color: '#0B5CAB',

    fontSize: 14,
    fontWeight: '800',
  },

  selectedBranchInfo: {
    flex: 1,

    marginRight: 8,
  },

  selectedBranchName: {
    color: '#24313E',

    fontSize: 12.5,
    fontWeight: '800',
  },

  selectedBranchManager: {
    color: '#84909B',

    fontSize: 9,

    marginTop: 3,
  },

  readyStatus: {
    backgroundColor: '#F1F4F7',

    borderRadius: 8,

    paddingHorizontal: 7,
    paddingVertical: 5,
  },

  readyStatusText: {
    color: '#7B8792',

    fontSize: 7.5,
    fontWeight: '700',
  },

  callingStatus: {
    width: 28,
    height: 28,

    borderRadius: 9,

    backgroundColor: '#EAF2FB',

    alignItems: 'center',
    justifyContent: 'center',
  },

  startedStatus: {
    width: 28,
    height: 28,

    borderRadius: 9,

    backgroundColor: '#EAF8F1',

    alignItems: 'center',
    justifyContent: 'center',
  },

  startedStatusText: {
    color: '#16845A',

    fontSize: 13,
    fontWeight: '800',
  },

  failedStatus: {
    width: 28,
    height: 28,

    borderRadius: 9,

    backgroundColor: '#FDECEE',

    alignItems: 'center',
    justifyContent: 'center',
  },

  failedStatusText: {
    color: '#B4233D',

    fontSize: 13,
    fontWeight: '800',
  },

  loadingCard: {
    minHeight: 100,

    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    marginBottom: 16,
  },

  loadingText: {
    color: '#7C8995',

    fontSize: 10,

    marginTop: 8,
  },

  callErrorCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#E5B8C1',

    borderRadius: 15,

    padding: 15,

    marginBottom: 16,
  },

  callErrorTitle: {
    color: '#A4233B',

    fontSize: 12,
    fontWeight: '800',
  },

  callErrorText: {
    color: '#8A5A63',

    fontSize: 10,

    marginTop: 4,
  },

  callButton: {
    minHeight: 54,

    backgroundColor: '#16845A',

    borderRadius: 15,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#126344',
    shadowOpacity: 0.16,
    shadowRadius: 9,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 4,

    marginBottom: 12,
  },

  callButtonIcon: {
    width: 30,
    height: 30,

    borderRadius: 9,

    backgroundColor: 'rgba(255,255,255,0.15)',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 9,
  },

  callButtonIconText: {
    color: '#FFFFFF',

    fontSize: 15,
    fontWeight: '800',
  },

  callButtonText: {
    color: '#FFFFFF',

    fontSize: 13,
    fontWeight: '800',
  },

  /* =============================================================
     PREVIEW
  ============================================================= */

  previewCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 16,

    padding: 15,

    marginBottom: 22,
  },

  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  previewChannelIcon: {
    width: 35,
    height: 35,

    borderRadius: 11,

    backgroundColor: '#EAF2FB',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 10,
  },

  previewChannelIconText: {
    color: '#0B5CAB',

    fontSize: 14,
    fontWeight: '800',
  },

  previewHeaderTitle: {
    color: '#273542',

    fontSize: 11,
    fontWeight: '800',
  },

  previewHeaderSubtitle: {
    color: '#8A96A1',

    fontSize: 8,

    marginTop: 2,
  },

  previewDivider: {
    height: 1,

    backgroundColor: '#EEF2F5',

    marginVertical: 12,
  },

  previewText: {
    color: '#4A5661',

    fontSize: 11,

    lineHeight: 18,
  },

  /* =============================================================
     NOTE
  ============================================================= */

  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  optionalText: {
    color: '#9AA5AF',

    fontSize: 7,
    fontWeight: '800',

    letterSpacing: 0.6,

    marginBottom: 9,
  },

  noteInput: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#CCD8E3',

    borderRadius: 14,

    paddingHorizontal: 13,
    paddingVertical: 12,

    fontSize: 11,

    minHeight: 82,

    color: '#263440',
  },

  charCount: {
    color: '#8F9AA5',

    fontSize: 8,

    textAlign: 'right',

    marginTop: 4,
    marginBottom: 3,
  },

  /* =============================================================
     ACTION BUTTON
  ============================================================= */

  sendButton: {
    minHeight: 54,

    backgroundColor: '#0B5CAB',

    borderRadius: 15,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#0B3D72',
    shadowOpacity: 0.16,
    shadowRadius: 9,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 4,

    marginTop: 17,
  },

  sendButtonText: {
    color: '#FFFFFF',

    fontSize: 13,
    fontWeight: '800',
  },

  sendButtonArrow: {
    color: '#FFFFFF',

    fontSize: 20,
    fontWeight: '300',

    marginLeft: 9,
  },

  actionButtonDisabled: {
    opacity: 0.55,
  },

  /* =============================================================
     ERRORS
  ============================================================= */

  errorBox: {
    backgroundColor: '#FDECEE',

    borderWidth: 1,
    borderColor: '#F0C5CD',

    borderRadius: 11,

    paddingHorizontal: 11,
    paddingVertical: 9,

    marginTop: 9,
  },

  errorText: {
    color: '#A4233B',

    fontSize: 9,

    textAlign: 'center',
  },

  /* =============================================================
     RESULT
  ============================================================= */

  successHero: {
    backgroundColor: '#0B5CAB',

    borderRadius: 20,

    padding: 20,

    alignItems: 'center',

    marginBottom: 22,
  },

  successIcon: {
    width: 46,
    height: 46,

    borderRadius: 15,

    backgroundColor: 'rgba(255,255,255,0.14)',

    alignItems: 'center',
    justifyContent: 'center',

    marginBottom: 10,
  },

  successIconText: {
    color: '#FFFFFF',

    fontSize: 22,
    fontWeight: '800',
  },

  successTitle: {
    color: '#FFFFFF',

    fontSize: 19,
    fontWeight: '800',
  },

  successSubtitle: {
    color: 'rgba(255,255,255,0.7)',

    fontSize: 10,

    marginTop: 4,
  },

  resultSectionTitle: {
    color: '#182533',

    fontSize: 17,
    fontWeight: '800',

    marginBottom: 10,
  },

  resultRow: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 15,

    padding: 13,

    marginBottom: 10,
  },

  resultRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  resultBranchIdentity: {
    flexDirection: 'row',
    alignItems: 'center',

    flex: 1,

    marginRight: 8,
  },

  resultBranchIcon: {
    width: 35,
    height: 35,

    borderRadius: 11,

    backgroundColor: '#EAF2FB',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 9,
  },

  resultBranchIconText: {
    color: '#0B5CAB',

    fontSize: 12,
    fontWeight: '800',
  },

  resultBranchName: {
    color: '#273542',

    fontSize: 12,
    fontWeight: '800',

    flex: 1,
  },

  statusPill: {
    borderRadius: 9,

    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  statusPillText: {
    fontSize: 7.5,

    fontWeight: '800',
  },

  failureReason: {
    color: '#B4233D',

    fontSize: 9,

    marginTop: 7,
  },

  openWhatsAppButton: {
    marginTop: 10,

    backgroundColor: '#16845A',

    borderRadius: 9,

    paddingVertical: 9,

    alignItems: 'center',
  },

  openWhatsAppButtonText: {
    color: '#FFFFFF',

    fontSize: 9,

    fontWeight: '800',
  },

  doneButton: {
    marginTop: 7,

    borderWidth: 1,
    borderColor: '#0B5CAB',

    borderRadius: 12,

    paddingVertical: 12,

    alignItems: 'center',
  },

  doneButtonText: {
    color: '#0B5CAB',

    fontSize: 11,

    fontWeight: '800',
  },

  bottomSpace: {
    height: 15,
  },
});
