/**
 * AI 리터러시 진단 — 응답 수집용 웹 앱
 * 스프레드시트 → 확장 프로그램 → Apps Script에 붙여넣기 (bound script)
 *
 * 배포: 배포 > 새 배포 > 웹 앱
 *   - 실행 계정: 나
 *   - 액세스 권한: 모든 사용자  ← 반드시!
 * 코드 수정 후에는 "배포 관리 > 버전 업데이트" 필요
 */

const SHEET_NAME = '응답';
const LEVEL_NAMES = { 1: '탐색자', 2: '실행자', 3: '설계자', 4: '선도자' };

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // 동시 제출 시 행 꼬임 방지

  try {
    const data = JSON.parse(e.postData.contents);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      const header = [
        '제출시각', '이름', '이메일', '회사명', '직무', '역할', '마케팅동의',
        '레벨', '레벨명',
        '빈도·깊이(/2.5)', '프롬프트·자동화(/4.0)', '확산·주도(/4.0)',
      ];
      for (let i = 1; i <= 11; i++) {
        header.push('Q' + i + ' 선택');   // A~D 라벨
      }
      header.push('UserAgent');
      sheet.appendRow(header);
      sheet.setFrozenRows(1);
    }

    const ax = data.axisScores || {};
    const details = Array.isArray(data.answersDetail) ? data.answersDetail : [];

    const row = [
      new Date(),
      data.name || '',
      data.email || '',
      data.company || '',
      data.job || '',
      data.role || '',
      data.marketing ? 'Y' : 'N',
      data.level || '',
      LEVEL_NAMES[data.level] || '',
      ax.freq   != null ? Number(ax.freq).toFixed(2)   : '',
      ax.prompt != null ? Number(ax.prompt).toFixed(2) : '',
      ax.spread != null ? Number(ax.spread).toFixed(2) : '',
    ];
    for (let i = 0; i < 11; i++) {
      const d = details[i] || {};
      row.push(d.label || '');
    }
    row.push(data.userAgent || '');

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/** 에디터에서 직접 실행해 시트 기록이 되는지 확인하는 테스트 함수 */
function testAppend() {
  const e = { postData: { contents: JSON.stringify({
    name: '테스트', email: 'test@example.com', company: 'Codepresso', job: '기획', role: '실무자',
    marketing: true, level: 3,
    axisScores: { freq: 2.0, prompt: 3.2, spread: 3.0 },
    answersDetail: Array.from({ length: 11 }, () => ({ label: 'C', value: 3 })),
    userAgent: 'test'
  }) } };
  Logger.log(doPost(e).getContent());
}
