import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  BranchPerformanceDetail,
  getBranchPerformance,
  updateBranchPerformance,
  PerformancePeriodType,
} from '../../services/performanceService';

interface Props {
  route: {
    params: {
      branchId: string;
      branchName?: string;
    };
  };
  navigation: any;
}

const formatCurrency = (value: number) => {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }

  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }

  return `₹${value.toLocaleString('en-IN')}`;
};

const formatDate = (value: string) => {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const BranchPerformanceScreen = ({
  route,
}: Props) => {
  const { branchId, branchName } = route.params;

  const [period, setPeriod] =
    useState<PerformancePeriodType>('QUARTER');

  const [data, setData] =
    useState<BranchPerformanceDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadPerformance = async (
    selectedPeriod: PerformancePeriodType = period,
  ) => {
    try {
      const result = await getBranchPerformance(
        branchId,
        selectedPeriod,
      );

      setData(result);
    } catch (error) {
      console.error(
        'Failed to load branch performance:',
        error,
      );

      if (!refreshing) {
        Alert.alert(
          'Unable to load',
          'Could not load branch performance data.',
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPerformance(period);
    }, [branchId, period]),
  );

  const handlePeriodChange = (
    nextPeriod: PerformancePeriodType,
  ) => {
    if (nextPeriod === period) {
      return;
    }

    setLoading(true);
    setPeriod(nextPeriod);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPerformance(period);
  };

  const handleUpdate = async () => {
    const cleanedAmount = amount.replace(/,/g, '').trim();
    const numericAmount = Number(cleanedAmount);

    if (
      !cleanedAmount ||
      !Number.isFinite(numericAmount)
    ) {
      Alert.alert(
        'Invalid amount',
        'Please enter a valid business amount.',
      );
      return;
    }

    if (numericAmount < 0) {
      Alert.alert(
        'Invalid amount',
        'Business amount cannot be negative.',
      );
      return;
    }

    if (!data) {
      return;
    }

    if (numericAmount < data.achieved) {
      Alert.alert(
        'Invalid update',
        'The new achieved amount cannot be lower than the current achieved amount.',
      );
      return;
    }

    try {
      setUpdating(true);

      await updateBranchPerformance(
        branchId,
        numericAmount,
        remarks.trim() || undefined,
      );

      setAmount('');
      setRemarks('');

      await loadPerformance(period);

      Alert.alert(
        'Performance Updated',
        'Branch business performance has been updated successfully.',
      );
    } catch (error) {
      console.error(
        'Failed to update performance:',
        error,
      );

      Alert.alert(
        'Update failed',
        'Could not update branch performance.',
      );
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#155EEF"
        />

        <Text style={styles.loadingText}>
          Loading performance...
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>
            !
          </Text>
        </View>

        <Text style={styles.errorTitle}>
          Performance unavailable
        </Text>

        <Text style={styles.errorText}>
          Performance data could not be loaded for this
          branch and period.
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.retryButton}
          onPress={() => {
            setLoading(true);
            loadPerformance(period);
          }}
        >
          <Text style={styles.retryText}>
            Try Again
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progress = Math.min(
    Math.max(data.percentage, 0),
    100,
  );

  const targetReached = data.percentage >= 100;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#155EEF"
          />
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <Text
            style={styles.branchName}
            numberOfLines={2}
          >
            {data.branch.name || branchName}
          </Text>

          <Text style={styles.headerSubtitle}>
            Target-based performance evaluation
          </Text>
        </View>

        {/* PERIOD SELECTOR */}

        <View style={styles.periodCard}>
          <Text style={styles.periodLabel}>
            PERFORMANCE PERIOD
          </Text>

          <View style={styles.periodContainer}>
            {[
              {
                label: 'Month',
                value: 'MONTH' as PerformancePeriodType,
              },
              {
                label: 'Quarter',
                value: 'QUARTER' as PerformancePeriodType,
              },
              {
                label: 'Annual',
                value: 'ANNUAL' as PerformancePeriodType,
              },
            ].map((item) => (
              <TouchableOpacity
                key={item.value}
                activeOpacity={0.8}
                style={[
                  styles.periodButton,
                  period === item.value &&
                    styles.periodButtonActive,
                ]}
                onPress={() =>
                  handlePeriodChange(item.value)
                }
              >
                <Text
                  style={[
                    styles.periodText,
                    period === item.value &&
                      styles.periodTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.periodDates}>
            {formatDate(data.period.start)} —{' '}
            {formatDate(data.period.end)}
          </Text>
        </View>

        {/* ACHIEVEMENT HERO */}

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroLabel}>
                ACHIEVEMENT
              </Text>

              <Text style={styles.heroPercentage}>
                {data.percentage}%
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                targetReached
                  ? styles.statusBadgeSuccess
                  : styles.statusBadgeProgress,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  targetReached
                    ? styles.statusBadgeTextSuccess
                    : styles.statusBadgeTextProgress,
                ]}
              >
                {targetReached
                  ? 'TARGET ACHIEVED'
                  : 'IN PROGRESS'}
              </Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress}%`,
                },
              ]}
            />
          </View>

          <View style={styles.progressMeta}>
            <View>
              <Text style={styles.progressMetaLabel}>
                ACHIEVED
              </Text>

              <Text style={styles.progressMetaValue}>
                {formatCurrency(data.achieved)}
              </Text>
            </View>

            <View style={styles.progressMetaRight}>
              <Text style={styles.progressMetaLabel}>
                TARGET
              </Text>

              <Text style={styles.progressMetaValue}>
                {formatCurrency(data.target)}
              </Text>
            </View>
          </View>
        </View>

        {/* CORE METRICS */}

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>
              TARGET
            </Text>

            <Text style={styles.metricValue}>
              {formatCurrency(data.target)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>
              ACHIEVED
            </Text>

            <Text style={styles.metricValue}>
              {formatCurrency(data.achieved)}
            </Text>
          </View>
        </View>

        <View style={styles.remainingCard}>
          <View style={styles.remainingLeft}>
            <Text style={styles.metricLabel}>
              REMAINING TO TARGET
            </Text>

            <Text style={styles.remainingValue}>
              {targetReached
                ? '₹0'
                : formatCurrency(data.remaining)}
            </Text>
          </View>

          <View
            style={[
              styles.remainingIndicator,
              targetReached &&
                styles.remainingIndicatorComplete,
            ]}
          >
            <Text
              style={[
                styles.remainingIndicatorText,
                targetReached &&
                  styles.remainingIndicatorTextComplete,
              ]}
            >
              {targetReached
                ? 'Complete'
                : 'Balance'}
            </Text>
          </View>
        </View>

        {/* BM UPDATE */}

        {data.canUpdate ? (
          <View style={styles.updateCard}>
            <View style={styles.updateHeader}>
              <View style={styles.updateIcon}>
                <Text style={styles.updateIconText}>
                  +
                </Text>
              </View>

              <View style={styles.updateHeaderText}>
                <Text style={styles.sectionTitle}>
                  Update Business
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Record the latest achieved business
                  amount for this period.
                </Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>
              ACHIEVED BUSINESS AMOUNT
            </Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. 4250000"
              placeholderTextColor="#9AA7B5"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.inputHelper}>
              Enter the cumulative achieved amount,
              not the incremental amount.
            </Text>

            <Text style={styles.inputLabel}>
              REMARKS
            </Text>

            <TextInput
              style={[
                styles.input,
                styles.remarksInput,
              ]}
              placeholder="Optional update remarks"
              placeholderTextColor="#9AA7B5"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              activeOpacity={0.86}
              style={[
                styles.updateButton,
                updating &&
                  styles.updateButtonDisabled,
              ]}
              onPress={handleUpdate}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              ) : (
                <>
                  <Text style={styles.updateButtonText}>
                    Update Performance
                  </Text>

                  <Text
                    style={styles.updateButtonArrow}
                  >
                    →
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.readOnlyCard}>
            <View style={styles.readOnlyIcon}>
              <Text style={styles.readOnlyIconText}>
                i
              </Text>
            </View>

            <View style={styles.readOnlyText}>
              <Text style={styles.readOnlyTitle}>
                Read-only view
              </Text>

              <Text style={styles.readOnlySubtitle}>
                You can view this branch's performance,
                but only the Branch Head can update
                business figures.
              </Text>
            </View>
          </View>
        )}

        {/* HISTORY */}

        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Recent Updates
              </Text>

              <Text style={styles.sectionSubtitle}>
                Latest performance changes
              </Text>
            </View>

            {data.updates.length > 0 ? (
              <View style={styles.updateCount}>
                <Text style={styles.updateCountText}>
                  {data.updates.length}
                </Text>
              </View>
            ) : null}
          </View>

          {data.updates.length === 0 ? (
            <View style={styles.noUpdatesCard}>
              <Text style={styles.noUpdatesTitle}>
                No updates recorded
              </Text>

              <Text style={styles.noUpdatesText}>
                Performance changes will appear here
                after the branch submits an update.
              </Text>
            </View>
          ) : (
            data.updates.map((update) => (
              <View
                key={update.id}
                style={styles.historyCard}
              >
                <View style={styles.historyTimeline}>
                  <View
                    style={styles.historyDot}
                  />

                  <View
                    style={styles.historyLine}
                  />
                </View>

                <View style={styles.historyContent}>
                  <View
                    style={styles.historyTopRow}
                  >
                    <Text
                      style={styles.historyAmount}
                    >
                      {formatCurrency(
                        update.newAmount,
                      )}
                    </Text>

                    <Text
                      style={styles.historyDate}
                    >
                      {formatDate(
                        update.createdAt,
                      )}
                    </Text>
                  </View>

                  <Text
                    style={styles.historyChange}
                  >
                    Previous achieved:{' '}
                    {formatCurrency(
                      update.previousAmount,
                    )}
                  </Text>

                  {update.remarks ? (
                    <View
                      style={
                        styles.remarksContainer
                      }
                    >
                      <Text
                        style={styles.remarksText}
                      >
                        {update.remarks}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default BranchPerformanceScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },

  content: {
    padding: 16,
    paddingBottom: 42,
  },

  header: {
    marginBottom: 16,
  },

  branchName: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    color: '#102A43',
    letterSpacing: -0.4,
  },

  headerSubtitle: {
    marginTop: 5,
    fontSize: 13,
    color: '#64748B',
  },

  periodCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E1E8F0',
  },

  periodLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#8A97A6',
    marginBottom: 9,
  },

  periodContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 11,
    backgroundColor: '#EAF0F6',
  },

  periodButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },

  periodButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#102A43',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 2,
  },

  periodText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  periodTextActive: {
    color: '#155EEF',
    fontWeight: '800',
  },

  periodDates: {
    marginTop: 9,
    textAlign: 'center',
    fontSize: 11,
    color: '#7A8794',
  },

  heroCard: {
    backgroundColor: '#155EEF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#155EEF',
    shadowOpacity: 0.18,
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

  heroLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: 'rgba(255,255,255,0.68)',
  },

  heroPercentage: {
    marginTop: 3,
    fontSize: 42,
    lineHeight: 47,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },

  statusBadgeProgress: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.16)',
  },

  statusBadgeSuccess: {
    backgroundColor: 'rgba(39,174,96,0.18)',
    borderColor: 'rgba(255,255,255,0.18)',
  },

  statusBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  statusBadgeTextProgress: {
    color: '#FFFFFF',
  },

  statusBadgeTextSuccess: {
    color: '#E9FFF2',
  },

  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    marginTop: 19,
  },

  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },

  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 13,
  },

  progressMetaRight: {
    alignItems: 'flex-end',
  },

  progressMetaLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.58)',
  },

  progressMetaValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  metricsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },

  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E1E8F0',
  },

  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#8A97A6',
  },

  metricValue: {
    marginTop: 7,
    fontSize: 18,
    fontWeight: '800',
    color: '#172B4D',
  },

  remainingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E1E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  remainingLeft: {
    flex: 1,
  },

  remainingValue: {
    marginTop: 5,
    fontSize: 23,
    fontWeight: '800',
    color: '#172B4D',
  },

  remainingIndicator: {
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#FFF6E5',
  },

  remainingIndicatorComplete: {
    backgroundColor: '#EAF8F0',
  },

  remainingIndicatorText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A56B00',
  },

  remainingIndicatorTextComplete: {
    color: '#16845A',
  },

  updateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DCE6F0',
  },

  updateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },

  updateIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  updateIconText: {
    color: '#155EEF',
    fontSize: 24,
    fontWeight: '500',
  },

  updateHeaderText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#172B4D',
  },

  sectionSubtitle: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: '#718096',
  },

  inputLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#738196',
    marginBottom: 7,
  },

  input: {
    height: 49,
    borderWidth: 1,
    borderColor: '#D6DFE9',
    borderRadius: 11,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#172B4D',
    backgroundColor: '#FAFBFD',
    marginBottom: 6,
  },

  inputHelper: {
    fontSize: 10,
    lineHeight: 15,
    color: '#94A3B8',
    marginBottom: 15,
  },

  remarksInput: {
    height: 76,
    paddingTop: 13,
    paddingBottom: 13,
  },

  updateButton: {
    height: 49,
    borderRadius: 11,
    backgroundColor: '#155EEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },

  updateButtonDisabled: {
    opacity: 0.65,
  },

  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  updateButtonArrow: {
    color: '#FFFFFF',
    fontSize: 19,
    marginLeft: 9,
    fontWeight: '500',
  },

  readOnlyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F5FA',
    borderRadius: 15,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DCE6F0',
  },

  readOnlyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCE8F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  readOnlyIconText: {
    color: '#155EEF',
    fontSize: 16,
    fontWeight: '800',
  },

  readOnlyText: {
    flex: 1,
  },

  readOnlyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#30465C',
  },

  readOnlySubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#718096',
  },

  historySection: {
    marginTop: 2,
  },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },

  updateCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  updateCountText: {
    color: '#155EEF',
    fontSize: 11,
    fontWeight: '800',
  },

  noUpdatesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E1E8F0',
  },

  noUpdatesTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#34495E',
  },

  noUpdatesText: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 17,
    color: '#8A97A6',
  },

  historyCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E1E8F0',
  },

  historyTimeline: {
    width: 18,
    alignItems: 'center',
    marginRight: 8,
  },

  historyDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#155EEF',
    marginTop: 5,
  },

  historyLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#DCE5EF',
    marginTop: 5,
  },

  historyContent: {
    flex: 1,
  },

  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  historyAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#172B4D',
  },

  historyDate: {
    fontSize: 10,
    color: '#94A3B8',
  },

  historyChange: {
    marginTop: 5,
    fontSize: 11,
    color: '#718096',
  },

  remarksContainer: {
    backgroundColor: '#F7F9FC',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 9,
  },

  remarksText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#526274',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FB',
    padding: 25,
  },

  loadingText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 13,
  },

  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  errorIconText: {
    color: '#C62846',
    fontSize: 22,
    fontWeight: '800',
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#172B4D',
  },

  errorText: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: '#718096',
    textAlign: 'center',
    maxWidth: 300,
  },

  retryButton: {
    marginTop: 18,
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#155EEF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});