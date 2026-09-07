import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { fetchMyLeads } from '../../api/dashboardApi';
import { LoadingState, ErrorState, EmptyState } from '../../components/StatusStates';
import { RegionDetailLead } from '../../types/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'MyLeads'>;

// The RM/ZM equivalent of BMLeadListScreen — same hero, same voice card
// treatment (glow, mic illustration, waveform), same 3-bucket stat row —
// leads assigned directly to the caller's own region (RM) or every
// region in their zone (ZM), with the same Voice Update entry point BM
// already has (Full-Hierarchy Expansion plan; voiceUpdate.service.ts
// already scopes voice updates to BM/RM/ZM, this screen makes that
// reachable for RM/ZM).
export function MyLeadsScreen({ navigation }: Props) {
  const { user } = useAuth();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['my-leads', user?.id],
    queryFn: fetchMyLeads,
    enabled: !!user,
  });

  if (isLoading) {
    return <LoadingState label="Loading your leads..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load your leads.'}
        onRetry={() => refetch()}
      />
    );
  }

  const leads = data?.leads ?? [];

  const documentation = leads.filter((l) => l.cbiPesStage === 'LEAD_CONFIRMED' || l.cbiPesStage === 'DOCUMENTS_RECEIVED').length;
  const processing = leads.filter((l) => l.cbiPesStage === 'BRANCH_PROCESSING' || l.cbiPesStage === 'SANCTIONED' || l.cbiPesStage === 'TO_RAC').length;
  const approved = leads.filter((l) => l.cbiPesStage === 'APPROVED' || l.cbiPesStage === 'DISBURSED').length;
  const totalLeads = leads.length;

  const scopeLabel = data?.scopeLabel ?? (user?.role === 'ZM' ? 'Your zone' : 'Your region');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <FlatList
          data={leads}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor="#0B3D91" />}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <TouchableOpacity activeOpacity={0.75} style={styles.backButton} onPress={() => navigation.goBack()} testID="back-button">
                  <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>

                <View style={styles.headerText}>
                  <Text style={styles.greetingSmall}>My Leads</Text>
                  <Text style={styles.greetingName} numberOfLines={1}>
                    {user?.name ?? (user?.role === 'ZM' ? 'Zonal Head' : 'Regional Head')}
                  </Text>
                  <View style={styles.locationRow}>
                    <Text style={styles.scopeName}>{scopeLabel}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.voiceHero}
                onPress={() => navigation.navigate('VoiceUpdate')}
                testID="voice-update-cta"
              >
                <View style={styles.voiceGlowOne} />
                <View style={styles.voiceGlowTwo} />

                <View style={styles.micOuter}>
                  <View style={styles.micInner}>
                    <View style={styles.micBody}>
                      <View style={styles.micTop} />
                    </View>
                    <View style={styles.micArc} />
                    <View style={styles.micStand} />
                    <View style={styles.micBase} />
                  </View>
                </View>

                <View style={styles.voiceContent}>
                  <View style={styles.voiceHeadingRow}>
                    <Text style={styles.voiceTitle}>Voice Update</Text>
                    <View style={styles.aiBadge}>
                      <Text style={styles.aiBadgeText}>AI</Text>
                    </View>
                  </View>

                  <Text style={styles.voiceDescription}>Update these leads quickly using your voice</Text>

                  <View style={styles.voiceButton}>
                    <Text style={styles.voiceButtonText}>Start Voice Update</Text>
                    <Text style={styles.voiceButtonArrow}>→</Text>
                  </View>
                </View>

                <View style={styles.waveform}>
                  <View style={[styles.wave, { height: 13 }]} />
                  <View style={[styles.wave, { height: 25 }]} />
                  <View style={[styles.wave, { height: 39 }]} />
                  <View style={[styles.wave, { height: 19 }]} />
                  <View style={[styles.wave, { height: 47 }]} />
                  <View style={[styles.wave, { height: 30 }]} />
                  <View style={[styles.wave, { height: 54 }]} />
                  <View style={[styles.wave, { height: 24 }]} />
                  <View style={[styles.wave, { height: 40 }]} />
                  <View style={[styles.wave, { height: 18 }]} />
                </View>
              </TouchableOpacity>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Overview</Text>
              </View>

              <View style={styles.statsCard}>
                <Stat value={totalLeads} label="Total Leads" />
                <View style={styles.statDivider} />
                <Stat value={documentation} label="Documentation" />
                <View style={styles.statDivider} />
                <Stat value={processing} label="Processing" />
                <View style={styles.statDivider} />
                <Stat value={approved} label="Approved" />
              </View>

              <View style={styles.leadsHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Leads</Text>
                  <Text style={styles.leadsSubtitle}>Assigned directly to {scopeLabel}</Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{totalLeads}</Text>
                </View>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <LeadRow lead={item} onPress={() => navigation.navigate('LeadDetail', { leadId: item.id })} />
          )}
          ListEmptyComponent={<EmptyState message="No leads assigned directly to you yet." />}
        />
      </View>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LeadRow({ lead, onPress }: { lead: RegionDetailLead; onPress: () => void }) {
  const initials = lead.customerName
    ? lead.customerName.split(' ').slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()
    : '?';

  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.leadCard} onPress={onPress} testID={`lead-row-${lead.id}`}>
      <View style={styles.leadTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.leadIdentity}>
          <Text style={styles.leadName} numberOfLines={1}>
            {lead.customerName}
          </Text>
          {lead.sourceSrNo ? (
            <Text style={styles.leadProduct} numberOfLines={1}>
              Lead #{lead.sourceSrNo}
            </Text>
          ) : null}
        </View>

        <Text style={styles.chevron}>›</Text>
      </View>

      <View style={styles.leadBottom}>
        <View style={styles.stageBadge}>
          <Text style={styles.stageText}>{lead.cbiPesStage.replace(/_/g, ' ')}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FB' },
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  listContent: { paddingTop: 15, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 19 },
  backButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E7EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
    elevation: 3,
    shadowColor: '#0B3D91',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
  },
  backArrow: { fontSize: 22, color: '#0B3D91', fontWeight: '700', marginTop: -2 },
  headerText: { flex: 1 },
  greetingSmall: { fontSize: 13, color: '#7B8595', fontWeight: '500', marginBottom: 2 },
  greetingName: { fontSize: 24, lineHeight: 29, color: '#121A28', fontWeight: '700' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  scopeName: { fontSize: 14, color: '#174EA6', fontWeight: '700' },
  voiceHero: {
    marginHorizontal: 20,
    minHeight: 172,
    borderRadius: 22,
    backgroundColor: '#0B3D91',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 17,
    marginBottom: 24,
    elevation: 8,
    shadowColor: '#0B3D91',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 15,
  },
  voiceGlowOne: { position: 'absolute', width: 180, height: 180, borderRadius: 90, left: -105, top: -70, backgroundColor: '#2458B8', opacity: 0.6 },
  voiceGlowTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, right: -55, top: -50, backgroundColor: '#1C4EA7', opacity: 0.5 },
  micOuter: { width: 91, height: 91, borderRadius: 46, borderWidth: 2, borderColor: '#6D9CFF', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  micInner: { width: 69, height: 69, borderRadius: 35, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  micBody: { width: 22, height: 33, borderWidth: 3, borderColor: '#174EA6', borderRadius: 12, alignItems: 'center', justifyContent: 'flex-start' },
  micTop: { width: 10, height: 3, backgroundColor: '#174EA6', borderRadius: 2, marginTop: -1 },
  micArc: {
    position: 'absolute',
    width: 33,
    height: 31,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderColor: '#174EA6',
    borderBottomLeftRadius: 17,
    borderBottomRightRadius: 17,
    top: 27,
  },
  micStand: { width: 3, height: 8, backgroundColor: '#174EA6', marginTop: 2 },
  micBase: { width: 17, height: 3, backgroundColor: '#174EA6', borderRadius: 2, marginTop: 2 },
  voiceContent: { flex: 1, zIndex: 2 },
  voiceHeadingRow: { flexDirection: 'row', alignItems: 'center' },
  voiceTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  aiBadge: { marginLeft: 8, backgroundColor: '#FFFFFF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  aiBadgeText: { color: '#174EA6', fontSize: 9, fontWeight: '800' },
  voiceDescription: { color: '#DCE8FF', fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 175 },
  voiceButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  voiceButtonText: { color: '#123F91', fontSize: 11, fontWeight: '700' },
  voiceButtonArrow: { color: '#123F91', fontSize: 16, fontWeight: '700', marginLeft: 7 },
  waveform: { position: 'absolute', right: 9, bottom: 9, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.35 },
  wave: { width: 3, borderRadius: 3, backgroundColor: '#7FA5FF' },
  sectionHeader: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 19, color: '#192232', fontWeight: '700' },
  statsCard: {
    marginHorizontal: 20,
    marginTop: 11,
    marginBottom: 23,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: '#E5E9F0',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 20, color: '#172033', fontWeight: '700' },
  statLabel: { fontSize: 9, color: '#7C8697', marginTop: 4, textAlign: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: '#E7EAF0' },
  leadsHeader: { paddingHorizontal: 20, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leadsSubtitle: { fontSize: 11, color: '#8A94A4', marginTop: 3 },
  countBadge: { minWidth: 35, height: 35, borderRadius: 18, backgroundColor: '#E8F0FF', justifyContent: 'center', alignItems: 'center' },
  countBadgeText: { color: '#174EA6', fontSize: 14, fontWeight: '700' },
  leadCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 15,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#E6EAF1',
  },
  leadTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 47, height: 47, borderRadius: 24, backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#174EA6', fontSize: 16, fontWeight: '700' },
  leadIdentity: { flex: 1 },
  leadName: { color: '#151C29', fontSize: 16, fontWeight: '700' },
  leadProduct: { color: '#737D8D', fontSize: 13, marginTop: 3 },
  chevron: { color: '#8993A1', fontSize: 27, marginLeft: 8 },
  leadBottom: { marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#EEF1F5', flexDirection: 'row', alignItems: 'center' },
  stageBadge: { backgroundColor: '#E8F0FF', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  stageText: { color: '#174EA6', fontSize: 10, fontWeight: '800' },
});
