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
  PerformanceEvaluationBranch,
  getPerformanceEvaluation,
} from '../../services/performanceService';

interface Props {
  navigation: any;
}

// Short column-header labels for the 4 comparison metrics — the backend
// sends the full descriptive label (shown once, in the sub-header
// beneath the table header) since it's the same metric for every row.
const SHORT_METRIC_LABELS = [
  'Last FY',
  'Next Month',
  'Next Qtr',
  'FY Target',
];

const formatCurrency = (value: number | null) => {
  if (value === null) {
    return '—';
  }

  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)}Cr`;
  }

  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)}L`;
  }

  return `₹${value.toLocaleString('en-IN')}`;
};

const formatAsOfDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// Renamed from "My Branches" — an RM's live table of every branch's
// business done so far this fiscal year, alongside one of four
// comparison metrics that switches for the WHOLE table on tap: last
// FY's actual, and targets for next month / next quarter / this FY's
// year-end (Full-Hierarchy Expansion follow-up, RM-only for now).
const PerformanceLeaderboardScreen = ({
  navigation,
}: Props) => {
  const [branches, setBranches] = useState<
    PerformanceEvaluationBranch[]
  >([]);

  // Which of the 4 comparison metrics is currently shown — shared
  // across every row, so tapping the metric column header (or any row)
  // advances all of them together.
  const [metricIndex, setMetricIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPerformance = async () => {
    try {
      const data = await getPerformanceEvaluation();
      setBranches(data);
    } catch (error) {
      console.error(
        'Failed to load performance evaluation:',
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
    }, []),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadPerformance();
  };

  const handleBranchPress = (
    branch: PerformanceEvaluationBranch,
  ) => {
    navigation.navigate('BranchPerformance', {
      branchId: branch.branchId,
      branchName: branch.branchName,
    });
  };

  const cycleMetric = () => {
    setMetricIndex((prev) => (prev + 1) % 4);
  };

  const activeMetricSample = branches[0]?.comparisons[metricIndex];

  const renderBranch = ({
    item,
    index,
  }: {
    item: PerformanceEvaluationBranch;
    index: number;
  }) => {
    const metric = item.comparisons[metricIndex];

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        style={styles.row}
        onPress={() => handleBranchPress(item)}
        testID={`performance-branch-${item.branchId}`}
      >
        <Text style={styles.rowIndex}>{index + 1}</Text>

        <Text style={styles.rowBranch} numberOfLines={1}>
          {item.branchName}
        </Text>

        <Text style={styles.rowBusiness} numberOfLines={1}>
          {formatCurrency(item.businessAsOfToday)}
        </Text>

        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.rowMetricTouch}
          onPress={cycleMetric}
          testID={`performance-metric-${item.branchId}`}
        >
          <Text style={styles.rowMetric} numberOfLines={1}>
            {formatCurrency(metric.value)}
          </Text>
        </TouchableOpacity>
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
          Loading performance evaluation...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Performance Evaluation
        </Text>

        <Text style={styles.subtitle}>
          Business done vs. targets, by branch
        </Text>
      </View>

      {activeMetricSample ? (
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.activeMetricBanner}
          onPress={cycleMetric}
          testID="performance-metric-banner"
        >
          <Text style={styles.activeMetricLabel} numberOfLines={1}>
            {activeMetricSample.label} · {formatAsOfDate(activeMetricSample.asOf)}
          </Text>

          <View style={styles.dotsRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === metricIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, styles.rowIndex]}>#</Text>
        <Text style={[styles.tableHeaderCell, styles.rowBranch]}>BRANCH</Text>
        <Text style={[styles.tableHeaderCell, styles.rowBusiness]}>TODAY</Text>
        <TouchableOpacity
          style={styles.rowMetricTouch}
          activeOpacity={0.6}
          onPress={cycleMetric}
        >
          <Text
            style={[styles.tableHeaderCell, styles.tableHeaderMetric]}
            numberOfLines={1}
          >
            {SHORT_METRIC_LABELS[metricIndex]} ▾
          </Text>
        </TouchableOpacity>
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
              Performance data is not available yet.
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

  activeMetricBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#EAF0FF',
  },

  activeMetricLabel: {
    flex: 1,
    marginRight: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#3651B8',
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#B7C4EA',
    marginLeft: 4,
  },

  dotActive: {
    backgroundColor: '#155EEF',
    width: 14,
  },

  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE3EC',
  },

  tableHeaderCell: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#8A97A6',
  },

  tableHeaderMetric: {
    color: '#155EEF',
    textAlign: 'right',
  },

  list: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F6',
  },

  rowIndex: {
    width: 22,
    fontSize: 11,
    fontWeight: '700',
    color: '#A0AEC0',
  },

  rowBranch: {
    flex: 1,
    marginRight: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#172B4D',
  },

  rowBusiness: {
    width: 82,
    textAlign: 'right',
    marginRight: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#155EEF',
  },

  rowMetricTouch: {
    width: 82,
    alignItems: 'flex-end',
  },

  rowMetric: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374863',
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
