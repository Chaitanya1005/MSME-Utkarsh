import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';

import { LoginScreen } from '../screens/Login/LoginScreen';
import { RMDashboardScreen } from '../screens/RMDashboard/RMDashboardScreen';
import { ZMDashboardScreen } from '../screens/ZMDashboard/ZMDashboardScreen';
import { GMDashboardScreen } from '../screens/GMDashboard/GMDashboardScreen';
import { FollowUpScreen } from '../screens/FollowUp/FollowUpScreen';
import { BranchDetailScreen } from '../screens/BranchDetail/BranchDetailScreen';
import { RegionDetailScreen } from '../screens/RegionDetail/RegionDetailScreen';
import { ZoneDetailScreen } from '../screens/ZoneDetail/ZoneDetailScreen';
import { LeadDetailScreen } from '../screens/LeadDetail/LeadDetailScreen';
import { BMLeadListScreen } from '../screens/BMLeadList/BMLeadListScreen';
import { ProposeUpdateScreen } from '../screens/ProposeUpdate/ProposeUpdateScreen';
import { VoiceUpdateScreen } from '../screens/VoiceUpdate/VoiceUpdateScreen';
import { ProposalReviewScreen } from '../screens/ProposalReview/ProposalReviewScreen';
import { FollowUpAccessScreen } from '../screens/FollowUpAccess/FollowUpAccessScreen';

import { PipelineStage } from '../types/api';

import PerformanceLeaderboardScreen from '../screens/Performance/PerformanceLeaderboardScreen';
import BranchPerformanceScreen from '../screens/Performance/BranchPerformanceScreen';

export type RootStackParamList = {
  Login: undefined;

  RMDashboard: undefined;
  ZMDashboard: undefined;
  GMDashboard: undefined;

  FollowUp:
    | {
        // RM's existing flow, unchanged: branch ids already selected on
        // RMDashboardScreen. Only this shape enables the Call channel,
        // which operates on real branch records (fetchBranch/initiateCall)
        // rather than a generic recipient.
        branchIds: string[];
      }
    | {
        // ZM/GM dashboard-driven flow: regions/zones already resolved to
        // their head's user id + display name before navigating here.
        recipients: Array<{ id: string; name: string }>;
      }
    | undefined; // nothing preselected — the screen shows its own
    // role-driven level-toggle selection UI instead.

  BranchDetail: {
    branchId: string;
  };

  RegionDetail: {
    regionId: string;
  };

  ZoneDetail: {
    zoneId: string;
  };

  BMLeadList: undefined;

  LeadDetail: {
    leadId: string;
  };

  ProposeUpdate: {
    leadId: string;
    currentStage: PipelineStage;
  };

  VoiceUpdate: undefined;

  ProposalReview: undefined;

  PerformanceLeaderboard: {
    initialPeriod?:
      | 'MONTH'
      | 'QUARTER'
      | 'ANNUAL';
  } | undefined;

  BranchPerformance: {
    branchId: string;
    branchName?: string;
    periodType?:
      | 'MONTH'
      | 'QUARTER'
      | 'ANNUAL';
  };

  FollowUpAccess: {
    token: string;
  };
};

export type RMStackParamList =
  RootStackParamList;

export type BMStackParamList =
  RootStackParamList;

const Stack =
  createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return null;
  }

  const isAuthenticated = !!user;
  const isRM = user?.role === 'RM';
  const isBM = user?.role === 'BM';
  const isZM = user?.role === 'ZM';
  const isCO = user?.role === 'CO';

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />
        ) : isRM ? (
          <>
            <Stack.Screen
              name="RMDashboard"
              component={RMDashboardScreen}
            />

            <Stack.Screen
              name="PerformanceLeaderboard"
              component={
                PerformanceLeaderboardScreen
              }
            />

            <Stack.Screen
              name="BranchPerformance"
              component={
                BranchPerformanceScreen
              }
            />

            <Stack.Screen
              name="FollowUp"
              component={FollowUpScreen}
            />

            <Stack.Screen
              name="BranchDetail"
              component={BranchDetailScreen}
            />

            <Stack.Screen
              name="LeadDetail"
              component={LeadDetailScreen}
            />

            <Stack.Screen
              name="ProposeUpdate"
              component={ProposeUpdateScreen}
            />

            <Stack.Screen
              name="VoiceUpdate"
              component={VoiceUpdateScreen}
            />

            <Stack.Screen
              name="ProposalReview"
              component={ProposalReviewScreen}
            />
          </>
        ) : isBM ? (
          <>
            <Stack.Screen
              name="BMLeadList"
              component={BMLeadListScreen}
            />

            <Stack.Screen
              name="PerformanceLeaderboard"
              component={
                PerformanceLeaderboardScreen
              }
            />

            <Stack.Screen
              name="BranchPerformance"
              component={
                BranchPerformanceScreen
              }
            />

            <Stack.Screen
              name="LeadDetail"
              component={LeadDetailScreen}
            />

            <Stack.Screen
              name="ProposeUpdate"
              component={ProposeUpdateScreen}
            />

            <Stack.Screen
              name="VoiceUpdate"
              component={VoiceUpdateScreen}
            />

            <Stack.Screen
              name="ProposalReview"
              component={ProposalReviewScreen}
            />
          </>
        ) : isZM ? (
          <>
            <Stack.Screen
              name="ZMDashboard"
              component={ZMDashboardScreen}
            />

            <Stack.Screen
              name="RegionDetail"
              component={RegionDetailScreen}
            />

            <Stack.Screen
              name="BranchDetail"
              component={BranchDetailScreen}
            />

            <Stack.Screen
              name="LeadDetail"
              component={LeadDetailScreen}
            />

            <Stack.Screen
              name="ProposeUpdate"
              component={ProposeUpdateScreen}
            />

            <Stack.Screen
              name="VoiceUpdate"
              component={VoiceUpdateScreen}
            />

            <Stack.Screen
              name="ProposalReview"
              component={ProposalReviewScreen}
            />

            <Stack.Screen
              name="FollowUp"
              component={FollowUpScreen}
            />
          </>
        ) : isCO ? (
          <>
            <Stack.Screen
              name="GMDashboard"
              component={GMDashboardScreen}
            />

            <Stack.Screen
              name="ZoneDetail"
              component={ZoneDetailScreen}
            />

            <Stack.Screen
              name="RegionDetail"
              component={RegionDetailScreen}
            />

            <Stack.Screen
              name="BranchDetail"
              component={BranchDetailScreen}
            />

            {/* Reused, read-only for CO — LeadDetailScreen itself hides
                the update button for any role outside BM/RM/ZM. */}
            <Stack.Screen
              name="LeadDetail"
              component={LeadDetailScreen}
            />

            <Stack.Screen
              name="FollowUp"
              component={FollowUpScreen}
            />
          </>
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
