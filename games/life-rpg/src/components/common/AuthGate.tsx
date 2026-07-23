import React from "react";

type AuthGateProps = {
  authMode: "signup" | "login";
  authEmail: string;
  authPassword: string;
  authMessage: string | null;
  authError: string | null;
  authLoading: boolean;
  onModeChange: (mode: "signup" | "login") => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

export default function AuthGate({
  authMode,
  authEmail,
  authPassword,
  authMessage,
  authError,
  authLoading,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: AuthGateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-full max-w-md space-y-4 border border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-center">{authMode === "signup" ? "회원가입" : "로그인"}</h1>
        <div className="flex gap-2 text-xs font-bold">
          <button
            onClick={() => onModeChange("signup")}
            className={`flex-1 rounded-lg px-3 py-2 ${
              authMode === "signup" ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}
          >
            회원가입
          </button>
          <button
            onClick={() => onModeChange("login")}
            className={`flex-1 rounded-lg px-3 py-2 ${
              authMode === "login" ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}
          >
            로그인
          </button>
        </div>
        <div className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            value={authEmail}
            onChange={(event) => onEmailChange(event.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={authPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
          {authMessage && <div className="text-xs text-red-500">{authMessage}</div>}
          {authError && <div className="text-xs text-red-500">{authError}</div>}
          <button
            onClick={onSubmit}
            disabled={authLoading}
            className="w-full px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 text-sm font-bold disabled:opacity-60"
          >
            {authLoading ? "처리 중..." : authMode === "signup" ? "가입하기" : "로그인"}
          </button>
        </div>
        <p className="text-xs text-gray-500 text-center">로그인 후에만 대시보드가 열립니다.</p>
      </div>
    </div>
  );
}
