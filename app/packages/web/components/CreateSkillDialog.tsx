'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LocalSkillCandidate, SkillImportTarget } from '@ma/shared';
import {
  useImportLocalSkills,
  useImportSkillFromUrl,
  useProjects,
  useScanLocalSkills,
} from '@/lib/api';

type Method = 'chooser' | 'url' | 'local';

function detectUrlSource(url: string): 'clawhub' | 'skills.sh' | 'github' | null {
  const u = url.trim().toLowerCase();
  if (u.includes('clawhub.ai')) return 'clawhub';
  if (u.includes('skills.sh')) return 'skills.sh';
  if (u.includes('github.com') || u.includes('raw.githubusercontent.com')) return 'github';
  return null;
}

/**
 * Multica CreateSkillDialog 本地版：
 * 仅「从 URL 导入」+「从本机复制」（放弃手动创建）。
 * C3：默认用户级；可选工作区 / 绑定 localPath 的项目。
 */
export function CreateSkillDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const scanLocal = useScanLocalSkills();
  const importLocal = useImportLocalSkills();
  const importUrl = useImportSkillFromUrl();
  const { data: projects = [] } = useProjects();

  const [method, setMethod] = useState<Method>('chooser');
  const [target, setTarget] = useState<SkillImportTarget>('user');
  const [projectId, setProjectId] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const [scanPath, setScanPath] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LocalSkillCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [destHint, setDestHint] = useState<{
    project: string | null;
    user: string;
    destinations?: { id: string; label: string; path: string | null }[];
  } | null>(null);

  const projectsWithPath = useMemo(
    () => projects.filter((p) => Boolean(p.localPath?.trim()) && p.localPathExists !== false),
    [projects],
  );

  useEffect(() => {
    if (!open) return;
    setMethod('chooser');
    setUrl('');
    setUrlError(null);
    setScanPath('');
    setScanError(null);
    setCandidates([]);
    setSelected({});
    setOverwrite(false);
    setTarget('user');
    setProjectId('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const source = detectUrlSource(url);
  const selectedList = candidates.filter((c) => selected[c.key]);
  const busy = importUrl.isPending || importLocal.isPending || scanLocal.isPending;

  function resolveImportTarget(): {
    target: SkillImportTarget;
    projectId?: string;
    error?: string;
  } {
    if (target === 'project') {
      if (!projectId.trim()) {
        return { target, error: '请选择已绑定本机路径的项目' };
      }
      return { target: 'project', projectId: projectId.trim() };
    }
    return { target };
  }

  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed || importUrl.isPending) return;
    setUrlError(null);
    const t = resolveImportTarget();
    if (t.error) {
      setUrlError(t.error);
      return;
    }
    try {
      const res = await importUrl.mutateAsync({
        url: trimmed,
        target: t.target,
        projectId: t.projectId,
        overwrite,
      });
      if (res.status === 'failed') {
        setUrlError(res.error || '导入失败');
        return;
      }
      onImported?.();
      onClose();
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    const path = scanPath.trim();
    if (!path || scanLocal.isPending) return;
    setScanError(null);
    try {
      const res = await scanLocal.mutateAsync(path);
      setDestHint({
        project: res.projectSkillsDir,
        user: res.userSkillsDir,
        destinations: res.destinations,
      });
      if (res.error) {
        setCandidates([]);
        setSelected({});
        setScanError(res.error);
        return;
      }
      setCandidates(res.candidates);
      const next: Record<string, boolean> = {};
      for (const c of res.candidates) next[c.key] = !c.alreadyIndexed;
      setSelected(next);
      if (res.candidates.length === 0) {
        setScanError('未在该路径发现 skill（需 SKILL.md 或 *.md）');
      }
    } catch (err) {
      setCandidates([]);
      setSelected({});
      setScanError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitLocal() {
    if (selectedList.length === 0 || importLocal.isPending) return;
    const t = resolveImportTarget();
    if (t.error) {
      setScanError(t.error);
      return;
    }
    await importLocal.mutateAsync({
      target: t.target,
      projectId: t.projectId,
      items: selectedList.map((c) => ({
        sourcePath: c.path,
        name: c.name,
        description: c.description || undefined,
        overwrite,
      })),
    });
    onImported?.();
    onClose();
  }

  const title =
    method === 'chooser'
      ? '新建 skill'
      : method === 'url'
        ? '从 URL 导入'
        : '从本机复制';

  const subtitle =
    method === 'chooser'
      ? '选择一种方式把 skill 添加到工作区。'
      : method === 'url'
        ? '通过 URL 拉取已发布 skill，写入本地目录。'
        : '扫描本机路径，把磁盘上的 skill 提升到项目/用户目录。';

  return (
    <div
      className="modal-overlay skill-create-overlay"
      data-testid="create-skill-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal-dialog skill-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-skill-title"
      >
        <div className="skill-create-header">
          <div className="skill-create-header-main">
            {method !== 'chooser' ? (
              <button
                type="button"
                className="skill-create-back"
                data-testid="create-skill-back"
                disabled={busy}
                onClick={() => setMethod('chooser')}
              >
                ←
              </button>
            ) : null}
            <div>
              <h3 id="create-skill-title">{title}</h3>
              <p className="skill-create-sub">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            data-testid="create-skill-close"
            disabled={busy}
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="skill-create-body">
          {method === 'chooser' ? (
            <div className="skill-create-methods" data-testid="create-skill-chooser">
              <button
                type="button"
                className="skill-create-method"
                data-testid="create-skill-method-url"
                onClick={() => setMethod('url')}
              >
                <span className="skill-create-method-icon" aria-hidden>
                  ↓
                </span>
                <span className="skill-create-method-text">
                  <strong>从 URL 导入</strong>
                  <span>从 ClawHub、Skills.sh 或 GitHub 拉取已发布 skill。</span>
                </span>
                <span className="skill-create-method-chevron" aria-hidden>
                  ›
                </span>
              </button>
              <button
                type="button"
                className="skill-create-method"
                data-testid="create-skill-method-local"
                onClick={() => setMethod('local')}
              >
                <span className="skill-create-method-icon" aria-hidden>
                  ⌁
                </span>
                <span className="skill-create-method-text">
                  <strong>从本机复制</strong>
                  <span>扫描本机路径（如 Claude/opencode skills 目录）写入工作区。</span>
                </span>
                <span className="skill-create-method-chevron" aria-hidden>
                  ›
                </span>
              </button>
            </div>
          ) : null}

          {method !== 'chooser' ? (
            <div className="skill-create-target-row">
              <label className="ops-field">
                <span>写入目标</span>
                <select
                  value={target}
                  onChange={(e) => {
                    const v = e.target.value as SkillImportTarget;
                    setTarget(v);
                    if (v !== 'project') setProjectId('');
                  }}
                  data-testid="create-skill-target"
                  aria-label="写入目标"
                >
                  <option value="user">用户 · ~/.multi-agent/skills（推荐）</option>
                  <option value="workspace">工作区 · &lt;cwd&gt;/.skills</option>
                  <option value="project">项目本机 · localPath/.skills</option>
                </select>
              </label>
              {target === 'project' ? (
                <label className="ops-field">
                  <span>项目</span>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    data-testid="create-skill-project"
                    aria-label="选择项目"
                  >
                    <option value="">选择已绑路径的项目…</option>
                    {projectsWithPath.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                        {p.localPath ? ` · ${p.localPath}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="skills-import-overwrite">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  data-testid="create-skill-overwrite"
                />
                覆盖已存在
              </label>
            </div>
          ) : null}

          {method === 'url' ? (
            <div className="skill-create-url" data-testid="create-skill-url-form">
              <label className="ops-field">
                <span>Skill URL</span>
                <input
                  className="input"
                  value={url}
                  autoFocus
                  data-testid="create-skill-url"
                  placeholder="https://clawhub.ai/owner/skill"
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitUrl();
                    }
                  }}
                />
              </label>
              <p className="text-dim text-sm">支持的来源</p>
              <div className="skill-create-source-cards">
                <SourceCard
                  label="ClawHub"
                  example="clawhub.ai/owner/skill"
                  href="https://clawhub.ai"
                  active={source === 'clawhub'}
                />
                <SourceCard
                  label="Skills.sh"
                  example="skills.sh/owner/repo/skill"
                  href="https://skills.sh"
                  active={source === 'skills.sh'}
                />
                <SourceCard
                  label="GitHub"
                  example="github.com/owner/repo"
                  href="https://github.com"
                  active={source === 'github'}
                />
              </div>
              {urlError ? (
                <p className="skills-import-error" data-testid="create-skill-url-error" role="alert">
                  {urlError}
                </p>
              ) : null}
            </div>
          ) : null}

          {method === 'local' ? (
            <div className="skill-create-local" data-testid="create-skill-local-form">
              <form className="skills-import-scan" onSubmit={onScan}>
                <label className="ops-field" style={{ flex: 1, minWidth: 0 }}>
                  <span>本机路径</span>
                  <input
                    className="input"
                    value={scanPath}
                    onChange={(e) => setScanPath(e.target.value)}
                    placeholder="例如 ~/.claude/skills 或 D:/skills"
                    data-testid="create-skill-path"
                    autoFocus
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-secondary btn-sm"
                  data-testid="create-skill-scan"
                  disabled={!scanPath.trim() || scanLocal.isPending}
                >
                  {scanLocal.isPending ? '扫描中…' : '扫描'}
                </button>
              </form>
              {destHint ? (
                <p className="text-dim text-sm skills-import-dest">
                  用户：{destHint.user}
                  <br />
                  工作区：{destHint.project ?? '（cwd 未配置，可仍用用户级）'}
                  {target === 'project' && projectId ? (
                    <>
                      <br />
                      将写入所选项目的 .skills
                    </>
                  ) : null}
                </p>
              ) : null}
              {scanError ? (
                <p className="skills-import-error" data-testid="create-skill-scan-error" role="alert">
                  {scanError}
                </p>
              ) : null}
              {candidates.length > 0 ? (
                <>
                  <div className="skills-import-toolbar">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const c of candidates) next[c.key] = true;
                        setSelected(next);
                      }}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const c of candidates) next[c.key] = false;
                        setSelected(next);
                      }}
                    >
                      全不选
                    </button>
                    <span className="text-dim text-sm">
                      已选 {selectedList.length} / {candidates.length}
                    </span>
                  </div>
                  <ul className="skills-import-list skill-create-candidate-list">
                    {candidates.map((c) => (
                      <li key={c.key} className={selected[c.key] ? 'is-selected' : ''}>
                        <label className="skills-import-item-label">
                          <input
                            type="checkbox"
                            checked={Boolean(selected[c.key])}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [c.key]: e.target.checked,
                              }))
                            }
                          />
                          <span className="skills-import-item-body">
                            <span className="skills-import-item-name">
                              <strong>{c.name}</strong>
                              {c.alreadyIndexed ? (
                                <span className="skills-import-badge">已在索引</span>
                              ) : null}
                            </span>
                            {c.description ? (
                              <span className="text-dim text-sm skills-import-item-desc">
                                {c.description}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {method !== 'chooser' ? (
          <div className="skill-create-footer">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </button>
            {method === 'url' ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="create-skill-url-submit"
                disabled={!url.trim() || importUrl.isPending}
                onClick={() => void submitUrl()}
              >
                {importUrl.isPending
                  ? source === 'clawhub'
                    ? '从 ClawHub 导入…'
                    : source === 'skills.sh'
                      ? '从 Skills.sh 导入…'
                      : source === 'github'
                        ? '从 GitHub 导入…'
                        : '导入中…'
                  : '导入'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="create-skill-local-submit"
                disabled={selectedList.length === 0 || importLocal.isPending}
                onClick={() => void submitLocal()}
              >
                {importLocal.isPending
                  ? '导入中…'
                  : selectedList.length
                    ? `导入到工作区 · ${selectedList.length}`
                    : '导入到工作区'}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SourceCard({
  label,
  example,
  href,
  active,
}: {
  label: string;
  example: string;
  href: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`skill-create-source-card${active ? ' is-active' : ''}`}
    >
      <strong>{label}</strong>
      <span>{example}</span>
    </a>
  );
}
