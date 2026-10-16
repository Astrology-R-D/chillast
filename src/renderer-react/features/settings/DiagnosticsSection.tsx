import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import type { DiagnosticInfo } from '../../api/contracts';

export function DiagnosticsSection() {
  const [info, setInfo] = useState<DiagnosticInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => {
    let active = true;
    void apiClient.getDiagnosticsInfo().then((value) => { if (active) setInfo(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  async function run(action: 'open' | 'export') {
    setBusy(true); setFeedback(null);
    try {
      if (action === 'open') await apiClient.openDiagnosticsFolder();
      else {
        const result = await apiClient.exportDiagnostics();
        if (result) setFeedback({ error: false, text: `诊断日志已导出：${result.path}` });
      }
      setInfo(await apiClient.getDiagnosticsInfo());
    } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }
  return <section className="settings-section" aria-labelledby="settings-diagnostics">
    <h2 id="settings-diagnostics">诊断日志</h2>
    <p className="settings-hint">自动记录启动、AI 连接测试、工具可用性、调用状态与错误。API Key 会被过滤，不记录完整对话、工具参数或出生档案。</p>
    <p className="settings-hint">日志自动轮换，最多保留 5 个文件，每个约 2 MB。遇到问题后可导出 ZIP，便于排查。</p>
    {info && <p className="settings-hint settings-diagnostics-path">{info.enabled ? '日志位置：' : '日志写入失败：'}{info.lastError || info.directory}</p>}
    <div className="settings-row">
      <button type="button" disabled={busy} onClick={() => { void run('open'); }}>打开日志目录</button>
      <button type="button" disabled={busy} onClick={() => { void run('export'); }}>{busy ? '正在处理…' : '导出诊断日志'}</button>
    </div>
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className="settings-feedback" data-kind={feedback.error ? 'error' : 'success'}>{feedback.text}</p>}
  </section>;
}
