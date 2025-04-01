import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  ActivityIndicator
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from '../components/icons';
import * as ImagePicker from "expo-image-picker";
import axios from "axios";

const API_URL = "http://192.168.0.106:5000/api/auth";

// Available languages
const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "pa", name: "Punjabi" },
  { code: "bn", name: "Bengali" },
];

const EditProfileScreen: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [gender, setGender] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const profileData = await AsyncStorage.getItem("userProfile");
      if (profileData) {
        const parsedData = JSON.parse(profileData);
        setPhoneNumber(parsedData.phone || "");
        setGender(parsedData.gender || "");
        setSelectedLanguages(parsedData.languages || []);
        setLocation(parsedData.location || "");
        setProfileImage(parsedData.profileImage || null);
        setName(parsedData.name || "");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      Alert.alert("Error", "Failed to load profile data");
    } finally {
      setLoading(false);
    }
  };

  const handleImagePicker = async (useCamera: boolean) => {
    try {
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
          });

      if (!result.canceled) {
        setProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const validatePhone = (phone: string) => {
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      setPhoneError("Please enter a valid 10-digit phone number");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handleSubmit = async () => {
    if (!validatePhone(phoneNumber)) {
      return;
    }

    if (!gender) {
      Alert.alert("Error", "Please select your gender");
      return;
    }

    if (selectedLanguages.length === 0) {
      Alert.alert("Error", "Please select at least one language");
      return;
    }

    if (!location) {
      Alert.alert("Error", "Please enter your location");
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await AsyncStorage.getItem("token");
      const userId = await AsyncStorage.getItem("userId");

      if (!token || !userId) {
        throw new Error("Authentication required");
      }

      const userProfile = {
        userId,
        phone: phoneNumber,
        gender,
        languages: selectedLanguages,
        location,
        name,
        profileImage,
      };

      const response = await axios.put(`${API_URL}/profile`, userProfile, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        await AsyncStorage.setItem("userProfile", JSON.stringify(userProfile));
        Alert.alert("Success", "Profile updated successfully");
        router.back();
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066CC" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
        </View>

        {/* Profile Image Picker */}
        <View style={styles.imagePickerContainer}>
          <View style={styles.profileImageContainer}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Ionicons name="person" size={40} color="#CCCCCC" />
              </View>
            )}
          </View>
          <View style={styles.imageActionButtons}>
            <TouchableOpacity
              style={styles.imageButton}
              onPress={() => handleImagePicker(true)}
            >
              <Ionicons name="camera-outline" size={20} color="#007AFF" />
              <Text style={styles.imageButtonText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.imageButton}
              onPress={() => handleImagePicker(false)}
            >
              <Ionicons name="image-outline" size={20} color="#007AFF" />
              <Text style={styles.imageButtonText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Name Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor="#999"
          />
        </View>

        {/* Phone Number Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
            maxLength={10}
            placeholderTextColor="#999"
          />
          {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
        </View>

        {/* Gender Selection */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderContainer}>
            {["Male", "Female", "Other"].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.genderOption,
                  gender === option && styles.selectedGender,
                ]}
                onPress={() => setGender(option)}
              >
                <Text
                  style={[
                    styles.genderText,
                    gender === option && styles.selectedGenderText,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Languages Selection */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Languages</Text>
          <View style={styles.languagesContainer}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageOption,
                  selectedLanguages.includes(lang.name) &&
                    styles.selectedLanguage,
                ]}
                onPress={() => {
                  if (selectedLanguages.includes(lang.name)) {
                    setSelectedLanguages(
                      selectedLanguages.filter((l) => l !== lang.name)
                    );
                  } else {
                    setSelectedLanguages([...selectedLanguages, lang.name]);
                  }
                }}
              >
                <Text
                  style={[
                    styles.languageText,
                    selectedLanguages.includes(lang.name) &&
                      styles.selectedLanguageText,
                  ]}
                >
                  {lang.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Location Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Enter your location"
            placeholderTextColor="#999"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 16,
  },
  imagePickerContainer: {
    alignItems: "center",
    marginVertical: 20,
  },
  profileImageContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  profilePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  imageActionButtons: {
    flexDirection: "row",
    justifyContent: "center",
  },
  imageButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E6F0FF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 8,
  },
  imageButtonText: {
    color: "#007AFF",
    marginLeft: 8,
  },
  inputContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#DDDDDD",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 14,
    marginTop: 4,
  },
  genderContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  genderOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#DDDDDD",
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: "center",
  },
  selectedGender: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  genderText: {
    color: "#333",
    fontSize: 16,
  },
  selectedGenderText: {
    color: "#FFFFFF",
  },
  languagesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  languageOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#DDDDDD",
    borderRadius: 20,
    margin: 4,
  },
  selectedLanguage: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  languageText: {
    color: "#333",
  },
  selectedLanguageText: {
    color: "#FFFFFF",
  },
  submitButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 20,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
});

export default EditProfileScreen; 