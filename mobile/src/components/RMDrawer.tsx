import React from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

type RMDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onDashboard: () => void;
  onMyBranches: () => void;
  onFollowUps: () => void;
  onCalling: () => void;
  onLogout: () => void;
};

type DrawerItemProps = {
  label: string;
  icon: string;
  onPress: () => void;
};

const DrawerItem = ({
  label,
  icon,
  onPress,
}: DrawerItemProps) => {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={styles.drawerItem}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>
          {icon}
        </Text>
      </View>

      <Text style={styles.drawerItemText}>
        {label}
      </Text>

      <Text style={styles.chevron}>
        ›
      </Text>
    </TouchableOpacity>
  );
};

export const RMDrawer = ({
  visible,
  onClose,
  onDashboard,
  onMyBranches,
  onFollowUps,
  onCalling,
  onLogout,
}: RMDrawerProps) => {
  const handleNavigation = (
    callback: () => void,
  ) => {
    onClose();

    setTimeout(() => {
      callback();
    }, 180);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
        />

        <View style={styles.drawer}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>
                CBI-PES
              </Text>

              <Text style={styles.subtitle}>
                Relationship Head
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeText}>
                ×
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <View style={styles.menu}>
            <DrawerItem
              icon="⌂"
              label="Dashboard"
              onPress={() =>
                handleNavigation(
                  onDashboard,
                )
              }
            />

            <DrawerItem
              icon="▥"
              label="My Branches"
              onPress={() =>
                handleNavigation(
                  onMyBranches,
                )
              }
            />

            <DrawerItem
              icon="↗"
              label="Follow-Ups"
              onPress={() =>
                handleNavigation(
                  onFollowUps,
                )
              }
            />

            <DrawerItem
              icon="☎"
              label="Calling"
              onPress={() =>
                handleNavigation(
                  onCalling,
                )
              }
            />
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.divider} />

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.logoutButton}
              onPress={onLogout}
            >
              <View
                style={
                  styles.logoutIconContainer
                }
              >
                <Text style={styles.logoutIcon}>
                  ↪
                </Text>
              </View>

              <Text style={styles.logoutText}>
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },

  backdrop: {
    flex: 1,
    backgroundColor:
      'rgba(15, 23, 42, 0.42)',
  },

  drawer: {
    width: Math.min(width * 0.82, 330),
    height: '100%',
    backgroundColor: '#FFFFFF',
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: {
      width: 5,
      height: 0,
    },
    elevation: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },

  brand: {
    fontSize: 22,
    fontWeight: '800',
    color: '#123B66',
    letterSpacing: 0.3,
  },

  subtitle: {
    marginTop: 3,
    fontSize: 11,
    color: '#7B8794',
    fontWeight: '500',
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6FA',
  },

  closeText: {
    fontSize: 26,
    lineHeight: 28,
    color: '#526274',
    fontWeight: '400',
  },

  divider: {
    height: 1,
    backgroundColor: '#E8EDF3',
    marginVertical: 20,
  },

  menu: {
    gap: 5,
  },

  drawerItem: {
    minHeight: 56,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FB',
    marginRight: 12,
  },

  icon: {
    fontSize: 18,
    color: '#155EEF',
  },

  drawerItemText: {
    flex: 1,
    fontSize: 14,
    color: '#26384A',
    fontWeight: '600',
  },

  chevron: {
    fontSize: 22,
    color: '#A0ACB8',
    marginLeft: 8,
  },

  bottomSection: {
    marginTop: 'auto',
  },

  logoutButton: {
    minHeight: 52,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoutIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
    marginRight: 12,
  },

  logoutIcon: {
    fontSize: 19,
    color: '#C62846',
  },

  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C62846',
  },
});