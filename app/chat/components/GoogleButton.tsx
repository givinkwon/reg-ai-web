// 'use client';

// import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
// import { useUserStore } from '../../store/user';

// interface GmailMessage {
//   id: string;
//   threadId?: string;
//   snippet?: string;
// }

// export default function GoogleButton() {
//   const setUserInfo = useUserStore((state) => state.setUserInfo);

//   const handleGoogleLogin = async () => {
//     try {
//       // 🔐 구글 로그인 수행
//       const result = await signInWithPopup(loginAuth, provider);
//       const credential = GoogleAuthProvider.credentialFromResult(result);
//       const token = credential?.accessToken;
//       const user: User = result.user;

//       if (!user.email) throw new Error('이메일 정보가 없습니다.');

//       // 🧠 Zustand에 사용자 정보 저장
//       setUserInfo({
//         displayName: user.displayName || '',
//         email: user.email,
//         photoURL: user.photoURL || '',
//         token: token || '',
//       });

//       console.log('✅ 로그인 사용자:', user);

//       // 💾 로컬 스토리지 저장
//       localStorage.setItem(
//         'userInfo',
//         JSON.stringify({
//           displayName: user.displayName,
//           email: user.email,
//           photoURL: user.photoURL,
//           token: token,
//         })
//       );

//     //   // 📬 Gmail 메시지 수신
//     //   if (token) {
//     //     const messages: GmailMessage[] = await fetchGmailMessages(token);
//     //     console.log('📬 Gmail 메시지:', messages);

//     //     const detailedEmails = await Promise.all(
//     //       messages.map((message) => fetchMessageDetails(token, message.id))
//     //     );

//     //     console.log('📥 이메일 상세:', detailedEmails);
//     //     // ☝ 필요한 경우 상태 저장 등 추가 처리 가능
//     //   }
//     } catch (error) {
//       console.error('❌ Google 로그인 실패:', error);
//     }
//   };

//   return (
//     <button onClick={handleGoogleLogin} style={{ padding: '0.5rem 1rem' }}>
//       Google 로그인
//     </button>
//   );
// }
