"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar"; // Navbar.tsx 파일의 실제 경로에 맞게 수정해주세요

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Navbar를 숨기고 싶은 정확한 URL 경로들을 배열로 지정합니다.
  const hiddenRoutes = ["/docs/docs-sign", "/docs/docs-translate"];

  // 현재 경로가 hiddenRoutes 배열에 포함되어 있다면 null을 반환하여 렌더링하지 않음
  if (hiddenRoutes.includes(pathname)) {
    return null;
  }

  // 그 외의 모든 페이지에서는 Navbar를 정상적으로 보여줌
  return <Navbar />;
}