import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

// Only import maps on native platforms
let MapViewComponent: any = null;
let PolylineComponent: any = null;
let MarkerComponent: any = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapViewComponent = Maps.default;
    PolylineComponent = Maps.Polyline;
    MarkerComponent = Maps.Marker;
  } catch (e) {
    console.log('Maps not available');
  }
}

interface MapWrapperProps {
  routeCoords: Array<{ latitude: number; longitude: number }>;
  style?: any;
  showStartEndMarkers?: boolean;
  followUser?: boolean;
  mapRef?: any;
}

export const MapViewWrapper: React.FC<MapWrapperProps> = ({
  routeCoords,
  style,
  showStartEndMarkers = true,
  followUser = false,
  mapRef,
}) => {
  // Web fallback
  if (Platform.OS === 'web' || !MapViewComponent) {
    return (
      <View style={[styles.container, style, styles.placeholder]}>
        <Ionicons name="map" size={48} color={Colors.text.muted} />
        <Text style={styles.placeholderTitle}>Map View</Text>
        <Text style={styles.placeholderText}>
          Available on mobile devices
        </Text>
        {routeCoords.length > 0 && (
          <Text style={styles.placeholderSubtext}>
            {routeCoords.length} GPS points recorded
          </Text>
        )}
      </View>
    );
  }

  // Native map
  const initialRegion = routeCoords.length > 0
    ? {
        latitude: routeCoords[0].latitude,
        longitude: routeCoords[0].longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };

  return (
    <MapViewComponent
      ref={mapRef}
      style={[styles.container, style]}
      initialRegion={initialRegion}
      showsUserLocation={followUser}
      followsUserLocation={followUser}
    >
      {routeCoords.length > 1 && (
        <PolylineComponent
          coordinates={routeCoords}
          strokeColor={Colors.brand.primary}
          strokeWidth={4}
        />
      )}
      {showStartEndMarkers && routeCoords.length > 0 && (
        <>
          <MarkerComponent
            coordinate={routeCoords[0]}
            title="Start"
            pinColor="green"
          />
          {routeCoords.length > 1 && (
            <MarkerComponent
              coordinate={routeCoords[routeCoords.length - 1]}
              title="End"
              pinColor="red"
            />
          )}
        </>
      )}
    </MapViewComponent>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 200,
  },
  placeholder: {
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  placeholderSubtext: {
    fontSize: 12,
    color: Colors.text.muted,
  },
});

export default MapViewWrapper;
