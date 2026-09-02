import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../auth/AuthContext';
import { fetchMyScope, fetchLeads } from '../../api/orgApi';
import { LoadingState, EmptyState, ErrorState } from '../../components/StatusStates';
import { BmScope } from '../../types/api';
import { BMDrawer } from '../../components/BMDrawer';

export function BMHomeScreen({ navigation }: any) {
  console.log('🔥 NEW BM HOME SCREEN LOADED');
  const { user, logout } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const listRef = useRef<FlatList>(null);

  const scopeQuery = useQuery({
    queryKey: ['org', 'scope', user?.id, user?.role],
    queryFn: fetchMyScope,
    enabled: !!user && user.role === 'BM',
  });

  const leadsQuery = useQuery({
    queryKey: ['leads', 'my-branch', user?.id, user?.branch?.id],
    queryFn: () => fetchLeads({ page: 1, pageSize: 20 }),
    enabled: scopeQuery.isSuccess && user?.role === 'BM',
  });

  if (scopeQuery.isLoading) {
    return <LoadingState label="Loading your branch..." />;
  }

  if (scopeQuery.isError) {
    return (
      <ErrorState
        message={
          scopeQuery.error instanceof Error
            ? scopeQuery.error.message
            : 'Failed to load your branch.'
        }
        onRetry={() => scopeQuery.refetch()}
      />
    );
  }

  const scope = scopeQuery.data as BmScope;

  if (scope.role !== 'BM' || !scope.branch || !scope.branch.region) {
    return (
      <ErrorState
        message="Invalid branch scope returned by the server."
        onRetry={() => scopeQuery.refetch()}
      />
    );
  }

  const leads = leadsQuery.data?.items ?? [];

  const stats = useMemo(() => {
    const total = leads.length;

    const contacted = leads.filter(
      (lead) => lead.cbiPesStage === 'CONTACTED'
    ).length;

    const inProgress = leads.filter(
      (lead) =>
        lead.cbiPesStage === 'INTERESTED' ||
        lead.cbiPesStage === 'APPLICATION'
    ).length;

    const approval = leads.filter(
      (lead) => lead.cbiPesStage === 'APPROVAL'
    ).length;

    return {
      total,
      contacted,
      inProgress,
      approval,
    };
  }, [leads]);

  const handleLeadsPress = () => {
    setDrawerVisible(false);

    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    }, 150);
  };

  const handleMyRegionPress = () => {
    setDrawerVisible(false);

    // Region navigation can be connected when the dedicated
    // BM region screen is introduced.
  };

  const handleMyBranchPress = () => {
    setDrawerVisible(false);

    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    }, 150);
  };

  const renderLead = ({ item }: any) => {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.leadCard}
        onPress={() =>
          navigation?.navigate?.('LeadDetail', {
            leadId: item.id,
          })
        }
      >
        <View style={styles.leadTopRow}>
          <View style={styles.customerAvatar}>
            <Text style={styles.customerAvatarText}>
              {item.customerName?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>

          <View style={styles.leadIdentity}>
            <Text style={styles.leadName} numberOfLines={1}>
              {item.customerName}
            </Text>

            <Text style={styles.leadProduct} numberOfLines={1}>
              {item.subProductName}
            </Text>
          </View>

          <Text style={styles.chevron}>›</Text>
        </View>

        <View style={styles.leadBottomRow}>
          <View style={styles.stageBadge}>
            <Text style={styles.stageBadgeText}>
              {item.cbiPesStage}
            </Text>
          </View>

          <Text style={styles.leadAmount}>
            ₹{Number(item.amount).toLocaleString('en-IN')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.menuButton}
            onPress={() => setDrawerVisible(true)}
            testID="menu-button"
          >
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </TouchableOpacity>

          <View style={styles.greetingContainer}>
            <Text style={styles.greetingSmall}>Good morning</Text>

            <Text style={styles.greetingName} numberOfLines={1}>
              {user?.name ?? 'Branch Head'}
            </Text>

            <View style={styles.branchRow}>
              <Text style={styles.branchName}>
                {scope.branch.name}
              </Text>

              <Text style={styles.branchSeparator}>•</Text>

              <Text style={styles.regionName}>
                {scope.branch.region.name}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Voice Update Hero */}
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.voiceHero}
        onPress={() =>
          navigation?.navigate?.('VoiceUpdate')
        }
      >
        <View style={styles.voiceHeroGlow} />

        <View style={styles.microphoneCircleOuter}>
          <View style={styles.microphoneCircleInner}>
            <Text style={styles.microphoneIcon}>●</Text>
            <View style={styles.micStem} />
          </View>
        </View>

        <View style={styles.voiceHeroContent}>
          <View style={styles.voiceTitleRow}>
            <Text style={styles.voiceTitle}>
              Voice Update
            </Text>

            <View style={styles.aiPill}>
              <Text style={styles.aiPillText}>AI</Text>
            </View>
          </View>

          <Text style={styles.voiceDescription}>
            Update your leads quickly using your voice
          </Text>

          <View style={styles.voiceAction}>
            <Text style={styles.voiceActionText}>
              Start Voice Update
            </Text>

            <Text style={styles.voiceArrow}>
              →
            </Text>
          </View>
        </View>

        {/* Decorative waveform */}
        <View style={styles.waveform}>
          <View style={[styles.waveBar, { height: 12 }]} />
          <View style={[styles.waveBar, { height: 22 }]} />
          <View style={[styles.waveBar, { height: 35 }]} />
          <View style={[styles.waveBar, { height: 18 }]} />
          <View style={[styles.waveBar, { height: 45 }]} />
          <View style={[styles.waveBar, { height: 28 }]} />
          <View style={[styles.waveBar, { height: 52 }]} />
          <View style={[styles.waveBar, { height: 20 }]} />
          <View style={[styles.waveBar, { height: 38 }]} />
        </View>
      </TouchableOpacity>

      {/* Branch Overview */}
      <Text style={styles.sectionTitle}>
        Branch Overview
      </Text>

      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {stats.total}
          </Text>

          <Text style={styles.statLabel}>
            Total Leads
          </Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {stats.contacted}
          </Text>

          <Text style={styles.statLabel}>
            Contacted
          </Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {stats.inProgress}
          </Text>

          <Text style={styles.statLabel}>
            In Progress
          </Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {stats.approval}
          </Text>

          <Text style={styles.statLabel}>
            Approval
          </Text>
        </View>
      </View>

      {/* Leads Header */}
      <View style={styles.leadsHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            Leads
          </Text>

          <Text style={styles.leadsSubtext}>
            Leads assigned to {scope.branch.name}
          </Text>
        </View>

        <View style={styles.leadCountBadge}>
          <Text style={styles.leadCountText}>
            {leads.length}
          </Text>
        </View>
      </View>

      {/* Leads */}
      {leadsQuery.isLoading ? (
        <LoadingState label="Loading leads..." />
      ) : leadsQuery.isError ? (
        <ErrorState
          message={
            leadsQuery.error instanceof Error
              ? leadsQuery.error.message
              : 'Failed to load leads.'
          }
          onRetry={() => leadsQuery.refetch()}
        />
      ) : leads.length === 0 ? (
        <EmptyState message="No leads available." />
      ) : (
        <FlatList
          ref={listRef}
          data={leads}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={leadsQuery.isRefetching}
              onRefresh={() => leadsQuery.refetch()}
            />
          }
          renderItem={renderLead}
        />
      )}

      {/* Right-side Drawer */}
      <BMDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onLeads={handleLeadsPress}
        onMyRegion={handleMyRegionPress}
        onMyBranch={handleMyBranchPress}
        onLogout={logout}
        userName={user?.name ?? 'Branch Head'}
        branchName={scope.branch.name}
        regionName={scope.branch.region.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
    paddingTop: 16,
  },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  menuButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    shadowColor: '#0B3D91',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  menuLine: {
    width: 20,
    height: 2,
    backgroundColor: '#0B3D91',
    marginVertical: 2,
    borderRadius: 2,
  },

  greetingContainer: {
    flex: 1,
  },

  greetingSmall: {
    fontSize: 13,
    color: '#7A8494',
    fontWeight: '500',
    marginBottom: 2,
  },

  greetingName: {
    fontSize: 24,
    lineHeight: 29,
    color: '#111827',
    fontWeight: '700',
  },

  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },

  branchName: {
    fontSize: 14,
    color: '#174EA6',
    fontWeight: '700',
  },

  branchSeparator: {
    marginHorizontal: 7,
    color: '#A0A8B5',
    fontSize: 12,
  },

  regionName: {
    fontSize: 14,
    color: '#687386',
    fontWeight: '500',
  },

  voiceHero: {
    marginHorizontal: 20,
    marginBottom: 24,
    minHeight: 174,
    borderRadius: 22,
    backgroundColor: '#0B3D91',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    paddingVertical: 18,
    shadowColor: '#0B3D91',
    shadowOffset: {
      width: 0,
      height: 9,
    },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },

  voiceHeroGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    left: -80,
    top: -65,
    backgroundColor: '#174EA6',
    opacity: 0.45,
  },

  microphoneCircleOuter: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 2,
    borderColor: '#5B8DEF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  microphoneCircleInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  microphoneIcon: {
    fontSize: 26,
    color: '#0B3D91',
    lineHeight: 24,
  },

  micStem: {
    width: 3,
    height: 12,
    backgroundColor: '#0B3D91',
    marginTop: 2,
    borderRadius: 2,
  },

  voiceHeroContent: {
    flex: 1,
    zIndex: 2,
  },

  voiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  voiceTitle: {
    fontSize: 21,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  aiPill: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },

  aiPillText: {
    color: '#0B3D91',
    fontSize: 10,
    fontWeight: '800',
  },

  voiceDescription: {
    color: '#DCE8FF',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    maxWidth: 180,
  },

  voiceAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },

  voiceActionText: {
    color: '#0B3D91',
    fontSize: 12,
    fontWeight: '700',
  },

  voiceArrow: {
    color: '#0B3D91',
    fontSize: 17,
    marginLeft: 8,
    fontWeight: '700',
  },

  waveform: {
    position: 'absolute',
    right: 8,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.35,
  },

  waveBar: {
    width: 3,
    borderRadius: 3,
    backgroundColor: '#7EA5FF',
  },

  sectionTitle: {
    fontSize: 19,
    color: '#1A2333',
    fontWeight: '700',
  },

  statsCard: {
    marginHorizontal: 20,
    marginTop: 11,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    paddingVertical: 17,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6EAF1',
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
  },

  statNumber: {
    fontSize: 20,
    color: '#172033',
    fontWeight: '700',
  },

  statLabel: {
    fontSize: 10,
    color: '#778195',
    marginTop: 4,
    textAlign: 'center',
  },

  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E6EAF1',
  },

  leadsHeader: {
    marginHorizontal: 20,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  leadsSubtext: {
    fontSize: 11,
    color: '#8A93A3',
    marginTop: 3,
  },

  leadCountBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8F0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  leadCountText: {
    color: '#174EA6',
    fontSize: 14,
    fontWeight: '700',
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },

  leadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 16,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#E7EBF2',
  },

  leadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  customerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E8F0FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  customerAvatarText: {
    color: '#174EA6',
    fontSize: 17,
    fontWeight: '700',
  },

  leadIdentity: {
    flex: 1,
  },

  leadName: {
    fontSize: 16,
    color: '#151C29',
    fontWeight: '700',
  },

  leadProduct: {
    fontSize: 13,
    color: '#727C8C',
    marginTop: 3,
  },

  chevron: {
    fontSize: 27,
    color: '#8791A0',
    marginLeft: 8,
  },

  leadBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
  },

  stageBadge: {
    backgroundColor: '#E8F0FF',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  stageBadgeText: {
    color: '#174EA6',
    fontSize: 10,
    fontWeight: '800',
  },

  leadAmount: {
    color: '#151C29',
    fontSize: 15,
    fontWeight: '700',
  },
});