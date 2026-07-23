import { useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<"firebase" | "local">("firebase");
  const [isSyncing, setIsSyncing] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  return {
    user,
    setUser,
    authError,
    setAuthError,
    syncMode,
    setSyncMode,
    isSyncing,
    setIsSyncing,
    authModalOpen,
    setAuthModalOpen,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authMode,
    setAuthMode,
    authLoading,
    setAuthLoading,
    authMessage,
    setAuthMessage,
  };
}
