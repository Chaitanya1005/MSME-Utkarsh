import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  BranchPerformance,
  getRegionalPerformance,
  PerformancePeriodType,
} from '../../services/performanceService';

interface Props {
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

const PerformanceLeaderboardScreen = ({
  navigation,
}: Props) => {
  const [period, setPeriod] =
    useState<PerformancePeriodType>('QUARTER');

  const [branches, setBranches] = useState<
    BranchPerformance[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPerformance = async () => {
    try {
      const data = await getRegionalPerformance(period);

      const sorted = [...data].sort(
        (a, b) => {
          if (b.percentage !== a.percentage) {
            return b.percentage - a.percentage;
          }

          if (b.achieved !== a.achieved) {
            return b.achieved - a.achieved;
          }

          return a.branchName.localeCompare(
            b.branchName,
          );
        },
      );

      setBranches(
        sorted.map((branch, index) => ({
          ...branch,
          rank: index + 1,
        })),
      );
    } catch (error) {
      console.error(
        'Failed to load performance:',
        error,
      );

      setBranches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPerformance();
    }, [period]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadPerformance();
  };

  const handleBranchPress = (
    branch: BranchPerformance,
  ) => {
    navigation.navigate('BranchPerformance', {
      branchId: branch.branchId,
      branchName: branch.branchName,
    });
  };

  const renderBranch = ({
    item,
  }: {
    item: BranchPerformance;
  }) => {
    const progress = Math.min(
      Math.max(item.percentage, 0),
      100,
    );

    return (
      <TouchableOpacity
        activeOpacity={0.86}
        style={styles.branchCard}
        onPress={() => handleBranchPress(item)}
      >
        <View style={styles.topRow}>
          <View style={styles.rankBox}>
            <Text style={styles.rankText}>
              #{item.rank}
            </Text>
          </View>

          <View style={styles.branchInfo}>
            <Text
              style={styles.branchName}
              numberOfLines={1}
            >
              {item.branchName}
            </Text>

            <Text style={styles.amountText}>
              {formatCurrency(item.achieved)} of{' '}
              {formatCurrency(item.target)}
            </Text>
          </View>

          <View style={styles.percentageContainer}>
            <Text style={styles.percentage}>
              {item.percentage}%
            </Text>

            <Text style={styles.viewText}>
              View
            </Text>
          </View>
        </View>

        <View style={styles.progressBackground}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
            ]}
          />
        </View>

        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.remainingLabel}>
              Remaining
            </Text>

            <Text style={styles.remainingValue}>
              {formatCurrency(item.remaining)}
            </Text>
          </View>

          <Text style={styles.detailsArrow}>
            ›
          </Text>
        </View>
      </TouchableOpacity>
    );
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          My Branches
        </Text>

        <Text style={styles.subtitle}>
          Regional target performance
        </Text>
      </View>

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
              setPeriod(item.value)
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

      <View style={styles.summaryBar}>
        <View>
          <Text style={styles.summaryLabel}>
            REGIONAL LEADERBOARD
          </Text>

          <Text style={styles.summaryValue}>
            {branches.length} branches
          </Text>
        </View>

        <View style={styles.summaryRight}>
          <Text style={styles.summaryRightLabel}>
            SORTED BY
          </Text>

          <Text style={styles.summaryRightValue}>
            Achievement
          </Text>
        </View>
      </View>

      <FlatList
        data={branches}
        keyExtractor={(item) => item.branchId}
        renderItem={renderBranch}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#155EEF"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>
                —
              </Text>
            </View>

            <Text style={styles.emptyTitle}>
              No performance data
            </Text>

            <Text style={styles.emptyText}>
              Performance data is not available
              for this period.
            </Text>
          </View>
        }
      />
    </View>
  );
};

export default PerformanceLeaderboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF3',
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#102A43',
  },

  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7C93',
  },

  periodContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 15,
    marginBottom: 10,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#E8EDF5',
  },

  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },

  periodTextActive: {
    color: '#155EEF',
    fontWeight: '800',
  },

  summaryBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  summaryLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#8A97A6',
  },

  summaryValue: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '800',
    color: '#172B4D',
  },

  summaryRight: {
    alignItems: 'flex-end',
  },

  summaryRightLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#8A97A6',
  },

  summaryRightValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: '#155EEF',
  },

  list: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },

  branchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#E1E8F0',
    shadowColor: '#102A43',
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  rankBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rankText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#155EEF',
  },

  branchInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  branchName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#172B4D',
  },

  amountText: {
    marginTop: 4,
    fontSize: 12,
    color: '#718096',
  },

  percentageContainer: {
    alignItems: 'flex-end',
  },

  percentage: {
    fontSize: 18,
    fontWeight: '800',
    color: '#155EEF',
  },

  viewText: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },

  progressBackground: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8EDF5',
    marginTop: 16,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#155EEF',
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  remainingLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },

  remainingValue: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#172B4D',
  },

  detailsArrow: {
    fontSize: 25,
    fontWeight: '300',
    color: '#155EEF',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FB',
  },

  loadingText: {
    marginTop: 10,
    color: '#64748B',
  },

  empty: {
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 30,
  },

  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EAF0F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  emptyIconText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#94A3B8',
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#172B4D',
  },

  emptyText: {
    marginTop: 6,
    color: '#718096',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
});