import React from 'react';
import { Ionicons as ExpoIonicons } from '@expo/vector-icons';
import { MaterialIcons as ExpoMaterialIcons } from '@expo/vector-icons';

// Wrapper component for Ionicons
export const Ionicons = ({ name, size, color, style }: { 
  name: React.ComponentProps<typeof ExpoIonicons>['name'], 
  size: number, 
  color: string,
  style?: any 
}) => {
  return <ExpoIonicons name={name} size={size} color={color} style={style} />;
};

// Wrapper component for MaterialIcons
export const MaterialIcons = ({ name, size, color, style }: { 
  name: React.ComponentProps<typeof ExpoMaterialIcons>['name'], 
  size: number, 
  color: string,
  style?: any 
}) => {
  return <ExpoMaterialIcons name={name} size={size} color={color} style={style} />;
}; 