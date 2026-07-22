import React, { useState } from 'react';
import { X, Shield, FileText } from 'lucide-react';

interface LegalDocsModalProps {
  initialTab?: 'terms' | 'privacy';
  onClose: () => void;
}

export const LegalDocsModal: React.FC<LegalDocsModalProps> = ({ initialTab = 'terms', onClose }) => {
  const [tab, setTab] = useState<'terms' | 'privacy'>(initialTab);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 990,
      padding: '16px'
    }}>
      <div style={{
        background: '#161925',
        width: '100%',
        maxWidth: '480px',
        maxHeight: '85vh',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '14px 16px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTab('terms')}
              style={{
                background: tab === 'terms' ? '#ff9800' : 'transparent',
                color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              이용약관
            </button>
            <button
              onClick={() => setTab('privacy')}
              style={{
                background: tab === 'privacy' ? '#4caf50' : 'transparent',
                color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              개인정보처리방침
            </button>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '16px', overflowY: 'auto', fontSize: '0.82rem', color: '#ccc', lineHeight: '1.6' }}>
          {tab === 'terms' ? (
            <div>
              <h3 style={{ color: '#fff', marginTop: 0 }}>Project Forge 서비스 이용약관 (v1.0)</h3>
              <p><b>제 1 조 (목적)</b><br />본 약관은 Project Forge(이하 "회사")가 제공하는 웹게임 포털 서비스의 이용 조건 및 절차를 규정함을 목적으로 합니다.</p>
              <p><b>제 2 조 (익명 이용 및 서비스 제공)</b><br />본 서비스는 별도의 회원가입 없이 익명 사용자 ID 기반으로 Play First 원칙에 따라 즉시 제공됩니다.</p>
              <p><b>제 3 조 (부정행위 금지)</b><br />사용자는 클라이언트 변조, 자동화 봇, 랭킹 서버 데이터 주작 등 불법적인 방법을 사용할 수 없으며 발견 즉시 제재됩니다.</p>
              <p><b>제 4 조 (광고 및 보상)</b><br />보상형 광고 수청 보상은 게임 내 재화로 제한되며 현금성 보상은 제공되지 않습니다.</p>
            </div>
          ) : (
            <div>
              <h3 style={{ color: '#fff', marginTop: 0 }}>개인정보처리방침 (v1.0)</h3>
              <p><b>1. 개인정보 수집 항목</b><br />본 서비스는 실명, 주소, 전화번호 등의 개인 식별 정보를 수집하지 않습니다. 오직 무작위 생성된 익명 ID 및 기기 접속 식별 정보만을 저장합니다.</p>
              <p><b>2. 쿠키 및 광고 네트워크 고지</b><br />Google AdSense 및 H5 Games Ads 네트워크를 활용하여 타깃팅 광고를 제공할 수 있으며, 이 과정에서 쿠키가 사용될 수 있습니다.</p>
              <p><b>3. 개인정보 보유 및 이용기간</b><br />익명 사용자 세션 및 게임 진행 기록은 서비스 종료 또는 사용자 브라우저 데이터 삭제 시까지 보관됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
