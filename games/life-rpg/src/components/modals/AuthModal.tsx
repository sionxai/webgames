import React from "react";

import type { Profile } from "@/types/game";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthModalProps = any;

export default function AuthModal(props: AuthModalProps) {
  const {
    open,
    authMode,
    setAuthMode,
    setAuthModalOpen,
    handleAuthSubmit,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authMessage,
    authLoading,
    user,
    handleSignOut,
    profileInput,
    setProfileInput,
    saveProfile,
  } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold">{authMode === "signup" ? "회원가입" : "로그인"}</h3>
          <button onClick={() => setAuthModalOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">
            닫기
          </button>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <button
            onClick={() => setAuthMode("signup")}
            className={`flex-1 rounded-lg px-3 py-2 ${authMode === "signup" ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
              }`}
          >
            회원가입
          </button>
          <button
            onClick={() => setAuthMode("login")}
            className={`flex-1 rounded-lg px-3 py-2 ${authMode === "login" ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
              }`}
          >
            로그인
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleAuthSubmit();
          }}
          className="space-y-3"
        >
          <input
            type="email"
            placeholder="이메일"
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
          {authMessage && <div className="text-xs text-red-500">{authMessage}</div>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={authLoading}
              className="flex-1 px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 text-sm font-bold disabled:opacity-60"
            >
              {authLoading ? "처리 중..." : authMode === "signup" ? "가입하기" : "로그인"}
            </button>
            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                로그아웃
              </button>
            )}
          </div>
          {user?.email && <div className="text-xs text-gray-500">현재 로그인: {user.email}</div>}
          <div className="space-y-2 mt-2">
            <div className="text-xs font-bold text-gray-500 uppercase">프로필</div>
            <input
              type="text"
              placeholder="닉네임"
              value={profileInput.nickname}
              onChange={(event) => setProfileInput((prev: Profile) => ({ ...prev, nickname: event.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
            <input
              type="number"
              placeholder="나이"
              value={profileInput.age ?? ""}
              onChange={(event) =>
                setProfileInput((prev: Profile) => ({
                  ...prev,
                  age: event.target.value === "" ? null : Number(event.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
            <select
              value={profileInput.gender}
              onChange={(event) => setProfileInput((prev: Profile) => ({ ...prev, gender: event.target.value as Profile["gender"] }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              <option value="">성별 선택</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
              <option value="other">기타</option>
            </select>
            <button
              type="button"
              onClick={saveProfile}
              disabled={authLoading}
              className="w-full px-4 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 text-sm font-bold disabled:opacity-60"
            >
              프로필 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
