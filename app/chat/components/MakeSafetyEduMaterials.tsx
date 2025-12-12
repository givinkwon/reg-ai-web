// MakeSafetyEduMaterials.tsx
'use client';

import { useState } from 'react';



export type SafetyEduMaterial = {
  id: string;
  title: string;
  guideKey: string;
};

export type SafetyEduCategory = {
  id: string;
  title: string;
  description: string;
  materials: SafetyEduMaterial[];
};

export type SafetyEduGuide = {
  intro: string;
  bulletPoints: string[];
  downloadLabel: string;
  downloadUrl: string;
};


/**
 * 공정별 교육 카테고리 + 교육자료 목록
 */
export const SAFETY_EDU_CATEGORIES_RAW: SafetyEduCategory[] = [
  /* =========================
   * 1) 크레인·양중·고소작업
   * ========================= */
  {
    id: 'lifting-height',
    title: '크레인·양중·고소작업',
    description:
      '크레인, 이동식 크레인, 고소작업대, 비계 등 물건을 들어 올리거나 높은 곳에서 작업할 때 필요한 필수 안전교육 자료입니다.',
    materials: [
      {
        id: 'crane-basic-training',
        title: '크레인 작업 안전교육(기초)',
        guideKey: 'crane-basic-training',
      },
      {
        id: 'rigging-signal-training',
        title: '와이어로프·슬링·신호수 교육',
        guideKey: 'rigging-signal-training',
      },
      {
        id: 'fall-protection-training',
        title: '고소작업·추락방지 기본교육',
        guideKey: 'fall-protection-training',
      },
    ],
  },

  /* =========================
   * 2) 밀폐공간 작업
   * ========================= */
  {
    id: 'confined-space',
    title: '밀폐공간 작업',
    description:
      '탱크, 맨홀, 피트, 저장조 등 밀폐·반폐쇄 공간에서 가스 중독·질식사고를 예방하기 위한 교육자료입니다.',
    materials: [
      {
        id: 'confined-space-basic',
        title: '밀폐공간 작업 안전 기본교육',
        guideKey: 'confined-space-basic',
      },
      {
        id: 'confined-space-gas-measure',
        title: '밀폐공간 가스측정·환기·감시인 교육',
        guideKey: 'confined-space-gas-measure',
      },
      {
        id: 'confined-space-rescue',
        title: '밀폐공간 비상대응·구조훈련 교육',
        guideKey: 'confined-space-rescue',
      },
    ],
  },

  /* =========================
   * 3) 전기작업·LOTO
   * ========================= */
  {
    id: 'electrical-loto',
    title: '전기작업·LOTO',
    description:
      '수배전반, 전동기, 설비 유지보수 등 감전·아크플래시 위험이 있는 전기작업과 Lock-out/Tag-out 절차 교육자료입니다.',
    materials: [
      {
        id: 'electrical-basic-training',
        title: '전기 안전 일반(감전·아크플래시)',
        guideKey: 'electrical-basic-training',
      },
      {
        id: 'lockout-tagout-training',
        title: 'Lock-out/Tag-out(LOTO) 절차 교육',
        guideKey: 'lockout-tagout-training',
      },
      {
        id: 'electrical-permit-training',
        title: '전기 설비 작업허가·검전·접지 교육',
        guideKey: 'electrical-permit-training',
      },
    ],
  },

  /* =========================
   * 4) 화기 작업·용접·절단
   * ========================= */
  {
    id: 'hot-work-fire',
    title: '화기 작업·용접·절단',
    description:
      '용접·가스절단·연마 등 불꽃·고열이 발생하는 작업에서 화재·폭발사고를 예방하기 위한 교육자료입니다.',
    materials: [
      {
        id: 'hot-work-basic-training',
        title: '화기 작업 기본 안전교육',
        guideKey: 'hot-work-basic-training',
      },
      {
        id: 'hot-work-permit-training',
        title: '화기 작업허가·화재감시자 교육',
        guideKey: 'hot-work-permit-training',
      },
      {
        id: 'gas-cutting-welding-training',
        title: '가스용접·절단기 취급 및 사고 사례',
        guideKey: 'gas-cutting-welding-training',
      },
    ],
  },

  /* =========================
   * 5) 굴착·중장비·토공
   * ========================= */
  {
    id: 'excavation-heavy-equip',
    title: '굴착·중장비·토공',
    description:
      '굴착공사, 흙막이, 굴착기·불도저·덤프 등 중장비 사용 시 발생할 수 있는 붕괴·협착·접촉사고 예방 교육자료입니다.',
    materials: [
      {
        id: 'excavation-shoring-training',
        title: '굴착·흙막이 붕괴 재해 예방 교육',
        guideKey: 'excavation-shoring-training',
      },
      {
        id: 'heavy-equipment-operation-training',
        title: '굴착기·지게차·덤프 등 중장비 작업자 교육',
        guideKey: 'heavy-equipment-operation-training',
      },
      {
        id: 'spotter-traffic-control-training',
        title: '유도자·차량 통행 관리 교육',
        guideKey: 'spotter-traffic-control-training',
      },
    ],
  },

  /* =========================
   * 6) 화학물질·MSDS·호흡보호구
   * ========================= */
  {
    id: 'chemicals-msds',
    title: '화학물질·MSDS·호흡보호구',
    description:
      '도장, 세척, 공정용 화학물질 사용 사업장에서 필요한 MSDS 이해, 취급·보관, 호흡보호구 착용 교육자료입니다.',
    materials: [
      {
        id: 'msds-basic-training',
        title: 'MSDS 이해 및 화학물질 표지 교육',
        guideKey: 'msds-basic-training',
      },
      {
        id: 'chemical-handling-storage-training',
        title: '화학물질 취급·보관·누출 대응 교육',
        guideKey: 'chemical-handling-storage-training',
      },
      {
        id: 'respiratory-protection-training',
        title: '호흡보호구 종류·선정·밀착교육',
        guideKey: 'respiratory-protection-training',
      },
    ],
  },
];

