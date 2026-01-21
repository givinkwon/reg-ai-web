// components/DocReviewUploadPane.tsx
'use client';

import React, { useRef, useState } from 'react';
import type { SafetyDocCategory, SafetyDoc } from './make-safety-docs/MakeSafetyDocs';
import { UploadCloud } from 'lucide-react';
import s from './DocReviewUploadPane.module.css';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

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

const GA_CTX = {
  page: 'Chat',
  section: 'DocReview',
  component: 'DocReviewUploadPane',
} as const;

const fileSummary = (files: File[]) => {
  const list = (files ?? []).slice(0, 5).map((f) => ({
    name: f?.name ?? '',
    ext: (f?.name ?? '').split('.').pop()?.toLowerCase() ?? '',
    size: typeof f?.size === 'number' ? f.size : -1,
    type: f?.type ?? '',
  }));
  const totalSize = (files ?? []).reduce((acc, f) => acc + (typeof f?.size === 'number' ? f.size : 0), 0);
  return { count: files?.length ?? 0, totalSize, list };
};

export default function DocReviewUploadPane({
  category,
  doc,
  onUploadAndAsk,
}: DocReviewUploadPaneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const emitPicked = (source: 'file_picker' | 'drop') => {
    track(gaEvent(GA_CTX, 'PickFiles'), {
      ui_id: gaUiId(GA_CTX, 'PickFiles'),
      source,
      category_id: category?.id ?? '',
      category_title: category?.title ?? '',
      doc_id: doc?.id ?? '',
      doc_label: doc?.label ?? '',
    });
  };

  const emitUpload = async (source: 'file_picker' | 'drop', files: File[]) => {
    const meta = fileSummary(files);

    track(gaEvent(GA_CTX, 'UploadStart'), {
      ui_id: gaUiId(GA_CTX, 'UploadStart'),
      source,
      category_id: category?.id ?? '',
      category_title: category?.title ?? '',
      doc_id: doc?.id ?? '',
      doc_label: doc?.label ?? '',
      files_count: meta.count,
      total_bytes: meta.totalSize,
      // 민감할 수 있어 전체 파일명은 보내지 않고 확장자/크기만 보냄(최대 5개)
      files_preview: meta.list.map((x) => ({ ext: x.ext, size: x.size, type: x.type })),
    });

    try {
      await onUploadAndAsk({ category, doc, files });

      track(gaEvent(GA_CTX, 'UploadSuccess'), {
        ui_id: gaUiId(GA_CTX, 'UploadSuccess'),
        source,
        category_id: category?.id ?? '',
        doc_id: doc?.id ?? '',
        files_count: meta.count,
        total_bytes: meta.totalSize,
      });
    } catch (e: any) {
      track(gaEvent(GA_CTX, 'UploadError'), {
        ui_id: gaUiId(GA_CTX, 'UploadError'),
        source,
        category_id: category?.id ?? '',
        doc_id: doc?.id ?? '',
        files_count: meta.count,
        name: e?.name ?? '',
        message: e?.message ?? '',
      });
      throw e;
    }
  };

  const handleClick = () => {
    track(gaEvent(GA_CTX, 'ClickDropzone'), {
      ui_id: gaUiId(GA_CTX, 'ClickDropzone'),
      category_id: category?.id ?? '',
      doc_id: doc?.id ?? '',
    });
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    emitPicked('file_picker');
    await emitUpload('file_picker', files);

    // 같은 파일을 다시 선택할 수 있게 초기화
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files);

    emitPicked('drop');
    await emitUpload('drop', files);
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

    track(gaEvent(GA_CTX, 'DragEnter'), {
      ui_id: gaUiId(GA_CTX, 'DragEnter'),
      category_id: category?.id ?? '',
      doc_id: doc?.id ?? '',
    });
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // 내부 요소들(자식 div)로 enter/leave가 튀는 현상 방지:
    // 현재 떠나는 타겟이 root 영역 밖으로 나갈 때만 false 처리
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;

    setDragActive(false);

    track(gaEvent(GA_CTX, 'DragLeave'), {
      ui_id: gaUiId(GA_CTX, 'DragLeave'),
      category_id: category?.id ?? '',
      doc_id: doc?.id ?? '',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={`${s.root} ${dragActive ? s.dragActive : ''}`}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="파일 업로드 영역"
      data-ga-event={gaEvent(GA_CTX, 'ClickDropzone')}
      data-ga-id={gaUiId(GA_CTX, 'ClickDropzone')}
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
