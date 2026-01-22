'use client';

import { X } from 'lucide-react';

interface Props {
  type: string;
  onClose: () => void;
}

export default function DocCreationModal({ type, onClose }: Props) {
  let title = '문서 작성';
  switch(type) {
    case 'risk': title = '위험성평가 작성'; break;
    case 'tbm': title = 'TBM (작업전안전점검)'; break;
    case 'monthly': title = '월 정기 안전점검표'; break;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {/* 화이트 모달 박스 */}
      <div className="bg-white w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-1 rounded hover:bg-gray-200 transition">
            <X size={24} />
          </button>
        </div>

        {/* 본문 영역 */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
          <div className="bg-white border border-gray-200 rounded-lg p-10 min-h-[500px] shadow-sm flex flex-col items-center justify-center text-gray-500">
             <p className="text-lg mb-2 font-medium">📝 {title} 양식</p>
             <p className="text-sm">여기에 모바일 호환 입력 폼이 표시됩니다.</p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition"
          >
            취소
          </button>
          <button 
            className="px-5 py-2.5 rounded-lg bg-[#6c5ce7] text-white hover:bg-[#5b4bc4] font-medium shadow-md transition transform active:scale-95"
          >
            작성 완료
          </button>
        </div>

      </div>
    </div>
  );
}