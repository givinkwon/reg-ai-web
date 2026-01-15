// components/DocReviewUploadPane.tsx
'use client';

import React, { useRef, useState } from 'react';
import type { SafetyDocCategory, SafetyDoc } from './make-safety-docs/MakeSafetyDocs';
import { UploadCloud } from 'lucide-react';
import s from './DocReviewUploadPane.module.css';

type DocReviewUploadPaneProps = {
  category: SafetyDocCategory;
  doc: SafetyDoc;

  // ✅ 업로드 + 질의까지 한 번에 진행하는 콜백
  onUploadAndAsk: (params: {
    category: SafetyDocCategory;
    doc: SafetyDoc;
    files: File[];
  }) => void | Promise<void>;
};

export default function DocReviewUploadPane({
  category,
  doc,
  onUploadAndAsk,
}: DocReviewUploadPaneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    onUploadAndAsk({ category, doc, files });

    // 같은 파일을 다시 선택할 수 있게 초기화
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files);

    onUploadAndAsk({ category, doc, files });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // 드롭 가능 커서
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // 내부 요소들(자식 div)로 enter/leave가 튀는 현상 방지:
    // 현재 떠나는 타겟이 root 영역 밖으로 나갈 때만 false 처리
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;

    setDragActive(false);
  };

  return (
    <div
      className={`${s.root} ${dragActive ? s.dragActive : ''}`}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      role="button"
      tabIndex={0}
      aria-label="파일 업로드 영역"
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className={s.hiddenInput}
        onChange={handleChange}
      />

      <div className={s.inner}>
        <div className={s.badge}>{category.title}</div>

        <div className={s.docName}>
          <strong>{doc.label}</strong> 검토를 위해 파일을 업로드해 주세요.
        </div>

        <p className={s.sub}>
          이 영역에 파일을 드래그해서 놓거나, 클릭해서 파일을 선택하면
          REG AI가 바로 문서 내용을 분석해서 검토 결과를 알려드려요.
        </p>

        <div className={s.illustration} aria-hidden="true">
          <div className={s.square} />
          <div className={s.squareSmall} />
          <div className={s.squareDoc} />
          <UploadCloud className={s.uploadIcon} />
        </div>

        {dragActive && <div className={s.dragHint}>여기에 놓으면 업로드됩니다</div>}
      </div>
    </div>
  );
}
