import React, { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchBranch, fetchLeads } from '../../api/orgApi';
import { initiateCall } from '../../api/callingApi';
import {
  LoadingState,
  EmptyState,
  ErrorState,
} from '../../components/StatusStates';
import { ApiError } from '../../api/client';
import { Lead, PipelineStage } from '../../types/api';
import { RMStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RMStackParamList, 'BranchDetail'>;

const STAGE_ORDER: PipelineStage[] = [
  'INTERESTED',
  'CONTACTED',
  'APPLICATION',
  'APPROVAL',
  'CONVERSION',
];

/*
 * Pipeline colour system:
 *
 * Interested  -> Blue
 * Contacted   -> Yellow
 * Application -> Yellow
 * Approval    -> Yellow
 * Conversion  -> Green
 */
const STAGE_META: Record<
  PipelineStage,
  {
    short: string;
    color: string;
    background: string;
  }
> = {
  INTERESTED: {
    short: 'Interested',
    color: '#0B5CAB',
    background: '#EAF2FB',
  },

  CONTACTED: {
    short: 'Contacted',
    color: '#B7791F',
    background: '#FFF7E3',
  },

  APPLICATION: {
    short: 'Application',
    color: '#B7791F',
    background: '#FFF7E3',
  },

  APPROVAL: {
    short: 'Approval',
    color: '#B7791F',
    background: '#FFF7E3',
  },

  CONVERSION: {
    short: 'Conversion',
    color: '#16845A',
    background: '#ECF8F1',
  },
};

export function BranchDetailScreen({
  route,
  navigation,
}: Props) {
  const { branchId } = route.params;

  const queryClient = useQueryClient();

  const [callError, setCallError] = useState<string | null>(null);

  const branchQuery = useQuery({
    queryKey: ['org', 'branch', branchId],
    queryFn: () => fetchBranch(branchId),
  });

  const leadsQuery = useQuery({
    queryKey: ['leads', 'branch', branchId],
    queryFn: () => fetchLeads({ branchId, pageSize: 100 }),
  });

  const callMutation = useMutation({
    mutationFn: () => initiateCall(branchId),

    onSuccess: () => {
      setCallError(null);

      queryClient.invalidateQueries({
        queryKey: ['calls', 'rm'],
      });
    },

    onError: (err) => {
      setCallError(
        err instanceof ApiError
          ? err.message
          : 'Could not start the call. Please try again.',
      );
    },
  });

  if (branchQuery.isLoading) {
    return <LoadingState label="Loading branch details..." />;
  }

  if (branchQuery.isError) {
    return (
      <ErrorState
        message={
          branchQuery.error instanceof Error
            ? branchQuery.error.message
            : 'Failed to load branch.'
        }
        onRetry={() => branchQuery.refetch()}
      />
    );
  }

  const branch = branchQuery.data!;
  const leads = leadsQuery.data?.items ?? [];

  const stageCounts: Record<PipelineStage, number> = {
    INTERESTED: 0,
    CONTACTED: 0,
    APPLICATION: 0,
    APPROVAL: 0,
    CONVERSION: 0,
  };

  for (const lead of leads) {
    if (stageCounts[lead.cbiPesStage] !== undefined) {
      stageCounts[lead.cbiPesStage] += 1;
    }
  }

  const totalLeads = leads.length;

  const activityDates = leads
    .map((lead) => lead.updatedAt || lead.createdAt)
    .filter(Boolean)
    .map((date) => new Date(date).getTime())
    .filter((time) => !Number.isNaN(time));

  const latestActivity =
    activityDates.length > 0
      ? new Date(Math.max(...activityDates))
      : null;

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['left', 'right']}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F5F8FC"
      />

      <View style={styles.container}>
        <FlatList
          data={leads}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={leadsQuery.isRefetching}
              onRefresh={() => leadsQuery.refetch()}
              tintColor="#0B5CAB"
            />
          }
          ListHeaderComponent={
            <View>

              {/* =================================================
                  BRANCH HERO
              ================================================== */}

              <View style={styles.branchHero}>
                <View style={styles.heroTopRow}>
                  <View style={styles.branchIdentity}>
                    <View style={styles.branchSymbol}>
                      <Text style={styles.branchSymbolText}>
                        {branch.name
                          .replace(/^Branch\s+/i, '')
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.branchIdentityText}>
                      <Text style={styles.heroEyebrow}>
                        BRANCH
                      </Text>

                      <Text
                        style={styles.branchName}
                        numberOfLines={1}
                      >
                        {branch.name}
                      </Text>

                      <Text style={styles.branchRegion}>
                        {branch.region.name}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.activeBadge}>
                    <View style={styles.activeDot} />

                    <Text style={styles.activeBadgeText}>
                      ACTIVE
                    </Text>
                  </View>
                </View>

                <View style={styles.heroDivider} />

                {/* =================================================
                    BRANCH Head
                ================================================== */}

                {branch.bm ? (
                  <View style={styles.managerRow}>
                    <View style={styles.managerAvatar}>
                      <Text style={styles.managerAvatarText}>
                        {branch.bm.name
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.managerInfo}>
                      <Text style={styles.managerLabel}>
                        BRANCH MANAGER
                      </Text>

                      <Text
                        style={styles.managerName}
                        numberOfLines={1}
                      >
                        {branch.bm.name}
                      </Text>

                      <Text
                        style={styles.managerUsername}
                        numberOfLines={1}
                      >
                        @{branch.bm.username}
                      </Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.82}
                      style={[
                        styles.callButton,
                        (callMutation.isPending ||
                          !branch.bm.phoneNumber) &&
                          styles.callButtonDisabled,
                      ]}
                      onPress={() => {
                        setCallError(null);
                        callMutation.mutate();
                      }}
                      disabled={
                        callMutation.isPending ||
                        !branch.bm.phoneNumber
                      }
                      testID="call-bm-button"
                    >
                      <Text style={styles.callIcon}>
                        {callMutation.isPending
                          ? '...'
                          : '↗'}
                      </Text>

                      <Text style={styles.callButtonText}>
                        {callMutation.isPending
                          ? 'Calling'
                          : callMutation.isSuccess
                            ? 'Started'
                            : 'Call'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.noManagerRow}>
                    <View style={styles.noManagerIcon}>
                      <Text style={styles.noManagerIconText}>
                        !
                      </Text>
                    </View>

                    <View>
                      <Text style={styles.noManagerTitle}>
                        No Branch Manager assigned
                      </Text>

                      <Text style={styles.noManagerSubtitle}>
                        Contact information is unavailable.
                      </Text>
                    </View>
                  </View>
                )}

                {callError ? (
                  <Text style={styles.callErrorText}>
                    {callError}
                  </Text>
                ) : null}
              </View>

              {/* =================================================
                  BRANCH SNAPSHOT
              ================================================== */}

              <View style={styles.snapshotHeader}>
                <View>
                  <Text style={styles.sectionTitle}>
                    Branch snapshot
                  </Text>

                  <Text style={styles.sectionSubtitle}>
                    Current lead position
                  </Text>
                </View>

                <View style={styles.leadCountBadge}>
                  <Text style={styles.leadCountValue}>
                    {totalLeads}
                  </Text>

                  <Text style={styles.leadCountLabel}>
                    {totalLeads === 1 ? 'LEAD' : 'LEADS'}
                  </Text>
                </View>
              </View>

              {/* =================================================
                  LEAD PIPELINE
              ================================================== */}

              <View style={styles.pipelineCard}>
                <View style={styles.pipelineHeader}>
                  <Text style={styles.pipelineTitle}>
                    Lead pipeline
                  </Text>

                  <Text style={styles.pipelineTotal}>
                    {totalLeads} total
                  </Text>
                </View>

                <View style={styles.pipelineTrack}>
                  {STAGE_ORDER.map((stage, index) => {
                    const count = stageCounts[stage];
                    const meta = STAGE_META[stage];

                    return (
                      <View
                        key={stage}
                        style={styles.pipelineStage}
                      >
                        <View style={styles.pipelineStageTop}>
                          <View
                            style={[
                              styles.pipelineDot,
                              {
                                backgroundColor:
                                  meta.color,
                              },
                            ]}
                          />

                          {index <
                          STAGE_ORDER.length - 1 ? (
                            <View
                              style={styles.pipelineLine}
                            />
                          ) : null}
                        </View>

                        <Text
                          style={[
                            styles.pipelineCount,
                            {
                              color: meta.color,
                            },
                          ]}
                        >
                          {count}
                        </Text>

                        <Text
                          style={styles.pipelineLabel}
                          numberOfLines={1}
                        >
                          {meta.short}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* =================================================
                  LEADS HEADER
              ================================================== */}

              <View style={styles.leadsHeader}>
                <View style={styles.leadsHeaderText}>
                  <Text style={styles.sectionTitle}>
                    Leads
                  </Text>

                  <Text style={styles.sectionSubtitle}>
                    Select a lead to view complete details
                  </Text>
                </View>

                <View style={styles.activityBadge}>
                  <Text style={styles.activityBadgeText}>
                    {latestActivity
                      ? `Updated ${latestActivity.toLocaleDateString()}`
                      : 'No activity'}
                  </Text>
                </View>
              </View>

              {leadsQuery.isError ? (
                <ErrorState
                  message={
                    leadsQuery.error instanceof Error
                      ? leadsQuery.error.message
                      : 'Failed to load leads.'
                  }
                  onRetry={() => leadsQuery.refetch()}
                />
              ) : null}

              {leadsQuery.isLoading ? (
                <View style={styles.inlineLoading}>
                  <Text style={styles.inlineLoadingText}>
                    Loading leads...
                  </Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
  <LeadRow
    lead={item}
    onPress={() =>
      navigation.navigate('LeadDetail', {
        leadId: item.id,
      })
    }
  />
)}
          ListEmptyComponent={
            leadsQuery.isLoading ||
            leadsQuery.isError ? null : (
              <EmptyState message="No leads available." />
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

/* ================================================================
   LEAD ROW
================================================================ */

function LeadRow({
  lead,
  onPress,
}: {
  lead: Lead;
  onPress: () => void;
}) {
  const stage = STAGE_META[lead.cbiPesStage];

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.leadCard}
      onPress={onPress}
      testID={`branch-detail-lead-${lead.id}`}
    >
      <View
        style={[
          styles.leadTopAccent,
          {
            backgroundColor: stage.color,
          },
        ]}
      />

      <View style={styles.leadCardContent}>

        {/* =====================================================
            LEAD HEADER
        ====================================================== */}

        <View style={styles.leadHeader}>
          <View style={styles.leadIdentity}>
            <View style={styles.leadAvatar}>
              <Text style={styles.leadAvatarText}>
                {lead.customerName
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.leadNameContainer}>
              <Text
                style={styles.leadName}
                numberOfLines={1}
              >
                {lead.customerName}
              </Text>

              <Text style={styles.leadProduct}>
                {lead.subProductName}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.stageBadge,
              {
                backgroundColor: stage.background,
              },
            ]}
          >
            <Text
              style={[
                styles.stageBadgeText,
                {
                  color: stage.color,
                },
              ]}
            >
              {stage.short}
            </Text>
          </View>
        </View>

        {/* =====================================================
            AMOUNT / SOURCE
        ====================================================== */}

        <View style={styles.leadInfoRow}>
          <View style={styles.leadAmountBlock}>
            <Text style={styles.leadInfoLabel}>
              AMOUNT
            </Text>

            <Text style={styles.leadAmount}>
              ₹{Number(lead.amount).toLocaleString('en-IN')}
            </Text>
          </View>

          <View style={styles.leadInfoDivider} />

          <View style={styles.leadSourceBlock}>
            <Text style={styles.leadInfoLabel}>
              SOURCE STATUS
            </Text>

            <Text
              style={styles.leadSourceValue}
              numberOfLines={1}
            >
              {lead.sourceLeadStatus}
            </Text>
          </View>

          <Text style={styles.leadArrow}>
            ›
          </Text>
        </View>

        {/* =====================================================
            SOURCE META
        ====================================================== */}

        <View style={styles.sourceMetaRow}>
          <View style={styles.sourceMetaItem}>
            <Text style={styles.sourceMetaLabel}>
              CATEGORY
            </Text>

            <Text
              style={styles.sourceMetaValue}
              numberOfLines={1}
            >
              {lead.sourceCategorization}
            </Text>
          </View>

          <View style={styles.sourceMetaItem}>
            <Text style={styles.sourceMetaLabel}>
              PROGRESS
            </Text>

            <Text
              style={styles.sourceMetaValue}
              numberOfLines={1}
            >
              {lead.sourceStageProgress}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ================================================================
   STYLES
================================================================ */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F8FC',
  },

  container: {
    flex: 1,
    backgroundColor: '#F5F8FC',
  },

  listContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 28,
  },

  /* =============================================================
     BRANCH HERO
  ============================================================= */

  branchHero: {
    backgroundColor: '#0B5CAB',

    borderRadius: 20,

    marginTop: 12,
    marginBottom: 22,

    padding: 18,

    overflow: 'hidden',

    shadowColor: '#0B3D72',
    shadowOpacity: 0.2,
    shadowRadius: 12,

    shadowOffset: {
      width: 0,
      height: 6,
    },

    elevation: 5,
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  branchIdentity: {
    flexDirection: 'row',
    alignItems: 'center',

    flex: 1,

    marginRight: 8,
  },

  branchSymbol: {
    width: 50,
    height: 50,

    borderRadius: 15,

    backgroundColor: 'rgba(255,255,255,0.13)',

    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 12,
  },

  branchSymbolText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  branchIdentityText: {
    flex: 1,
  },

  heroEyebrow: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 3,
  },

  branchName: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
  },

  branchRegion: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },

  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: 'rgba(255,255,255,0.12)',

    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',

    borderRadius: 20,

    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  activeDot: {
    width: 6,
    height: 6,

    borderRadius: 3,

    backgroundColor: '#7FE0AC',

    marginRight: 5,
  },

  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  heroDivider: {
    height: 1,

    backgroundColor: 'rgba(255,255,255,0.14)',

    marginVertical: 16,
  },

  /* =============================================================
     MANAGER
  ============================================================= */

  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  managerAvatar: {
    width: 42,
    height: 42,

    borderRadius: 13,

    backgroundColor: 'rgba(255,255,255,0.15)',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 11,
  },

  managerAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  managerInfo: {
    flex: 1,
  },

  managerLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.9,
  },

  managerName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },

  managerUsername: {
    color: 'rgba(255,255,255,0.63)',
    fontSize: 10,
    marginTop: 1,
  },

  callButton: {
    minWidth: 73,
    height: 39,

    borderRadius: 11,

    backgroundColor: '#FFFFFF',

    alignItems: 'center',
    justifyContent: 'center',

    flexDirection: 'row',

    paddingHorizontal: 10,
  },

  callButtonDisabled: {
    opacity: 0.55,
  },

  callIcon: {
    color: '#16845A',
    fontSize: 14,
    fontWeight: '800',
    marginRight: 5,
  },

  callButtonText: {
    color: '#167347',
    fontSize: 11,
    fontWeight: '800',
  },

  callErrorText: {
    color: '#FFD6DE',
    fontSize: 10,
    marginTop: 9,
  },

  noManagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  noManagerIcon: {
    width: 40,
    height: 40,

    borderRadius: 12,

    backgroundColor: 'rgba(255,255,255,0.12)',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 10,
  },

  noManagerIconText: {
    color: '#FFD7DF',
    fontSize: 16,
    fontWeight: '800',
  },

  noManagerTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  noManagerSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    marginTop: 2,
  },

  /* =============================================================
     SNAPSHOT
  ============================================================= */

  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginBottom: 10,
  },

  sectionTitle: {
    color: '#182533',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.25,
  },

  sectionSubtitle: {
    color: '#7A8794',
    fontSize: 11,
    marginTop: 2,
  },

  leadCountBadge: {
    minWidth: 58,

    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#BFD5EA',

    borderRadius: 12,

    paddingHorizontal: 9,
    paddingVertical: 7,

    alignItems: 'center',
  },

  leadCountValue: {
    color: '#0B5CAB',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 19,
  },

  leadCountLabel: {
    color: '#7B8793',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  /* =============================================================
     PIPELINE
  ============================================================= */

  pipelineCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#D8E3ED',

    borderRadius: 16,

    paddingHorizontal: 13,
    paddingVertical: 13,

    marginBottom: 23,
  },

  pipelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginBottom: 13,
  },

  pipelineTitle: {
    color: '#24313E',
    fontSize: 12,
    fontWeight: '800',
  },

  pipelineTotal: {
    color: '#8995A1',
    fontSize: 9,
    fontWeight: '600',
  },

  pipelineTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  pipelineStage: {
    flex: 1,
  },

  pipelineStageTop: {
    height: 10,

    flexDirection: 'row',
    alignItems: 'center',
  },

  pipelineDot: {
    width: 9,
    height: 9,

    borderRadius: 4.5,

    zIndex: 2,
  },

  pipelineLine: {
    flex: 1,

    height: 1,

    backgroundColor: '#DCE4EB',

    marginHorizontal: 2,
  },

  pipelineCount: {
    fontSize: 18,
    fontWeight: '800',

    marginTop: 7,
  },

  pipelineLabel: {
    color: '#778390',

    fontSize: 8,
    fontWeight: '600',

    marginTop: 1,
  },

  /* =============================================================
     LEADS HEADER
  ============================================================= */

  leadsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',

    marginBottom: 11,
  },

  leadsHeaderText: {
    flex: 1,
    marginRight: 8,
  },

  activityBadge: {
    backgroundColor: '#F0F4F8',

    borderRadius: 9,

    paddingHorizontal: 8,
    paddingVertical: 6,

    maxWidth: 110,
  },

  activityBadgeText: {
    color: '#7D8995',
    fontSize: 8,
    fontWeight: '600',
  },

  inlineLoading: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#E1E8EF',

    borderRadius: 14,

    padding: 18,

    alignItems: 'center',
  },

  inlineLoadingText: {
    color: '#7B8793',
    fontSize: 12,
  },

  /* =============================================================
     LEAD CARDS
  ============================================================= */

  leadCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 16,

    marginBottom: 10,

    overflow: 'hidden',

    shadowColor: '#17324A',
    shadowOpacity: 0.045,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 2,
  },

  leadTopAccent: {
    height: 3,
    width: '100%',
  },

  leadCardContent: {
    padding: 13,
  },

  leadHeader: {
    flexDirection: 'row',
    alignItems: 'center',

    justifyContent: 'space-between',
  },

  leadIdentity: {
    flexDirection: 'row',
    alignItems: 'center',

    flex: 1,

    marginRight: 8,
  },

  leadAvatar: {
    width: 38,
    height: 38,

    borderRadius: 12,

    backgroundColor: '#EAF2FB',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 10,
  },

  leadAvatarText: {
    color: '#0B5CAB',
    fontSize: 14,
    fontWeight: '800',
  },

  leadNameContainer: {
    flex: 1,
  },

  leadName: {
    color: '#1C2936',
    fontSize: 15,
    fontWeight: '800',
  },

  leadProduct: {
    color: '#7C8995',
    fontSize: 10,
    marginTop: 2,
  },

  stageBadge: {
    borderRadius: 20,

    paddingHorizontal: 9,
    paddingVertical: 6,

    maxWidth: 92,
  },

  stageBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },

  /* =============================================================
     LEAD INFO
  ============================================================= */

  leadInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#F8FAFC',

    borderRadius: 11,

    marginTop: 12,

    paddingHorizontal: 10,
    paddingVertical: 9,
  },

  leadAmountBlock: {
    minWidth: 90,
  },

  leadInfoLabel: {
    color: '#8A96A2',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  leadAmount: {
    color: '#182533',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },

  leadInfoDivider: {
    width: 1,
    height: 27,

    backgroundColor: '#DEE5EB',

    marginHorizontal: 10,
  },

  leadSourceBlock: {
    flex: 1,
  },

  leadSourceValue: {
    color: '#42515F',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },

  leadArrow: {
    color: '#0B5CAB',
    fontSize: 23,
    fontWeight: '300',

    marginLeft: 6,
  },

  /* =============================================================
     SOURCE META
  ============================================================= */

  sourceMetaRow: {
    flexDirection: 'row',

    marginTop: 10,

    paddingTop: 9,

    borderTopWidth: 1,
    borderTopColor: '#EEF1F4',
  },

  sourceMetaItem: {
    flex: 1,

    marginRight: 10,
  },

  sourceMetaLabel: {
    color: '#9AA5AF',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  sourceMetaValue: {
    color: '#697682',
    fontSize: 9,
    fontWeight: '600',

    marginTop: 3,
  },
});