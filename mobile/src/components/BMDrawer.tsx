import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

type BMDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onLeads: () => void;
  onMyRegion: () => void;
  onMyBranch: () => void;
  onLogout: () => void;
  userName: string;
  branchName: string;
  regionName: string;
};

export function BMDrawer({
  visible,
  onClose,
  onLeads,
  onMyRegion,
  onMyBranch,
  onLogout,
  userName,
  branchName,
  regionName,
}: BMDrawerProps) {
  const translateX = useRef(
    new Animated.Value(DRAWER_WIDTH)
  ).current;

  const overlayOpacity = useRef(
    new Animated.Value(0)
  ).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 180,
          mass: 0.8,
        }),

        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: DRAWER_WIDTH,
          duration: 180,
          useNativeDriver: true,
        }),

        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateX, overlayOpacity]);

  const handleLogout = () => {
    onClose();

    setTimeout(() => {
      onLogout();
    }, 150);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* BACKDROP */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        >
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: overlayOpacity,
              },
            ]}
          />
        </Pressable>

        {/* DRAWER */}
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [
                {
                  translateX,
                },
              ],
            },
          ]}
        >
          {/* PROFILE */}
          <View style={styles.profileSection}>
            <View style={styles.profileTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {userName.charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.profileDetails}>
                <Text
                  style={styles.userName}
                  numberOfLines={1}
                >
                  {userName}
                </Text>

                <Text style={styles.userRole}>
                  Branch Head
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.closeButton}
                onPress={onClose}
              >
                <Text style={styles.closeText}>
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.locationCard}>
              <Text style={styles.locationLabel}>
                CURRENT LOCATION
              </Text>

              <Text style={styles.locationBranch}>
                {branchName}
              </Text>

              <Text style={styles.locationRegion}>
                {regionName}
              </Text>
            </View>
          </View>

          {/* MENU */}
          <View style={styles.menuSection}>
            <Text style={styles.menuHeading}>
              MENU
            </Text>

            <DrawerItem
              icon="▦"
              label="Leads"
              onPress={onLeads}
            />

            <DrawerItem
              icon="◎"
              label="My Region"
              onPress={onMyRegion}
            />

            <DrawerItem
              icon="⌂"
              label="My Branch"
              onPress={onMyBranch}
              active
            />
          </View>

          {/* BOTTOM */}
          <View style={styles.bottomSection}>
            <View style={styles.separator} />

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <View style={styles.logoutIcon}>
                <Text style={styles.logoutIconText}>
                  ↪
                </Text>
              </View>

              <Text style={styles.logoutText}>
                Log Out
              </Text>
            </TouchableOpacity>

            <Text style={styles.brandText}>
              MSME - Utkarsh
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[
        styles.drawerItem,
        active && styles.drawerItemActive,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.itemIcon,
          active && styles.itemIconActive,
        ]}
      >
        <Text
          style={[
            styles.itemIconText,
            active && styles.itemIconTextActive,
          ]}
        >
          {icon}
        </Text>
      </View>

      <Text
        style={[
          styles.itemLabel,
          active && styles.itemLabelActive,
        ]}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.itemArrow,
          active && styles.itemArrowActive,
        ]}
      >
        ›
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },

  backdrop: {
    flex: 1,
    backgroundColor: '#07152F',
  },

  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: '#FFFFFF',
    paddingTop: 52,
    paddingHorizontal: 20,
    elevation: 20,
    shadowColor: '#000000',
    shadowOffset: {
      width: -7,
      height: 0,
    },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },

  profileSection: {
    paddingBottom: 23,
  },

  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E5EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#174EA6',
    fontSize: 20,
    fontWeight: '800',
  },

  profileDetails: {
    flex: 1,
    marginLeft: 12,
  },

  userName: {
    color: '#151C29',
    fontSize: 17,
    fontWeight: '700',
  },

  userRole: {
    color: '#788294',
    fontSize: 12,
    marginTop: 3,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F4F6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: '#263142',
    fontSize: 27,
    lineHeight: 29,
    fontWeight: '300',
  },

  locationCard: {
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: '#F4F7FC',
    borderWidth: 1,
    borderColor: '#E4EAF3',
  },

  locationLabel: {
    color: '#8A94A5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  locationBranch: {
    color: '#174EA6',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },

  locationRegion: {
    color: '#717C8D',
    fontSize: 12,
    marginTop: 2,
  },

  menuSection: {
    flex: 1,
  },

  menuHeading: {
    color: '#9AA3B1',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 9,
  },

  drawerItem: {
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 7,
  },

  drawerItemActive: {
    backgroundColor: '#EDF3FF',
  },

  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemIconActive: {
    backgroundColor: '#DCE8FF',
  },

  itemIconText: {
    color: '#697586',
    fontSize: 21,
    fontWeight: '600',
  },

  itemIconTextActive: {
    color: '#174EA6',
  },

  itemLabel: {
    flex: 1,
    marginLeft: 10,
    color: '#394354',
    fontSize: 15,
    fontWeight: '600',
  },

  itemLabelActive: {
    color: '#174EA6',
    fontWeight: '700',
  },

  itemArrow: {
    color: '#A1A9B5',
    fontSize: 23,
  },

  itemArrowActive: {
    color: '#174EA6',
  },

  bottomSection: {
    paddingBottom: 24,
  },

  separator: {
    height: 1,
    backgroundColor: '#E7EAF0',
    marginBottom: 11,
  },

  logoutButton: {
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },

  logoutIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutIconText: {
    color: '#C62828',
    fontSize: 21,
    fontWeight: '700',
  },

  logoutText: {
    color: '#C62828',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 12,
  },

  brandText: {
    textAlign: 'center',
    color: '#A3AAB6',
    fontSize: 10,
    marginTop: 14,
  },
});