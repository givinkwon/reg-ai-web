from pathlib import Path
import json
import re
import os
from typing import Any, Dict, List, Union

# 230. ...
LEADING_NO_RE = re.compile(r"^\s*\d+\.\s*")

# ✅ "99서비스업..." 같은 앞자리 짧은 숫자 제거 (원하면 유지)
LEADING_SHORT_DIGITS_RE = re.compile(r"^\s*\d{1,3}\s*[-–—:]*\s*(?=[A-Za-z가-힣])")

# ✅ (업/직 등 접두어) + 코드 프리픽스 제거
# 지원 예:
# - "업-2-740-산업용로봇"
# - "업1-666-산업용 로봇"
# - "직2-879-택시 운전자"
# - "업1-685 허가사항 ..."        ← ✅ 하이픈 없이 공백으로 이어지는 케이스
# - "업 1 685 ..." / "업_1_685 ..."
#
# 규칙:
#   [접두어(업/직)] [선택:붙은숫자] [구분자] [숫자] [선택:구분자+숫자] [구분자 또는 공백] 이후 본문
LEADING_CODE_PREFIX_RE = re.compile(
    r"^\s*(?:업|직)\s*\d*"                 # 업 / 업1 / 직2 ...
    r"(?:\s*[-_ ]\s*)?"                    # 선택 구분자(없을 수도 있음)
    r"\d+"                                 # 1번째 코드 숫자(예: 685)
    r"(?:\s*[-_ ]\s*\d+){0,2}"             # 선택: 추가 숫자 덩어리(0~2개) => 총 1~3덩어리
    r"(?:\s*[-_ ]\s*|\s+)"                 # 마지막 구분자: '-'/'_'/' ' 또는 최소 1칸 공백
)

# 맨 앞 [....] 제거
LEADING_BRACKET_ANY_RE = re.compile(r"^\s*\[[^\]]+\]\s*-?\s*")

# 제목 끝 "(2017년 최종)" 같은 괄호 꼬리표 제거
TRAILING_TAG_PAREN_RE = re.compile(
    r"\s*\((?:[^)]*?(?:최종|최종본|최종안|개정|수정|ver\.?|v\d+)[^)]*?)\)\s*$",
    re.IGNORECASE
)

# ✅ 끝 "-최종" "-최종본" "-개정" "-수정" "-ver3" "-v2" 같은 꼬리 제거
TRAILING_TAG_HYPHEN_RE = re.compile(
    r"\s*[-_ ]\s*(?:최종|최종본|최종안|개정|수정|ver\.?\s*\d*|v\d+)\s*$",
    re.IGNORECASE
)

def clean_text(s: str) -> str:
    s = (s or "").strip()

    # 0) ✅ "업1-685 ..." / "업-2-740-..." / "직2-879-..." 등 프리픽스 제거 (가장 먼저)
    s = LEADING_CODE_PREFIX_RE.sub("", s)

    # 1) ✅ "99서비스업..." 같은 앞자리 짧은 숫자 제거 (필요없으면 주석처리)
    s = LEADING_SHORT_DIGITS_RE.sub("", s)

    # 2) "230. " 제거
    s = LEADING_NO_RE.sub("", s)

    # 3) "[...]" 제거
    s = LEADING_BRACKET_ANY_RE.sub("", s)

    # 4) "_" 이후 제거 (기존 요구사항)
    if "_" in s:
        s = s.split("_", 1)[0].strip()

    # 5) 끝 "-최종" 같은 꼬리 제거
    s = TRAILING_TAG_HYPHEN_RE.sub("", s).strip()

    # 6) 끝 "(2017년 최종)" 같은 괄호 꼬리표 제거
    s = TRAILING_TAG_PAREN_RE.sub("", s).strip()

    # 7) 공백 정리 + 남는 앞뒤 기호 정리
    s = re.sub(r"\s+", " ", s).strip()
    s = s.strip("-_ ").strip()

    return s

def clean_filename(name: str) -> str:
    name = (name or "").strip()
    base, ext = os.path.splitext(name)
    return clean_text(base) + ext

def transform_item(item: Dict[str, Any]) -> Dict[str, Any]:
    if item.get("title"):
        item["title"] = clean_text(item["title"])
    if isinstance(item.get("downloads"), list):
        for d in item["downloads"]:
            if isinstance(d, dict) and d.get("suggested"):
                d["suggested"] = clean_filename(d["suggested"])
    return item

def main():
    HERE = Path(__file__).resolve().parent
    in_path = HERE / "items.json"
    out_path = HERE / "items_new.json"

    with open(in_path, "r", encoding="utf-8") as f:
        data: Union[List[Any], Dict[str, Any]] = json.load(f)

    if isinstance(data, list):
        new_data = [transform_item(x) if isinstance(x, dict) else x for x in data]
    elif isinstance(data, dict) and isinstance(data.get("items"), list):
        data["items"] = [transform_item(x) if isinstance(x, dict) else x for x in data["items"]]
        new_data = data
    else:
        new_data = data

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)

    print(f"OK: wrote {out_path}")

if __name__ == "__main__":
    main()