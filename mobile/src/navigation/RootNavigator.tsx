import React from 'react';
import {
  ActivityIndicator,
  View,
  StyleSheet,
} from 'react-native';
import {
  NavigationContainer,
  LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';

import { LoginScreen } from '../screens/Login/LoginScreen';
import { RMDashboardScreen } from '../screens/RMDashboard/RMDashboardScreen';
import { FollowUpScreen } from '../screens/FollowUp/FollowUpScreen';
import { BranchDetailScreen } from '../screens/BranchDetail/BranchDetailScreen';
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

  FollowUp: {
    branchIds: string[];
  };

  BranchDetail: {
    branchId: string;
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
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  const isAuthenticated = !!user;
  const isRM = user?.role === 'RM';
  const isBM = user?.role === 'BM';

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