/**
 * 각 교육자료별 상세 설명 + 다운로드 정보
 */
export const SAFETY_EDU_GUIDES_RAW: Record<string, SafetyEduGuide> = {
  /* ---------- 1) 크레인·양중·고소작업 ---------- */

  'crane-basic-training': {
    intro:
      '크레인 운전원·신호수·줄걸이 작업자에게 실시할 기초 안전교육(PPT/교안)을 구성할 때 포함해야 할 주요 내용을 정리했습니다.',
    bulletPoints: [
      '· 관련 법령: 산업안전보건법, 크레인 설치·운영 규정, 정기·수시점검 기준',
      '· 크레인 종류별 특징(호이스트, 이동식 크레인, 타워크레인 등)과 주요 위험요인',
      '· 정격하중, 작업반경, 아웃트리거 전개 등 기본 안전원칙',
      '· 운전 전 점검항목(와이어로프, 브레이크, 훅, 리미트 스위치 등)',
      '· 작업 중 금지행위(사람 태우기, 편하중 작업, 지반 불안정 상태 작업 등)',
      '· 신호수와 운전원의 의사소통 원칙(표준 수신호·무전 사용 요령)',
      '· 실제 사고 사례(전도, 붕괴, 와이어 단선 등)와 교훈',
    ],
    downloadLabel: '크레인 작업 기초 안전교육(PPT) 다운로드',
    downloadUrl: '/training/crane-basic-training.pptx',
  },

  'rigging-signal-training': {
    intro:
      '줄걸이 작업자·신호수를 대상으로 하는 와이어로프·샤클·슬링 사용법과 표준 수신호 교육자료입니다.',
    bulletPoints: [
      '· 줄걸이 작업의 역할 분담(운전원·신호수·줄걸이 작업자)',
      '· 와이어로프, 체인, 섬유 슬링의 구조와 사용 가능 하중(WLL) 표시 읽는 법',
      '· 각종 걸이 방법(바스켓, 초크, 2점·4점 걸이 등)과 각도에 따른 하중 변화',
      '· 손상·마모·꼬임 등 사용 불가 기준과 폐기 절차',
      '· 표준 수신호(정지, 상승, 하강, 천천히, 비상정지 등)와 무전 사용 시 유의사항',
      '· 줄걸이 작업 중 협착·낙하 사고 사례와 예방대책',
    ],
    downloadLabel: '와이어로프·슬링·신호수 교육자료 다운로드',
    downloadUrl: '/training/rigging-signal-training.pptx',
  },

  'fall-protection-training': {
    intro:
      '비계, 발판, 지붕, 고소작업대 등에서 작업하는 근로자를 위한 추락재해 예방 기본교육자료입니다.',
    bulletPoints: [
      '· 추락 위험 작업의 범위(2m 이상, 개구부, 개방된 단부 등)',
      '· 비계·작업발판·난간의 설치 기준과 점검 포인트',
      '· 안전대(전신형, 허리식)의 올바른 착용법과 앵커 포인트 기준',
      '· 고소작업대 사용 시 전도·끼임·접촉사고 주요 사례',
      '· 개구부·개방된 단부의 덮개·난간·표지 설치 기준',
      '· 비·풍속·야간 등 기상·환경 조건에 따른 작업 중지 기준',
    ],
    downloadLabel: '고소작업·추락방지 기본교육(PPT) 다운로드',
    downloadUrl: '/training/fall-protection-training.pptx',
  },

  /* ---------- 2) 밀폐공간 작업 ---------- */

  'confined-space-basic': {
    intro:
      '밀폐공간에 출입하는 작업자에게 실시하는 기본 안전교육으로, 질식·중독사고 예방을 위한 필수 내용을 담고 있습니다.',
    bulletPoints: [
      '· 밀폐공간의 정의와 대표 사례(맨홀, 탱크, 피트, 보일러 등)',
      '· 산소결핍, 유해가스(황화수소, 일산화탄소 등)의 위험성',
      '· 밀폐공간 작업 시 법적 요구사항(작업허가, 감시인, 교육 등)',
      '· 출입 전 체크리스트: 환기, 가스측정, 비상구·통신수단 확보',
      '· 비상 시 대피 절차와 구조 요청 방법',
      '· 실제 질식사고 사례와 주요 원인 분석',
    ],
    downloadLabel: '밀폐공간 작업 기본교육(PPT) 다운로드',
    downloadUrl: '/training/confined-space-basic.pptx',
  },

  'confined-space-gas-measure': {
    intro:
      '밀폐공간 작업 전·중 가스 측정 및 환기, 감시인 역할에 초점을 맞춘 실무형 교육자료입니다.',
    bulletPoints: [
      '· 산소농도·폭발하한계(LEL)·유해가스 기준치 이해',
      '· 가스측정기 종류(고정식·휴대식)와 교정·점검 방법',
      '· 측정 위치·순서(상·중·하층)와 시간 간격 설정',
      '· 송풍기·배기팬을 활용한 환기 방법과 주의사항',
      '· 감시인의 역할(출입관리, 인원 파악, 비상연락, 작업중지 권한 등)',
      '· 측정·환기 기록 양식 작성 예시',
    ],
    downloadLabel: '밀폐공간 가스측정·환기 교육자료 다운로드',
    downloadUrl: '/training/confined-space-gas-measure.pptx',
  },

  'confined-space-rescue': {
    intro:
      '밀폐공간 내 사고 발생 시 구조대 도착 전까지 사업장 자체에서 수행해야 할 초기 대응·구조 절차 교육자료입니다.',
    bulletPoints: [
      '· 구조 시 2차 질식·중독사고 발생 위험(무방비 진입의 위험성)',
      '· “절대 단독 진입 금지” 원칙과 비접촉 구조 개념',
      '· 삼각대, 윈치, 하네스 등 구조장비 기본 구성',
      '· 구조·응급조치 흐름(상황 파악 → 119 신고 → 환기·측정 → 안전한 구조 시도)',
      '· 정기적인 모의훈련 계획 수립과 체크리스트 예시',
      '· 실제 밀폐공간 구조 실패 사례와 교훈',
    ],
    downloadLabel: '밀폐공간 비상대응·구조훈련 교육자료 다운로드',
    downloadUrl: '/training/confined-space-rescue.pptx',
  },

  /* ---------- 3) 전기작업·LOTO ---------- */

  'electrical-basic-training': {
    intro:
      '전기 설비를 취급하는 모든 근로자를 대상으로 하는 감전·아크플래시 예방 기본교육자료입니다.',
    bulletPoints: [
      '· 인체에 대한 전기의 영향(전류·통전경로·통전시간)',
      '· 감전 사고 주요 유형(누전, 합선, 설비 접촉, 젖은 손·바닥 등)',
      '· 아크플래시·아크블라스트 현상과 보호대책',
      '· 누전차단기, 접지, 절연 보호구의 역할',
      '· 젖은 환경·금속 사다리 사용 금지 등 작업수칙',
      '· 감전 시 응급조치(전원 차단, 안전한 구조, 심폐소생술 연계)',
    ],
    downloadLabel: '전기 안전 일반교육(PPT) 다운로드',
    downloadUrl: '/training/electrical-basic-training.pptx',
  },

  'lockout-tagout-training': {
    intro:
      '설비 정비·청소·점검 시 오동작·예기치 않은 기동을 막기 위한 Lock-out/Tag-out(LOTO) 절차 교육자료입니다.',
    bulletPoints: [
      '· LOTO가 필요한 작업의 범위(전기, 유압, 공압, 중력에너지 등)',
      '· 에너지 차단 장치 종류(개폐기, 밸브, 차단기 등)와 잠금 장치',
      '· LOTO 6단계 절차(통보 → 정지 → 에너지 차단 → 잠금·표지 → 에너지 해소 → 검증)',
      '· 개인 잠금장치(PADLOCK)와 그룹 잠금 방법',
      '· 작업 완료 후 해제 절차와 인원 확인',
      '· LOTO 미준수로 인한 실제 중대사고 사례',
    ],
    downloadLabel: 'LOTO 절차 교육자료 다운로드',
    downloadUrl: '/training/lockout-tagout-training.pptx',
  },

  'electrical-permit-training': {
    intro:
      '수배전반·고압 설비 등 위험도가 높은 전기작업 수행자에게 필요한 작업허가 및 검전·접지 교육자료입니다.',
    bulletPoints: [
      '· 고압·특고압 설비 작업 시 요구되는 자격·교육 요건',
      '· 전기작업 허가서 주요 항목(작업범위, 차단범위, 책임자 등)',
      '· 검전 절차(검전기 점검 → 비접촉 검전 → 접촉 검전)',
      '· 작업 전 접지 설치 기준과 순서',
      '· 활선근접 작업 시 접근한계거리 및 보호구 기준',
      '· 전기작업 중 위험 징후(소음, 냄새, 발열 등) 발견 시 조치요령',
    ],
    downloadLabel: '전기 설비 작업허가·검전 교육자료 다운로드',
    downloadUrl: '/training/electrical-permit-training.pptx',
  },

  /* ---------- 4) 화기 작업·용접·절단 ---------- */

  'hot-work-basic-training': {
    intro:
      '용접·가스절단·연마 작업 시 화재·폭발·화상사고를 예방하기 위한 기본 안전교육자료입니다.',
    bulletPoints: [
      '· 화기 작업의 정의와 대표 작업(아크용접, 가스절단, 그라인더 등)',
      '· 불티 비산 거리와 하역장·가연물 근접 작업의 위험성',
      '· 인화성 물질(페인트, 용제, 가스 등) 주변 작업 금지 원칙',
      '· 용접면·보안경·방염포 등 보호구 및 방호장비 사용',
      '· 작업 전 주변 정리·차단·소화기 비치 등 준비 사항',
      '· 작업 종료 후 최소 30분 이상 화재감시의 필요성',
    ],
    downloadLabel: '화기 작업 기본 안전교육(PPT) 다운로드',
    downloadUrl: '/training/hot-work-basic-training.pptx',
  },

  'hot-work-permit-training': {
    intro:
      '공사 현장·공장 내 화기 작업허가제 운영을 위한 담당자·감시원 교육자료입니다.',
    bulletPoints: [
      '· 화기 작업허가제가 필요한 이유와 법적 요구사항',
      '· 작업허가서 필수 항목(장소, 시간, 가연물 제거, 소화설비 등)',
      '· 화재감시자의 역할(감시 범위, 비상연락, 작업중지 권한 등)',
      '· 인근 설비·배관·케이블 트레이 등 은폐 공간 화재 위험',
      '· 화기 작업 전·중·후 점검 체크리스트 예시',
      '· 허가제 미운영으로 발생한 대형 화재 사고 사례',
    ],
    downloadLabel: '화기 작업허가·감시자 교육자료 다운로드',
    downloadUrl: '/training/hot-work-permit-training.pptx',
  },

  'gas-cutting-welding-training': {
    intro:
      '가스용접·절단 장비 취급자에게 필요한 안전사용·보관·점검 요령과 사고 사례를 다룬 교육자료입니다.',
    bulletPoints: [
      '· 산소·아세틸렌·LPG 용기의 구조와 색상 구분',
      '· 역화·역류 방지기, 조정기, 호스 점검 방법',
      '· 용기 고정, 밸브 개폐 요령, 누설 점검 방법(비눗물 검사 등)',
      '· 불꽃 역류, 호스 파열, 용기 전도 시 대응 절차',
      '· 용기 보관 장소·온도·거리 기준',
      '· 가스용접·절단 작업 중 폭발사고 사례 분석',
    ],
    downloadLabel: '가스용접·절단기 안전 취급 교육자료 다운로드',
    downloadUrl: '/training/gas-cutting-welding-training.pptx',
  },

  /* ---------- 5) 굴착·중장비·토공 ---------- */

  'excavation-shoring-training': {
    intro:
      '지하 매설물, 토사 붕괴, 흙막이 붕괴 사고를 예방하기 위한 굴착·흙막이 공사 안전교육자료입니다.',
    bulletPoints: [
      '· 굴착깊이·토질·지하수 등에 따른 붕괴 위험요인',
      '· 흙막이 공법별(버팀보, 어스앵커 등) 안전관리 포인트',
      '· 굴착면 경사, 토사 적치 위치, 차량 하중 영향',
      '· 지하 매설물(가스, 통신, 상·하수도) 확인 절차',
      '· 우기·동절기 굴착 작업 시 추가 위험요인',
      '· 붕괴 징후(균열, 토사 이동 등) 발견 시 작업중지 기준',
    ],
    downloadLabel: '굴착·흙막이 붕괴 재해 예방 교육자료 다운로드',
    downloadUrl: '/training/excavation-shoring-training.pptx',
  },

  'heavy-equipment-operation-training': {
    intro:
      '굴착기, 지게차, 휠로더, 덤프트럭 등 중장비 운전원·신호수·보행자를 대상으로 하는 안전교육자료입니다.',
    bulletPoints: [
      '· 장비별 사각지대 및 회전반경 이해',
      '· 전도·전복 사고 주요 원인(과적, 경사, 지반 침하 등)',
      '· 인근 보행자·작업자 보호를 위한 출입 통제·유도 방법',
      '· 장비 일일점검 항목(타이어/트랙, 제동장치, 작업기 등)',
      '· 유도자와 운전원의 수신호·무전 통신 규칙',
      '· 중장비와 보행자 충돌·협착 사고 사례와 교훈',
    ],
    downloadLabel: '중장비 작업자·유도자 안전교육자료 다운로드',
    downloadUrl: '/training/heavy-equipment-operation-training.pptx',
  },

  'spotter-traffic-control-training': {
    intro:
      '현장 내 차량 통행이 많은 사업장에서 유도자·신호수에게 필요한 교통관리·통행계획 교육자료입니다.',
    bulletPoints: [
      '· 현장 내 차량·보행자 동선 파악과 일방통행·출입구 계획',
      '· 유도자의 위치 선정(안전거리, 피난 경로 확보 등)',
      '· 수신호·지시신호 표준과 야간·우천 시 보조 장비(라이트, 형광조끼 등)',
      '· 차단봉·콘·바리케이드 등 물리적 차단 수단 사용법',
      '· 덤프트럭 후진·굴착기 회전 구간 등 고위험 구역 관리',
      '· 교통사고 발생 시 초기 대응·신고 절차',
    ],
    downloadLabel: '유도자·차량 통행 관리 교육자료 다운로드',
    downloadUrl: '/training/spotter-traffic-control-training.pptx',
  },

  /* ---------- 6) 화학물질·MSDS·호흡보호구 ---------- */

  'msds-basic-training': {
    intro:
      '사업장 내 사용하는 화학제품의 MSDS를 이해하고 경고표지를 읽을 수 있도록 하는 기초 교육자료입니다.',
    bulletPoints: [
      '· MSDS의 목적과 법적 비치·교육 의무',
      '· MSDS 주요 항목(위험·유해성, 취급·저장, 누출 시 조치 등) 읽는 방법',
      '· GHS pictogram(위험표지) 의미와 예시',
      '· 라벨 정보(제품명, 신호어, 유해·위험문구, 예방조치문구 등) 해석',
      '· 작업 전 MSDS 확인 절차와 실습 예시',
      '· MSDS 미비 또는 외국어 MSDS 활용 시 주의사항',
    ],
    downloadLabel: 'MSDS 이해 및 화학물질 표지 교육자료 다운로드',
    downloadUrl: '/training/msds-basic-training.pptx',
  },

  'chemical-handling-storage-training': {
    intro:
      '도장, 세척, 세정 공정 등에서 사용하는 화학물질의 안전한 취급·보관·누출 대응을 다루는 실무 교육자료입니다.',
    bulletPoints: [
      '· 휘발성 유기화합물, 산·알칼리, 독성가스 등 물질별 주요 위험성',
      '· 취급 시 필요한 개인보호구(PPE) 선택 기준',
      '· 저장탱크·드럼·용기 보관 기준(온도, 통풍, 분리보관 등)',
      '· 소량·대량 누출 시 대응 절차(제거, 흡착제 사용, 격리 등)',
      '· 배관·밸브·호스 연결 전 누설 점검 요령',
      '· 화학물질 관련 화재·폭발·누출 사고 사례',
    ],
    downloadLabel: '화학물질 취급·보관·누출 대응 교육자료 다운로드',
    downloadUrl: '/training/chemical-handling-storage-training.pptx',
  },

  'respiratory-protection-training': {
    intro:
      '분진, 유기용제, 용접흄 등 호흡기 유해요인에 노출되는 작업자를 위한 호흡보호구 교육자료입니다.',
    bulletPoints: [
      '· 호흡보호구 필요 작업(분진, 유기용제, 용접흄, 곰팡이 등)',
      '· 필터 종류(방진, 방독, 겸용)와 색상·기호 의미',
      '· 적합한 보호구 선정 절차(농도, 노출시간, 작업형태 등)',
      '· 밀착성 확보 방법(밀착검사, 수염·안경 등 영향요인)',
      '· 보관·교체 주기 관리와 필터 포화 징후',
      '· 호흡보호구 착용 불량으로 인한 건강장해 사례',
    ],
    downloadLabel: '호흡보호구 선택·착용·관리 교육자료 다운로드',
    downloadUrl: '/training/respiratory-protection-training.pptx',
  },
};

