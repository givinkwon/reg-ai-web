'use client';

import React, { useEffect, useMemo } from 'react';
import s from './ProgressDownloadModal.module.css';

type Props = {
  open: boolean;
  percent: number; // 0~100
  title?: string;
  onCancel?: () => void;
  // (선택) 상태가 에러일 때 문구 바꾸고 싶으면
  errorText?: string | null;
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function getStage(percent: number) {
  const p = clamp(percent);

  // 구간별 문구 (요구한 그대로)
  if (p < 25) {
    return { idx: 1, total: 4, msg: '사업장 정보를 분석하고 있어요' };
  }
  if (p < 50) {
    return { idx: 2, total: 4, msg: '세부 공정 데이터를 분석하고 있어요' };
  }
  if (p < 75) {
    return { idx: 3, total: 4, msg: '위험 요인 데이터를 취합하여 위험성평가를 진행하고 있어요' };
  }
  return { idx: 4, total: 4, msg: 'RegAI가 사업장에 적합한 최적의 개선 대책을 준비하고 있어요!' };
}

export default function ProgressDownloadModal({
  open,
  percent,
  title = '문서를 생성하고 있어요',
  onCancel,
  errorText,
}: Props) {
  const p = clamp(percent);
  const stage = useMemo(() => getStage(p), [p]);

  // 모달 열리면 바디 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label="다운로드 진행 모달">
      <div className={s.modal}>
        <div className={s.header}>
          <div className={s.title}>{title}</div>
          <div className={s.subTitle}>
            {errorText ? (
              <span className={s.errorText}>{errorText}</span>
            ) : (
              <>
                <span className={s.stage}>
                  {stage.idx}/{stage.total}
                </span>
                <span className={s.dotSep}>•</span>
                <span className={s.msg}>{stage.msg}</span>
              </>
            )}
          </div>
        </div>

        <div className={s.progressWrap}>
          <div className={s.progressTop}>
            <div className={s.percent}>{p}%</div>
            {!errorText ? (
              <div className={s.spinner} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          <div className={s.barTrack} aria-label="진행률">
            <div className={s.barFill} style={{ width: `${p}%` }} />
          </div>

          <div className={s.hint}>
            {errorText
              ? '네트워크/서버 상태를 확인한 뒤 다시 시도해 주세요.'
              : '생성 완료 후 다운로드가 자동으로 시작됩니다. (최대 5분 소요)'}
          </div>
        </div>

        <div className={s.actions}>
          {onCancel ? (
            <button type="button" className={s.cancelBtn} onClick={onCancel}>
              취소
            </button>
          ) : (
            <div className={s.noCancelNote}>작업 중에는 창을 닫지 마세요</div>
          )}
        </div>
      </div>
    </div>
  );
}
