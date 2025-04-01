import { useRouter } from "expo-router";

const router = useRouter();

const handleEditProfile = () => {
  router.push("/(profile)/edit-profile");
}; 