import { ChevronDown, ChevronUp, FileText, Download } from 'lucide-react';
import s from './MakeSafetyEduMaterials.module.css';
import Button from '@/app/components/ui/button';

type MakeSafetyEduMaterialsProps = {
  /**
   * 사용자가 특정 교육자료를 선택하고
   * "이 내용으로 교육자료 생성하기" 버튼을 눌렀을 때 호출되는 콜백
   */
  onSelectMaterial?: (params: {
    category: SafetyEduCategory;
    material: SafetyEduMaterial;
    guide: SafetyEduGuide;
  }) => void;
};

export default function MakeSafetyEduMaterials({
  onSelectMaterial,
}: MakeSafetyEduMaterialsProps) {
  // 기본으로 첫 번째 카테고리 open
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(
    SAFETY_EDU_CATEGORIES_RAW[0]?.id ?? null,
  );
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );

  const selectedCategory =
    SAFETY_EDU_CATEGORIES_RAW.find((c) => c.id === openCategoryId) ?? null;

  const selectedMaterial: SafetyEduMaterial | null =
    selectedCategory?.materials.find((m) => m.id === selectedMaterialId) ??
    null;

  const selectedGuide: SafetyEduGuide | null =
    selectedMaterial != null
      ? SAFETY_EDU_GUIDES_RAW[selectedMaterial.guideKey]
      : null;

  const handleCategoryClick = (id: string) => {
    // 같은 카테고리를 다시 누르면 접기
    setOpenCategoryId((prev) => (prev === id ? null : id));
    setSelectedMaterialId(null);
  };

  const handleMaterialClick = (
    category: SafetyEduCategory,
    material: SafetyEduMaterial,
  ) => {
    setOpenCategoryId(category.id);
    setSelectedMaterialId(material.id);
  };

  const handleGenerateClick = () => {
    if (!selectedCategory || !selectedMaterial || !selectedGuide) return;
    if (!onSelectMaterial) return;

    onSelectMaterial({
      category: selectedCategory,
      material: selectedMaterial,
      guide: selectedGuide,
    });
  };

  return (
    <div className={s.root}>
      {/* 왼쪽 영역: 카테고리 + 드랍다운 리스트 */}
      <div className={s.leftPane}>
        <div className={s.header}>
          <div className={s.badge}>교육 자료 생성</div>
          <div className={s.title}>공정별 안전교육 주제 선택</div>
          <p className={s.sub}>
            먼저 공정·작업 종류를 선택한 뒤, 안에서 필요한 교육 주제를
            골라주세요. 선택된 주제에 맞게 교육 구성 항목과 기본 템플릿을
            보여드려요.
          </p>
        </div>

        <div className={s.categoryList}>
          {SAFETY_EDU_CATEGORIES_RAW.map((category) => {
            const isOpen = category.id === openCategoryId;
            return (
              <div key={category.id} className={s.categoryItem}>
                <button
                  type="button"
                  className={s.categoryHeader}
                  onClick={() => handleCategoryClick(category.id)}
                >
                  <div>
                    <div className={s.categoryTitle}>{category.title}</div>
                    <div className={s.categoryDesc}>
                      {category.description}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className={s.chevron} />
                  ) : (
                    <ChevronDown className={s.chevron} />
                  )}
                </button>

                {isOpen && (
                  <div className={s.materialRow}>
                    {category.materials.map((material) => (
                      <button
                        key={material.id}
                        type="button"
                        className={
                          material.id === selectedMaterialId
                            ? `${s.materialChip} ${s.materialChipActive}`
                            : s.materialChip
                        }
                        onClick={() => handleMaterialClick(category, material)}
                      >
                        <FileText className={s.materialIcon} />
                        <span>{material.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 오른쪽 영역: 선택된 교육자료 상세 안내 + 다운로드/생성 버튼 */}
      <div className={s.rightPane}>
        {selectedCategory && selectedMaterial && selectedGuide ? (
          <div className={s.inner}>
            <div className={s.docName}>
              <strong>{selectedMaterial.title}</strong>
              <span className={s.docTag}>{selectedCategory.title}</span>
            </div>

            <p className={s.guideIntro}>{selectedGuide.intro}</p>

            <p className={s.guideHint}>
              아래 항목들을 중심으로 PPT/교안을 구성하면, 실제 산업현장에서
              바로 활용 가능한 교육자료를 만들 수 있어요.
            </p>

            <ul className={s.bulletList}>
              {selectedGuide.bulletPoints.map((line, idx) => (
                <li key={idx}>{line.replace(/^·\s?/, '')}</li>
              ))}
            </ul>

            <div className={s.actions}>
              {/* 템플릿 다운로드 */}
                <Button variant="outline" size="sm" type="button">
                <a
                    href={selectedGuide.downloadUrl}
                    download
                    className={s.downloadLink}
                >
                    <Download className={s.actionIcon} />
                    {selectedGuide.downloadLabel}
                </a>
                </Button>

              {/* 이 주제로 바로 생성 시작 */}
              {onSelectMaterial && (
                <Button size="sm" onClick={handleGenerateClick}>
                  이 내용으로 교육자료 생성하기
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className={s.empty}>
            공정과 교육 주제를 선택하면 이 영역에
            <br />
            교육 구성 항목과 템플릿 다운로드 버튼을 보여드릴게요.
          </div>
        )}
      </div>
    </div>
  );
}