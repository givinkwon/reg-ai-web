'use client';

import { useRef } from 'react';
import type { SafetyDocCategory, SafetyDoc } from './make-safety-docs/MakeSafetyDocs';
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
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const files = Array.from(e.dataTransfer.files);
    onUploadAndAsk({ category, doc, files });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div
      className={s.root}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
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

        <div className={s.illustration}>
          <div className={s.square} />
          <div className={s.squareSmall} />
          <div className={s.squareDoc} />
        </div>
      </div>
    </div>
  );
}
