import React from "react";

import type { ModalState } from "@/types/game";

type AlertModalProps = {
  modal: ModalState | null;
  setModal: (modal: ModalState | null) => void;
};

export default function AlertModal({ modal, setModal }: AlertModalProps) {
  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-xl font-bold mb-4">{modal.title}</h3>
        <p className="mb-6 whitespace-pre-wrap">{modal.message}</p>
        <div className="flex justify-end gap-3">
          {modal.onConfirm && (
            <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
              취소
            </button>
          )}
          <button
            onClick={modal.onConfirm || (() => setModal(null))}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
