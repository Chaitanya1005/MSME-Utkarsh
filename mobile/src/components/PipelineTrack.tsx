import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PipelineStage } from '../types/api';
import { STAGE_ORDER, STAGE_META } from '../constants/pipelineStages';

// The 7-stage horizontal pipeline visualization, factored out of
// BranchDetailScreen so RegionDetailScreen/ZoneDetailScreen (Full-
// Hierarchy Expansion plan, Phase 4) render the identical component
// instead of a re-implementation.
export function PipelineTrack({ leadsByStage }: { leadsByStage: Record<PipelineStage, number> }) {
  return (
    <View style={styles.pipelineTrack}>
      {STAGE_ORDER.map((stage, index) => {
        const count = leadsByStage[stage] ?? 0;
        const meta = STAGE_META[stage];

        return (
          <View key={stage} style={styles.pipelineStage}>
            <View style={styles.pipelineStageTop}>
              <View style={[styles.pipelineDot, { backgroundColor: meta.color }]} />
              {index < STAGE_ORDER.length - 1 ? <View style={styles.pipelineLine} /> : null}
            </View>

            <Text style={[styles.pipelineCount, { color: meta.color }]}>{count}</Text>
            <Text style={styles.pipelineLabel} numberOfLines={1}>
              {meta.short}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pipelineTrack: { flexDirection: 'row', alignItems: 'flex-start' },
  pipelineStage: { flex: 1 },
  pipelineStageTop: { height: 10, flexDirection: 'row', alignItems: 'center' },
  pipelineDot: { width: 9, height: 9, borderRadius: 4.5, zIndex: 2 },
  pipelineLine: { flex: 1, height: 1, backgroundColor: '#DCE4EB', marginHorizontal: 2 },
  pipelineCount: { fontSize: 18, fontWeight: '800', marginTop: 7 },
  pipelineLabel: { color: '#778390', fontSize: 8, fontWeight: '600', marginTop: 1 },
});
