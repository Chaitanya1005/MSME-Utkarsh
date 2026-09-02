import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchLead } from '../../api/orgApi';
import {
  fetchProposalsForLead,
  fetchLeadActivity,
} from '../../api/leadUpdateApi';
import {
  LoadingState,
  ErrorState,
} from '../../components/StatusStates';
import { useAuth } from '../../auth/AuthContext';
import { BMStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<BMStackParamList, 'LeadDetail'>;

const STAGE_META: Record<
  string,
  {
    color: string;
    background: string;
    label: string;
  }
> = {
  INTERESTED: {
    color: '#0B5CAB',
    background: '#EAF2FB',
    label: 'Interested',
  },
  CONTACTED: {
    color: '#B7791F',
    background: '#FFF6DF',
    label: 'Contacted',
  },
  APPLICATION: {
    color: '#B7791F',
    background: '#FFF6DF',
    label: 'Application',
  },
  APPROVAL: {
    color: '#B7791F',
    background: '#FFF6DF',
    label: 'Approval',
  },
  CONVERSION: {
    color: '#16845A',
    background: '#EAF8F1',
    label: 'Conversion',
  },
};

export function LeadDetailScreen({
  route,
  navigation,
}: Props) {
  const { leadId } = route.params;
  const { user } = useAuth();

  const isBm = user?.role === 'BM';

  const leadQuery = useQuery({
    queryKey: ['leads', 'detail', leadId],
    queryFn: () => fetchLead(leadId),
  });

  const proposalsQuery = useQuery({
    queryKey: ['proposals', 'lead', leadId],
    queryFn: () => fetchProposalsForLead(leadId),
    enabled: isBm,
  });

  const activityQuery = useQuery({
    queryKey: ['activity', 'lead', leadId],
    queryFn: () => fetchLeadActivity(leadId),
  });

  if (leadQuery.isLoading) {
    return <LoadingState label="Loading lead..." />;
  }

  if (leadQuery.isError) {
    return (
      <ErrorState
        message={
          leadQuery.error instanceof Error
            ? leadQuery.error.message
            : 'Failed to load lead.'
        }
        onRetry={() => leadQuery.refetch()}
      />
    );
  }

  const lead = leadQuery.data!;

  const pendingProposals = isBm
    ? (proposalsQuery.data ?? []).filter(
        (proposal) => proposal.status === 'PENDING',
      )
    : [];

  const stageMeta =
    STAGE_META[lead.cbiPesStage] ?? {
      color: '#0B5CAB',
      background: '#EAF2FB',
      label: lead.cbiPesStage,
    };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* =========================================================
          LEAD HERO
      ========================================================= */}

      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIdentity}>
            <View style={styles.leadAvatar}>
              <Text style={styles.leadAvatarText}>
                {lead.customerName
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.heroIdentityText}>
              <Text style={styles.heroEyebrow}>
                LEAD {lead.sourceSrNo ?? lead.id}
              </Text>

              <Text
                style={styles.customerName}
                numberOfLines={2}
              >
                {lead.customerName}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.stageBadge,
              {
                backgroundColor: stageMeta.background,
              },
            ]}
          >
            <View
              style={[
                styles.stageDot,
                {
                  backgroundColor: stageMeta.color,
                },
              ]}
            />

            <Text
              style={[
                styles.stageBadgeText,
                {
                  color: stageMeta.color,
                },
              ]}
            >
              {stageMeta.label}
            </Text>
          </View>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroProductRow}>
          <View style={styles.heroProductIcon}>
            <Text style={styles.heroProductIconText}>
              ₹
            </Text>
          </View>

          <View style={styles.heroProductInfo}>
            <Text style={styles.heroProductLabel}>
              PRODUCT
            </Text>

            <Text style={styles.heroProductName}>
              {lead.subProductName}
            </Text>
          </View>

          <View style={styles.heroAmount}>
            <Text style={styles.heroAmountLabel}>
              AMOUNT
            </Text>

            <Text style={styles.heroAmountValue}>
              ₹{Number(lead.amount).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>
      </View>

      {/* =========================================================
          QUICK SUMMARY
      ========================================================= */}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            Lead overview
          </Text>

          <Text style={styles.sectionSubtitle}>
            Current position and source information
          </Text>
        </View>
      </View>

      <View style={styles.overviewCard}>
        <OverviewItem
          label="SOURCE STATUS"
          value={lead.sourceLeadStatus}
        />

        <View style={styles.overviewDivider} />

        <OverviewItem
          label="CATEGORY"
          value={lead.sourceCategorization}
        />

        <View style={styles.overviewDivider} />

        <OverviewItem
          label="PROGRESS"
          value={lead.sourceStageProgress}
        />
      </View>

      {/* =========================================================
          CUSTOMER / LEAD INFORMATION
      ========================================================= */}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            Lead information
          </Text>

          <Text style={styles.sectionSubtitle}>
            Complete lead details
          </Text>
        </View>
      </View>

      <View style={styles.detailsCard}>
        <InfoRow
          label="Lead ID"
          value={lead.sourceSrNo ?? lead.id}
        />

        <InfoRow
          label="Customer"
          value={lead.customerName}
        />

        <InfoRow
          label="Product"
          value={lead.subProductName}
        />

        <InfoRow
          label="Amount"
          value={`₹${Number(lead.amount).toLocaleString(
            'en-IN',
          )}`}
          emphasize
        />

        <InfoRow
          label="Phone"
          value={lead.customerPrimaryPhone}
        />

        <InfoRow
          label="Source status"
          value={lead.sourceLeadStatus}
        />

        <InfoRow
          label="Categorization"
          value={lead.sourceCategorization}
        />

        <InfoRow
          label="Stage-wise progress"
          value={lead.sourceStageProgress}
        />

        {lead.tentativeSanctionDate ? (
          <InfoRow
            label="Tentative sanction"
            value={new Date(
              lead.tentativeSanctionDate,
            ).toLocaleDateString()}
          />
        ) : null}

        {lead.tentativeDisbursementDate ? (
          <InfoRow
            label="Tentative disbursement"
            value={new Date(
              lead.tentativeDisbursementDate,
            ).toLocaleDateString()}
          />
        ) : null}

        {lead.sourceRemarks ? (
          <InfoRow
            label="Remarks"
            value={lead.sourceRemarks}
          />
        ) : null}

        <InfoRow
          label="Created"
          value={new Date(
            lead.createdAt,
          ).toLocaleString()}
        />

        <InfoRow
          label="Last updated"
          value={new Date(
            lead.updatedAt,
          ).toLocaleString()}
          last
        />
      </View>

      {/* =========================================================
          BM PENDING PROPOSALS
      ========================================================= */}

      {isBm && pendingProposals.length > 0 ? (
        <View
          style={styles.pendingCard}
          testID="lead-pending-banner"
        >
          <View style={styles.pendingIcon}>
            <Text style={styles.pendingIconText}>
              !
            </Text>
          </View>

          <View style={styles.pendingContent}>
            <Text style={styles.pendingTitle}>
              Confirmation required
            </Text>

            <Text style={styles.pendingText}>
              {pendingProposals.length} update
              {pendingProposals.length > 1 ? 's' : ''}{' '}
              awaiting your confirmation
            </Text>
          </View>
        </View>
      ) : null}

      {/* =========================================================
          BM UPDATE ACTION
      ========================================================= */}

      {isBm ? (
        <TouchableOpacity
          style={styles.proposeButton}
          activeOpacity={0.84}
          onPress={() =>
            navigation.navigate('ProposeUpdate', {
              leadId: lead.id,
              currentStage: lead.cbiPesStage,
            })
          }
          testID="propose-update-button"
        >
          <View style={styles.proposeIcon}>
            <Text style={styles.proposeIconText}>
              +
            </Text>
          </View>

          <View style={styles.proposeContent}>
            <Text style={styles.proposeTitle}>
              Update this lead
            </Text>

            <Text style={styles.proposeSubtitle}>
              Record a new stage or progress update
            </Text>
          </View>

          <Text style={styles.proposeArrow}>
            ›
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* =========================================================
          UPDATE HISTORY
      ========================================================= */}

      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            Update history
          </Text>

          <Text style={styles.sectionSubtitle}>
            Activity recorded against this lead
          </Text>
        </View>

        {activityQuery.data &&
        activityQuery.data.length > 0 ? (
          <View style={styles.historyCount}>
            <Text style={styles.historyCountText}>
              {activityQuery.data.length}
            </Text>
          </View>
        ) : null}
      </View>

      {activityQuery.isLoading ? (
        <LoadingState label="Loading history..." />
      ) : !activityQuery.data ||
        activityQuery.data.length === 0 ? (
        <View style={styles.emptyHistoryCard}>
          <View style={styles.emptyHistoryIcon}>
            <Text style={styles.emptyHistoryIconText}>
              —
            </Text>
          </View>

          <Text style={styles.emptyHistoryTitle}>
            No confirmed updates
          </Text>

          <Text style={styles.emptyHistoryText}>
            Lead activity will appear here once an
            update is recorded.
          </Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {activityQuery.data.map((entry, index) => {
            const isVoice =
              entry.source === 'VOICE_AI';

            const isLast =
              index ===
              activityQuery.data!.length - 1;

            return (
              <View
                key={entry.id}
                style={styles.timelineItem}
                testID={`activity-${entry.id}`}
              >
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: isVoice
                          ? '#B7791F'
                          : '#0B5CAB',
                      },
                    ]}
                  />

                  {!isLast ? (
                    <View style={styles.timelineLine} />
                  ) : null}
                </View>

                <View style={styles.activityCard}>
                  <View style={styles.activityTopRow}>
                    <View style={styles.activityTransition}>
                      <Text
                        style={styles.activityPrevious}
                      >
                        {entry.previousStage}
                      </Text>

                      <Text style={styles.activityArrow}>
                        →
                      </Text>

                      <Text
                        style={[
                          styles.activityNew,
                          {
                            color: isVoice
                              ? '#B7791F'
                              : '#0B5CAB',
                          },
                        ]}
                      >
                        {entry.newStage}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.sourceBadge,
                        {
                          backgroundColor: isVoice
                            ? '#FFF6DF'
                            : '#EAF2FB',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sourceBadgeText,
                          {
                            color: isVoice
                              ? '#A36A17'
                              : '#0B5CAB',
                          },
                        ]}
                      >
                        {isVoice
                          ? 'VOICE'
                          : 'MANUAL'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.activityDate}>
                    {new Date(
                      entry.createdAt,
                    ).toLocaleString()}
                  </Text>

                  {entry.remarks ? (
                    <View style={styles.remarkBox}>
                      <Text style={styles.remarkLabel}>
                        NOTE
                      </Text>

                      <Text style={styles.activityRemarks}>
                        {entry.remarks}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

/* ================================================================
   OVERVIEW ITEM
================================================================ */

function OverviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.overviewItem}>
      <Text style={styles.overviewLabel}>
        {label}
      </Text>

      <Text
        style={styles.overviewValue}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/* ================================================================
   INFORMATION ROW
================================================================ */

function InfoRow({
  label,
  value,
  emphasize = false,
  last = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        last && styles.infoRowLast,
      ]}
    >
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.infoValue,
          emphasize && styles.infoValueEmphasize,
        ]}
      >
        {value}
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
    paddingTop: 14,
    paddingBottom: 36,
  },

  /* =============================================================
     HERO
  ============================================================= */

  heroCard: {
    backgroundColor: '#0B5CAB',

    borderRadius: 21,

    padding: 18,

    shadowColor: '#0B3D72',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },

    elevation: 5,

    marginBottom: 25,
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  heroIdentity: {
    flexDirection: 'row',
    alignItems: 'center',

    flex: 1,

    marginRight: 10,
  },

  leadAvatar: {
    width: 51,
    height: 51,

    borderRadius: 15,

    backgroundColor: 'rgba(255,255,255,0.14)',

    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 12,
  },

  leadAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  heroIdentityText: {
    flex: 1,
  },

  heroEyebrow: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,

    marginBottom: 3,
  },

  customerName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',

    borderRadius: 18,

    paddingHorizontal: 9,
    paddingVertical: 7,

    maxWidth: 100,
  },

  stageDot: {
    width: 6,
    height: 6,

    borderRadius: 3,

    marginRight: 5,
  },

  stageBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },

  heroDivider: {
    height: 1,

    backgroundColor: 'rgba(255,255,255,0.15)',

    marginVertical: 16,
  },

  heroProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroProductIcon: {
    width: 40,
    height: 40,

    borderRadius: 12,

    backgroundColor: 'rgba(255,255,255,0.13)',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 10,
  },

  heroProductIconText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  heroProductInfo: {
    flex: 1,
  },

  heroProductLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.9,
  },

  heroProductName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',

    marginTop: 2,
  },

  heroAmount: {
    alignItems: 'flex-end',
  },

  heroAmountLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.9,
  },

  heroAmountValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',

    marginTop: 2,
  },

  /* =============================================================
     SECTION HEADERS
  ============================================================= */

  sectionHeader: {
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
    fontSize: 10.5,
    marginTop: 3,
  },

  /* =============================================================
     OVERVIEW
  ============================================================= */

  overviewCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#D5E2EE',

    borderRadius: 15,

    flexDirection: 'row',

    paddingVertical: 13,
    paddingHorizontal: 10,

    marginBottom: 24,
  },

  overviewItem: {
    flex: 1,

    paddingHorizontal: 5,
  },

  overviewDivider: {
    width: 1,

    backgroundColor: '#E4EAF0',

    marginVertical: 2,
  },

  overviewLabel: {
    color: '#8C98A4',

    fontSize: 7,
    fontWeight: '800',

    letterSpacing: 0.65,

    marginBottom: 4,
  },

  overviewValue: {
    color: '#273542',

    fontSize: 10,
    fontWeight: '700',
  },

  /* =============================================================
     DETAILS
  ============================================================= */

  detailsCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 16,

    paddingHorizontal: 14,

    marginBottom: 24,

    shadowColor: '#18354D',
    shadowOpacity: 0.035,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 2,
    },

    elevation: 1,
  },

  infoRow: {
    minHeight: 43,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F5',

    paddingVertical: 9,
  },

  infoRowLast: {
    borderBottomWidth: 0,
  },

  infoLabel: {
    color: '#87939E',

    fontSize: 10.5,

    flex: 0.9,
  },

  infoValue: {
    color: '#27313B',

    fontSize: 11,

    fontWeight: '600',

    flex: 1.4,

    textAlign: 'right',
  },

  infoValueEmphasize: {
    color: '#0B5CAB',

    fontSize: 12.5,

    fontWeight: '800',
  },

  /* =============================================================
     PENDING
  ============================================================= */

  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#FFF8E8',

    borderWidth: 1,
    borderColor: '#F1D99B',

    borderRadius: 15,

    padding: 13,

    marginBottom: 12,
  },

  pendingIcon: {
    width: 38,
    height: 38,

    borderRadius: 12,

    backgroundColor: '#F8D979',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 11,
  },

  pendingIconText: {
    color: '#775900',

    fontSize: 17,
    fontWeight: '800',
  },

  pendingContent: {
    flex: 1,
  },

  pendingTitle: {
    color: '#775900',

    fontSize: 12,
    fontWeight: '800',
  },

  pendingText: {
    color: '#9B7B22',

    fontSize: 9.5,

    marginTop: 2,
  },

  /* =============================================================
     PROPOSE / UPDATE BUTTON
  ============================================================= */

  proposeButton: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#0B5CAB',

    borderRadius: 16,

    padding: 13,

    marginBottom: 26,

    shadowColor: '#0B3D72',
    shadowOpacity: 0.15,
    shadowRadius: 9,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 4,
  },

  proposeIcon: {
    width: 40,
    height: 40,

    borderRadius: 12,

    backgroundColor: 'rgba(255,255,255,0.14)',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 11,
  },

  proposeIconText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '400',
  },

  proposeContent: {
    flex: 1,
  },

  proposeTitle: {
    color: '#FFFFFF',

    fontSize: 13,
    fontWeight: '800',
  },

  proposeSubtitle: {
    color: 'rgba(255,255,255,0.68)',

    fontSize: 9,

    marginTop: 2,
  },

  proposeArrow: {
    color: '#FFFFFF',

    fontSize: 25,
    fontWeight: '300',

    marginLeft: 5,
  },

  /* =============================================================
     HISTORY HEADER
  ============================================================= */

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginBottom: 12,
  },

  historyCount: {
    minWidth: 28,
    height: 28,

    borderRadius: 9,

    backgroundColor: '#EAF2FB',

    alignItems: 'center',
    justifyContent: 'center',
  },

  historyCountText: {
    color: '#0B5CAB',

    fontSize: 11,
    fontWeight: '800',
  },

  /* =============================================================
     TIMELINE
  ============================================================= */

  timeline: {
    paddingBottom: 4,
  },

  timelineItem: {
    flexDirection: 'row',

    minHeight: 104,
  },

  timelineRail: {
    width: 27,

    alignItems: 'center',
  },

  timelineDot: {
    width: 11,
    height: 11,

    borderRadius: 5.5,

    marginTop: 17,

    borderWidth: 3,
    borderColor: '#F5F8FC',
  },

  timelineLine: {
    width: 1,

    flex: 1,

    backgroundColor: '#D7E1EA',

    marginTop: 2,
  },

  activityCard: {
    flex: 1,

    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 14,

    padding: 13,

    marginBottom: 10,

    shadowColor: '#18354D',
    shadowOpacity: 0.035,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },

    elevation: 1,
  },

  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  activityTransition: {
    flexDirection: 'row',
    alignItems: 'center',

    flex: 1,

    marginRight: 7,
  },

  activityPrevious: {
    color: '#4E5B67',

    fontSize: 10,

    fontWeight: '700',
  },

  activityArrow: {
    color: '#9AA5AF',

    fontSize: 12,

    marginHorizontal: 5,
  },

  activityNew: {
    fontSize: 10,

    fontWeight: '800',
  },

  sourceBadge: {
    borderRadius: 8,

    paddingHorizontal: 7,
    paddingVertical: 4,
  },

  sourceBadgeText: {
    fontSize: 7,

    fontWeight: '800',

    letterSpacing: 0.5,
  },

  activityDate: {
    color: '#89949F',

    fontSize: 9,

    marginTop: 7,
  },

  remarkBox: {
    backgroundColor: '#F7F9FB',

    borderRadius: 9,

    paddingHorizontal: 9,
    paddingVertical: 7,

    marginTop: 9,
  },

  remarkLabel: {
    color: '#9AA5AF',

    fontSize: 6.5,

    fontWeight: '800',

    letterSpacing: 0.7,

    marginBottom: 3,
  },

  activityRemarks: {
    color: '#4A5661',

    fontSize: 10,

    lineHeight: 15,
  },

  /* =============================================================
     EMPTY HISTORY
  ============================================================= */

  emptyHistoryCard: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#DDE6EE',

    borderRadius: 15,

    padding: 20,

    alignItems: 'center',
  },

  emptyHistoryIcon: {
    width: 38,
    height: 38,

    borderRadius: 12,

    backgroundColor: '#EFF3F7',

    alignItems: 'center',
    justifyContent: 'center',

    marginBottom: 8,
  },

  emptyHistoryIconText: {
    color: '#87939E',

    fontSize: 18,
    fontWeight: '600',
  },

  emptyHistoryTitle: {
    color: '#3D4A56',

    fontSize: 12,
    fontWeight: '800',
  },

  emptyHistoryText: {
    color: '#8A96A1',

    fontSize: 9.5,

    textAlign: 'center',

    marginTop: 4,

    lineHeight: 14,
  },

  bottomSpace: {
    height: 10,
  },
});