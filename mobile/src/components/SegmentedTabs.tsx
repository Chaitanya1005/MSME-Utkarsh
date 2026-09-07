import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface SegmentedTab {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  tabs: SegmentedTab[];
  activeKey: string;
  onChange: (key: string) => void;
}

// A tap-to-switch pill selector — used to split a detail screen's
// sections (e.g. "Leads" / "Branches") into separate views instead of
// stacking them vertically, so a unit with many leads doesn't push its
// branch/region list dozens of scrolls down (Full-Hierarchy Expansion
// plan, region/zone detail UX pass).
export function SegmentedTabs({ tabs, activeKey, onChange }: Props) {
  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.8}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(tab.key)}
            testID={`segmented-tab-${tab.key}`}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {tab.label}
              {tab.count !== undefined ? ` (${tab.count})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#EAF0F7',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#17324A',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B6B7C',
  },
  tabTextActive: {
    color: '#0B5CAB',
  },
});
